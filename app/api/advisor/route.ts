import { postAdvisorResponse } from "@/server/advisorApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return postAdvisorResponse(request);
}
