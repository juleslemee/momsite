'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

interface AdminLayoutProps {
  children: React.ReactNode;
}

const sidebarLinks = [
  { href: '/', label: 'Overview' },
  { href: '/artists', label: 'Artists' },
  { href: '/exhibitions', label: 'Exhibitions' },
  { href: '/news', label: 'News' },
  { href: '/press', label: 'Press' },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isActive = (href: string) => {
    if (!mounted) return false;
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="site-header">
        <Link href="/" className="logo-link">
          <img
            src="https://s3.amazonaws.com/files.collageplatform.com.prod/application/539f1b2ba9aa2c31208b4568/fc6e4116526034e8fc53679c011004a3.png"
            alt="Muriel Guepin Gallery"
            className="logo-img"
          />
        </Link>
        <div className="info">
          <div className="user">
            contact@murielguepingallery.com
          </div>
        </div>
      </header>

      {/* Main wrapper */}
      <div className="main-wrapper">
        {/* Sidebar */}
        <aside className="sidebar">
          {sidebarLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={isActive(link.href) ? 'active' : undefined}
            >
              {link.label}
            </Link>
          ))}
        </aside>

        {/* Content */}
        <main className="content">
          {children}
        </main>
      </div>

      {/* Footer */}
      <footer className="site-footer">
        <div>made with love by your son</div>
        <div></div>
      </footer>
    </div>
  );
}
