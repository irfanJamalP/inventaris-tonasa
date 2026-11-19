import { useEffect, useState } from 'react';
import Head from 'next/head';
import Sidebar from './Sidebar';
import { useRouter } from 'next/router';
import { apiGet } from '../lib/api';
import { getToken } from '../lib/auth';

const isDemo = process.env.NEXT_PUBLIC_PORTFOLIO_DEMO === 'true';

export default function Layout({ user, title, subtitle, children, pendingCount }) {
  const router = useRouter();
  const [isImpersonated, setIsImpersonated] = useState(false);
  const [dynamicPendingCount, setDynamicPendingCount] = useState(0);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('original_admin_token')) {
      setIsImpersonated(true);
    }
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token || !user) return;
    
    const fetchCount = async () => {
      try {
        const data = await apiGet('/notifications/count', token);
        if (data && typeof data.count === 'number') {
          setDynamicPendingCount(data.count);
        }
      } catch (err) {
        console.error('Gagal mengambil count pending:', err);
      }
    };
    
    fetchCount();
    const interval = setInterval(fetchCount, 15000);
    
    if (isDemo) {
      window.addEventListener('ASSET_CHANGED', fetchCount);
      return () => {
        clearInterval(interval);
        window.removeEventListener('ASSET_CHANGED', fetchCount);
      };
    }

    // SSE Real-time connection
    const eventSource = new EventSource(`/api/stream?token=${token}`);
    
    eventSource.addEventListener('ASSET_CHANGED', (e) => {
      console.log('Real-time update received: ASSET_CHANGED');
      fetchCount(); // Update badge automatically
      window.dispatchEvent(new Event('ASSET_CHANGED')); // Notify other pages
    });

    eventSource.onerror = (error) => {
      console.error('SSE Error (reconnecting...):', error);
      // Remove eventSource.close() so the browser can automatically reconnect
    };

    return () => {
      clearInterval(interval);
      eventSource.close();
    };
  }, [user]);

  const displayCount = pendingCount !== undefined ? pendingCount : dynamicPendingCount;

  const handleSwitchBack = () => {
    const origToken = localStorage.getItem('original_admin_token');
    const origUser = localStorage.getItem('original_admin_user');
    if (origToken && origUser) {
      localStorage.setItem('tonasa_token', origToken);
      localStorage.setItem('tonasa_user', origUser);
      localStorage.removeItem('original_admin_token');
      localStorage.removeItem('original_admin_user');
      router.reload();
    }
  };

  const name = user?.name || '';
  const initials = name ? name.slice(0, 2).toUpperCase() : '?';

  return (
    <>
      <Head>
        <title>{title ? `${title} — Inventaris Tonasa` : 'Inventaris Aset Tonasa'}</title>
        <meta name="description" content="Sistem Manajemen Inventaris Aset PT Semen Tonasa" />
        <link rel="icon" href="/logo-tonasa-fix.png" />
      </Head>
      <div className="app-layout">
        <Sidebar user={user} pendingCount={displayCount} />
        <main className="main-content">
          {isImpersonated && (
            <div style={{
              background: '#f59e0b', color: '#0f172a', padding: '0.5rem 1.5rem',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontWeight: 600, fontSize: '0.9rem'
            }}>
              <span>
                <i className="fas fa-user-secret" style={{ marginRight: 8 }}></i>
                Anda sedang login sebagai <strong>{user?.name}</strong> ({user?.role === 'admin_utama' ? 'Admin Utama' : user?.role === 'admin' ? 'Admin' : 'User'})
              </span>
              <button onClick={handleSwitchBack} className="btn btn-secondary btn-sm" style={{ background: '#0f172a', color: 'white', border: 'none' }}>
                <i className="fas fa-undo"></i> Kembali ke Admin
              </button>
            </div>
          )}
          <header className="page-header">
            <div className="page-header-title">
              <h1>{title}</h1>
              {subtitle && <p className="text-muted">{subtitle}</p>}
            </div>
            <div className="page-header-right">
              <div className="d-flex align-center gap-2">
                <div className="avatar" style={{ width: 36, height: 36, fontSize: '0.8rem' }}>
                  {initials}
                </div>
                <div>
                  <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>{user?.name || 'Pengguna'}</p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    {user?.role === 'admin_utama' ? 'Admin Utama' : user?.role === 'admin' ? 'Admin' : 'User'}
                  </p>
                </div>
              </div>
            </div>
          </header>
          <div className="content-body">
            {isDemo && (
              <div className="alert alert-info" role="status" style={{ marginBottom: '1rem' }}>
                Demo portofolio dengan data fiktif. Perubahan tersimpan di browser ini.
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
    </>
  );
}
