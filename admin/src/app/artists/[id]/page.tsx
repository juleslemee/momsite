import AdminLayout from '@/components/AdminLayout';
import Link from 'next/link';
import { db } from '@/db';
import { artists, artworks, artworkImages, images } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ArtistEditPage({ params }: Props) {
  const { id } = await params;

  // Handle "new" as a special case
  if (id === 'new') {
    return <NewArtistForm />;
  }

  const artist = await db.query.artists.findFirst({
    where: eq(artists.id, id),
    with: {
      profileImage: true,
      artworks: {
        with: {
          images: {
            with: {
              image: true,
            },
          },
        },
      },
    },
  });

  if (!artist) {
    notFound();
  }

  return (
    <AdminLayout>
      {/* Breadcrumb */}
      <div className="route">
        <div>
          <Link href="/">Muriel Guepin Gallery</Link>
          {' / '}
          <Link href="/artists">Artists</Link>
          {' / '}
          <span>{artist.name}</span>
        </div>
        <a href={`https://www.murielguepingallery.com/artists/${artist.slug}`} target="_blank" rel="noopener" className="view-link">
          View Page
        </a>
      </div>

      {/* Section header with actions */}
      <div className="section-header">
        <span>Edit Artist: {artist.name}</span>
        <div>
          <button className="btn" style={{ marginRight: '10px' }}>
            {artist.isEnabled ? 'Disable' : 'Enable'}
          </button>
          <button className="btn btn-danger" style={{ marginRight: '10px' }}>Delete</button>
          <button className="btn btn-primary">Save Changes</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="content-tabs">
        <button className="active">General</button>
        <button>Featured Works ({artist.artworks?.length || 0})</button>
        <button>Biography</button>
      </div>

      {/* Form */}
      <form>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div className="form-group">
            <label htmlFor="name">Full Name</label>
            <input type="text" id="name" name="name" defaultValue={artist.name} />
          </div>

          <div className="form-group">
            <label htmlFor="slug">URL Slug</label>
            <input type="text" id="slug" name="slug" defaultValue={artist.slug} />
          </div>
        </div>

        <div className="form-group">
          <label>Profile Image</label>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', marginTop: '10px' }}>
            <div style={{ width: '150px', height: '150px', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {artist.profileImage ? (
                <img
                  src={`${process.env.R2_PUBLIC_URL}/images/${artist.profileImage.hash}/thumbnail.webp`}
                  alt={artist.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ color: '#999', fontSize: '12px' }}>No image</span>
              )}
            </div>
            <div>
              <button type="button" className="btn">Upload Image</button>
              <p style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
                Recommended: Square image, at least 640x640 pixels
              </p>
            </div>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="biography">Biography</label>
          <textarea
            id="biography"
            name="biography"
            defaultValue={artist.biography || ''}
            placeholder="Enter artist biography..."
          />
        </div>
      </form>

      {/* Featured Works Section */}
      <div style={{ marginTop: '40px' }}>
        <div className="section-header">
          <span>Featured Works</span>
          <button className="btn">Add Work</button>
        </div>

        {artist.artworks && artist.artworks.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-move">Move</th>
                <th className="col-thumbnail">Image</th>
                <th>Title</th>
                <th>Medium</th>
                <th>Year</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {artist.artworks.map((artwork) => (
                <tr key={artwork.id}>
                  <td className="col-move">
                    <span className="move-handle">⋮⋮</span>
                  </td>
                  <td className="col-thumbnail">
                    {artwork.images?.[0]?.image && (
                      <img
                        src={`${process.env.R2_PUBLIC_URL}/images/${artwork.images[0].image.hash}/thumbnail.webp`}
                        alt={artwork.title}
                      />
                    )}
                  </td>
                  <td className="col-name">{artwork.title}</td>
                  <td style={{ color: '#666', fontSize: '12px' }}>{artwork.medium || ''}</td>
                  <td style={{ color: '#666', fontSize: '12px' }}>{artwork.year || ''}</td>
                  <td className="col-actions">
                    <button className="btn btn-small">Edit</button>
                    <button className="btn btn-small btn-danger">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
            No featured works yet.
          </p>
        )}
      </div>
    </AdminLayout>
  );
}

function NewArtistForm() {
  return (
    <AdminLayout>
      {/* Breadcrumb */}
      <div className="route">
        <div>
          <Link href="/">Muriel Guepin Gallery</Link>
          {' / '}
          <Link href="/artists">Artists</Link>
          {' / '}
          <span>New Artist</span>
        </div>
      </div>

      {/* Section header */}
      <div className="section-header">
        <span>New Artist</span>
        <button className="btn btn-primary">Create Artist</button>
      </div>

      {/* Form */}
      <form>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div className="form-group">
            <label htmlFor="name">Full Name</label>
            <input type="text" id="name" name="name" placeholder="Enter artist name..." autoFocus />
          </div>

          <div className="form-group">
            <label htmlFor="slug">URL Slug</label>
            <input type="text" id="slug" name="slug" placeholder="auto-generated-from-name" />
            <p style={{ marginTop: '5px', fontSize: '11px', color: '#666' }}>
              Leave blank to auto-generate from name
            </p>
          </div>
        </div>
      </form>
    </AdminLayout>
  );
}
