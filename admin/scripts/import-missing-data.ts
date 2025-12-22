/**
 * Import missing data from backup CMS HTML files:
 * - 12 missing exhibitions
 * - All press items
 * - All news items
 */

import * as fs from 'fs';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../src/db/schema';

const uuidv4 = () => crypto.randomUUID();

dotenv.config();

const client = createClient({
  url: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const db = drizzle(client, { schema });

const BACKUP_PATH = '/Users/born2die/Code/Columbia/mom/backup_cms/accounts.exhibit-e.com/application/539f1b2ba9aa2c31208b4568/content/r';

// Missing exhibitions to import
const MISSING_EXHIBITIONS = [
  'Shine On Me',
  'This is Not About Flowers',
  'Soothing White',
  'Circular Harmony Part I',
  'Celebrating Nature',
  'Relief',
  'Fotofever',
  'Laurent Chehere and Juan Arana',
  "That's all Folks!",
  'Polarities of Banality',
  'Art Toronto',
  'Market Art + Design - Fairview Farm at Mecox in the Hamptons',
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

interface ExhibitionData {
  title: string;
  subtitle?: string;
  subtitle2?: string;
  dateText?: string;
  status?: 'current' | 'upcoming' | 'past';
}

interface PressData {
  id: string;
  title: string;
  subtitle?: string;
  date?: string;
  imageUrl?: string;
  isEnabled: boolean;
}

interface NewsData {
  id: string;
  title: string;
  subtitle?: string;
  date?: string;
  imageUrl?: string;
  isEnabled: boolean;
}

function parseExhibitionsHtml(html: string): ExhibitionData[] {
  const exhibitions: ExhibitionData[] = [];
  const rowRegex = /<tr class="(odd|even)" role="row">([\s\S]*?)<\/tr>/g;

  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowContent = rowMatch[2];

    // Extract all col-content values
    const colContentRegex = /<div class="col-content">([^<]*)<\/div>/g;
    const values: string[] = [];
    let colMatch;
    while ((colMatch = colContentRegex.exec(rowContent)) !== null) {
      values.push(colMatch[1].trim());
    }

    // values[0] = date, values[1] = title, values[2] = subtitle, values[3] = subtitle2
    if (values.length >= 2) {
      const exhibition: ExhibitionData = {
        title: values[1],
        dateText: values[0] || undefined,
        subtitle: values[2] || undefined,
        subtitle2: values[3] || undefined,
      };

      // Determine status based on date
      if (values[0]) {
        const dateStr = values[0].toLowerCase();
        const currentYear = new Date().getFullYear();
        if (dateStr.includes(String(currentYear)) || dateStr.includes(String(currentYear + 1))) {
          exhibition.status = 'current';
        } else {
          exhibition.status = 'past';
        }
      }

      exhibitions.push(exhibition);
    }
  }

  return exhibitions;
}

function parsePressHtml(html: string): PressData[] {
  const pressItems: PressData[] = [];
  const rowRegex = /<tr class="item[^"]*" data-id="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g;

  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const id = rowMatch[1];
    const rowContent = rowMatch[2];

    // Check if disabled
    const isEnabled = !rowContent.includes('class="disable');

    // Extract title cells specifically (skip thumbnail td)
    const titleTdRegex = /<td class="title">([\s\S]*?)<\/td>/g;
    const values: string[] = [];
    let tdMatch;
    while ((tdMatch = titleTdRegex.exec(rowContent)) !== null) {
      const tdContent = tdMatch[1];
      const colContentMatch = tdContent.match(/<div class="col-content">([^<]*)<\/div>/);
      if (colContentMatch) {
        let value = colContentMatch[1]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#039;/g, "'")
          .trim();
        values.push(value);
      }
    }

    // Extract image URL from thumbnail
    const imgMatch = rowContent.match(/src="(https:\/\/[^"]+)"/);
    const imageUrl = imgMatch ? imgMatch[1] : undefined;

    // values: [0]=title, [1]=subtitle, [2]=date
    if (values.length >= 1 && values[0]) {
      pressItems.push({
        id,
        title: values[0],
        subtitle: values[1] || undefined,
        date: values[2] || undefined,
        imageUrl,
        isEnabled,
      });
    }
  }

  return pressItems;
}

