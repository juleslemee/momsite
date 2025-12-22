/**
 * Comprehensive Data Sync Script
 *
 * Consolidates artist data from:
 * 1. Live site (murielguepingallery.com) - 44 currently visible artists
 * 2. CMS backup HTML files - 61 artists (including disabled)
 * 3. Existing data/artists.json - has artworks data
 *
 * Creates a unified dataset of all 64 unique artists with:
 * - Correct profile image hashes
 * - All artworks
 * - Proper enabled/disabled status
 *
 * Run: npx tsx scripts/comprehensive-data-sync.ts
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const CMS_BACKUP_PATH = '/Users/born2die/Code/Columbia/mom/backup_cms/accounts.exhibit-e.com/application/539f1b2ba9aa2c31208b4568';
const DATA_PATH = join(__dirname, '..', '..', 'data');

// Live site artist -> profile image hash mapping (from WebFetch)
const LIVE_SITE_PROFILE_IMAGES: Record<string, string> = {
  'PASCAL OUDET': 'ed208f2a68ec6cb4d27113f112865ea0',
  'MANE PHELY': '32b3c6467b02e5bf7403a59388c3e397',
  'ANNE-CHARLOTTE SALIBA': '72784e5a464c23578a46ebe2b32e4caa',
  'SUSANNA BAUER': '17ae182a582ec056f186de52aa275c20',
  'INNI PARNANEN': 'a4cfbb79144f2ac75c0b2e015e2c8a61',
  'MYLINH NGUYEN': 'f62c3d901dfa2131c22abe35d7f6f287',
  'JOAN LURIE': '6304551b2362706cfcd367e7ed7861a7',
  'CAROLINE BESSE': '8ebbc9b94722bd5510831ed44d97ef80',
  'ALMA PRISM': 'a9258f8537250a487e31ddfee12d2cf4',
  'ANNA KRUHELSKA': '5f010c8ecb8a851a9a66b87e58e0e801',
  'ERIN VINCENT': '8985baa98e6eb6d38c147c564ce2190f',
  'MARIE LAFOREY': '7618b4261aa426f5abb70bfc9678de69',
  'ANTONIN ANZIL': '81724e7f2d7f8ef68a05b8adfcc2aa8e',
  'NATHALIE PALOMINO': '52edee4b1560db4b52de0b40d10ab816',
  'DAMIEN GERNAY': '01e18f8bed0463362e53a984c95289a8',
  'JOANIE LEMERCIER': '8fcbc082e77937b9b1680ad75cb7eb67',
  'FRANCOIS WUNSCHEL': '6d01f500aac2667381d9802bebec5b30',
  'PATRICK CARRARA': 'dd1d43228bd1588387901179bffda240',
  'ISABELLE MENIN': 'ae7457e3e653643d42554c88eab96f5c',
  'HADLEY RADT': '9e00626872a0ada7c41ada878eb1a19b',
  'DANA PIAZZA': '46ef0746eebd051ba3db51739a6ce36d',
  'DAVID FREDRIK MOUSSALLEM': '168748e6f0afee786010f738b91b6423',
  'SCOTT MCMILLIN': '582caee71db98a24c04c922f5f96b26f',
  'ZIN HELENA SONG': 'ef74b9f789f75c66f8ba3167555d600e',
  'DEBORAH T COLTER': 'f3847488f50e130d402ade04277f0cee',
  'MICHAEL AZGOUR': '89692268976f1c24c0a2e92d71b73760',
  'KEUN YOUNG PARK': '5e04305f0aad4dda96603248e8052614',
  'CHRISTOFFER RELANDER': '332ba933b7707823cc681114d2600218',
  'MIREIA SERRA': '4c86df2a276e5c19409594b3253c6e86',
  'ANI ABAKUMOVA': '88ecb178f38fc65439f04d68fb8be250',
  'CHRIS DOROSZ': 'd43c8a90beed0cf1e738ff77bc5e1cdb',
  'JOSHUA SMITH': 'ed9f44b0bcbf34190f4a350cf34686f8',
  'LAURENT CHÉHÈRE': '86390c86004f98b6df1bf8982aaed4a8',
  'DAVY & KRISTIN MCGUIRE': '5bfcdd79d9f685b3c614ade8e91dc575',
  'MARGIE CRINER': 'a1eae152f94e80d364283b3a974265b5',
  'CHARLOTTE FOUST': '4b92ebe702b0342d081b43d551b90935',
  'OLE BRODERSEN': '96b1abbf78672d3ae5435e38feda84b0',
  'JAMES MINDEN': '75fd88452a57c4a18c411a4948628f0a',
  'EVAN VENEGAS': 'ffd07f32f150493901a23788110e8e1f',
  'PATRICK DINTINO': '504e6c73f5e0faa98c251b2d888da9d2',
  'CHRIS MAYNARD': '873b9a793c277b54d8a87bb86ad1e33c',
  'LISA LALA': '315ff107d71dd8dd237d3abc76ce3b3d',
  'ESTHER TRAUGOT': '25022d0e11f40ad881a05b73d1ca6971',
  'AMY SANDS': '3bfc63f88f55fe86d2e273a589d54d55',
};

interface CmsArtist {
  cmsId: string;
  name: string;
  imageHash: string | null;
  isEnabled: boolean;
}

interface Artwork {
  title: string;
  artistName: string;
  medium: string;
  dimensions: string;
  year: string;
  imageHash: string | null;
  enlargeHash?: string | null;
  sortOrder: number;
}

interface ConsolidatedArtist {
  name: string;
  slug: string;
  biography: string;
  profileImageHash: string | null;
  artworks: Artwork[];
  isEnabled: boolean;
  isArchived: boolean;
  source: 'live' | 'cms' | 'both';
}

function extractCmsArtists(): CmsArtist[] {
  const html = readFileSync(join(CMS_BACKUP_PATH, 'content/r/artists.html'), 'utf-8');
  const artists: CmsArtist[] = [];

  // Match each artist row
  const rowRegex = /<tr\s+class="item\s*(error)?\s*(?:odd|even)?"\s*data-id="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g;

  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const isDisabled = match[1] === 'error';
    const cmsId = match[2];
    const rowHtml = match[3];

    // Extract name from the title column
    const nameMatch = rowHtml.match(/<td class="title">[^]*?<div class="col-content">([^<]+)<\/div>/);
    let name = nameMatch ? nameMatch[1].replace(/&amp;/g, '&').trim() : '';

    // Extract image hash
    const imageMatch = rowHtml.match(/539f1b2ba9aa2c31208b4568\/([a-f0-9]+)\.(jpeg|jpg|png)/i);
    const imageHash = imageMatch ? imageMatch[1] : null;

    if (name) {
      artists.push({
        cmsId,
        name,
        imageHash,
        isEnabled: !isDisabled,
      });
    }
  }

  return artists;
}

function loadExistingArtistsJson(): ConsolidatedArtist[] {
  const path = join(DATA_PATH, 'artists.json');
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeArtistName(name: string): string {
  return name.toUpperCase().replace(/&AMP;/g, '&').trim();
}

async function main() {
  console.log('=== Comprehensive Data Sync ===\n');

  // 1. Extract CMS backup artists
  console.log('1. Extracting artists from CMS backup...');
  const cmsArtists = extractCmsArtists();
  console.log(`   Found ${cmsArtists.length} artists in CMS backup`);

  // 2. Load existing artists.json (has artworks data)
  console.log('\n2. Loading existing artists.json...');
  const existingArtists = loadExistingArtistsJson();
  console.log(`   Found ${existingArtists.length} artists in existing JSON`);

  // 3. Build artist name -> existing data map
  const existingMap = new Map<string, ConsolidatedArtist>();
  for (const artist of existingArtists) {
    existingMap.set(normalizeArtistName(artist.name), artist);
  }

  // 4. Build CMS artist name -> data map
  const cmsMap = new Map<string, CmsArtist>();
  for (const artist of cmsArtists) {
    const normalized = normalizeArtistName(artist.name);
    // Handle duplicate names (like Joan Lurie vs JOAN LURIE) - prefer enabled
    if (!cmsMap.has(normalized) || artist.isEnabled) {
      cmsMap.set(normalized, artist);
    }
  }

  // 5. Live site artists
  const liveSiteArtists = Object.keys(LIVE_SITE_PROFILE_IMAGES);
  console.log(`\n3. Live site has ${liveSiteArtists.length} artists with profile images`);

  // 6. Create union of all artists
  console.log('\n4. Creating union of all artists...');
  const allArtistNames = new Set<string>();

  // Add from live site
  liveSiteArtists.forEach(name => allArtistNames.add(normalizeArtistName(name)));

  // Add from CMS
  cmsArtists.forEach(a => allArtistNames.add(normalizeArtistName(a.name)));

  // Add from existing JSON (in case there are any extras)
  existingArtists.forEach(a => allArtistNames.add(normalizeArtistName(a.name)));

  console.log(`   Total unique artists: ${allArtistNames.size}`);

  // 7. Build consolidated artist list
  console.log('\n5. Building consolidated artist data...');
  const consolidatedArtists: ConsolidatedArtist[] = [];

  for (const artistName of [...allArtistNames].sort()) {
    const isOnLiveSite = liveSiteArtists.some(n => normalizeArtistName(n) === artistName);
    const cmsArtist = cmsMap.get(artistName);
    const existingArtist = existingMap.get(artistName);

    // Determine source
    let source: 'live' | 'cms' | 'both' = 'both';
    if (isOnLiveSite && !cmsArtist) source = 'live';
    else if (!isOnLiveSite && cmsArtist) source = 'cms';

    // Get correct profile image hash
    // Priority: live site > CMS backup
    let profileImageHash: string | null = null;
    const liveSiteKey = liveSiteArtists.find(n => normalizeArtistName(n) === artistName);
    if (liveSiteKey) {
      profileImageHash = LIVE_SITE_PROFILE_IMAGES[liveSiteKey];
    } else if (cmsArtist?.imageHash) {
      profileImageHash = cmsArtist.imageHash;
    }

    // Determine enabled status
    // If on live site, definitely enabled
    // If only in CMS, use CMS status
    const isEnabled = isOnLiveSite || (cmsArtist?.isEnabled ?? false);
    const isArchived = !isEnabled;

    // Get existing data (biography, artworks)
    const existingData = existingArtist || {
      biography: '',
      artworks: [],
    };

    // Find proper display name (prefer existing casing)
    let displayName = artistName;
    if (liveSiteKey) displayName = liveSiteKey;
    else if (cmsArtist) displayName = cmsArtist.name;
    else if (existingArtist) displayName = existingArtist.name;

    consolidatedArtists.push({
      name: displayName,
      slug: existingArtist?.slug || generateSlug(displayName),
      biography: existingData.biography || '',
      profileImageHash,
      artworks: existingData.artworks || [],
      isEnabled,
      isArchived,
      source,
    });
  }

  // 8. Output statistics
  console.log('\n=== Statistics ===');
  console.log(`Total artists: ${consolidatedArtists.length}`);
  console.log(`Enabled: ${consolidatedArtists.filter(a => a.isEnabled).length}`);
  console.log(`Archived/Disabled: ${consolidatedArtists.filter(a => a.isArchived).length}`);
  console.log(`With profile image: ${consolidatedArtists.filter(a => a.profileImageHash).length}`);
  console.log(`Without profile image: ${consolidatedArtists.filter(a => !a.profileImageHash).length}`);

  // Artists without profile images
  const noImage = consolidatedArtists.filter(a => !a.profileImageHash);
  if (noImage.length > 0) {
    console.log('\nArtists WITHOUT profile images:');
    noImage.forEach(a => console.log(`  - ${a.name} (${a.source}, ${a.isEnabled ? 'enabled' : 'disabled'})`));
  }

  // 9. Collect all unique image hashes
  const allImageHashes = new Set<string>();

  // Profile images
  consolidatedArtists.forEach(a => {
    if (a.profileImageHash) allImageHashes.add(a.profileImageHash);
  });

  // Artwork images
  consolidatedArtists.forEach(a => {
    a.artworks.forEach(work => {
      if (work.imageHash) allImageHashes.add(work.imageHash);
      if (work.enlargeHash) allImageHashes.add(work.enlargeHash);
    });
  });

  console.log(`\nTotal unique image hashes: ${allImageHashes.size}`);

  // 10. Save consolidated data
  const outputPath = join(DATA_PATH, 'consolidated-artists.json');
  writeFileSync(outputPath, JSON.stringify(consolidatedArtists, null, 2));
  console.log(`\nSaved consolidated artists to: ${outputPath}`);

  // Save image hashes
  const imagesOutputPath = join(DATA_PATH, 'all-image-hashes.json');
  writeFileSync(imagesOutputPath, JSON.stringify([...allImageHashes].sort(), null, 2));
  console.log(`Saved all image hashes to: ${imagesOutputPath}`);

  // 11. Show what needs to be done
  console.log('\n=== Next Steps ===');
  console.log('1. Review consolidated-artists.json for accuracy');
  console.log('2. Ensure all image hashes in all-image-hashes.json exist in R2');
  console.log('3. Run migration to update database with correct data');
}

main().catch(console.error);
