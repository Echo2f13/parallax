import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname } from 'path'
import * as schema from './schema.js'
import { config } from '../config/config.js'

mkdirSync(dirname(config.dbPath), { recursive: true })

const sqlite = new Database(config.dbPath)
sqlite.pragma('journal_mode = WAL')

export let db = drizzle(sqlite, { schema })
export type DB = typeof db

export function setDatabase(database: DB): void {
	db = database
}