function parseNewsHtml(html: string): NewsData[] {
  const newsItems: NewsData[] = [];
  const rowRegex = /<tr class="item[^"]*" data-id="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g;

  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const id = rowMatch[1];
    const rowContent = rowMatch[2];

    // Check if disabled
    const isEnabled = !rowContent.includes('class="disable');

    // Extract title cells specifically (skip thumbnail td)
    const titleTdRegex = /<td class="title">([\s\S]*?)<\/td>/g;
    const values: string[] = [];
    let tdMatch;
    while ((tdMatch = titleTdRegex.exec(rowContent)) !== null) {
      const tdContent = tdMatch[1];
      const colContentMatch = tdContent.match(/<div class="col-content">([^<]*)<\/div>/);
      if (colContentMatch) {
        let value = colContentMatch[1]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#039;/g, "'")
          .trim();
        values.push(value);
      }
    }

    // Extract image URL from thumbnail
    const imgMatch = rowContent.match(/src="(https:\/\/[^"]+)"/);
    const imageUrl = imgMatch ? imgMatch[1] : undefined;

    // values: [0]=title, [1]=subtitle, [2]=date
    if (values.length >= 1 && values[0]) {
      newsItems.push({
        id,
        title: values[0],
        subtitle: values[1] || undefined,
        date: values[2] || undefined,
        imageUrl,
        isEnabled,
      });
    }
  }

  return newsItems;
}

async function importMissingExhibitions() {
  console.log('\n=== Importing Missing Exhibitions ===\n');

  const html = fs.readFileSync(`${BACKUP_PATH}/exhibitions.html`, 'utf-8');
  const allExhibitions = parseExhibitionsHtml(html);

  // Filter to only missing exhibitions
  const missingExhibitions = allExhibitions.filter(e =>
    MISSING_EXHIBITIONS.some(m => m.toLowerCase() === e.title.toLowerCase())
  );

  console.log(`Found ${missingExhibitions.length} missing exhibitions to import`);

  for (const exhibition of missingExhibitions) {
    const id = uuidv4();
    const slug = slugify(exhibition.title);

    try {
      await db.insert(schema.exhibitions).values({
        id,
        slug,
        title: exhibition.title,
        subtitle: exhibition.subtitle,
        subtitle2: exhibition.subtitle2,
        dateText: exhibition.dateText,
        status: exhibition.status || 'past',
        isEnabled: true,
        sortOrder: 0,
      });
      console.log(`✓ Imported: ${exhibition.title}`);
    } catch (error: any) {
      if (error.message?.includes('UNIQUE constraint')) {
        console.log(`⚠ Already exists: ${exhibition.title}`);
      } else {
        console.error(`✗ Error importing ${exhibition.title}:`, error.message);
      }
    }
  }
}

async function importPress() {
  console.log('\n=== Importing Press Items ===\n');

  const html = fs.readFileSync(`${BACKUP_PATH}/press.html`, 'utf-8');
  const pressItems = parsePressHtml(html);

  console.log(`Found ${pressItems.length} press items to import`);

  let imported = 0;
  let skipped = 0;

  for (const item of pressItems) {
    const id = uuidv4();

    try {
      await db.insert(schema.press).values({
        id,
        title: item.title,
        subtitle: item.subtitle,
        date: item.date,
        isEnabled: item.isEnabled,
        sortOrder: 0,
      });
      imported++;
      console.log(`✓ Imported: ${item.title}`);
    } catch (error: any) {
      if (error.message?.includes('UNIQUE constraint')) {
        skipped++;
        console.log(`⚠ Already exists: ${item.title}`);
      } else {
        console.error(`✗ Error importing ${item.title}:`, error.message);
      }
    }
  }

  console.log(`\nPress import complete: ${imported} imported, ${skipped} skipped`);
}

async function importNews() {
  console.log('\n=== Importing News Items ===\n');

  const html = fs.readFileSync(`${BACKUP_PATH}/news.html`, 'utf-8');
  const newsItems = parseNewsHtml(html);

  console.log(`Found ${newsItems.length} news items to import`);

  let imported = 0;
  let skipped = 0;

  for (const item of newsItems) {
    const id = uuidv4();

    try {
      await db.insert(schema.news).values({
        id,
        title: item.title,
        subtitle: item.subtitle,
        date: item.date,
        isEnabled: item.isEnabled,
        sortOrder: 0,
      });
      imported++;
      console.log(`✓ Imported: ${item.title}`);
    } catch (error: any) {
      if (error.message?.includes('UNIQUE constraint')) {
        skipped++;
        console.log(`⚠ Already exists: ${item.title}`);
      } else {
        console.error(`✗ Error importing ${item.title}:`, error.message);
      }
    }
  }

  console.log(`\nNews import complete: ${imported} imported, ${skipped} skipped`);
}

async function main() {
  console.log('Starting data import from backup CMS...\n');

  try {
    await importMissingExhibitions();
    await importPress();
    await importNews();

    console.log('\n=== Import Complete ===\n');

    // Show final counts
    const exhibitions = await db.select().from(schema.exhibitions);
    const press = await db.select().from(schema.press);
    const news = await db.select().from(schema.news);

    console.log(`Total exhibitions: ${exhibitions.length}`);
    console.log(`Total press items: ${press.length}`);
    console.log(`Total news items: ${news.length}`);

  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  }
}

main();
