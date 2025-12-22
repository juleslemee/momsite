/**
 * Download missing images from S3 and upload to R2
 * Creates image records and links them to exhibitions/press/news
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import { createClient } from '@libsql/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

dotenv.config();

const dbClient = createClient({
  url: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME!;
const BACKUP_PATH = '/Users/born2die/Code/Columbia/mom/backup_cms/accounts.exhibit-e.com/application/539f1b2ba9aa2c31208b4568/content/r';

interface MissingImage {
  type: 'exhibition' | 'press' | 'news';
  title: string;
  s3Url: string;
  s3Hash: string;
}

function extractHashFromS3Url(url: string): string | null {
  const match = url.match(/\/([a-f0-9]{32})\.\w+$/);
  return match ? match[1] : null;
}

function parseHtmlForImages(html: string, type: 'exhibition' | 'press' | 'news'): MissingImage[] {
  const items: MissingImage[] = [];

  if (type === 'exhibition') {
    const rowRegex = /<tr class="(odd|even)" role="row">([\s\S]*?)<\/tr>/g;
    let match;
    while ((match = rowRegex.exec(html)) !== null) {
      const rowContent = match[2];
      const imgMatch = rowContent.match(/src="(https:\/\/s3\.amazonaws\.com[^"]+)"/);
      const titleMatch = rowContent.match(/<td class="title">[\s\S]*?<div class="col-name">Title<\/div>[\s\S]*?<div class="col-content">([^<]*)<\/div>/);

      if (imgMatch && titleMatch) {
        const s3Hash = extractHashFromS3Url(imgMatch[1]);
        if (s3Hash) {
          items.push({
            type,
            title: titleMatch[1].trim(),
            s3Url: imgMatch[1],
            s3Hash,
          });
        }
      }
    }
  } else {
    const rowRegex = /<tr class="item[^"]*"[^>]*>([\s\S]*?)<\/tr>/g;
    let match;
    while ((match = rowRegex.exec(html)) !== null) {
      const rowContent = match[1];
      const imgMatch = rowContent.match(/src="(https:\/\/s3\.amazonaws\.com[^"]+)"/);
      const titleTdMatch = rowContent.match(/<td class="title">[\s\S]*?<div class="col-content">([^<]*)<\/div>/);

      if (imgMatch && titleTdMatch) {
        const s3Hash = extractHashFromS3Url(imgMatch[1]);
        if (s3Hash) {
          items.push({
            type,
            title: titleTdMatch[1].replace(/&amp;/g, '&').trim(),
            s3Url: imgMatch[1],
            s3Hash,
          });
        }
      }
    }
  }

  return items;
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`  Failed to download: ${response.status}`);
      return null;
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.log(`  Download error: ${error}`);
    return null;
  }
}

async function uploadToR2(hash: string, imageBuffer: Buffer, contentType: string): Promise<boolean> {
  try {
    // Upload as thumbnail.webp (we only have the thumbnail)
    const key = `images/${hash}/thumbnail.webp`;

    await r2Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: imageBuffer,
      ContentType: contentType,
    }));

    return true;
  } catch (error) {
    console.log(`  Upload error: ${error}`);
    return false;
  }
}

async function createImageRecord(hash: string): Promise<string | null> {
  const id = crypto.randomUUID();

  try {
    // Check if image already exists
    const existing = await dbClient.execute({
      sql: 'SELECT id FROM images WHERE hash = ?',
      args: [hash],
    });

    if (existing.rows.length > 0) {
      return existing.rows[0].id as string;
    }

    // Create new image record
    const variants = JSON.stringify({
      thumbnail: `images/${hash}/thumbnail.webp`,
    });

    await dbClient.execute({
      sql: 'INSERT INTO images (id, hash, variants, created_at) VALUES (?, ?, ?, ?)',
      args: [id, hash, variants, Date.now()],
    });

    return id;
  } catch (error) {
    console.log(`  DB error: ${error}`);
    return null;
  }
}

async function linkImageToRecord(type: 'exhibition' | 'press' | 'news', title: string, imageId: string): Promise<boolean> {
  try {
    let sql: string;
    if (type === 'exhibition') {
      sql = 'UPDATE exhibitions SET cover_image_id = ? WHERE LOWER(title) = LOWER(?) AND cover_image_id IS NULL';
    } else if (type === 'press') {
      sql = 'UPDATE press SET image_id = ? WHERE LOWER(title) = LOWER(?) AND image_id IS NULL';
    } else {
      sql = 'UPDATE news SET image_id = ? WHERE LOWER(title) = LOWER(?) AND image_id IS NULL';
    }

    const result = await dbClient.execute({ sql, args: [imageId, title] });
    return result.rowsAffected > 0;
  } catch (error) {
    console.log(`  Link error: ${error}`);
    return false;
  }
}

async function processImages(type: 'exhibition' | 'press' | 'news') {
  const filename = type === 'exhibition' ? 'exhibitions.html' : `${type}.html`;
  console.log(`\n=== Processing ${type} images ===\n`);

  const html = fs.readFileSync(`${BACKUP_PATH}/${filename}`, 'utf-8');
  const items = parseHtmlForImages(html, type);

  console.log(`Found ${items.length} items with images`);

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    // Check if already has an image linked
    let checkSql: string;
    if (type === 'exhibition') {
      checkSql = 'SELECT cover_image_id FROM exhibitions WHERE LOWER(title) = LOWER(?)';
    } else if (type === 'press') {
      checkSql = 'SELECT image_id FROM press WHERE LOWER(title) = LOWER(?)';
    } else {
      checkSql = 'SELECT image_id FROM news WHERE LOWER(title) = LOWER(?)';
    }

    const existing = await dbClient.execute({ sql: checkSql, args: [item.title] });
    if (existing.rows.length === 0) {
      continue; // Record doesn't exist in DB
    }

    const imageIdCol = type === 'exhibition' ? 'cover_image_id' : 'image_id';
    if (existing.rows[0][imageIdCol]) {
      skipped++;
      continue; // Already has an image
    }

    console.log(`Processing: ${item.title}`);

    // Check if image already exists in DB (by hash)
    const existingImg = await dbClient.execute({
      sql: 'SELECT id FROM images WHERE hash = ?',
      args: [item.s3Hash],
    });

    let imageId: string | null = null;

    if (existingImg.rows.length > 0) {
      imageId = existingImg.rows[0].id as string;
      console.log(`  Found existing image: ${item.s3Hash}`);
    } else {
      // Download and upload
      console.log(`  Downloading from S3...`);
      const imageBuffer = await downloadImage(item.s3Url);

      if (!imageBuffer) {
        console.log(`  ✗ Failed to download`);
        failed++;
        continue;
      }

      // Determine content type
      const ext = item.s3Url.split('.').pop()?.toLowerCase() || 'png';
      const contentType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
                          ext === 'gif' ? 'image/gif' : 'image/png';

      console.log(`  Uploading to R2...`);
      const uploaded = await uploadToR2(item.s3Hash, imageBuffer, contentType);

      if (!uploaded) {
        console.log(`  ✗ Failed to upload`);
        failed++;
        continue;
      }

      // Create DB record
      imageId = await createImageRecord(item.s3Hash);
      if (!imageId) {
        console.log(`  ✗ Failed to create DB record`);
        failed++;
        continue;
      }
    }

    // Link to record
    const linked = await linkImageToRecord(type, item.title, imageId);
    if (linked) {
      console.log(`  ✓ Linked successfully`);
      processed++;
    } else {
      console.log(`  ✗ Failed to link`);
      failed++;
    }
  }

  console.log(`\n${type}: ${processed} processed, ${skipped} already had images, ${failed} failed`);
}

async function main() {
  console.log('Starting image download and upload...');

  try {
    await processImages('exhibition');
    await processImages('press');
    await processImages('news');

    // Final summary
    console.log('\n=== Final Summary ===\n');

    const exNoImg = await dbClient.execute('SELECT COUNT(*) as count FROM exhibitions WHERE cover_image_id IS NULL');
    const pressNoImg = await dbClient.execute('SELECT COUNT(*) as count FROM press WHERE image_id IS NULL');
    const newsNoImg = await dbClient.execute('SELECT COUNT(*) as count FROM news WHERE image_id IS NULL');

    console.log(`Exhibitions without images: ${exNoImg.rows[0].count}`);
    console.log(`Press without images: ${pressNoImg.rows[0].count}`);
    console.log(`News without images: ${newsNoImg.rows[0].count}`);

    console.log('\n=== Done ===');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
