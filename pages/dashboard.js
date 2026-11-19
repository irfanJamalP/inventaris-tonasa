import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import useAuth from '../lib/useAuth';
import { apiGet } from '../lib/api';

function StatCard({ icon, label, value, color, iconBg }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: iconBg }}>
        <i className={`fas ${icon}`} style={{ color }}></i>
      </div>
      <div className="stat-info">
        <h3 style={{ color }}>{value ?? '...'}</h3>
        <p>{label}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { token, user, loading } = useAuth();
  const [stats, setStats] = useState(null);
  const [recentHistory, setRecentHistory] = useState([]);
  const [rejectedCount, setRejectedCount] = useState(0);

  const isAdmin = user?.role === 'admin' || user?.role === 'admin_utama';
  const [chartLoaded, setChartLoaded] = useState(false);
  const chartRef1 = useRef(null);
  const chartRef2 = useRef(null);
  const chartInstance1 = useRef(null);
  const chartInstance2 = useRef(null);

  useEffect(() => {
    if (!token) return;
    loadDashboard();
    
    const handleAssetChanged = () => {
      console.log("SSE: Refreshing dashboard.js");
      loadDashboard();
    };
    window.addEventListener('ASSET_CHANGED', handleAssetChanged);
    return () => window.removeEventListener('ASSET_CHANGED', handleAssetChanged);
  }, [token]);

  const loadDashboard = async () => {
    try {
      const [s, h, n] = await Promise.all([
        apiGet('/stats', token),
        apiGet('/history?limit=8', token),
        apiGet('/notifications/count', token),
      ]);
      setStats(s);
      setRecentHistory(Array.isArray(h) ? h : []);
      if (n && typeof n.count === 'number') {
        setRejectedCount(n.count);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!stats) return;
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    script.onload = () => setChartLoaded(true);
    document.head.appendChild(script);
    return () => document.head.removeChild(script);
  }, [stats]);

  useEffect(() => {
    if (!chartLoaded || !stats || !window.Chart) return;

    // Destroy old instances
    if (chartInstance1.current) chartInstance1.current.destroy();
    if (chartInstance2.current) chartInstance2.current.destroy();

    const kondisi = stats.kondisi_summary || {};
    const status = stats.status_summary || {};

    const kondisiLabels = ['Baik', 'Rusak', 'Tidak Ada Fisik'];
    const kondisiColors = ['#10b981', '#ef4444', '#f59e0b'];
    const kondisiData = kondisiLabels.map(label => kondisi[label] || 0);

    if (chartRef1.current) {
      chartInstance1.current = new window.Chart(chartRef1.current, {
        type: 'doughnut',
        data: {
          labels: kondisiLabels,
          datasets: [{
            data: kondisiData,
            backgroundColor: kondisiColors,
            borderColor: '#1e293b',
            borderWidth: 3,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#cbd5e1', font: { family: 'Inter' } } } }
        }
      });
    }

    const statusLabels = ['Optimal', 'Tidak Optimal'];
    const statusData = statusLabels.map(label => status[label] || 0);

    if (chartRef2.current) {
      chartInstance2.current = new window.Chart(chartRef2.current, {
        type: 'bar',
        data: {
          labels: statusLabels,
          datasets: [{
            label: 'Jumlah Aset',
            data: statusData,
            backgroundColor: 'rgba(59,130,246,0.7)',
            borderColor: '#3b82f6',
            borderWidth: 1,
            borderRadius: 6,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
            y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }
          }
        }
      });
    }
  }, [chartLoaded, stats]);

  const getActivityIcon = (action) => {
    if (action?.includes('Tambah') || action?.includes('tambah')) return { icon: 'fa-plus', bg: 'rgba(16,185,129,0.15)', color: '#10b981' };
    if (action?.includes('Edit') || action?.includes('update')) return { icon: 'fa-pen', bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' };
    if (action?.includes('Hapus') || action?.includes('hapus')) return { icon: 'fa-trash', bg: 'rgba(239,68,68,0.15)', color: '#ef4444' };
    if (action?.includes('Setuju') || action?.includes('Tolak')) return { icon: 'fa-circle-check', bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' };
    return { icon: 'fa-clock-rotate-left', bg: 'rgba(100,116,139,0.15)', color: '#94a3b8' };
  };

  const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0f172a' }}>
      <div className="loading-spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div>
    </div>
  );

  return (
    <Layout user={user} title="Dashboard" subtitle="Ringkasan sistem inventaris aset Tonasa">
      {!isAdmin && rejectedCount > 0 && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          color: '#f87171',
          padding: '1rem 1.5rem',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
        }}>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>
              <i className="fas fa-circle-exclamation" style={{ marginRight: 8 }}></i>
              Ada {rejectedCount} Aset Anda yang Ditolak oleh Admin
            </h4>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Silakan periksa daftar aset Anda untuk melihat alasan penolakan dan lakukan perbaikan.
            </p>
          </div>
          <button
            onClick={() => router.push('/aset?status=Rejected')}
            className="btn btn-danger btn-sm"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
          >
            Lihat Aset <i className="fas fa-arrow-right" style={{ marginLeft: 6 }}></i>
          </button>
        </div>
      )}

      {/* Stats Grid */}
      <div className="stats-grid">
        <StatCard icon="fa-boxes-stacked" label="Total Aset" value={stats?.total_aset} color="#3b82f6" iconBg="rgba(59,130,246,0.15)" />
        <StatCard icon="fa-circle-check" label="Kondisi Baik" value={stats?.kondisi_baik} color="#10b981" iconBg="rgba(16,185,129,0.15)" />
        <StatCard icon="fa-circle-xmark" label="Aset Rusak" value={stats?.kondisi_rusak} color="#ef4444" iconBg="rgba(239,68,68,0.15)" />
        <StatCard icon="fa-clock" label="Pending Approval" value={stats?.pending_approvals} color="#f59e0b" iconBg="rgba(245,158,11,0.15)" />
      </div>

      {/* Charts */}
      <div className="charts-grid">
        <div className="chart-card">
          <h3><i className="fas fa-chart-pie" style={{ marginRight: 8, color: '#3b82f6' }}></i>Kondisi Aset</h3>
          <div style={{ height: 240, position: 'relative' }}>
            <canvas ref={chartRef1}></canvas>
          </div>
        </div>
        <div className="chart-card">
          <h3><i className="fas fa-chart-bar" style={{ marginRight: 8, color: '#10b981' }}></i>Status Aset</h3>
          <div style={{ height: 240, position: 'relative' }}>
            <canvas ref={chartRef2}></canvas>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="table-container" style={{ marginTop: '1.5rem' }}>
        <div className="modal-header" style={{ borderRadius: '11px 11px 0 0' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>
            <i className="fas fa-clock-rotate-left" style={{ marginRight: 8, color: '#3b82f6' }}></i>Aktivitas Terkini
          </h3>
        </div>
        {recentHistory.length === 0 ? (
          <div className="empty-state"><i className="fas fa-inbox"></i><p>Belum ada aktivitas</p></div>
        ) : (
          recentHistory.map((h, i) => {
            const ai = getActivityIcon(h.action);
            return (
              <div key={i} className="recent-activity-item">
                <div className="activity-icon" style={{ background: ai.bg }}>
                  <i className={`fas ${ai.icon}`} style={{ color: ai.color }}></i>
                </div>
                <div className="activity-text">
                  <p>{h.description || h.action}</p>
                  <span>oleh {h.username || 'Sistem'}</span>
                </div>
                <div className="activity-time">{formatDate(h.created_at)}</div>
              </div>
            );
          })
        )}
      </div>
    </Layout>
  );
}
