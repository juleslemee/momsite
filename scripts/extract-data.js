/**
 * Data Extraction Script - Parse HTML files to extract structured data
 *
 * Extracts:
 * - Artists (name, slug, biography, artworks)
 * - Exhibitions (title, dates, status, artworks, linked artists)
 * - Artworks (title, medium, dimensions, year, images)
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const MOMSITE_DIR = path.join(__dirname, '..');
const BACKUP_CMS_DIR = '/Users/born2die/Code/Columbia/mom/backup_cms';
const OUTPUT_DIR = path.join(__dirname, '..', 'data');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Extract image hash from URL
function extractImageHash(url) {
  if (!url) return null;
  const match = url.match(/\/([a-f0-9]{32})\.(jpeg|jpg|png|gif)/i);
  return match ? match[1] : null;
}

// Parse a single artist page
function parseArtistPage(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const $ = cheerio.load(html);

  const slug = path.basename(htmlPath, '.html');
  const name = $('h1').first().text().trim();

  // Extract biography from meta description or content
  let biography = '';
  const bioSection = $('.biography, .artist-biography, [class*="bio"]').first();
  if (bioSection.length) {
    biography = bioSection.html();
  } else {
    // Fall back to meta description
    biography = $('meta[name="description"]').attr('content') || '';
  }

  // Extract profile image
  const profileImg = $('.entry img, .artist-image img').first();
  const profileImageHash = extractImageHash(profileImg.attr('src') || profileImg.attr('data-src'));

  // Extract featured works
  const artworks = [];
  $('#featured-works .slide, .featured-works .slide').each((i, el) => {
    const $slide = $(el);
    const $fig = $slide.find('figcaption');
    const $img = $slide.find('img');

    const parts = $fig.find('p').map((_, p) => $(p).text().trim()).get();

    const artwork = {
      title: parts[1] || '',
      artistName: parts[0] || name,
      medium: parts[2] || '',
      dimensions: parts[3] || '',
      year: parts[4] || '',
      imageHash: extractImageHash($img.attr('src') || $img.attr('data-src')),
      enlargeHash: extractImageHash($img.attr('data-enlarge')),
      sortOrder: i,
    };

    if (artwork.title || artwork.imageHash) {
      artworks.push(artwork);
    }
  });

  return {
    slug,
    name,
    biography: biography.substring(0, 5000), // Truncate very long bios
    profileImageHash,
    artworks,
    isEnabled: true,
  };
}

// Parse exhibition page
function parseExhibitionPage(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const $ = cheerio.load(html);

  const slug = path.basename(htmlPath, '.html');
  const title = $('h1').first().text().trim();

  // Extract date from h3 or date element
  const dateText = $('h3, .date, .exhibition-date').first().text().trim();

  // Try to parse date range
  let startDate = null;
  let endDate = null;
  const dateMatch = dateText.match(/(\w+ \d+)[–-](\w+ \d+),?\s*(\d{4})/i);
  if (dateMatch) {
    const year = dateMatch[3];
    startDate = `${dateMatch[1]}, ${year}`;
    endDate = `${dateMatch[2]}, ${year}`;
  }

  // Extract subtitle/description
  const subtitle = $('h2').first().text().trim();
  const subtitle2 = $('h2').eq(1).text().trim();

  // Determine status based on path
  const isPast = htmlPath.includes('/past/') || htmlPath.includes('exhibitions/past');
  const status = isPast ? 'past' : 'current';

  // Extract cover image
  const coverImg = $('figure img, .exhibition-image img').first();
  const coverImageHash = extractImageHash(coverImg.attr('src') || coverImg.attr('data-src'));

  // Extract artworks in exhibition
  const artworks = [];
  $('#selected-works .slide, .selected-works .slide').each((i, el) => {
    const $slide = $(el);
    const $fig = $slide.find('figcaption');
    const $img = $slide.find('img');

    const parts = $fig.find('p').map((_, p) => $(p).text().trim()).get();

    artworks.push({
      artistName: parts[0] || '',
      title: parts[1] || '',
      medium: parts[2] || '',
      dimensions: parts[3] || '',
      year: parts[4] || '',
      imageHash: extractImageHash($img.attr('src') || $img.attr('data-src')),
      sortOrder: i,
    });
  });

  // Extract linked artists
  const linkedArtists = [];
  $('.artists-list a, .related-artists a').each((i, el) => {
    const href = $(el).attr('href');
    if (href && href.includes('/artists/')) {
      const artistSlug = path.basename(href, '.html');
      linkedArtists.push(artistSlug);
    }
  });

  return {
    slug,
    title,
    subtitle,
    subtitle2,
    startDate,
    endDate,
    dateText,
    status,
    coverImageHash,
    artworks,
    linkedArtists,
    isEnabled: true,
  };
}

// Parse archived artists from backup CMS
function parseBackupCmsArtists() {
  const artistDir = path.join(
    BACKUP_CMS_DIR,
    'accounts.exhibit-e.com/application/539f1b2ba9aa2c31208b4568/content/edit/Artist'
  );

  if (!fs.existsSync(artistDir)) {
    console.log('Backup CMS artist directory not found');
    return [];
  }

  const archivedArtists = [];
  const files = fs.readdirSync(artistDir).filter(f => f.endsWith('.html'));

  for (const file of files) {
    try {
      const html = fs.readFileSync(path.join(artistDir, file), 'utf-8');
      const $ = cheerio.load(html);

      // Extract name from form input
      const name = $('input[name="form[title]"], input#form_title').val() || '';

      // Check if enabled
      const isEnabled = $('input[name="form[enabled]"]').is(':checked');

      // Extract profile image from S3 URL
      const imgSrc = $('img').first().attr('src') || '';
      const imageHash = extractImageHash(imgSrc);

      if (name) {
        archivedArtists.push({
          id: path.basename(file, '.html'),
          name: name.trim(),
          slug: name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
          profileImageHash: imageHash,
          isEnabled: isEnabled,
          isArchived: true,
        });
      }
    } catch (err) {
      console.error(`Error parsing ${file}: ${err.message}`);
    }
  }

  return archivedArtists;
}

async function main() {
  console.log('=== Data Extraction ===\n');

  // 1. Parse artist pages
  console.log('Parsing artist pages...');
  const artistsDir = path.join(MOMSITE_DIR, 'artists');
  const artistFiles = fs.readdirSync(artistsDir).filter(f => f.endsWith('.html'));

  const artists = [];
  for (const file of artistFiles) {
    try {
      const artist = parseArtistPage(path.join(artistsDir, file));
      artists.push(artist);
      process.stdout.write(`\rParsed ${artists.length}/${artistFiles.length} artists`);
    } catch (err) {
      console.error(`\nError parsing ${file}: ${err.message}`);
    }
  }
  console.log(`\nFound ${artists.length} artists`);

  // 2. Parse archived artists from backup CMS
  console.log('\nParsing archived artists from backup CMS...');
  const archivedArtists = parseBackupCmsArtists();
  console.log(`Found ${archivedArtists.length} artists in backup CMS`);

  // Merge: add archived artists not in current site
  const currentSlugs = new Set(artists.map(a => a.slug));
  const newArchived = archivedArtists.filter(a => !currentSlugs.has(a.slug));
  console.log(`${newArchived.length} archived artists not on current site`);

  // Add as disabled
  for (const archived of newArchived) {
    artists.push({
      ...archived,
      biography: '',
      artworks: [],
      isEnabled: false,
    });
  }

  // 3. Parse exhibition pages
  console.log('\nParsing exhibition pages...');
  const exhibitionsDir = path.join(MOMSITE_DIR, 'exhibitions');
  const exhibitionFiles = [];

  // Get all exhibition files (including in past/ subdirectory)
  function findExhibitionFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findExhibitionFiles(fullPath);
      } else if (entry.name.endsWith('.html')) {
        exhibitionFiles.push(fullPath);
      }
    }
  }
  findExhibitionFiles(exhibitionsDir);

  const exhibitions = [];
  for (const file of exhibitionFiles) {
    try {
      const exhibition = parseExhibitionPage(file);
      exhibitions.push(exhibition);
      process.stdout.write(`\rParsed ${exhibitions.length}/${exhibitionFiles.length} exhibitions`);
    } catch (err) {
      console.error(`\nError parsing ${file}: ${err.message}`);
    }
  }
  console.log(`\nFound ${exhibitions.length} exhibitions`);

  // 4. Build image manifest
  console.log('\nBuilding image manifest...');
  const imageHashes = new Set();

  for (const artist of artists) {
    if (artist.profileImageHash) imageHashes.add(artist.profileImageHash);
    for (const artwork of artist.artworks || []) {
      if (artwork.imageHash) imageHashes.add(artwork.imageHash);
      if (artwork.enlargeHash) imageHashes.add(artwork.enlargeHash);
    }
  }

  for (const exhibition of exhibitions) {
    if (exhibition.coverImageHash) imageHashes.add(exhibition.coverImageHash);
    for (const artwork of exhibition.artworks || []) {
      if (artwork.imageHash) imageHashes.add(artwork.imageHash);
    }
  }

  console.log(`Found ${imageHashes.size} unique image hashes in content`);

  // 5. Save extracted data
  console.log('\nSaving data...');

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'artists.json'),
    JSON.stringify(artists, null, 2)
  );
  console.log(`Saved ${artists.length} artists to data/artists.json`);

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'exhibitions.json'),
    JSON.stringify(exhibitions, null, 2)
  );
  console.log(`Saved ${exhibitions.length} exhibitions to data/exhibitions.json`);

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'images.json'),
    JSON.stringify([...imageHashes], null, 2)
  );
  console.log(`Saved ${imageHashes.size} image hashes to data/images.json`);

  // Summary stats
  console.log('\n=== Summary ===');
  console.log(`Artists: ${artists.length} (${artists.filter(a => a.isEnabled).length} enabled)`);
  console.log(`Exhibitions: ${exhibitions.length}`);
  console.log(`  - Current: ${exhibitions.filter(e => e.status === 'current').length}`);
  console.log(`  - Past: ${exhibitions.filter(e => e.status === 'past').length}`);
  console.log(`Total artworks: ${artists.reduce((sum, a) => sum + (a.artworks?.length || 0), 0)}`);
  console.log(`Unique images: ${imageHashes.size}`);
}

main().catch(console.error);
