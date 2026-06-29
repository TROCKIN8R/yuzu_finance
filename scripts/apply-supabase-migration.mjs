#!/usr/bin/env node
/**
 * Apply SQL migration using Supabase service role + pg when DATABASE_URL is set,
 * otherwise prints instructions.
 */
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { createRequire } from 'module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const require = createRequire(pathToFileURL(resolve(root, 'app/package.json')))
const { createClient } = require('@supabase/supabase-js')

function loadEnv(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m) continue
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[m[1]]) process.env[m[1]] = val
  }
}

loadEnv(resolve(root, 'app/.env.local'))

const migrationFile =
  process.argv[2] ?? resolve(root, 'supabase/migrations/20260628140000_shareholders.sql')

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const databaseUrl = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL

if (databaseUrl) {
  const { default: pg } = await import('pg')
  const sql = readFileSync(migrationFile, 'utf8')
  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    await client.query(sql)
    console.log(`Applied via DATABASE_URL: ${migrationFile}`)
  } finally {
    await client.end()
  }
  process.exit(0)
}

if (url && serviceKey) {
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { error } = await supabase.from('shareholders').select('id').limit(1)
  if (!error) {
    console.log('shareholders table already exists — skipping migration.')
    process.exit(0)
  }
  console.log('shareholders table missing. DATABASE_URL not set — cannot apply DDL via REST API.')
  console.log('Run this SQL in Supabase SQL Editor:')
  console.log('---')
  console.log(readFileSync(migrationFile, 'utf8'))
  console.log('---')
  console.log('Or add DATABASE_URL (Postgres connection string) to app/.env.local and re-run this script.')
  process.exit(1)
}

console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in app/.env.local')
process.exit(1)
