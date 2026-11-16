import { getDb } from "@/server/db";
import { resetSaveResponse } from "@/server/saveApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return resetSaveResponse(request, getDb().db);
}
