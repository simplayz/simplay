const MAX_JSON_BYTES = 2 * 1024 * 1024;

export function jsonResponse(data: unknown, status = 200, headers?: HeadersInit): Response {
  const response = new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
  return response;
}

export function apiError(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
  headers?: HeadersInit,
): Response {
  return jsonResponse({ error: { code, message, ...extra } }, status, headers);
}

export function noStoreHeaders(): HeadersInit {
  return { "Cache-Control": "no-store" };
}

function requestOriginParts(request: Request): { host: string; protocol: string } {
  const trustProxy = process.env.SIMPLAYZ_TRUST_PROXY === "1";
  const requestUrl = new URL(request.url);
  const host = trustProxy
    ? (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? requestUrl.host).split(",")[0]!.trim()
    : (request.headers.get("host") ?? requestUrl.host);
  const protocol = trustProxy
    ? (request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.replace(":", "")).split(",")[0]!.trim()
    : requestUrl.protocol.replace(":", "");
  return { host, protocol };
}

/**
 * State-changing requests must prove same-origin intent. SameSite=Lax protects
 * the cookie; the Origin check and custom header keep cross-site form/fetch
 * requests from using the save endpoints. This is not a substitute for an
 * account system, but it is the CSRF boundary for this anonymous prototype.
 */
export function checkStateChangingRequest(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (!origin) return apiError(403, "ORIGIN_REQUIRED", "A same-origin Origin header is required.");

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return apiError(403, "ORIGIN_INVALID", "The Origin header is invalid.");
  }

  const expected = requestOriginParts(request);
  if (!expected.host || parsed.host !== expected.host || parsed.protocol !== `${expected.protocol}:`) {
    return apiError(403, "ORIGIN_MISMATCH", "This request did not come from the application origin.");
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    return apiError(403, "CROSS_SITE_REQUEST", "Cross-site state changes are not allowed.");
  }

  if (request.headers.get("x-simplayz-request") !== "1") {
    return apiError(403, "CSRF_HEADER_REQUIRED", "The Simplayz request header is required.");
  }
  return null;
}

export async function readJsonBody(
  request: Request,
  maxBytes = MAX_JSON_BYTES,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return {
      ok: false,
      response: apiError(415, "CONTENT_TYPE_REQUIRED", "Send this request as application/json."),
    };
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, response: apiError(400, "BODY_UNREADABLE", "The request body could not be read.") };
  }
  if (new TextEncoder().encode(text).length > maxBytes) {
    return {
      ok: false,
      response: apiError(413, "BODY_TOO_LARGE", `The request body exceeds ${maxBytes} bytes.`),
    };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, response: apiError(400, "INVALID_JSON", "The request body is not valid JSON.") };
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
