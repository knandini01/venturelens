import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema.js';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'anvaya.db');
const client = createClient({ url: `file:${dbPath}` });

export const db = drizzle(client, { schema });
