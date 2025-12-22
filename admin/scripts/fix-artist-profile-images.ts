/**
 * Fix Artist Profile Images Migration
 *
 * This script:
 * 1. Creates missing image records for profile images
 * 2. Updates all artists to point to the correct profile images
 * 3. Adds any missing artists from the consolidated data
 *
 * Run: npx tsx scripts/fix-artist-profile-images.ts
 */

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '../src/db/schema';
import { readFileSync } from 'fs';
import { join } from 'path';

import 'dotenv/config';

const client = createClient({
  url: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const db = drizzle(client, { schema });

interface ConsolidatedArtist {
  name: string;
  slug: string;
  biography: string;
  profileImageHash: string | null;
  artworks: any[];
  isEnabled: boolean;
  isArchived: boolean;
  source: string;
}

function uuid(): string {
  return crypto.randomUUID();
}

async function main() {
  console.log('=== Fix Artist Profile Images Migration ===\n');

  // Load consolidated data
  const dataPath = join(__dirname, '..', '..', 'data', 'consolidated-artists.json');
  const consolidatedArtists: ConsolidatedArtist[] = JSON.parse(
    readFileSync(dataPath, 'utf-8')
  );

  console.log(`Loaded ${consolidatedArtists.length} artists from consolidated data\n`);

  // 1. Get all existing images by hash
  console.log('1. Checking existing images...');
  const existingImages = await db.select().from(schema.images);
  const imageHashToId = new Map<string, string>();
  existingImages.forEach((img) => {
    imageHashToId.set(img.hash, img.id);
  });
  console.log(`   Found ${existingImages.length} existing images\n`);

  // 2. Identify profile image hashes that need to be created
  const neededHashes = new Set<string>();
  consolidatedArtists.forEach((artist) => {
    if (artist.profileImageHash && !imageHashToId.has(artist.profileImageHash)) {
      neededHashes.add(artist.profileImageHash);
    }
  });

  console.log(`2. Creating ${neededHashes.size} missing image records...`);

  // Create missing image records
  for (const hash of neededHashes) {
    const id = uuid();
    await db.insert(schema.images).values({
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
    imageHashToId.set(hash, id);
  }
  console.log(`   Created ${neededHashes.size} new image records\n`);

  // 3. Get existing artists
  console.log('3. Checking existing artists...');
  const existingArtists = await db.select().from(schema.artists);
  const artistNameToData = new Map<string, typeof existingArtists[0]>();
  existingArtists.forEach((artist) => {
    artistNameToData.set(artist.name.toUpperCase(), artist);
  });
  console.log(`   Found ${existingArtists.length} existing artists\n`);

  // 4. Update/create artists
  console.log('4. Updating artist profile images...');
  let updated = 0;
  let created = 0;
  let skipped = 0;

  for (const artist of consolidatedArtists) {
    const normalizedName = artist.name.toUpperCase();
    const existingArtist = artistNameToData.get(normalizedName);
    const profileImageId = artist.profileImageHash
      ? imageHashToId.get(artist.profileImageHash)
      : null;

    if (existingArtist) {
      // Update existing artist
      const needsUpdate =
        existingArtist.profileImageId !== profileImageId ||
        existingArtist.isEnabled !== artist.isEnabled ||
        existingArtist.isArchived !== artist.isArchived;

      if (needsUpdate) {
        await db
          .update(schema.artists)
          .set({
            profileImageId: profileImageId || null,
            isEnabled: artist.isEnabled,
            isArchived: artist.isArchived,
            updatedAt: new Date(),
          })
          .where(eq(schema.artists.id, existingArtist.id));
        updated++;
        console.log(`   Updated: ${artist.name}`);
      } else {
        skipped++;
      }
    } else {
      // Create new artist
      await db.insert(schema.artists).values({
        id: uuid(),
        slug: artist.slug,
        name: artist.name,
        biography: artist.biography || null,
        profileImageId: profileImageId || null,
        sortOrder: consolidatedArtists.indexOf(artist),
        isEnabled: artist.isEnabled,
        isArchived: artist.isArchived,
      });
      created++;
      console.log(`   Created: ${artist.name}`);
    }
  }

  console.log(`\n   Updated: ${updated}, Created: ${created}, Skipped (no change): ${skipped}\n`);

  // 5. Verify results
  console.log('5. Verifying results...');
  const finalArtists = await db.select().from(schema.artists);

  let withProfileImage = 0;
  let withoutProfileImage = 0;

  finalArtists.forEach((artist) => {
    if (artist.profileImageId) {
      withProfileImage++;
    } else {
      withoutProfileImage++;
      console.log(`   Missing profile image: ${artist.name}`);
    }
  });

  console.log(`\n=== Migration Complete ===`);
  console.log(`Total artists: ${finalArtists.length}`);
  console.log(`With profile image: ${withProfileImage}`);
  console.log(`Without profile image: ${withoutProfileImage}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
