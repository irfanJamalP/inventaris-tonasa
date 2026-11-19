const db = require('../lib/db.js');
const sample = require('../lib/demo-data.json');

async function seed() {
  await db.ready();
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(873057198)');
    const categoryIds = new Map();
    for (const category of sample.categories) {
      const found = await client.query('SELECT id FROM categories WHERE name = $1 LIMIT 1', [category.name]);
      const result = found.rows[0] ? found : await client.query(
        'INSERT INTO categories (name) VALUES ($1) RETURNING id', [category.name]
      );
      categoryIds.set(category.id, result.rows[0].id);
    }
    for (const asset of sample.assets) {
      await client.query(
        `INSERT INTO assets (asset_number, name, category_id, location, function_status, performance_status, status_approval)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (asset_number) DO NOTHING`,
        [asset.asset_number, asset.name, categoryIds.get(asset.category_id), asset.location,
          asset.function_status, asset.performance_status, asset.status_approval]
      );
    }
    await client.query('COMMIT');
    console.log('Data contoh siap.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

seed().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => db.pool.end());
