import { getDb } from "@/server/db";
import { getSaveResponse, putSaveResponse } from "@/server/saveApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return getSaveResponse(request, getDb().db);
}

export async function PUT(request: Request) {
  return putSaveResponse(request, getDb().db);
}
