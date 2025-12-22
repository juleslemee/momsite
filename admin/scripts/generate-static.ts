/**
 * Static Site Generator - Generate HTML files from database
 *
 * Run to publish the site:
 *   npx tsx scripts/generate-static.ts
 *
 * This generates:
 * - artists.html (grid of all artists)
 * - artists/*.html (individual artist pages)
 * - exhibitions.html (current exhibitions)
 * - exhibitions/*.html (individual exhibition pages)
 * - exhibitions/past/*.html (past exhibitions)
 */

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from '../src/db/schema';
import { eq, asc, desc } from 'drizzle-orm';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// Load environment
import 'dotenv/config';

const client = createClient({
  url: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const db = drizzle(client, { schema });

const OUTPUT_DIR = join(__dirname, '..', '..');
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || '';

// Helper to get image URL
function getImageUrl(hash: string | null, size: string): string {
  if (!hash) return '';
  return `${R2_PUBLIC_URL}/images/${hash}/${size}.webp`;
}

// Helper to escape HTML
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Template for artist grid item
function artistGridItem(artist: any): string {
  const imageUrl = artist.profileImage
    ? getImageUrl(artist.profileImage.hash, 'thumbnail')
    : '';
  const image2xUrl = artist.profileImage
    ? getImageUrl(artist.profileImage.hash, 'thumbnail_2x')
    : '';

  return `
    <li class="artist-item">
      <a href="/artists/${artist.slug}.html">
        <figure>
          <img
            src="${imageUrl}"
            srcset="${imageUrl} 1x, ${image2xUrl} 2x"
            alt="${escapeHtml(artist.name)}"
            loading="lazy"
          />
          <figcaption>
            <p class="artist-name">${escapeHtml(artist.name)}</p>
          </figcaption>
        </figure>
      </a>
    </li>
  `;
}

// Template for artwork slide
function artworkSlide(artwork: any, index: number): string {
  const primaryImage = artwork.images?.[0]?.image;
  if (!primaryImage) return '';

  const displayUrl = getImageUrl(primaryImage.hash, 'display');
  const displaySmUrl = getImageUrl(primaryImage.hash, 'display_sm');
  const enlargeUrl = getImageUrl(primaryImage.hash, 'enlarge_2x');

  return `
    <li class="slide" data-index="${index}">
      <figure>
        <img
          src="${displaySmUrl}"
          srcset="${displaySmUrl} 750w, ${displayUrl} 1500w"
          sizes="(max-width: 768px) 100vw, 80vw"
          data-enlarge="${enlargeUrl}"
          alt="${escapeHtml(artwork.title)}"
          loading="${index < 2 ? 'eager' : 'lazy'}"
        />
        <figcaption>
          <p class="artist-name">${escapeHtml(artwork.artist?.name || '')}</p>
          <p class="artwork-title"><em>${escapeHtml(artwork.title)}</em></p>
          <p class="artwork-medium">${escapeHtml(artwork.medium || '')}</p>
          <p class="artwork-dimensions">${escapeHtml(artwork.dimensions || '')}</p>
          <p class="artwork-year">${escapeHtml(artwork.year || '')}</p>
        </figcaption>
      </figure>
    </li>
  `;
}

async function generateArtistsGrid(): Promise<void> {
  console.log('Generating artists.html...');

  const artists = await db.query.artists.findMany({
    where: eq(schema.artists.isEnabled, true),
    with: { profileImage: true },
    orderBy: [asc(schema.artists.sortOrder), asc(schema.artists.name)],
  });

  const gridItems = artists.map(artistGridItem).join('');

  // Load template (you'd read from an existing template file)
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Artists | Muriel Guepin Gallery</title>
  <link rel="stylesheet" href="/style.a00fb4ff439aec84560b68d1f4100e68.css">
</head>
<body>
  <header class="site-header">
    <a href="/" class="logo">Muriel Guepin Gallery</a>
    <nav>
      <a href="/artists.html">Artists</a>
      <a href="/exhibitions.html">Exhibitions</a>
      <a href="/about.html">About</a>
      <a href="/contact.html">Contact</a>
    </nav>
  </header>

  <main>
    <h1>Artists</h1>
    <ul class="artists-grid">
      ${gridItems}
    </ul>
  </main>

  <footer class="site-footer">
    <p>&copy; ${new Date().getFullYear()} Muriel Guepin Gallery</p>
  </footer>
</body>
</html>`;

  writeFileSync(join(OUTPUT_DIR, 'artists.html'), html);
  console.log(`  Generated artists.html with ${artists.length} artists`);
}

async function generateArtistPages(): Promise<void> {
  console.log('Generating artist pages...');

  const artistsDir = join(OUTPUT_DIR, 'artists');
  if (!existsSync(artistsDir)) {
    mkdirSync(artistsDir, { recursive: true });
  }

  const artists = await db.query.artists.findMany({
    where: eq(schema.artists.isEnabled, true),
    with: {
      profileImage: true,
      artworks: {
        where: eq(schema.artworks.isEnabled, true),
        with: {
          images: {
            with: { image: true },
          },
        },
        orderBy: [asc(schema.artworks.sortOrder)],
      },
    },
    orderBy: [asc(schema.artists.sortOrder)],
  });

  for (const artist of artists) {
    const artworkSlides = artist.artworks
      .map((aw, i) => artworkSlide({ ...aw, artist }, i))
      .join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(artist.name)} | Muriel Guepin Gallery</title>
  <link rel="stylesheet" href="/style.a00fb4ff439aec84560b68d1f4100e68.css">
</head>
<body>
  <header class="site-header">
    <a href="/" class="logo">Muriel Guepin Gallery</a>
    <nav>
      <a href="/artists.html">Artists</a>
      <a href="/exhibitions.html">Exhibitions</a>
      <a href="/about.html">About</a>
      <a href="/contact.html">Contact</a>
    </nav>
  </header>

  <main class="artist-page">
    <h1>${escapeHtml(artist.name)}</h1>

    ${artist.biography ? `<div class="biography">${artist.biography}</div>` : ''}

    <section id="featured-works" class="artwork-slider">
      <h2>Featured Works</h2>
      <div class="slider-container">
        <ul class="slides">
          ${artworkSlides}
        </ul>
        <button class="slider-nav prev" aria-label="Previous">‹</button>
        <button class="slider-nav next" aria-label="Next">›</button>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <p>&copy; ${new Date().getFullYear()} Muriel Guepin Gallery</p>
  </footer>

  <script src="/build/main.js"></script>
</body>
</html>`;

    writeFileSync(join(artistsDir, `${artist.slug}.html`), html);
  }

  console.log(`  Generated ${artists.length} artist pages`);
}

async function generateExhibitionsGrid(): Promise<void> {
  console.log('Generating exhibitions.html...');

  const currentExhibitions = await db.query.exhibitions.findMany({
    where: eq(schema.exhibitions.status, 'current'),
    with: { coverImage: true },
    orderBy: [asc(schema.exhibitions.sortOrder)],
  });

  const exhibitionCards = currentExhibitions
    .map((exhibition) => {
      const imageUrl = exhibition.coverImage
        ? getImageUrl(exhibition.coverImage.hash, 'card')
        : '';
      const image2xUrl = exhibition.coverImage
        ? getImageUrl(exhibition.coverImage.hash, 'card_2x')
        : '';

      return `
      <li class="exhibition-card">
        <a href="/exhibitions/${exhibition.slug}.html">
          <figure>
            <img
              src="${imageUrl}"
              srcset="${imageUrl} 1x, ${image2xUrl} 2x"
              alt="${escapeHtml(exhibition.title)}"
              loading="lazy"
            />
            <figcaption>
              <h3>${escapeHtml(exhibition.title)}</h3>
              ${exhibition.subtitle ? `<p class="subtitle">${escapeHtml(exhibition.subtitle)}</p>` : ''}
              <p class="dates">${escapeHtml(exhibition.dateText || '')}</p>
            </figcaption>
          </figure>
        </a>
      </li>
    `;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Exhibitions | Muriel Guepin Gallery</title>
  <link rel="stylesheet" href="/style.a00fb4ff439aec84560b68d1f4100e68.css">
</head>
<body>
  <header class="site-header">
    <a href="/" class="logo">Muriel Guepin Gallery</a>
    <nav>
      <a href="/artists.html">Artists</a>
      <a href="/exhibitions.html">Exhibitions</a>
      <a href="/about.html">About</a>
      <a href="/contact.html">Contact</a>
    </nav>
  </header>

  <main>
    <h1>Current Exhibitions</h1>
    <ul class="exhibitions-grid">
      ${exhibitionCards}
    </ul>

    <p class="past-link">
      <a href="/exhibitions/past.html">View Past Exhibitions</a>
    </p>
  </main>

  <footer class="site-footer">
    <p>&copy; ${new Date().getFullYear()} Muriel Guepin Gallery</p>
  </footer>
</body>
</html>`;

  writeFileSync(join(OUTPUT_DIR, 'exhibitions.html'), html);
  console.log(`  Generated exhibitions.html with ${currentExhibitions.length} exhibitions`);
}

async function main(): Promise<void> {
  console.log('=== Static Site Generator ===\n');
  console.log(`Output directory: ${OUTPUT_DIR}`);
  console.log(`R2 URL: ${R2_PUBLIC_URL}\n`);

  await generateArtistsGrid();
  await generateArtistPages();
  await generateExhibitionsGrid();

  console.log('\n=== Generation Complete ===');
}

main().catch((err) => {
  console.error('Generation failed:', err);
  process.exit(1);
});
