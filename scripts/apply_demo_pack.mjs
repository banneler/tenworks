#!/usr/bin/env node
/**
 * Apply supabase/seed/tw_demo_pack.sql to TenWorks only.
 *
 *   DATABASE_URL='postgresql://postgres.ccrnueyxmnzqlaphqdjn:…@….pooler.supabase.com:5432/postgres' \
 *     node scripts/apply_demo_pack.mjs
 *
 * The SQL editor in project ccrnueyxmnzqlaphqdjn is the same script.
 * Do not point this at Constellation (iudcdraytwduxkoromut / pjxcciepfypzrfmlfchj).
 *
 * Wipe without reseeding: node scripts/apply_demo_pack.mjs --wipe
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wipe = process.argv.includes('--wipe');
const sql = path.join(root, 'supabase/seed', wipe ? 'tw_demo_pack_wipe.sql' : 'tw_demo_pack.sql');
const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '';

if (!url) {
    console.error('Set DATABASE_URL to the TenWorks Postgres connection (project ref ccrnueyxmnzqlaphqdjn).');
    console.error('Or paste supabase/seed/tw_demo_pack.sql into that project’s SQL editor.');
    process.exit(2);
}

const allowed = url.includes('ccrnueyxmnzqlaphqdjn');
const blocked = url.includes('iudcdraytwduxkoromut') || url.includes('pjxcciepfypzrfmlfchj');
if (blocked || !allowed) {
    console.error('Refusing to run. The connection string must be TenWorks (ccrnueyxmnzqlaphqdjn), not Constellation.');
    process.exit(2);
}

const result = spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-f', sql], { stdio: 'inherit' });
process.exit(result.status === null ? 1 : result.status);
