import AdminLayout from '@/components/AdminLayout';
import Link from 'next/link';
import { db } from '@/db';
import { desc, asc } from 'drizzle-orm';

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://jlemee.com';

export default async function PressPage() {
  const allPress = await db.query.press.findMany({
    with: {
      image: true,
    },
    orderBy: (press, { desc, asc }) => [desc(press.date), asc(press.sortOrder)],
  });

  return (
    <AdminLayout>
      {/* Breadcrumb */}
      <div className="route">
        <div>
          <Link href="/">Muriel Guepin Gallery</Link>
          {' / '}
          <Link href="/press">Press</Link>
        </div>
        <a href="https://www.murielguepingallery.com/press" target="_blank" rel="noopener" className="view-link">
          View Page
        </a>
      </div>

      {/* Section header */}
      <div className="section-header">
        Press
      </div>

      {/* Quick add form */}
      <form className="quick-add-form" action="/api/press/create" method="POST">
        <div style={{ flex: 1 }}>
          <label htmlFor="title">Title</label>
          <input
            type="text"
            id="title"
            name="title"
            required
            placeholder="Enter press title..."
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button type="submit" className="btn btn-primary">Add</button>
        </div>
      </form>

      {/* Press table */}
      <div className="data-table-header">
        <h2>Press</h2>
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
          {allPress.map((item) => (
            <tr key={item.id} className={!item.isEnabled ? 'disabled' : ''}>
              <td className="col-select">
                <input type="checkbox" name="selected[]" value={item.id} />
              </td>
              <td className="col-move">
                <span className="move-handle">⋮⋮</span>
              </td>
              <td className="col-thumbnail">
                <img
                  src={item.image?.hash
                    ? `${R2_PUBLIC_URL}/images/${item.image.hash}/thumbnail.webp`
                    : '/placeholder.png'}
                  alt=""
                />
              </td>
              <td className="col-name">{item.title}</td>
              <td style={{ color: '#666', fontSize: '12px' }}>{item.subtitle || ''}</td>
              <td style={{ color: '#666', fontSize: '12px' }}>{item.date || ''}</td>
              <td className="col-actions">
                <Link href={`/press/${item.id}`} className="btn btn-small">
                  Edit
                </Link>
                {item.isEnabled ? (
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

      {allPress.length === 0 && (
        <p style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
          No press items yet. Add your first press item above.
        </p>
      )}

      {/* Bulk actions */}
      <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '12px', color: '#666' }}>
          Showing 1 to {allPress.length} of {allPress.length} entries
        </div>
        <div>
          <button className="btn btn-small">Select All</button>
          <button className="btn btn-small btn-danger" style={{ marginLeft: '10px' }}>Delete Selected</button>
        </div>
      </div>
    </AdminLayout>
  );
}
