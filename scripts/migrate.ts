import { openDatabase } from '../src/server/database';
const db = openDatabase();
console.log('Database migrations applied (version 1).');
db.sqlite.close();
