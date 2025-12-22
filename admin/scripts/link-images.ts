/**
 * Link images from backup HTML to existing database records
 * - Extract S3 image URLs and hashes
 * - Look up matching images in database
 * - Update exhibitions/press/news with image references
 */

import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { createClient } from '@libsql/client';

dotenv.config();

const client = createClient({
  url: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const BACKUP_PATH = '/Users/born2die/Code/Columbia/mom/backup_cms/accounts.exhibit-e.com/application/539f1b2ba9aa2c31208b4568/content/r';

interface ExhibitionWithImage {
  title: string;
  dateText: string;
  subtitle: string;
  subtitle2: string;
  imageHash: string | null;
  imageUrl: string | null;
}

interface PressWithImage {
  title: string;
  subtitle: string;
  date: string;
  imageHash: string | null;
  imageUrl: string | null;
}

interface NewsWithImage {
  title: string;
  subtitle: string;
  date: string;
  imageHash: string | null;
  imageUrl: string | null;
}

function extractHashFromS3Url(url: string): string | null {
  // URL format: https://s3.amazonaws.com/files.collageplatform.com.prod/image_cache/thumb_mini/539f1b2ba9aa2c31208b4568/{hash}.{ext}
  const match = url.match(/\/([a-f0-9]{32})\.\w+$/);
  return match ? match[1] : null;
}

function parseExhibitionsHtml(html: string): ExhibitionWithImage[] {
  const exhibitions: ExhibitionWithImage[] = [];
  const rowRegex = /<tr class="(odd|even)" role="row">([\s\S]*?)<\/tr>/g;

  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowContent = rowMatch[2];

    // Extract image URL
    const imgMatch = rowContent.match(/src="(https:\/\/s3\.amazonaws\.com[^"]+)"/);
    const imageUrl = imgMatch ? imgMatch[1] : null;
    const imageHash = imageUrl ? extractHashFromS3Url(imageUrl) : null;

    // Extract title cells
    const titleTdRegex = /<td class="title">([\s\S]*?)<\/td>/g;
    const values: string[] = [];
    let tdMatch;
    while ((tdMatch = titleTdRegex.exec(rowContent)) !== null) {
      const colContentMatch = tdMatch[1].match(/<div class="col-content">([^<]*)<\/div>/);
      values.push(colContentMatch ? colContentMatch[1].trim() : '');
    }

    // values: [0]=date, [1]=title, [2]=subtitle, [3]=subtitle2
    if (values.length >= 2 && values[1]) {
      exhibitions.push({
        title: values[1],
        dateText: values[0] || '',
        subtitle: values[2] || '',
        subtitle2: values[3] || '',
        imageHash,
        imageUrl,
      });
    }
  }

  return exhibitions;
}

function parsePressHtml(html: string): PressWithImage[] {
  const items: PressWithImage[] = [];
  const rowRegex = /<tr class="item[^"]*"[^>]*>([\s\S]*?)<\/tr>/g;

  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowContent = rowMatch[1];

    // Extract image URL
    const imgMatch = rowContent.match(/src="(https:\/\/s3\.amazonaws\.com[^"]+)"/);
    const imageUrl = imgMatch ? imgMatch[1] : null;
    const imageHash = imageUrl ? extractHashFromS3Url(imageUrl) : null;

    // Extract title cells
    const titleTdRegex = /<td class="title">([\s\S]*?)<\/td>/g;
    const values: string[] = [];
    let tdMatch;
    while ((tdMatch = titleTdRegex.exec(rowContent)) !== null) {
      const colContentMatch = tdMatch[1].match(/<div class="col-content">([^<]*)<\/div>/);
      values.push(colContentMatch ? colContentMatch[1].replace(/&amp;/g, '&').trim() : '');
    }

    if (values.length >= 1 && values[0]) {
      items.push({
        title: values[0],
        subtitle: values[1] || '',
        date: values[2] || '',
        imageHash,
        imageUrl,
      });
    }
  }

  return items;
}

function parseNewsHtml(html: string): NewsWithImage[] {
  const items: NewsWithImage[] = [];
  const rowRegex = /<tr class="item[^"]*"[^>]*>([\s\S]*?)<\/tr>/g;

  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowContent = rowMatch[1];

    // Extract image URL
    const imgMatch = rowContent.match(/src="(https:\/\/s3\.amazonaws\.com[^"]+)"/);
    const imageUrl = imgMatch ? imgMatch[1] : null;
    const imageHash = imageUrl ? extractHashFromS3Url(imageUrl) : null;

    // Extract title cells
    const titleTdRegex = /<td class="title">([\s\S]*?)<\/td>/g;
    const values: string[] = [];
    let tdMatch;
    while ((tdMatch = titleTdRegex.exec(rowContent)) !== null) {
      const colContentMatch = tdMatch[1].match(/<div class="col-content">([^<]*)<\/div>/);
      values.push(colContentMatch ? colContentMatch[1].replace(/&amp;/g, '&').trim() : '');
    }

    if (values.length >= 1 && values[0]) {
      items.push({
        title: values[0],
        subtitle: values[1] || '',
        date: values[2] || '',
        imageHash,
        imageUrl,
      });
    }
  }

  return items;
}

