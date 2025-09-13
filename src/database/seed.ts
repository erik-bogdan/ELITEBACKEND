import { sql } from 'drizzle-orm';
import { db } from '../db';

export async function format() {
  // Drop all tables and recreate them
  await db.execute(sql`DROP SCHEMA public CASCADE`);
  await db.execute(sql`DROP SCHEMA drizzle CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await db.execute(sql`CREATE SCHEMA drizzle`);
  
}

async function main() {
  const command = process.argv[2];
  
  if (command === 'format') {
    await format();
    console.log('Database has been cleared!');
  } else {
    console.log('Database has been seeded!');
  }
}

main().catch(console.error); 