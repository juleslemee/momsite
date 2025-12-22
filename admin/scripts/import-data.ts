/**
 * Data Import Script - Import extracted JSON data into the database
 *
 * Run after setting up the database:
 *   npx tsx scripts/import-data.ts
 */

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from '../src/db/schema';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load environment
import 'dotenv/config';

const client = createClient({
  url: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const db = drizzle(client, { schema });

function uuid(): string {
  return crypto.randomUUID();
}

// Types for imported data
interface ImportedArtwork {
  title: string;
  artistName: string;
  medium: string;
  dimensions: string;
  year: string;
  imageHash: string | null;
  enlargeHash?: string | null;
  sortOrder: number;
}

interface ImportedArtist {
  slug: string;
  name: string;
  biography: string;
  profileImageHash: string | null;
  artworks: ImportedArtwork[];
  isEnabled: boolean;
  isArchived?: boolean;
}

interface ImportedExhibition {
  slug: string;
  title: string;
  subtitle?: string;
  subtitle2?: string;
  startDate?: string;
  endDate?: string;
  dateText?: string;
  status: 'current' | 'past';
  coverImageHash?: string | null;
  artworks: ImportedArtwork[];
  linkedArtists: string[];
  isEnabled: boolean;
}

// Batch insert helper
async function batchInsert<T>(
  table: any,
  records: T[],
  batchSize = 50
): Promise<void> {
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    if (batch.length > 0) {
      await db.insert(table).values(batch);
    }
    // Small delay between batches
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function main() {
  console.log('=== Data Import ===\n');

  // Load JSON data
  const dataDir = join(__dirname, '..', '..', 'data');

  const artistsData: ImportedArtist[] = JSON.parse(
    readFileSync(join(dataDir, 'artists.json'), 'utf-8')
  );
  const exhibitionsData: ImportedExhibition[] = JSON.parse(
    readFileSync(join(dataDir, 'exhibitions.json'), 'utf-8')
  );
  const imageHashes: string[] = JSON.parse(
    readFileSync(join(dataDir, 'images.json'), 'utf-8')
  );

  console.log(`Loaded ${artistsData.length} artists`);
  console.log(`Loaded ${exhibitionsData.length} exhibitions`);
  console.log(`Loaded ${imageHashes.length} image hashes\n`);

  // Build all records first, then batch insert

  // 1. Prepare images
  console.log('Preparing images...');
  const imageMap = new Map<string, string>();
  const imageRecords: (typeof schema.images.$inferInsert)[] = [];

  for (const hash of imageHashes) {
    const id = uuid();
    imageMap.set(hash, id);
    imageRecords.push({
      id,
      hash,
      originalKey: `images/${hash}/original.webp`,
      variants: {
        thumbnail: `images/${hash}/thumbnail.webp`,
        thumbnail_2x: `images/${hash}/thumbnail_2x.webp`,
        card: `images/${hash}/card.webp`,
        card_2x: `images/${hash}/card_2x.webp`,
        display: `images/${hash}/display.webp`,
        display_sm: `images/${hash}/display_sm.webp`,
        enlarge: `images/${hash}/enlarge.webp`,
        enlarge_2x: `images/${hash}/enlarge_2x.webp`,
      },
    });
  }

  console.log('Inserting images in batches...');
  await batchInsert(schema.images, imageRecords, 100);
  console.log(`  Imported ${imageRecords.length} images`);

  // 2. Prepare artists and artworks
  console.log('Preparing artists...');
  const artistMap = new Map<string, string>();
  const artistRecords: (typeof schema.artists.$inferInsert)[] = [];
  const artworkRecords: (typeof schema.artworks.$inferInsert)[] = [];
  const artworkImageRecords: (typeof schema.artworkImages.$inferInsert)[] = [];

  for (let i = 0; i < artistsData.length; i++) {
    const artist = artistsData[i];
    const artistId = uuid();
    artistMap.set(artist.slug, artistId);

    const profileImageId = artist.profileImageHash
      ? imageMap.get(artist.profileImageHash)
      : null;

    artistRecords.push({
      id: artistId,
      slug: artist.slug,
      name: artist.name,
      biography: artist.biography || null,
      profileImageId: profileImageId || null,
      sortOrder: i,
      isEnabled: artist.isEnabled ?? true,
      isArchived: artist.isArchived ?? false,
    });

    // Prepare artworks for this artist
    for (let j = 0; j < artist.artworks.length; j++) {
      const artwork = artist.artworks[j];
      const artworkId = uuid();

      artworkRecords.push({
        id: artworkId,
        artistId,
        title: artwork.title,
        medium: artwork.medium || null,
        dimensions: artwork.dimensions || null,
        year: artwork.year || null,
        sortOrder: j,
        isEnabled: true,
      });

      if (artwork.imageHash && imageMap.has(artwork.imageHash)) {
        artworkImageRecords.push({
          id: uuid(),
          artworkId,
          imageId: imageMap.get(artwork.imageHash)!,
          isPrimary: true,
          sortOrder: 0,
        });
      }
    }
  }

  console.log('Inserting artists...');
  await batchInsert(schema.artists, artistRecords, 50);
  console.log(`  Imported ${artistRecords.length} artists`);

  console.log('Inserting artworks...');
  await batchInsert(schema.artworks, artworkRecords, 50);
  console.log(`  Imported ${artworkRecords.length} artworks`);

  console.log('Inserting artwork images...');
  await batchInsert(schema.artworkImages, artworkImageRecords, 50);
  console.log(`  Imported ${artworkImageRecords.length} artwork images`);

  // 3. Prepare exhibitions
  console.log('Preparing exhibitions...');
  const exhibitionRecords: (typeof schema.exhibitions.$inferInsert)[] = [];
  const exhibitionArtistRecords: (typeof schema.exhibitionArtists.$inferInsert)[] = [];
  const exhibitionArtworkRecords: (typeof schema.exhibitionArtworks.$inferInsert)[] = [];
  const exhibitionArtworkItems: (typeof schema.artworks.$inferInsert)[] = [];
  const exhibitionArtworkImageItems: (typeof schema.artworkImages.$inferInsert)[] = [];

  for (let i = 0; i < exhibitionsData.length; i++) {
    const exhibition = exhibitionsData[i];
    const exhibitionId = uuid();

    const coverImageId = exhibition.coverImageHash
      ? imageMap.get(exhibition.coverImageHash)
      : null;

    exhibitionRecords.push({
      id: exhibitionId,
      slug: exhibition.slug,
      title: exhibition.title,
      subtitle: exhibition.subtitle || null,
      subtitle2: exhibition.subtitle2 || null,
      startDate: exhibition.startDate || null,
      endDate: exhibition.endDate || null,
      dateText: exhibition.dateText || null,
      status: exhibition.status,
      coverImageId: coverImageId || null,
      sortOrder: i,
      isEnabled: exhibition.isEnabled ?? true,
    });

    // Link exhibition to artists
    for (let j = 0; j < exhibition.linkedArtists.length; j++) {
      const artistSlug = exhibition.linkedArtists[j];
      const artistId = artistMap.get(artistSlug);

      if (artistId) {
        exhibitionArtistRecords.push({
          id: uuid(),
          exhibitionId,
          artistId,
          sortOrder: j,
        });
      }
    }

    // Prepare exhibition artworks
    for (let j = 0; j < exhibition.artworks.length; j++) {
      const artwork = exhibition.artworks[j];
      const artworkId = uuid();

      const artistSlug = artwork.artistName
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      const artistId = artistMap.get(artistSlug);

      exhibitionArtworkItems.push({
        id: artworkId,
        artistId: artistId || null,
        title: artwork.title,
        medium: artwork.medium || null,
        dimensions: artwork.dimensions || null,
        year: artwork.year || null,
        sortOrder: j,
        isEnabled: true,
      });

      if (artwork.imageHash && imageMap.has(artwork.imageHash)) {
        exhibitionArtworkImageItems.push({
          id: uuid(),
          artworkId,
          imageId: imageMap.get(artwork.imageHash)!,
          isPrimary: true,
          sortOrder: 0,
        });
      }

      exhibitionArtworkRecords.push({
        id: uuid(),
        exhibitionId,
        artworkId,
        sortOrder: j,
      });
    }
  }

  console.log('Inserting exhibitions...');
  await batchInsert(schema.exhibitions, exhibitionRecords, 50);
  console.log(`  Imported ${exhibitionRecords.length} exhibitions`);

  console.log('Inserting exhibition artists...');
  await batchInsert(schema.exhibitionArtists, exhibitionArtistRecords, 50);
  console.log(`  Imported ${exhibitionArtistRecords.length} exhibition-artist links`);

  console.log('Inserting exhibition artworks...');
  await batchInsert(schema.artworks, exhibitionArtworkItems, 50);
  await batchInsert(schema.artworkImages, exhibitionArtworkImageItems, 50);
  await batchInsert(schema.exhibitionArtworks, exhibitionArtworkRecords, 50);
  console.log(`  Imported ${exhibitionArtworkRecords.length} exhibition artworks`);

  console.log('\n=== Import Complete ===');
  console.log(`Images: ${imageRecords.length}`);
  console.log(`Artists: ${artistRecords.length}`);
  console.log(`Artworks: ${artworkRecords.length + exhibitionArtworkItems.length}`);
  console.log(`Exhibitions: ${exhibitionRecords.length}`);
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
