import { database } from '@/server/database';
import { gameApi, safeError } from '@/server/game-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(req: Request) {
  try { return await gameApi(req, database()); } catch (e) { return safeError(e); }
}
export { handle as GET, handle as PUT };
