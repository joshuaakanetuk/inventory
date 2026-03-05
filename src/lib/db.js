import Database from "better-sqlite3";
import path from "path";

const DATABASE_URL = process.env.DATABASE_URL;
const USE_PG = DATABASE_URL && DATABASE_URL.startsWith("postgres");

let sqliteDb;
let pgPool;
let pgInitPromise;

// --------------- SQLite helpers ---------------

function getSqliteDb() {
  if (!sqliteDb) {
    const DB_PATH = path.join(process.cwd(), "inventory.db");
    sqliteDb = new Database(DB_PATH);
    sqliteDb.pragma("journal_mode = WAL");
    sqliteDb.pragma("foreign_keys = ON");
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        barcode TEXT,
        qty INTEGER NOT NULL DEFAULT 1,
        added_by TEXT NOT NULL,
        added_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (added_by) REFERENCES users(name)
      );
      CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode);
      CREATE INDEX IF NOT EXISTS idx_items_added_by ON items(added_by);
    `);
  }
  return sqliteDb;
}

// --------------- Postgres helpers ---------------

async function initPgPool() {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      barcode TEXT,
      qty INTEGER NOT NULL DEFAULT 1,
      added_by TEXT NOT NULL,
      added_at TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (added_by) REFERENCES users(name)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_items_added_by ON items(added_by);`);

  pgPool = pool;
  return pool;
}

async function getPgPool() {
  if (pgPool) return pgPool;
  if (!pgInitPromise) {
    pgInitPromise = initPgPool();
  }
  return pgInitPromise;
}

// Convert SQLite-style "?" placeholders to Postgres "$1, $2, ..."
function toPgParams(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// --------------- Unified async API ---------------

/** Run a query and return all matching rows. */
export async function query(sql, params = []) {
  if (USE_PG) {
    const pool = await getPgPool();
    const { rows } = await pool.query(toPgParams(sql), params);
    return rows;
  }
  return getSqliteDb().prepare(sql).all(...params);
}

/** Run a query and return the first row, or undefined. */
export async function queryOne(sql, params = []) {
  if (USE_PG) {
    const pool = await getPgPool();
    const { rows } = await pool.query(toPgParams(sql), params);
    return rows[0];
  }
  return getSqliteDb().prepare(sql).get(...params);
}

/**
 * Execute a statement (INSERT / UPDATE / DELETE).
 * Returns { lastId, changes }.
 */
export async function run(sql, params = []) {
  if (USE_PG) {
    const pool = await getPgPool();
    // Append RETURNING id for INSERTs so we can retrieve the new row id
    let pgSql = toPgParams(sql);
    const isInsert = /^\s*INSERT\s/i.test(pgSql);
    if (isInsert && !/RETURNING/i.test(pgSql)) {
      pgSql += " RETURNING id";
    }
    const { rows, rowCount } = await pool.query(pgSql, params);
    return {
      lastId: rows.length > 0 ? rows[0].id : null,
      changes: rowCount,
    };
  }
  const result = getSqliteDb().prepare(sql).run(...params);
  return { lastId: result.lastInsertRowid, changes: result.changes };
}
