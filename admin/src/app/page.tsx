import AdminLayout from '@/components/AdminLayout';
import Link from 'next/link';

export default function OverviewPage() {
  // Mock recent updates - in production this would come from the database
  const recentUpdates = [
    { date: 'December 21 2024, 10:30', action: 'System initialized' },
  ];

  return (
    <AdminLayout>
      {/* Breadcrumb */}
      <div className="route">
        <div>
          <Link href="/">Muriel Guepin Gallery</Link>
        </div>
        <a href="https://www.murielguepingallery.com" target="_blank" rel="noopener" className="view-link">
          View Website
        </a>
      </div>

      {/* Recent Updates */}
      <section>
        <div className="section-header">Recent Updates</div>

        <table className="updates-table">
          <tbody>
            {recentUpdates.map((update, i) => (
              <tr key={i}>
                <td className="date-col">
                  <div className="label">Date</div>
                  <div>{update.date}</div>
                </td>
                <td>
                  <div className="label">Update</div>
                  <div>{update.action}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: '20px', textAlign: 'right' }}>
          <Link href="/updates" className="btn">See all updates</Link>
        </div>
      </section>
    </AdminLayout>
  );
}
