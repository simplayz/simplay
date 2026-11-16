import { database } from '@/server/database';
import { advisorApi } from '@/server/advisor-api';
import { safeError } from '@/server/game-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  try { return await advisorApi(req, database()); } catch (e) { return safeError(e); }
}
