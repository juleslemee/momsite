import { createClient } from '@libsql/client';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const client = createClient({
  url: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function main() {
  const result = await client.execute('SELECT title FROM exhibitions ORDER BY title');
  const dbTitles = result.rows.map(r => r.title as string);

  console.log('Total exhibitions in DB:', dbTitles.length);

  // Load HTML titles
  const htmlTitles = fs.readFileSync('/tmp/html_exhibitions.txt', 'utf-8').split('\n').filter(Boolean);

  // Find missing (in HTML but not in DB)
  const missing = htmlTitles.filter(h => !dbTitles.some(d => d.toLowerCase().trim() === h.toLowerCase().trim()));

  console.log('\n--- Missing in DB (found in HTML):', missing.length, '---');
  missing.forEach((t, i) => console.log(`${i + 1}. ${t}`));

  // Find extra (in DB but not in HTML)
  const extra = dbTitles.filter(d => !htmlTitles.some(h => h.toLowerCase().trim() === d.toLowerCase().trim()));

  if (extra.length > 0) {
    console.log('\n--- Extra in DB (not in HTML):', extra.length, '---');
    extra.forEach((t, i) => console.log(`${i + 1}. ${t}`));
  }
}

main().catch(console.error);
