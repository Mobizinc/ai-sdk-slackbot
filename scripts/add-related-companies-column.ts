import * as dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

async function addColumn() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('Adding related_companies column to business_contexts table...');

  try {
    const sql = neon(databaseUrl);
    await sql`ALTER TABLE business_contexts ADD COLUMN IF NOT EXISTS related_companies jsonb DEFAULT '[]'::jsonb NOT NULL`;
    console.log('✅ Migration complete! Column added successfully.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

addColumn();
