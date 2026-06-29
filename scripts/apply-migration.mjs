#!/usr/bin/env node
/**
 * Apply pending SQL migrations via direct Postgres connection.
 * Requires DATABASE_URL in app/.env.local (Supabase → Settings → Database → Connection string).
 * Usage: node scripts/apply-migration.mjs [migration-file.sql]
 */
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnv(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m) continue
    const val = m[2].replace(/^["']|["']$/g, '')
    if (!process.env[m[1]]) process.env[m[1]] = val
  }
}

loadEnv(resolve(root, 'app/.env.local'))

const migrationFile =
  process.argv[2] ?? resolve(root, 'supabase/migrations/20260628140000_shareholders.sql')

const databaseUrl = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL
if (!databaseUrl) {
  console.error('Missing DATABASE_URL or SUPABASE_DB_URL in app/.env.local')
  console.error('Add the Postgres connection string from Supabase → Project Settings → Database.')
  process.exit(1)
}

const sql = readFileSync(migrationFile, 'utf8')

const { default: pg } = await import('pg')
const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()
  await client.query(sql)
  console.log(`Applied: ${migrationFile}`)
} finally {
  await client.end()
}
