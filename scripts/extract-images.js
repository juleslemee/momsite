/**
 * Image Migration Script - Step 1: Extract unique image URLs
 *
 * This script parses all HTML files to find Artlogic and S3 image URLs,
 * deduplicates by hash, and prepares for download.
 */

const fs = require('fs');
const path = require('path');

const MOMSITE_DIR = path.join(__dirname, '..');
const BACKUP_CMS_DIR = '/Users/born2die/Code/Columbia/mom/backup_cms';

// Regex patterns for image URLs
const ARTLOGIC_PATTERN = /https:\/\/static-assets\.artlogic\.net\/[^"'\s)]+/g;
const S3_PATTERN = /https:\/\/s3\.amazonaws\.com\/files\.collageplatform\.com\.prod\/[^"'\s)]+/g;

// Extract hash from URL
function extractHash(url) {
  // Artlogic: .../539f1b2ba9aa2c31208b4568/HASH.jpeg
  // S3: .../539f1b2ba9aa2c31208b4568/HASH.png
  const match = url.match(/\/([a-f0-9]{32})\.(jpeg|jpg|png|gif)/i);
  return match ? match[1] : null;
}

// Get highest resolution URL for an artlogic image
function getHighResUrl(url) {
  // Replace size params with max resolution
  return url.replace(/w_\d+,h_\d+/, 'w_3600,h_3600');
}

// Recursively find all HTML files
function findHtmlFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules, .git, etc.
      if (!['node_modules', '.git', 'build'].includes(entry.name)) {
        findHtmlFiles(fullPath, files);
      }
    } else if (entry.name.endsWith('.html')) {
      files.push(fullPath);
    }
  }
  return files;
}

// Extract URLs from HTML content
function extractUrls(content) {
  const artlogicUrls = content.match(ARTLOGIC_PATTERN) || [];
  const s3Urls = content.match(S3_PATTERN) || [];
  return [...artlogicUrls, ...s3Urls];
}

// Main extraction
function main() {
  console.log('=== Image URL Extraction ===\n');

  // Find all HTML files
  console.log('Scanning directories...');
  const momsiteFiles = findHtmlFiles(MOMSITE_DIR);
  const backupFiles = findHtmlFiles(BACKUP_CMS_DIR);

  console.log(`Found ${momsiteFiles.length} HTML files in momsite`);
  console.log(`Found ${backupFiles.length} HTML files in backup_cms\n`);

  // Extract all URLs
  const allUrls = new Set();
  const urlsByHash = new Map(); // hash -> { urls: Set, highResUrl: string }

  const allFiles = [...momsiteFiles, ...backupFiles];
  let totalRefs = 0;

  for (const file of allFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const urls = extractUrls(content);
    totalRefs += urls.length;

    for (const url of urls) {
      allUrls.add(url);
      const hash = extractHash(url);
      if (hash) {
        if (!urlsByHash.has(hash)) {
          urlsByHash.set(hash, { urls: new Set(), highResUrl: null, extension: null });
        }
        const entry = urlsByHash.get(hash);
        entry.urls.add(url);

        // Track highest res URL (prefer w_3600)
        if (url.includes('artlogic.net')) {
          const highRes = getHighResUrl(url);
          entry.highResUrl = highRes;
          entry.extension = url.match(/\.(jpeg|jpg|png|gif)/i)?.[1] || 'jpeg';
        } else if (url.includes('s3.amazonaws.com') && !entry.highResUrl) {
          entry.highResUrl = url;
          entry.extension = url.match(/\.(jpeg|jpg|png|gif)/i)?.[1] || 'png';
        }
      }
    }
  }

  console.log(`Total URL references found: ${totalRefs}`);
  console.log(`Unique URLs: ${allUrls.size}`);
  console.log(`Unique images (by hash): ${urlsByHash.size}\n`);

  // Prepare download list
  const downloadList = [];
  for (const [hash, data] of urlsByHash) {
    if (data.highResUrl) {
      downloadList.push({
        hash,
        url: data.highResUrl,
        extension: data.extension,
        refCount: data.urls.size
      });
    }
  }

  // Sort by reference count (most used first)
  downloadList.sort((a, b) => b.refCount - a.refCount);

  // Save download list
  const outputPath = path.join(__dirname, 'download-list.json');
  fs.writeFileSync(outputPath, JSON.stringify(downloadList, null, 2));
  console.log(`Download list saved to: ${outputPath}`);
  console.log(`Total images to download: ${downloadList.length}\n`);

  // Show stats
  console.log('=== Top 10 Most Referenced Images ===');
  for (const img of downloadList.slice(0, 10)) {
    console.log(`  ${img.hash}.${img.extension} - ${img.refCount} refs`);
  }

  // Estimate size
  console.log('\n=== Size Estimate ===');
  console.log(`Assuming ~500KB avg per image: ~${Math.round(downloadList.length * 0.5)}MB total`);
  console.log(`Assuming ~1MB avg per image: ~${Math.round(downloadList.length)}MB total`);

  return downloadList;
}

main();
