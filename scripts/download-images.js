/**
 * Image Migration Script - Step 2: Download all images
 *
 * Downloads all unique images to local backup folder.
 * Handles Artlogic's hotlink protection by using proper headers.
 * Falls back to smaller sizes if high-res fails.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const DOWNLOAD_DIR = path.join(__dirname, '..', 'images-backup');
const DOWNLOAD_LIST = path.join(__dirname, 'download-list.json');
const PROGRESS_FILE = path.join(__dirname, 'download-progress.json');

// Ensure download directory exists
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// Load download list
const downloadList = JSON.parse(fs.readFileSync(DOWNLOAD_LIST, 'utf-8'));

// Load progress (for resume capability)
let progress = { completed: [], failed: [] };
if (fs.existsSync(PROGRESS_FILE)) {
  progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
}

function saveProgress() {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// Size fallback order (try largest first, fall back to smaller)
const SIZES = [
  { width: 3600, height: 3600 },
  { width: 1800, height: 1800 },
  { width: 1500, height: 1000 },
  { width: 750, height: 500 },
  { width: 560, height: 320 },
  { width: 320, height: 320 },
  { width: 280, height: 400 },
];

// Generate URL variants for an image
function getUrlVariants(originalUrl) {
  const variants = [originalUrl];

  // For artlogic URLs, generate size variants
  if (originalUrl.includes('artlogic.net')) {
    for (const size of SIZES) {
      const variant = originalUrl.replace(
        /w_\d+,h_\d+/,
        `w_${size.width},h_${size.height}`
      );
      if (!variants.includes(variant)) {
        variants.push(variant);
      }
    }
  }

  return variants;
}

// Download a single file with proper headers
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://www.murielguepingallery.com/',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Connection: 'keep-alive',
      },
    };

    const request = protocol.get(options, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      const fileStream = fs.createWriteStream(destPath);
      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });

      fileStream.on('error', (err) => {
        fs.unlink(destPath, () => {}); // Delete partial file
        reject(err);
      });
    });

    request.on('error', reject);
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('Timeout'));
    });
  });
}

// Try downloading with fallback to different sizes
async function downloadWithFallback(img, destPath) {
  const variants = getUrlVariants(img.url);

  for (const url of variants) {
    try {
      await downloadFile(url, destPath);
      return { success: true, url };
    } catch (err) {
      // Continue to next variant
    }
  }

  // Also try S3 direct URL if we have the hash
  if (img.hash) {
    const s3Url = `https://s3.amazonaws.com/files.collageplatform.com.prod/image_cache/original/539f1b2ba9aa2c31208b4568/${img.hash}.${img.extension}`;
    try {
      await downloadFile(s3Url, destPath);
      return { success: true, url: s3Url };
    } catch (err) {
      // S3 also failed
    }
  }

  return { success: false, error: 'All variants failed' };
}

// Batch download with concurrency limit
async function downloadAll(concurrency = 5) {
  const completedSet = new Set(progress.completed);
  const toDownload = downloadList.filter((img) => !completedSet.has(img.hash));

  console.log(`\n=== Image Download ===`);
  console.log(`Total images: ${downloadList.length}`);
  console.log(`Already downloaded: ${progress.completed.length}`);
  console.log(`To download: ${toDownload.length}`);
  console.log(`Concurrency: ${concurrency}\n`);

  if (toDownload.length === 0) {
    console.log('All images already downloaded!');
    return;
  }

  let downloaded = 0;
  let failed = 0;
  const startTime = Date.now();

  // Process in batches
  for (let i = 0; i < toDownload.length; i += concurrency) {
    const batch = toDownload.slice(i, i + concurrency);

    await Promise.all(
      batch.map(async (img) => {
        const filename = `${img.hash}.${img.extension}`;
        const destPath = path.join(DOWNLOAD_DIR, filename);

        // Skip if file already exists
        if (fs.existsSync(destPath)) {
          progress.completed.push(img.hash);
          downloaded++;
          return;
        }

        const result = await downloadWithFallback(img, destPath);

        if (result.success) {
          progress.completed.push(img.hash);
          downloaded++;
        } else {
          console.error(`  Failed: ${img.hash}`);
          progress.failed.push({ hash: img.hash, url: img.url, error: result.error });
          failed++;
        }
      })
    );

    // Progress update
    const total = downloaded + failed;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = total / elapsed;
    const remaining = (toDownload.length - total) / rate;

    process.stdout.write(
      `\rProgress: ${total}/${toDownload.length} (${downloaded} ok, ${failed} failed) - ` +
        `${rate.toFixed(1)}/sec - ETA: ${Math.round(remaining)}s   `
    );

    // Save progress periodically
    if (total % 50 === 0) {
      saveProgress();
    }

    // Small delay between batches to avoid rate limiting
    await new Promise((r) => setTimeout(r, 100));
  }

  saveProgress();

  console.log(`\n\n=== Download Complete ===`);
  console.log(`Successfully downloaded: ${downloaded}`);
  console.log(`Failed: ${failed}`);

  if (progress.failed.length > 0) {
    console.log(`\nFailed downloads saved to: ${PROGRESS_FILE}`);
    console.log('You may need to download these manually from the Artlogic CMS.');
  }

  // Calculate total size
  let totalSize = 0;
  const files = fs.readdirSync(DOWNLOAD_DIR);
  for (const file of files) {
    const stat = fs.statSync(path.join(DOWNLOAD_DIR, file));
    totalSize += stat.size;
  }
  console.log(`\nTotal downloaded: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
}

// Run with concurrency of 5 (lower to avoid rate limiting)
downloadAll(5).catch(console.error);
