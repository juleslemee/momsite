/**
 * R2 Upload Script - Upload WebP images to Cloudflare R2
 *
 * Prerequisites:
 * 1. Create Cloudflare account and R2 bucket
 * 2. Create API token with R2 read/write permissions
 * 3. Create .env file with credentials (see .env.example)
 *
 * Usage:
 *   node scripts/upload-to-r2.js
 *
 * The script uploads all WebP variants and tracks progress for resume capability.
 */

const fs = require('fs');
const path = require('path');

// Check for AWS SDK
let S3Client, PutObjectCommand;
try {
  const aws = require('@aws-sdk/client-s3');
  S3Client = aws.S3Client;
  PutObjectCommand = aws.PutObjectCommand;
} catch (e) {
  console.log('AWS SDK not installed. Installing...');
  const { execSync } = require('child_process');
  execSync('npm install @aws-sdk/client-s3', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  const aws = require('@aws-sdk/client-s3');
  S3Client = aws.S3Client;
  PutObjectCommand = aws.PutObjectCommand;
}

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const WEBP_DIR = path.join(__dirname, '..', 'images-webp');
const PROGRESS_FILE = path.join(__dirname, 'r2-upload-progress.json');

// R2 Configuration
const R2_CONFIG = {
  accountId: process.env.R2_ACCOUNT_ID,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucketName: process.env.R2_BUCKET_NAME || 'murielguepin-images',
  publicUrl: process.env.R2_PUBLIC_URL, // e.g., https://images.murielguepingallery.com
};

// Validate configuration
function validateConfig() {
  const required = ['accountId', 'accessKeyId', 'secretAccessKey'];
  const missing = required.filter(key => !R2_CONFIG[key]);

  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    console.error(missing.map(k => `  - R2_${k.replace(/([A-Z])/g, '_$1').toUpperCase()}`).join('\n'));
    console.error('\nCreate a .env file with:');
    console.error(`
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=murielguepin-images
R2_PUBLIC_URL=https://your-bucket.your-account.r2.dev
`);
    process.exit(1);
  }
}

// Initialize S3 client for R2
function createR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_CONFIG.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_CONFIG.accessKeyId,
      secretAccessKey: R2_CONFIG.secretAccessKey,
    },
  });
}

// Load/save progress
let progress = { completed: [], failed: [], stats: { files: 0, bytes: 0 } };
if (fs.existsSync(PROGRESS_FILE)) {
  progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
}

