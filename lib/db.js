const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool(process.env.DATABASE_URL ? {
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
} : {
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'inventaris_tonasa',
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT || 5432),
  connectionTimeoutMillis: 5000,
});

// Helper function to translate SQLite ? syntax to PostgreSQL $1, $2, etc.
function translateQuery(query, params) {
  let i = 1;
  let newQuery = query
    .replace(/datetime\('now', 'localtime'\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/\?/g, () => `$${i++}`);
  
  // Append RETURNING id for INSERT queries to mimic SQLite's lastID
  if (newQuery.trim().toUpperCase().startsWith('INSERT') && !newQuery.toUpperCase().includes('RETURNING')) {
    newQuery += ' RETURNING id';
  }
  return { text: newQuery, values: params || [] };
}

// Wrapper to mimic sqlite3 API using PostgreSQL
const db = {
  run: function(query, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    const { text, values } = translateQuery(query, params);
    pool.query(text, values, (err, res) => {
      if (err) {
        if (callback) callback(err);
        return;
      }
      const context = { 
        lastID: res && res.rows && res.rows.length > 0 ? res.rows[0].id : null, 
        changes: res ? res.rowCount : 0 
      };
      if (callback) callback.call(context, null);
    });
  },
  all: function(query, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    const { text, values } = translateQuery(query, params);
    pool.query(text, values, (err, res) => {
      if (callback) callback(err, res ? res.rows : []);
    });
  },
  get: function(query, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    const { text, values } = translateQuery(query, params);
    pool.query(text, values, (err, res) => {
      if (callback) callback(err, res && res.rows && res.rows.length > 0 ? res.rows[0] : undefined);
    });
  },
  serialize: function(callback) {
    callback();
  },
  prepare: function(query) {
    return {
      run: function(params, callback) {
         if (typeof params === 'function') {
            callback = params;
            params = [];
         }
         const { text, values } = translateQuery(query, params);
         pool.query(text, values, (err, res) => {
           const context = { lastID: res && res.rows && res.rows.length > 0 ? res.rows[0].id : null, changes: res ? res.rowCount : 0 };
           if (callback) callback.call(context, err);
         });
      },
      finalize: function(cb) { if (cb) cb(); }
    };
  },
  pool: pool
};

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(873057198)');

    await client.query(`CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        email VARCHAR(255) UNIQUE,
        password_hash TEXT,
        role VARCHAR(50) CHECK (role IN ('admin', 'operator', 'karyawan', 'admin_utama')),
        is_deleted INTEGER DEFAULT 0,
        deleted_at TIMESTAMP NULL,
        deleted_by INTEGER NULL
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS assets (
        id SERIAL PRIMARY KEY,
        asset_number VARCHAR(255) UNIQUE NOT NULL,
        equipment_number VARCHAR(255) NULL,
        name VARCHAR(255) NOT NULL,
        category_id INTEGER REFERENCES categories(id),
        location VARCHAR(255),
        location_grup VARCHAR(255) NULL,
        cum_acq_value DOUBLE PRECISION NULL,
        end_book_value DOUBLE PRECISION NULL,
        specification TEXT,
        function_status VARCHAR(50) CHECK (function_status IN ('Baik', 'Rusak', 'Mutasi', 'Tidak Ada Fisik')),
        performance_status VARCHAR(50) CHECK (performance_status IN ('Optimal', 'Tidak Optimal')),
        added_date DATE DEFAULT CURRENT_DATE,
        is_deleted INTEGER DEFAULT 0,
        deleted_at TIMESTAMP NULL,
        deleted_by INTEGER NULL,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        rejection_reason TEXT NULL,
        status_approval VARCHAR(50) DEFAULT 'Pending',
        change_reason TEXT NULL,
        land_area VARCHAR(255) NULL
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS asset_history (
        id SERIAL PRIMARY KEY,
        asset_id INTEGER REFERENCES assets(id),
        field_changed VARCHAR(255),
        old_value TEXT,
        new_value TEXT,
        changed_by INTEGER REFERENCES users(id),
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS user_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        field_changed VARCHAR(255),
        old_value TEXT,
        new_value TEXT,
        changed_by INTEGER REFERENCES users(id),
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await client.query('ALTER TABLE assets ADD COLUMN IF NOT EXISTS photo_proof TEXT');
    await client.query(`CREATE TABLE IF NOT EXISTS asset_media (
        id TEXT PRIMARY KEY,
        content_type TEXT NOT NULL,
        contents BYTEA NOT NULL
    )`);

    const { rows: [result] } = await client.query('SELECT COUNT(*) AS count FROM users');
    if (Number(result.count) === 0) {
        const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
        if (!ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
            throw new Error('Atur ADMIN_EMAIL dan ADMIN_PASSWORD minimal 12 karakter untuk database baru.');
        }
        const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
        await client.query(
            'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
            ['Admin Utama', ADMIN_EMAIL, hash, 'admin_utama']
        );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

let initialization;
db.ready = function () {
  initialization ??= initDb().catch(error => {
    initialization = undefined;
    throw error;
  });
  return initialization;
};

module.exports = db;
