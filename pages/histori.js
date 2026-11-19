import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import useAuth from '../lib/useAuth';
import { apiGet, apiPost } from '../lib/api';

export default function HistoriPage() {
  const { token, user, loading } = useAuth('admin');
  
  const [activeTab, setActiveTab] = useState('assets');
  const [fetching, setFetching] = useState(false);

  const pageSize = 50;

  // SECTION: Deleted Assets
  const [delAssets, setDelAssets] = useState([]);
  const [delAssetsPage, setDelAssetsPage] = useState(1);
  const [delAssetsTotal, setDelAssetsTotal] = useState(0);
  const [delAssetsSearch, setDelAssetsSearch] = useState('');
  const [delAssetsSelected, setDelAssetsSelected] = useState([]);
  const [delAssetsDeleteMode, setDelAssetsDeleteMode] = useState(false);

  // SECTION: Asset Logs
  const [assetLogs, setAssetLogs] = useState([]);
  const [assetLogsPage, setAssetLogsPage] = useState(1);
  const [assetLogsTotal, setAssetLogsTotal] = useState(0);
  const [assetLogsSearch, setAssetLogsSearch] = useState('');
  const [assetLogsSelected, setAssetLogsSelected] = useState([]);
  const [assetLogsDeleteMode, setAssetLogsDeleteMode] = useState(false);

  // SECTION: Deleted Users
  const [delUsers, setDelUsers] = useState([]);
  const [delUsersPage, setDelUsersPage] = useState(1);
  const [delUsersTotal, setDelUsersTotal] = useState(0);
  const [delUsersSearch, setDelUsersSearch] = useState('');
  const [delUsersSelected, setDelUsersSelected] = useState([]);
  const [delUsersDeleteMode, setDelUsersDeleteMode] = useState(false);

  // SECTION: User Logs
  const [userLogs, setUserLogs] = useState([]);
  const [userLogsPage, setUserLogsPage] = useState(1);
  const [userLogsTotal, setUserLogsTotal] = useState(0);
  const [userLogsSearch, setUserLogsSearch] = useState('');
  const [userLogsSelected, setUserLogsSelected] = useState([]);
  const [userLogsDeleteMode, setUserLogsDeleteMode] = useState(false);

  useEffect(() => { setDelAssetsPage(1); }, [delAssetsSearch]);
  useEffect(() => { setAssetLogsPage(1); }, [assetLogsSearch]);
  useEffect(() => { setDelUsersPage(1); }, [delUsersSearch]);
  useEffect(() => { setUserLogsPage(1); }, [userLogsSearch]);

  useEffect(() => {
    if (!token) return;
    const handler = setTimeout(() => {
      loadData();
    }, 400);
    return () => clearTimeout(handler);
  }, [
    token, activeTab, 
    delAssetsPage, delAssetsSearch, 
    assetLogsPage, assetLogsSearch, 
    delUsersPage, delUsersSearch, 
    userLogsPage, userLogsSearch
  ]);

  const loadData = async () => {
    setFetching(true);
    try {
      if (activeTab === 'assets') {
        const [del, logs] = await Promise.all([
          apiGet(`/history/deleted-assets?page=${delAssetsPage}&limit=${pageSize}&search=${encodeURIComponent(delAssetsSearch)}`, token),
          apiGet(`/history/logs/assets?page=${assetLogsPage}&limit=${pageSize}&search=${encodeURIComponent(assetLogsSearch)}`, token)
        ]);
        setDelAssets(del?.data || []);
        setDelAssetsTotal(del?.total || 0);
        setAssetLogs(logs?.data || []);
        setAssetLogsTotal(logs?.total || 0);
      } else if (activeTab === 'users') {
        const [del, logs] = await Promise.all([
          apiGet(`/history/deleted-users?page=${delUsersPage}&limit=${pageSize}&search=${encodeURIComponent(delUsersSearch)}`, token),
          apiGet(`/history/logs/users?page=${userLogsPage}&limit=${pageSize}&search=${encodeURIComponent(userLogsSearch)}`, token)
        ]);
        setDelUsers(del?.data || []);
        setDelUsersTotal(del?.total || 0);
        setUserLogs(logs?.data || []);
        setUserLogsTotal(logs?.total || 0);
      }
    } catch (e) {
      console.error('Gagal mengambil data histori:', e);
    } finally {
      setFetching(false);
      setDelAssetsSelected([]); setAssetLogsSelected([]); setDelUsersSelected([]); setUserLogsSelected([]);
      setDelAssetsDeleteMode(false); setAssetLogsDeleteMode(false); setDelUsersDeleteMode(false); setUserLogsDeleteMode(false);
    }
  };

  const handlePermanentDelete = async (type, ids) => {
    if (!ids || ids.length === 0) return;
    if (!confirm('Hapus permanen ' + ids.length + ' data ini? Tindakan ini tidak dapat dibatalkan.')) return;

    let endpoint = '';
    if (type === 'delAssets') endpoint = '/history/assets/permanent';
    else if (type === 'assetLogs') endpoint = '/history/logs/assets/permanent';
    else if (type === 'delUsers') endpoint = '/history/users/permanent';
    else if (type === 'userLogs') endpoint = '/history/logs/users/permanent';

    try {
      const res = await apiPost(endpoint, { ids }, token, 'DELETE');
      if (res.ok) {
        alert('Data berhasil dihapus permanen.');
        loadData();
      } else {
        const err = await res.json();
        alert(err.message || 'Gagal menghapus data.');
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan.');
    }
  };

  const handleRestore = async (type, id, name) => {
    if (!confirm(`Pulihkan kembali data ${type} "${name}"?`)) return;
    try {
      let endpoint = '';
      if (type === 'aset') endpoint = `/assets/${id}/restore`;
      else if (type === 'pengguna') endpoint = `/users/${id}/restore`;

      const res = await apiPost(endpoint, {}, token);
      if (res.ok) {
        alert(`Data ${type} berhasil dipulihkan.`);
        loadData();
      } else {
        const data = await res.json();
        alert(data.message || 'Gagal memulihkan data.');
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan saat memulihkan data.');
    }
  };

  const toggleSelect = (id, selected, setSelected) => {
    if (selected.includes(id)) setSelected(selected.filter(i => i !== id));
    else setSelected([...selected, id]);
  };

  const toggleSelectAll = (data, selected, setSelected) => {
    if (selected.length === data.length && data.length > 0) setSelected([]);
    else setSelected(data.map(d => d.id));
  };

  const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const cleanDescription = (desc, field, oldVal, newVal) => {
    if (newVal === 'Aset dummy baru didaftarkan lewat skrip migrasi' || desc?.includes('Aset dummy baru didaftarkan lewat skrip migrasi')) {
      return 'Aset baru didaftarkan';
    }
    return desc || `Mengubah ${field} dari "${oldVal || ''}" menjadi "${newVal || ''}"`;
  };

  const PaginationNav = ({ page, setPage, total }) => {
    const totalPages = Math.ceil(total / pageSize) || 1;
    return (
      <div className="pagination-simple" style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '1rem', justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
          <i className="fas fa-chevron-left" style={{ marginRight: 6 }}></i> Sebelumnya
        </button>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Halaman {page} dari {totalPages}</span>
        <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
          Selanjutnya <i className="fas fa-chevron-right" style={{ marginLeft: 6 }}></i>
        </button>
      </div>
    );
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0f172a' }}><div className="loading-spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div></div>;

  return (
    <Layout user={user} title="Histori & Pemulihan" subtitle="Pemulihan data soft-delete dan log aktivitas sistem (Admin Only)">
      
      {/* Tab Navigations */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
        <button
          className={`btn ${activeTab === 'assets' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('assets')}
          style={{ background: activeTab === 'assets' ? 'var(--accent-primary)' : '' }}
        >
          <i className="fas fa-boxes-stacked" style={{ marginRight: 6 }}></i> Aset
        </button>
        <button
          className={`btn ${activeTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('users')}
          style={{ background: activeTab === 'users' ? 'var(--accent-primary)' : '' }}
        >
          <i className="fas fa-users" style={{ marginRight: 6 }}></i> Akun Pengguna
        </button>
      </div>

      {fetching && delAssets.length === 0 && delUsers.length === 0 ? (
        <div className="loading-state" style={{ padding: '3rem 0' }}><div className="loading-spinner"></div> Memuat data histori...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* TAB CONTENT: ASSETS */}
          {activeTab === 'assets' && (
            <>
              {/* Section 1: Deleted Assets */}
              <div className="table-container">
                <div className="table-header" style={{ borderRadius: '11px 11px 0 0', background: 'rgba(239, 68, 68, 0.15)', borderBottom: '1px solid rgba(239, 68, 68, 0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#ef4444' }}>
                    <i className="fas fa-trash-can" style={{ marginRight: 8 }}></i>Aset Terhapus (Soft-Delete)
                  </h3>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input type="text" className="search-input" placeholder="Cari aset terhapus..." value={delAssetsSearch} onChange={e => setDelAssetsSearch(e.target.value)} style={{ padding: '0.3rem 0.6rem', fontSize: '0.85rem' }} />
                    <button className={`btn btn-sm ${delAssetsDeleteMode ? 'btn-danger' : 'btn-secondary'}`} onClick={() => setDelAssetsDeleteMode(!delAssetsDeleteMode)}>
                      {delAssetsDeleteMode ? 'Batal' : 'Pilih untuk Dihapus Permanen'}
                    </button>
                    {delAssetsDeleteMode && delAssetsSelected.length > 0 && (
                      <button className="btn btn-danger btn-sm" onClick={() => handlePermanentDelete('delAssets', delAssetsSelected)}>
                        Hapus Terpilih ({delAssetsSelected.length})
                      </button>
                    )}
                  </div>
                </div>
                {delAssets.length === 0 ? (
                  <div className="empty-state" style={{ padding: '2rem' }}><p>Tidak ada aset terhapus.</p></div>
                ) : (
                  <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
                    <table style={{ position: 'relative' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-secondary)', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                        <tr>
                          {delAssetsDeleteMode && (
                            <th style={{ width: 40 }}>
                              <input type="checkbox" checked={delAssetsSelected.length === delAssets.length} onChange={() => toggleSelectAll(delAssets, delAssetsSelected, setDelAssetsSelected)} />
                            </th>
                          )}
                          <th>Kode</th>
                          <th>Nama Aset</th>
                          <th>Kategori</th>
                          <th>Lokasi</th>
                          <th>Dihapus Pada</th>
                          <th>Oleh</th>
                          <th>Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {delAssets.map(a => (
                          <tr key={a.id} className={delAssetsSelected.includes(a.id) ? 'selected-row' : ''}>
                            {delAssetsDeleteMode && (
                              <td>
                                <input type="checkbox" checked={delAssetsSelected.includes(a.id)} onChange={() => toggleSelect(a.id, delAssetsSelected, setDelAssetsSelected)} />
                              </td>
                            )}
                            <td><code>{a.asset_number}</code></td>
                            <td><strong>{a.name}</strong></td>
                            <td>{a.category_name || '-'}</td>
                            <td>{a.location || '-'}</td>
                            <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{formatDate(a.deleted_at)}</td>
                            <td>{a.deleted_by_name || 'Sistem'}</td>
                            <td>
                              <button className="btn btn-success btn-sm" onClick={() => handleRestore('aset', a.id, a.name)}>
                                <i className="fas fa-undo"></i> Pulihkan
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {delAssetsTotal > 0 && <PaginationNav page={delAssetsPage} setPage={setDelAssetsPage} total={delAssetsTotal} />}
                  </div>
                )}
              </div>

              {/* Section 2: Asset Logs */}
              <div className="table-container">
                <div className="table-header" style={{ borderRadius: '11px 11px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem' }}>
                    <i className="fas fa-clock-rotate-left" style={{ marginRight: 8, color: '#3b82f6' }}></i>Log Aktivitas Perubahan Aset
                  </h3>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input type="text" className="search-input" placeholder="Cari log..." value={assetLogsSearch} onChange={e => setAssetLogsSearch(e.target.value)} style={{ padding: '0.3rem 0.6rem', fontSize: '0.85rem' }} />
                    <button className={`btn btn-sm ${assetLogsDeleteMode ? 'btn-danger' : 'btn-secondary'}`} onClick={() => setAssetLogsDeleteMode(!assetLogsDeleteMode)}>
                      {assetLogsDeleteMode ? 'Batal' : 'Pilih untuk Dihapus'}
                    </button>
                    {assetLogsDeleteMode && assetLogsSelected.length > 0 && (
                      <button className="btn btn-danger btn-sm" onClick={() => handlePermanentDelete('assetLogs', assetLogsSelected)}>
                        Hapus Terpilih ({assetLogsSelected.length})
                      </button>
                    )}
                  </div>
                </div>
                {assetLogs.length === 0 ? (
                  <div className="empty-state" style={{ padding: '2rem' }}><p>Belum ada log aktivitas.</p></div>
                ) : (
                  <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
                    <table style={{ position: 'relative' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-secondary)', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                        <tr>
                          {assetLogsDeleteMode && (
                            <th style={{ width: 40 }}>
                              <input type="checkbox" checked={assetLogsSelected.length === assetLogs.length} onChange={() => toggleSelectAll(assetLogs, assetLogsSelected, setAssetLogsSelected)} />
                            </th>
                          )}
                          <th>Tanggal</th>
                          <th>Kode Aset</th>
                          <th>Nama Aset</th>
                          <th>Kolom Diubah</th>
                          <th>Nilai Lama</th>
                          <th>Nilai Baru</th>
                          <th>Pelaku</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assetLogs.map((h, i) => (
                          <tr key={h.id} className={assetLogsSelected.includes(h.id) ? 'selected-row' : ''}>
                            {assetLogsDeleteMode && (
                              <td>
                                <input type="checkbox" checked={assetLogsSelected.includes(h.id)} onChange={() => toggleSelect(h.id, assetLogsSelected, setAssetLogsSelected)} />
                              </td>
                            )}
                            <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{formatDate(h.changed_at)}</td>
                            <td><code>{h.asset_number || '-'}</code></td>
                            <td><strong>{h.asset_name || 'Aset Terhapus'}</strong></td>
                            <td><span className="badge" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>{h.field_changed}</span></td>
                            <td style={{ color: '#f87171', fontSize: '0.85rem' }}>{h.old_value || '-'}</td>
                            <td style={{ color: '#4ade80', fontSize: '0.85rem' }}>{cleanDescription(h.new_value, h.field_changed, h.old_value, h.new_value)}</td>
                            <td>{h.actor_name || 'Sistem'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {assetLogsTotal > 0 && <PaginationNav page={assetLogsPage} setPage={setAssetLogsPage} total={assetLogsTotal} />}
                  </div>
                )}
              </div>
            </>
          )}

          {/* TAB CONTENT: USERS */}
          {activeTab === 'users' && (
            <>
              {/* Section 1: Deleted Users */}
              <div className="table-container">
                <div className="table-header" style={{ borderRadius: '11px 11px 0 0', background: 'rgba(239, 68, 68, 0.15)', borderBottom: '1px solid rgba(239, 68, 68, 0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#ef4444' }}>
                    <i className="fas fa-trash-can" style={{ marginRight: 8 }}></i>Akun Terhapus (Soft-Delete)
                  </h3>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input type="text" className="search-input" placeholder="Cari akun terhapus..." value={delUsersSearch} onChange={e => setDelUsersSearch(e.target.value)} style={{ padding: '0.3rem 0.6rem', fontSize: '0.85rem' }} />
                    <button className={`btn btn-sm ${delUsersDeleteMode ? 'btn-danger' : 'btn-secondary'}`} onClick={() => setDelUsersDeleteMode(!delUsersDeleteMode)}>
                      {delUsersDeleteMode ? 'Batal' : 'Pilih untuk Dihapus Permanen'}
                    </button>
                    {delUsersDeleteMode && delUsersSelected.length > 0 && (
                      <button className="btn btn-danger btn-sm" onClick={() => handlePermanentDelete('delUsers', delUsersSelected)}>
                        Hapus Terpilih ({delUsersSelected.length})
                      </button>
                    )}
                  </div>
                </div>
                {delUsers.length === 0 ? (
                  <div className="empty-state" style={{ padding: '2rem' }}><p>Tidak ada pengguna terhapus.</p></div>
                ) : (
                  <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
                    <table style={{ position: 'relative' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-secondary)', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                        <tr>
                          {delUsersDeleteMode && (
                            <th style={{ width: 40 }}>
                              <input type="checkbox" checked={delUsersSelected.length === delUsers.length} onChange={() => toggleSelectAll(delUsers, delUsersSelected, setDelUsersSelected)} />
                            </th>
                          )}
                          <th>Nama Lengkap</th>
                          <th>Email</th>
                          <th>Peran</th>
                          <th>Dihapus Pada</th>
                          <th>Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {delUsers.map(u => (
                          <tr key={u.id} className={delUsersSelected.includes(u.id) ? 'selected-row' : ''}>
                            {delUsersDeleteMode && (
                              <td>
                                <input type="checkbox" checked={delUsersSelected.includes(u.id)} onChange={() => toggleSelect(u.id, delUsersSelected, setDelUsersSelected)} />
                              </td>
                            )}
                            <td><strong>{u.name}</strong></td>
                            <td>{u.email.replace(/_deleted_\d+$/, '')}</td>
                            <td><span className={`badge ${u.role}`}>{u.role}</span></td>
                            <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{formatDate(u.deleted_at)}</td>
                            <td>
                              <button className="btn btn-success btn-sm" onClick={() => handleRestore('pengguna', u.id, u.name)}>
                                <i className="fas fa-undo"></i> Pulihkan
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {delUsersTotal > 0 && <PaginationNav page={delUsersPage} setPage={setDelUsersPage} total={delUsersTotal} />}
                  </div>
                )}
              </div>

              {/* Section 2: User Logs */}
              <div className="table-container">
                <div className="table-header" style={{ borderRadius: '11px 11px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem' }}>
                    <i className="fas fa-clock-rotate-left" style={{ marginRight: 8, color: '#a855f7' }}></i>Log Aktivitas Perubahan Akun
                  </h3>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input type="text" className="search-input" placeholder="Cari log..." value={userLogsSearch} onChange={e => setUserLogsSearch(e.target.value)} style={{ padding: '0.3rem 0.6rem', fontSize: '0.85rem' }} />
                    <button className={`btn btn-sm ${userLogsDeleteMode ? 'btn-danger' : 'btn-secondary'}`} onClick={() => setUserLogsDeleteMode(!userLogsDeleteMode)}>
                      {userLogsDeleteMode ? 'Batal' : 'Pilih untuk Dihapus'}
                    </button>
                    {userLogsDeleteMode && userLogsSelected.length > 0 && (
                      <button className="btn btn-danger btn-sm" onClick={() => handlePermanentDelete('userLogs', userLogsSelected)}>
                        Hapus Terpilih ({userLogsSelected.length})
                      </button>
                    )}
                  </div>
                </div>
                {userLogs.length === 0 ? (
                  <div className="empty-state" style={{ padding: '2rem' }}><p>Belum ada log aktivitas.</p></div>
                ) : (
                  <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
                    <table style={{ position: 'relative' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-secondary)', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                        <tr>
                          {userLogsDeleteMode && (
                            <th style={{ width: 40 }}>
                              <input type="checkbox" checked={userLogsSelected.length === userLogs.length} onChange={() => toggleSelectAll(userLogs, userLogsSelected, setUserLogsSelected)} />
                            </th>
                          )}
                          <th>Tanggal</th>
                          <th>Target User</th>
                          <th>Kolom Diubah</th>
                          <th>Nilai Lama</th>
                          <th>Nilai Baru</th>
                          <th>Pelaku</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userLogs.map((h, i) => (
                          <tr key={h.id} className={userLogsSelected.includes(h.id) ? 'selected-row' : ''}>
                            {userLogsDeleteMode && (
                              <td>
                                <input type="checkbox" checked={userLogsSelected.includes(h.id)} onChange={() => toggleSelect(h.id, userLogsSelected, setUserLogsSelected)} />
                              </td>
                            )}
                            <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{formatDate(h.changed_at)}</td>
                            <td><strong>{h.target_name || 'User Terhapus'}</strong></td>
                            <td><span className="badge" style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7' }}>{h.field_changed}</span></td>
                            <td style={{ color: '#f87171', fontSize: '0.85rem' }}>{h.old_value || '-'}</td>
                            <td style={{ color: '#4ade80', fontSize: '0.85rem' }}>{h.new_value || '-'}</td>
                            <td>{h.actor_name || 'Sistem'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {userLogsTotal > 0 && <PaginationNav page={userLogsPage} setPage={setUserLogsPage} total={userLogsTotal} />}
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      )}
    </Layout>
  );
}
