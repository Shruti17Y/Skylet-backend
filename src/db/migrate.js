const fs = require('fs');
const path = require('path');
const db = require('../config/db');

async function runMigrations() {
  console.log('Starting PostgreSQL Database Migration...');
  try {
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    console.log('Running schema.sql...');
    await db.query(schemaSql);
    console.log('Schema executed successfully.');

    const seedSql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
    console.log('Running seed.sql...');
    await db.query(seedSql);
    console.log('Seed executed successfully.');

    console.log('Database setup and seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed with error:', error);
    process.exit(1);
  }
}

runMigrations();
