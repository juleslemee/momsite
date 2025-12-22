import AdminLayout from '@/components/AdminLayout';
import Link from 'next/link';
import { db } from '@/db';
import { artists } from '@/db/schema';
import { asc } from 'drizzle-orm';

export default async function ArtistsPage() {
  const allArtists = await db.query.artists.findMany({
    orderBy: [asc(artists.sortOrder), asc(artists.name)],
    with: {
      profileImage: true,
    },
  });

  return (
    <AdminLayout>
      {/* Breadcrumb */}
      <div className="route">
        <div>
          <Link href="/">Muriel Guepin Gallery</Link>
          {' / '}
          <Link href="/artists">Artists</Link>
        </div>
        <a href="https://www.murielguepingallery.com/artists" target="_blank" rel="noopener" className="view-link">
          View Page
        </a>
      </div>

      {/* Section header */}
      <div className="section-header">
        Artists
      </div>

      {/* Quick add form */}
      <form className="quick-add-form" action="/api/artists/create" method="POST">
        <div style={{ flex: 1 }}>
          <label htmlFor="fullName">Full Name</label>
          <input
            type="text"
            id="fullName"
            name="name"
            required
            placeholder="Enter artist name..."
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button type="submit" className="btn btn-primary">Add</button>
        </div>
      </form>

      {/* Artists table */}
      <div className="data-table-header">
        <h2>Artists</h2>
        <div className="search-box">
          <input type="search" placeholder="Search" />
        </div>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th className="col-select">Select</th>
            <th className="col-move">Move</th>
            <th className="col-thumbnail">Thumbnail</th>
            <th>Name</th>
            <th className="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {allArtists.map((artist) => (
            <tr key={artist.id} className={!artist.isEnabled ? 'disabled' : ''}>
              <td className="col-select">
                <input type="checkbox" name="selected[]" value={artist.id} />
              </td>
              <td className="col-move">
                <span className="move-handle">⋮⋮</span>
              </td>
              <td className="col-thumbnail">
                {artist.profileImage ? (
                  <img
                    src={`${process.env.R2_PUBLIC_URL}/images/${artist.profileImage.hash}/thumbnail.webp`}
                    alt=""
                  />
                ) : (
                  <img src="/placeholder.png" alt="" />
                )}
              </td>
              <td className="col-name">{artist.name}</td>
              <td className="col-actions">
                <Link href={`/artists/${artist.id}`} className="btn btn-small">
                  Edit
                </Link>
                {artist.isEnabled ? (
                  <button className="btn btn-small">Disable</button>
                ) : (
                  <button className="btn btn-small">Enable</button>
                )}
                <button className="btn btn-small btn-danger">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {allArtists.length === 0 && (
        <p style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
          No artists yet. Add your first artist above.
        </p>
      )}

      {/* Bulk actions */}
      <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '12px', color: '#666' }}>
          Showing 1 to {allArtists.length} of {allArtists.length} entries
        </div>
        <div>
          <button className="btn btn-small">Select All</button>
          <button className="btn btn-small btn-danger" style={{ marginLeft: '10px' }}>Delete Selected</button>
        </div>
      </div>
    </AdminLayout>
  );
}
