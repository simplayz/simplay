import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "simplayz.sid";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isValidSessionToken(token: string | null | undefined): token is string {
  return !!token && TOKEN_PATTERN.test(token);
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function readSessionToken(request: Request): string | null {
  return readCookie(request, SESSION_COOKIE);
}

export function shouldUseSecureCookie(): boolean {
  const override = process.env.SIMPLAYZ_COOKIE_SECURE?.trim().toLowerCase();
  if (override === "1" || override === "true") return true;
  if (override === "0" || override === "false") return false;
  return process.env.NODE_ENV === "production";
}

export function serializeSessionCookie(token: string): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (shouldUseSecureCookie()) parts.push("Secure");
  return parts.join("; ");
}