async function linkExhibitionImages() {
  console.log('\n=== Linking Exhibition Images ===\n');

  const html = fs.readFileSync(`${BACKUP_PATH}/exhibitions.html`, 'utf-8');
  const exhibitions = parseExhibitionsHtml(html);

  console.log(`Found ${exhibitions.length} exhibitions in HTML`);

  let linked = 0;
  let notFound = 0;
  let alreadyHasImage = 0;

  for (const ex of exhibitions) {
    if (!ex.imageHash) continue;

    // Check if exhibition exists and needs an image
    const dbEx = await client.execute({
      sql: 'SELECT id, cover_image_id FROM exhibitions WHERE LOWER(title) = LOWER(?)',
      args: [ex.title],
    });

    if (dbEx.rows.length === 0) continue;

    const exhibition = dbEx.rows[0];
    if (exhibition.cover_image_id) {
      alreadyHasImage++;
      continue;
    }

    // Look up image by hash
    const dbImg = await client.execute({
      sql: 'SELECT id FROM images WHERE hash = ?',
      args: [ex.imageHash],
    });

    if (dbImg.rows.length > 0) {
      // Link the image
      await client.execute({
        sql: 'UPDATE exhibitions SET cover_image_id = ? WHERE id = ?',
        args: [dbImg.rows[0].id, exhibition.id],
      });
      console.log(`✓ Linked: ${ex.title}`);
      linked++;
    } else {
      console.log(`✗ Image not found for: ${ex.title} (hash: ${ex.imageHash})`);
      notFound++;
    }
  }

  console.log(`\nExhibitions: ${linked} linked, ${notFound} images not found, ${alreadyHasImage} already had images`);
  return { linked, notFound };
}

async function linkPressImages() {
  console.log('\n=== Linking Press Images ===\n');

  const html = fs.readFileSync(`${BACKUP_PATH}/press.html`, 'utf-8');
  const pressItems = parsePressHtml(html);

  console.log(`Found ${pressItems.length} press items in HTML`);

  let linked = 0;
  let notFound = 0;

  for (const item of pressItems) {
    if (!item.imageHash) continue;

    // Check if press item exists
    const dbPress = await client.execute({
      sql: 'SELECT id, image_id FROM press WHERE LOWER(title) = LOWER(?)',
      args: [item.title],
    });

    if (dbPress.rows.length === 0) continue;

    const press = dbPress.rows[0];
    if (press.image_id) continue;

    // Look up image by hash
    const dbImg = await client.execute({
      sql: 'SELECT id FROM images WHERE hash = ?',
      args: [item.imageHash],
    });

    if (dbImg.rows.length > 0) {
      await client.execute({
        sql: 'UPDATE press SET image_id = ? WHERE id = ?',
        args: [dbImg.rows[0].id, press.id],
      });
      console.log(`✓ Linked: ${item.title}`);
      linked++;
    } else {
      console.log(`✗ Image not found for: ${item.title} (hash: ${item.imageHash})`);
      notFound++;
    }
  }

  console.log(`\nPress: ${linked} linked, ${notFound} images not found`);
  return { linked, notFound };
}

async function linkNewsImages() {
  console.log('\n=== Linking News Images ===\n');

  const html = fs.readFileSync(`${BACKUP_PATH}/news.html`, 'utf-8');
  const newsItems = parseNewsHtml(html);

  console.log(`Found ${newsItems.length} news items in HTML`);

  let linked = 0;
  let notFound = 0;

  for (const item of newsItems) {
    if (!item.imageHash) continue;

    // Check if news item exists
    const dbNews = await client.execute({
      sql: 'SELECT id, image_id FROM news WHERE LOWER(title) = LOWER(?)',
      args: [item.title],
    });

    if (dbNews.rows.length === 0) continue;

    const news = dbNews.rows[0];
    if (news.image_id) continue;

    // Look up image by hash
    const dbImg = await client.execute({
      sql: 'SELECT id FROM images WHERE hash = ?',
      args: [item.imageHash],
    });

    if (dbImg.rows.length > 0) {
      await client.execute({
        sql: 'UPDATE news SET image_id = ? WHERE id = ?',
        args: [dbImg.rows[0].id, news.id],
      });
      console.log(`✓ Linked: ${item.title}`);
      linked++;
    } else {
      console.log(`✗ Image not found for: ${item.title} (hash: ${item.imageHash})`);
      notFound++;
    }
  }

  console.log(`\nNews: ${linked} linked, ${notFound} images not found`);
  return { linked, notFound };
}

async function showMissingImages() {
  console.log('\n=== Summary of Missing Images ===\n');

  // Exhibitions without images
  const exNoImg = await client.execute('SELECT title FROM exhibitions WHERE cover_image_id IS NULL');
  if (exNoImg.rows.length > 0) {
    console.log(`Exhibitions without cover images (${exNoImg.rows.length}):`);
    exNoImg.rows.forEach(r => console.log(`  - ${r.title}`));
  }

  // Press without images
  const pressNoImg = await client.execute('SELECT title FROM press WHERE image_id IS NULL');
  if (pressNoImg.rows.length > 0) {
    console.log(`\nPress items without images (${pressNoImg.rows.length}):`);
    pressNoImg.rows.forEach(r => console.log(`  - ${r.title}`));
  }

  // News without images
  const newsNoImg = await client.execute('SELECT title FROM news WHERE image_id IS NULL');
  if (newsNoImg.rows.length > 0) {
    console.log(`\nNews items without images (${newsNoImg.rows.length}):`);
    newsNoImg.rows.forEach(r => console.log(`  - ${r.title}`));
  }
}

async function main() {
  console.log('Starting image linking...\n');

  try {
    await linkExhibitionImages();
    await linkPressImages();
    await linkNewsImages();
    await showMissingImages();

    console.log('\n=== Done ===\n');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
