import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// Images table - stores all image variants
export const images = sqliteTable('images', {
  id: text('id').primaryKey(), // UUID
  hash: text('hash').notNull().unique(), // Original image hash for deduplication
  originalKey: text('original_key'), // R2 key for original
  variants: text('variants', { mode: 'json' }).$type<Record<string, string>>(), // { thumbnail: 'key', display: 'key', ... }
  altText: text('alt_text'),
  width: integer('width'),
  height: integer('height'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Artists table
export const artists = sqliteTable('artists', {
  id: text('id').primaryKey(), // UUID
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  biography: text('biography'),
  profileImageId: text('profile_image_id').references(() => images.id),
  sortOrder: integer('sort_order').default(0),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).default(true),
  isArchived: integer('is_archived', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Artworks table
export const artworks = sqliteTable('artworks', {
  id: text('id').primaryKey(), // UUID
  artistId: text('artist_id').references(() => artists.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  medium: text('medium'),
  dimensions: text('dimensions'),
  year: text('year'),
  description: text('description'),
  sortOrder: integer('sort_order').default(0),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Artwork images (many-to-many, with primary flag)
export const artworkImages = sqliteTable('artwork_images', {
  id: text('id').primaryKey(),
  artworkId: text('artwork_id')
    .notNull()
    .references(() => artworks.id, { onDelete: 'cascade' }),
  imageId: text('image_id')
    .notNull()
    .references(() => images.id, { onDelete: 'cascade' }),
  isPrimary: integer('is_primary', { mode: 'boolean' }).default(false),
  sortOrder: integer('sort_order').default(0),
});

// Exhibitions table
export const exhibitions = sqliteTable('exhibitions', {
  id: text('id').primaryKey(), // UUID
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  subtitle2: text('subtitle2'),
  description: text('description'),
  startDate: text('start_date'), // ISO date string
  endDate: text('end_date'), // ISO date string
  dateText: text('date_text'), // Display text like "January 15 – February 28, 2024"
  status: text('status', { enum: ['current', 'upcoming', 'past'] }).default('current'),
  coverImageId: text('cover_image_id').references(() => images.id),
  sortOrder: integer('sort_order').default(0),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Exhibition artworks (many-to-many with order)
export const exhibitionArtworks = sqliteTable('exhibition_artworks', {
  id: text('id').primaryKey(),
  exhibitionId: text('exhibition_id')
    .notNull()
    .references(() => exhibitions.id, { onDelete: 'cascade' }),
  artworkId: text('artwork_id')
    .notNull()
    .references(() => artworks.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').default(0),
});

// Exhibition artists (linked artists for exhibition page)
export const exhibitionArtists = sqliteTable('exhibition_artists', {
  id: text('id').primaryKey(),
  exhibitionId: text('exhibition_id')
    .notNull()
    .references(() => exhibitions.id, { onDelete: 'cascade' }),
  artistId: text('artist_id')
    .notNull()
    .references(() => artists.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').default(0),
});

// Press articles
export const press = sqliteTable('press', {
  id: text('id').primaryKey(), // UUID
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  date: text('date'), // Display date text
  url: text('url'), // External link to press article
  imageId: text('image_id').references(() => images.id),
  sortOrder: integer('sort_order').default(0),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// News items
export const news = sqliteTable('news', {
  id: text('id').primaryKey(), // UUID
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  date: text('date'), // Display date text
  content: text('content'), // Rich text content
  imageId: text('image_id').references(() => images.id),
  sortOrder: integer('sort_order').default(0),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Site settings (key-value store)
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Admin users
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  hashedPassword: text('hashed_password').notNull(),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Sessions for auth
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
});

// Relations
export const artistsRelations = relations(artists, ({ one, many }) => ({
  profileImage: one(images, {
    fields: [artists.profileImageId],
    references: [images.id],
  }),
  artworks: many(artworks),
  exhibitions: many(exhibitionArtists),
}));

export const artworksRelations = relations(artworks, ({ one, many }) => ({
  artist: one(artists, {
    fields: [artworks.artistId],
    references: [artists.id],
  }),
  images: many(artworkImages),
  exhibitions: many(exhibitionArtworks),
}));

export const artworkImagesRelations = relations(artworkImages, ({ one }) => ({
  artwork: one(artworks, {
    fields: [artworkImages.artworkId],
    references: [artworks.id],
  }),
  image: one(images, {
    fields: [artworkImages.imageId],
    references: [images.id],
  }),
}));

export const exhibitionsRelations = relations(exhibitions, ({ one, many }) => ({
  coverImage: one(images, {
    fields: [exhibitions.coverImageId],
    references: [images.id],
  }),
  artworks: many(exhibitionArtworks),
  artists: many(exhibitionArtists),
}));

export const exhibitionArtworksRelations = relations(exhibitionArtworks, ({ one }) => ({
  exhibition: one(exhibitions, {
    fields: [exhibitionArtworks.exhibitionId],
    references: [exhibitions.id],
  }),
  artwork: one(artworks, {
    fields: [exhibitionArtworks.artworkId],
    references: [artworks.id],
  }),
}));

export const exhibitionArtistsRelations = relations(exhibitionArtists, ({ one }) => ({
  exhibition: one(exhibitions, {
    fields: [exhibitionArtists.exhibitionId],
    references: [exhibitions.id],
  }),
  artist: one(artists, {
    fields: [exhibitionArtists.artistId],
    references: [artists.id],
  }),
}));

export const pressRelations = relations(press, ({ one }) => ({
  image: one(images, {
    fields: [press.imageId],
    references: [images.id],
  }),
}));

export const newsRelations = relations(news, ({ one }) => ({
  image: one(images, {
    fields: [news.imageId],
    references: [images.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));
