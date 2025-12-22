/**
 * Image Conversion Script - Convert all images to WebP with multiple sizes
 *
 * Generates:
 * - thumbnail: 320x320 (grid thumbnails)
 * - card: 560x320 (exhibition cards)
 * - display: 1500x1000 (slider display)
 * - enlarge: 3600x3600 (zoom view)
 * - original: preserved as-is
 */

const fs = require('fs');
const path = require('path');

// Check if sharp is installed
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.log('Sharp not installed. Installing...');
  const { execSync } = require('child_process');
  execSync('npm install sharp', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  sharp = require('sharp');
}

const INPUT_DIR = path.join(__dirname, '..', 'images-backup');
const OUTPUT_DIR = path.join(__dirname, '..', 'images-webp');
const PROGRESS_FILE = path.join(__dirname, 'webp-progress.json');

// Size configurations matching the site's srcset patterns
const SIZES = {
  thumbnail: { width: 320, height: 320, fit: 'cover' },
  thumbnail_2x: { width: 640, height: 640, fit: 'cover' },
  card: { width: 560, height: 320, fit: 'cover' },
  card_2x: { width: 1120, height: 640, fit: 'cover' },
  display: { width: 1500, height: 1000, fit: 'inside' },
  display_sm: { width: 750, height: 500, fit: 'inside' },
  enlarge: { width: 1800, height: 1800, fit: 'inside' },
  enlarge_2x: { width: 3600, height: 3600, fit: 'inside' },
};

// Load progress for resume capability
let progress = { completed: [], failed: [], stats: { original: 0, webp: 0 } };
if (fs.existsSync(PROGRESS_FILE)) {
  progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
}

function saveProgress() {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function processImage(filename) {
  const inputPath = path.join(INPUT_DIR, filename);
  const hash = path.basename(filename, path.extname(filename));
  const outputSubdir = path.join(OUTPUT_DIR, hash);

  // Create output directory for this image
  if (!fs.existsSync(outputSubdir)) {
    fs.mkdirSync(outputSubdir, { recursive: true });
  }

  const inputBuffer = fs.readFileSync(inputPath);
  const originalSize = inputBuffer.length;
  let totalWebpSize = 0;

  // Get original dimensions
  const metadata = await sharp(inputBuffer).metadata();

  // Process each size
  for (const [sizeName, config] of Object.entries(SIZES)) {
    const outputPath = path.join(outputSubdir, `${sizeName}.webp`);

    // Skip if already exists
    if (fs.existsSync(outputPath)) {
      totalWebpSize += fs.statSync(outputPath).size;
      continue;
    }

    try {
      const processed = await sharp(inputBuffer)
        .resize(config.width, config.height, {
          fit: config.fit,
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .toBuffer();

      fs.writeFileSync(outputPath, processed);
      totalWebpSize += processed.length;
    } catch (err) {
      console.error(`  Error processing ${sizeName} for ${hash}: ${err.message}`);
    }
  }

  // Also save original as webp (for archival, max quality)
  const originalWebpPath = path.join(outputSubdir, 'original.webp');
  if (!fs.existsSync(originalWebpPath)) {
    try {
      const originalWebp = await sharp(inputBuffer)
        .webp({ quality: 95, lossless: metadata.format === 'png' })
        .toBuffer();
      fs.writeFileSync(originalWebpPath, originalWebp);
      totalWebpSize += originalWebp.length;
    } catch (err) {
      console.error(`  Error converting original for ${hash}: ${err.message}`);
    }
  }

  return { originalSize, webpSize: totalWebpSize };
}

async function main() {
  console.log('=== WebP Conversion ===\n');

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Get list of images to process
  const allFiles = fs.readdirSync(INPUT_DIR).filter(f =>
    /\.(jpe?g|png|gif|webp)$/i.test(f)
  );

  const completedSet = new Set(progress.completed);
  const toProcess = allFiles.filter(f => !completedSet.has(f));

  console.log(`Total images: ${allFiles.length}`);
  console.log(`Already processed: ${progress.completed.length}`);
  console.log(`To process: ${toProcess.length}\n`);

  if (toProcess.length === 0) {
    console.log('All images already converted!');
    showStats();
    return;
  }

  let processed = 0;
  let failed = 0;
  const startTime = Date.now();

  for (const filename of toProcess) {
    try {
      const result = await processImage(filename);
      progress.completed.push(filename);
      progress.stats.original += result.originalSize;
      progress.stats.webp += result.webpSize;
      processed++;

      // Progress update
      const total = processed + failed;
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = total / elapsed;
      const remaining = (toProcess.length - total) / rate;

      process.stdout.write(
        `\rProgress: ${total}/${toProcess.length} - ${rate.toFixed(1)}/sec - ETA: ${Math.round(remaining)}s   `
      );

      // Save progress periodically
      if (total % 50 === 0) {
        saveProgress();
      }
    } catch (err) {
      console.error(`\nFailed: ${filename} - ${err.message}`);
      progress.failed.push({ filename, error: err.message });
      failed++;
    }
  }

  saveProgress();

  console.log(`\n\n=== Conversion Complete ===`);
  console.log(`Successfully converted: ${processed}`);
  console.log(`Failed: ${failed}`);

  showStats();
}

function showStats() {
  // Calculate total sizes
  let totalOriginal = 0;
  let totalWebp = 0;

  const files = fs.readdirSync(INPUT_DIR);
  for (const f of files) {
    if (/\.(jpe?g|png|gif|webp)$/i.test(f)) {
      totalOriginal += fs.statSync(path.join(INPUT_DIR, f)).size;
    }
  }

  // Count webp output
  if (fs.existsSync(OUTPUT_DIR)) {
    const subdirs = fs.readdirSync(OUTPUT_DIR);
    for (const subdir of subdirs) {
      const subdirPath = path.join(OUTPUT_DIR, subdir);
      if (fs.statSync(subdirPath).isDirectory()) {
        const webpFiles = fs.readdirSync(subdirPath);
        for (const wf of webpFiles) {
          totalWebp += fs.statSync(path.join(subdirPath, wf)).size;
        }
      }
    }
  }

  console.log(`\n=== Size Comparison ===`);
  console.log(`Original images: ${(totalOriginal / 1024 / 1024 / 1024).toFixed(2)} GB`);
  console.log(`WebP output (all sizes): ${(totalWebp / 1024 / 1024 / 1024).toFixed(2)} GB`);
  console.log(`Savings: ${(100 - (totalWebp / totalOriginal) * 100).toFixed(1)}%`);
}

main().catch(console.error);
