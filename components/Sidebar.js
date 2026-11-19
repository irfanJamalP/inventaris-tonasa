import Link from 'next/link';
import { useRouter } from 'next/router';
import { logout } from '../lib/auth';

export default function Sidebar({ user, pendingCount = 0 }) {
  const router = useRouter();
  const currentPath = router.pathname;

  const isAdmin = user?.role === 'admin' || user?.role === 'admin_utama';

  const navItems = [
    { href: '/dashboard', icon: 'fa-gauge-high', label: 'Dashboard', roles: ['admin_utama', 'admin', 'operator', 'karyawan', 'user'] },
    { href: '/aset', icon: 'fa-boxes-stacked', label: 'Aset', roles: ['admin_utama', 'admin', 'operator', 'karyawan', 'user'], badge: !isAdmin ? pendingCount : 0 },
    { href: '/laporan', icon: 'fa-chart-bar', label: 'Laporan', roles: ['admin_utama', 'admin', 'operator', 'karyawan', 'user'] },
    { href: '/profil', icon: 'fa-user-pen', label: 'Edit Profil', roles: ['admin_utama', 'admin', 'operator', 'karyawan', 'user'] },
  ];

  const adminItems = [
    { href: '/persetujuan', icon: 'fa-circle-check', label: 'Persetujuan', badge: pendingCount },
    { href: '/pengguna', icon: 'fa-users', label: 'Pengguna' },
    { href: '/histori', icon: 'fa-clock-rotate-left', label: 'Histori' },
  ];

  const initials = user?.name ? user.name.slice(0, 2).toUpperCase() : '?';

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon" style={{ background: 'transparent', width: '40px', height: '40px' }}>
            <img src="/logo-tonasa-fix.png" alt="Logo Tonasa" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <h2>Inventaris Tonasa</h2>
        </div>
        <p className="sidebar-subtitle">Sistem Manajemen Aset</p>
      </div>

      <nav className="sidebar-nav">
        <p className="nav-section-label">Menu Utama</p>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${currentPath === item.href ? 'active' : ''}`}
          >
            <i className={`fas ${item.icon}`}></i>
            <span>{item.label}</span>
            {item.badge > 0 && (
              <span className="badge-count" style={{ background: 'var(--danger)' }}>{item.badge}</span>
            )}
          </Link>
        ))}

        {isAdmin && (
          <>
            <p className="nav-section-label">Administrasi</p>
            {adminItems.map((item) => {
              if (item.href === '/pengguna' && user?.role !== 'admin_utama') return null;
              return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${currentPath === item.href ? 'active' : ''}`}
              >
                <i className={`fas ${item.icon}`}></i>
                <span>{item.label}</span>
                {item.badge > 0 && (
                  <span className="badge-count">{item.badge}</span>
                )}
              </Link>
            )})}
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="user-card">
          <div className="avatar">{initials}</div>
          <div className="user-details">
            <p className="user-name">{user?.name || 'Pengguna'}</p>
            <p className="user-role">
              {user?.role === 'admin_utama'
                ? 'Admin Utama'
                : user?.role === 'admin'
                ? 'Admin'
                : (user?.role === 'operator' || user?.role === 'karyawan' || user?.role === 'user')
                ? 'User'
                : user?.role || '-'}
            </p>
          </div>
        </div>
        <button
          className="btn btn-danger"
          style={{ width: '100%', fontSize: '0.85rem' }}
          onClick={() => logout(router)}
        >
          <i className="fas fa-right-from-bracket"></i>
          Keluar
        </button>
      </div>
    </aside>
  );
}