function saveProgress() {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// Get content type for file
function getContentType(filename) {
  if (filename.endsWith('.webp')) return 'image/webp';
  if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) return 'image/jpeg';
  if (filename.endsWith('.png')) return 'image/png';
  if (filename.endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
}

// Upload a single file to R2
async function uploadFile(client, localPath, r2Key) {
  const fileContent = fs.readFileSync(localPath);
  const contentType = getContentType(r2Key);

  const command = new PutObjectCommand({
    Bucket: R2_CONFIG.bucketName,
    Key: r2Key,
    Body: fileContent,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable', // 1 year cache
  });

  await client.send(command);
  return fileContent.length;
}

// Upload all images with concurrency control
async function uploadAll(concurrency = 10) {
  validateConfig();

  console.log('=== R2 Upload ===\n');
  console.log(`Bucket: ${R2_CONFIG.bucketName}`);
  console.log(`Endpoint: https://${R2_CONFIG.accountId}.r2.cloudflarestorage.com\n`);

  const client = createR2Client();

  // Get list of image directories (each hash has its own folder)
  const hashDirs = fs.readdirSync(WEBP_DIR).filter(f =>
    fs.statSync(path.join(WEBP_DIR, f)).isDirectory()
  );

  // Build list of all files to upload
  const filesToUpload = [];
  for (const hash of hashDirs) {
    const dirPath = path.join(WEBP_DIR, hash);
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      filesToUpload.push({
        hash,
        filename: file,
        localPath: path.join(dirPath, file),
        r2Key: `images/${hash}/${file}`,
      });
    }
  }

  const completedSet = new Set(progress.completed);
  const toUpload = filesToUpload.filter(f => !completedSet.has(f.r2Key));

  console.log(`Total files: ${filesToUpload.length}`);
  console.log(`Already uploaded: ${progress.completed.length}`);
  console.log(`To upload: ${toUpload.length}\n`);

  if (toUpload.length === 0) {
    console.log('All files already uploaded!');
    showSummary();
    return;
  }

  let uploaded = 0;
  let failed = 0;
  let bytesUploaded = 0;
  const startTime = Date.now();

  // Process in batches
  for (let i = 0; i < toUpload.length; i += concurrency) {
    const batch = toUpload.slice(i, i + concurrency);

    await Promise.all(
      batch.map(async (file) => {
        try {
          const bytes = await uploadFile(client, file.localPath, file.r2Key);
          progress.completed.push(file.r2Key);
          progress.stats.files++;
          progress.stats.bytes += bytes;
          bytesUploaded += bytes;
          uploaded++;
        } catch (err) {
          console.error(`\nFailed: ${file.r2Key} - ${err.message}`);
          progress.failed.push({ key: file.r2Key, error: err.message });
          failed++;
        }
      })
    );

    // Progress update
    const total = uploaded + failed;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = total / elapsed;
    const remaining = (toUpload.length - total) / rate;
    const mbUploaded = bytesUploaded / 1024 / 1024;

    process.stdout.write(
      `\rProgress: ${total}/${toUpload.length} (${uploaded} ok, ${failed} failed) - ` +
      `${rate.toFixed(1)}/sec - ${mbUploaded.toFixed(1)} MB - ETA: ${Math.round(remaining)}s   `
    );

    // Save progress periodically
    if (total % 100 === 0) {
      saveProgress();
    }
  }

  saveProgress();

  console.log('\n\n=== Upload Complete ===');
  console.log(`Successfully uploaded: ${uploaded}`);
  console.log(`Failed: ${failed}`);

  showSummary();
}

function showSummary() {
  console.log('\n=== Summary ===');
  console.log(`Total files in R2: ${progress.completed.length}`);
  console.log(`Total size: ${(progress.stats.bytes / 1024 / 1024 / 1024).toFixed(2)} GB`);

  if (R2_CONFIG.publicUrl) {
    console.log(`\nPublic URL format:`);
    console.log(`  ${R2_CONFIG.publicUrl}/images/{hash}/{size}.webp`);
    console.log(`\nExample:`);
    const exampleHash = progress.completed[0]?.split('/')[1] || 'abc123';
    console.log(`  ${R2_CONFIG.publicUrl}/images/${exampleHash}/display.webp`);
  }

  if (progress.failed.length > 0) {
    console.log(`\nFailed uploads saved to: ${PROGRESS_FILE}`);
    console.log('Re-run the script to retry failed uploads.');
  }
}

// Generate URL mapping for HTML replacement
function generateUrlMapping() {
  const mapping = {};

  for (const key of progress.completed) {
    // key format: images/{hash}/{size}.webp
    const parts = key.split('/');
    if (parts.length === 3) {
      const hash = parts[1];
      const size = parts[2].replace('.webp', '');

      if (!mapping[hash]) {
        mapping[hash] = {};
      }
      mapping[hash][size] = `${R2_CONFIG.publicUrl}/${key}`;
    }
  }

  fs.writeFileSync(
    path.join(__dirname, 'r2-url-mapping.json'),
    JSON.stringify(mapping, null, 2)
  );
  console.log(`\nURL mapping saved to scripts/r2-url-mapping.json`);
}

// Main
async function main() {
  await uploadAll(10);

  if (progress.completed.length > 0 && R2_CONFIG.publicUrl) {
    generateUrlMapping();
  }
}

main().catch(console.error);
