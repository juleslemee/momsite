import AdminLayout from '@/components/AdminLayout';
import Link from 'next/link';
import { db } from '@/db';
import { exhibitions } from '@/db/schema';
import { asc, desc } from 'drizzle-orm';

export default async function ExhibitionsPage() {
  const allExhibitions = await db
    .select()
    .from(exhibitions)
    .orderBy(desc(exhibitions.startDate), asc(exhibitions.sortOrder));

  return (
    <AdminLayout>
      {/* Breadcrumb */}
      <div className="route">
        <div>
          <Link href="/">Muriel Guepin Gallery</Link>
          {' / '}
          <Link href="/exhibitions">Exhibitions</Link>
        </div>
        <a href="https://www.murielguepingallery.com/exhibitions" target="_blank" rel="noopener" className="view-link">
          View Page
        </a>
      </div>

      {/* Section header */}
      <div className="section-header">
        Exhibitions
      </div>

      {/* Quick add form */}
      <form className="quick-add-form" action="/api/exhibitions/create" method="POST">
        <div style={{ flex: 1 }}>
          <label htmlFor="title">Title</label>
          <input
            type="text"
            id="title"
            name="title"
            required
            placeholder="Enter exhibition title..."
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button type="submit" className="btn btn-primary">Add</button>
        </div>
      </form>

      {/* Exhibitions table */}
      <div className="data-table-header">
        <h2>Exhibitions</h2>
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
            <th>Title</th>
            <th>Subtitle</th>
            <th>Date</th>
            <th className="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {allExhibitions.map((exhibition) => (
            <tr key={exhibition.id} className={!exhibition.isEnabled ? 'disabled' : ''}>
              <td className="col-select">
                <input type="checkbox" name="selected[]" value={exhibition.id} />
              </td>
              <td className="col-move">
                <span className="move-handle">⋮⋮</span>
              </td>
              <td className="col-thumbnail">
                <img
                  src={exhibition.coverImageId ? `/api/images/${exhibition.coverImageId}/thumbnail` : '/placeholder.png'}
                  alt=""
                />
              </td>
              <td className="col-name">{exhibition.title}</td>
              <td style={{ color: '#666', fontSize: '12px' }}>{exhibition.subtitle || ''}</td>
              <td style={{ color: '#666', fontSize: '12px' }}>{exhibition.dateText || ''}</td>
              <td className="col-actions">
                <Link href={`/exhibitions/${exhibition.id}`} className="btn btn-small">
                  Edit
                </Link>
                {exhibition.isEnabled ? (
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

      {allExhibitions.length === 0 && (
        <p style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
          No exhibitions yet. Add your first exhibition above.
        </p>
      )}

      {/* Bulk actions */}
      <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '12px', color: '#666' }}>
          Showing 1 to {allExhibitions.length} of {allExhibitions.length} entries
        </div>
        <div>
          <button className="btn btn-small">Select All</button>
          <button className="btn btn-small btn-danger" style={{ marginLeft: '10px' }}>Delete Selected</button>
        </div>
      </div>
    </AdminLayout>
  );
}
