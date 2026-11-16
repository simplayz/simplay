import { getAdvisorConfigResponse } from "@/server/advisorApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return getAdvisorConfigResponse();
}
