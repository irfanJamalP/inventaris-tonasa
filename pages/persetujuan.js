import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import useAuth from '../lib/useAuth';
import { apiGet, apiPost } from '../lib/api';

export default function PersetujuanPage() {
  const { token, user, loading } = useAuth('admin');
  const [requests, setRequests] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkMode, setBulkMode] = useState(false);

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(requests.filter(a => a.status_approval === 'Pending').map(a => a.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Apakah Anda yakin ingin menyetujui ${selectedIds.length} pengajuan aset ini?`)) return;
    try {
      setFetching(true);
      const res = await apiPost('/approvals/bulk-approve', { ids: selectedIds }, token);
      setSelectedIds([]);
      setBulkMode(false);
      loadRequests();
    } catch (e) {
      alert('Gagal menyetujui secara massal: ' + e.message);
      setFetching(false);
    }
  };

  const handleBulkReject = async () => {
    if (selectedIds.length === 0) return;
    const reason = prompt(`Masukkan alasan penolakan untuk ${selectedIds.length} aset terpilih:`);
    if (reason === null) return;
    if (!reason.trim()) {
      alert('Alasan penolakan wajib diisi!');
      return;
    }
    try {
      setFetching(true);
      const res = await apiPost('/approvals/bulk-reject', { ids: selectedIds, rejection_reason: reason.trim() }, token);
      setSelectedIds([]);
      setBulkMode(false);
      loadRequests();
    } catch (e) {
      alert('Gagal menolak secara massal: ' + e.message);
      setFetching(false);
    }
  };

  // Detail Modal states
  const [detailModal, setDetailModal] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [selectedAssetHistory, setSelectedAssetHistory] = useState([]);

  const openDetail = async (asset) => {
    try {
      const data = await apiGet(`/assets/${asset.id}`, token);
      if (data && data.asset) {
        setSelectedAsset(data.asset);
        setSelectedAssetHistory(data.history || []);
        setDetailModal(true);
      }
    } catch (err) {
      console.error('Gagal memuat detail aset:', err);
      alert('Gagal memuat detail aset.');
    }
  };

  useEffect(() => {
    if (!token) return;
    loadRequests();
    
    const handleAssetChanged = () => {
      console.log("SSE: Refreshing persetujuan.js");
      loadRequests();
    };
    window.addEventListener('ASSET_CHANGED', handleAssetChanged);
    return () => window.removeEventListener('ASSET_CHANGED', handleAssetChanged);
  }, [token]);

  const loadRequests = async () => {
    setFetching(true);
    try {
      // The backend returns pending approvals from /approvals
      const data = await apiGet('/approvals', token);
      setRequests(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setFetching(false);
    }
  };

  const handleApproval = async (id, action) => {
    try {
      let body = {};
      if (action === 'reject') {
        const reason = prompt('Masukkan alasan penolakan aset:');
        if (reason === null) return; // User cancelled
        if (!reason.trim()) {
          alert('Alasan penolakan wajib diisi!');
          return;
        }
        body = { rejection_reason: reason.trim() };
      }
      
      const res = await apiPost(`/approvals/${id}/${action}`, body, token);
      if (res.ok) {
        alert(`Aset berhasil ${action === 'approve' ? 'disetujui' : 'ditolak'}.`);
        loadRequests();
      } else {
        alert('Gagal memproses persetujuan.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Filter requests based on status_approval and search
  const filtered = requests.filter(r => {
    if (filter !== 'all' && r.status_approval?.toLowerCase() !== filter.toLowerCase()) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        r.name?.toLowerCase().includes(s) ||
        r.asset_number?.toLowerCase().includes(s) ||
        r.equipment_number?.toLowerCase().includes(s) ||
        r.location?.toLowerCase().includes(s) ||
        r.category_name?.toLowerCase().includes(s) ||
        r.created_by_name?.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0f172a' }}><div className="loading-spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div></div>;

  const pendingCount = requests.filter(r => r.status_approval?.toLowerCase() === 'pending').length;

  return (
    <Layout user={user} title="Persetujuan" subtitle="Kelola permintaan registrasi aset dari operator" pendingCount={pendingCount}>
      <div className="table-container">
        <div className="table-header">
          <div className="table-filters" style={{ flexWrap: 'wrap', gap: '0.5rem', display: 'flex', alignItems: 'center' }}>
            <input
              className="search-input"
              placeholder="Cari aset, kode, pengaju..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select className="filter-select" value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="pending">Menunggu ({pendingCount})</option>
              <option value="rejected">Ditolak</option>
              <option value="all">Semua</option>
            </select>
          </div>
          <div className="table-actions">
            {bulkMode ? (
              <>
                {selectedIds.length > 0 && (
                  <>
                    <button className="btn btn-primary btn-sm" onClick={handleBulkApprove} style={{ marginRight: '10px' }}>
                      <i className="fas fa-check-double"></i> Setujui Terpilih ({selectedIds.length})
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={handleBulkReject} style={{ marginRight: '10px' }}>
                      <i className="fas fa-times"></i> Tolak Terpilih ({selectedIds.length})
                    </button>
                  </>
                )}
                <button className="btn btn-secondary btn-sm" onClick={() => { setBulkMode(false); setSelectedIds([]); }}>
                  Batal
                </button>
              </>
            ) : (
              filter === 'pending' && filtered.length > 0 && (
                <button className="btn btn-secondary btn-sm" onClick={() => setBulkMode(true)} style={{ marginRight: '10px' }}>
                  <i className="fas fa-tasks"></i> Pilih Massal
                </button>
              )
            )}
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', display: 'flex', alignItems: 'center' }}>
              {filtered.length} permintaan
            </span>
          </div>
        </div>

        {fetching ? (
          <div className="loading-state"><div className="loading-spinner"></div> Memuat...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <i className="fas fa-circle-check"></i>
            <p>
              {filter === 'pending'
                ? 'Tidak ada pengajuan aset yang menunggu persetujuan'
                : filter === 'rejected'
                ? 'Tidak ada pengajuan aset yang ditolak'
                : 'Tidak ada data'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 240px)' }}>
            <table style={{ position: 'relative' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-secondary)', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                <tr>

                  <th>Aset Diajukan</th>
                  <th>Spesifikasi & Lokasi</th>
                  <th>Bukti Aset</th>
                  <th>Oleh</th>
                  <th>Tanggal</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>
                    {bulkMode && filter === 'pending' ? (
                      <input 
                        type="checkbox" 
                        onChange={toggleSelectAll} 
                        checked={filtered.filter(a => a.status_approval === 'Pending').length > 0 && selectedIds.length === filtered.filter(a => a.status_approval === 'Pending').length}
                        title="Pilih Semua"
                        style={{ transform: 'scale(1.2)', cursor: 'pointer' }}
                      />
                    ) : 'Aksi'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((req) => (
                  <tr key={req.id}>

                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center', marginBottom: '4px' }}>
                        <code style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', padding: '2px 6px', borderRadius: 4, fontSize: '0.8rem' }}>
                          {req.asset_number}
                        </code>
                        {req.equipment_number && (
                          <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', padding: '1px 6px', borderRadius: 4, color: 'var(--text-secondary)' }}>
                            Eq: {req.equipment_number}
                          </span>
                        )}
                      </div>
                      <strong 
                        style={{ fontSize: '0.95rem', color: '#60a5fa', cursor: 'pointer', textDecoration: 'underline' }} 
                        onClick={() => openDetail(req)}
                        title="Klik untuk melihat deskripsi lengkap"
                      >
                        {req.name}
                      </strong>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Kategori: {req.category_name || '-'}</p>
                      {req.change_reason && (
                        <div style={{ fontSize: '0.78rem', color: '#60a5fa', marginTop: '4px', background: 'rgba(59,130,246,0.1)', padding: '4px 8px', borderRadius: 4, display: 'inline-block' }}>
                          <i className="fas fa-edit" style={{ marginRight: 4 }}></i>
                          <strong>Alasan Perubahan:</strong> {req.change_reason}
                        </div>
                      )}
                    </td>
                    <td>
                      <p style={{ fontSize: '0.85rem' }}>{req.location || '-'}</p>
                      {req.specification && <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Spec: {req.specification}</p>}
                    </td>
                    <td>
                      {req.photo_proof ? (
                        <div style={{ padding: '4px 0' }}>
                          {req.photo_proof && (
                            <img src={req.photo_proof} style={{ maxHeight: '80px', maxWidth: '140px', borderRadius: 4, objectFit: 'contain', background: '#000', cursor: 'pointer' }} onClick={() => window.open(req.photo_proof, '_blank')} title="Klik untuk lihat ukuran penuh" />
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Tidak ada bukti</span>
                      )}
                    </td>
                    <td>{req.created_by_name || '-'}</td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{formatDate(req.created_at)}</td>
                    <td>
                      <span className={`badge ${req.status_approval === 'Pending' ? 'warning' : req.status_approval === 'Rejected' ? 'rusak' : 'optimal'}`}
                            style={{
                              background: req.status_approval === 'Pending' ? 'rgba(245,158,11,0.15)' : req.status_approval === 'Rejected' ? 'rgba(239,68,68,0.15)' : '',
                              color: req.status_approval === 'Pending' ? '#f59e0b' : req.status_approval === 'Rejected' ? '#ef4444' : '',
                              display: 'inline-block'
                            }}>
                        {req.status_approval === 'Pending' ? 'Menunggu' : req.status_approval === 'Rejected' ? 'Ditolak' : 'Disetujui'}
                      </span>
                      {req.status_approval === 'Pending' && req.change_reason && (
                        <div style={{ fontSize: '0.72rem', color: '#f59e0b', marginTop: '0.25rem', whiteSpace: 'normal', maxWidth: '180px' }}>
                          <i className="fas fa-circle-info" style={{ marginRight: 4 }}></i>Mutasi: {req.change_reason}
                        </div>
                      )}
                      {req.status_approval === 'Rejected' && req.rejection_reason && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '0.25rem', whiteSpace: 'normal', maxWidth: '180px' }}>
                          <i className="fas fa-circle-info" style={{ marginRight: 4 }}></i>Alasan: {req.rejection_reason}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {req.status_approval?.toLowerCase() === 'pending' && (
                        bulkMode ? (
                          <input 
                            type="checkbox" 
                            checked={selectedIds.includes(req.id)}
                            onChange={() => toggleSelect(req.id)}
                            style={{ transform: 'scale(1.3)', cursor: 'pointer' }}
                          />
                        ) : (
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                            <button className="btn btn-success btn-sm" onClick={() => handleApproval(req.id, 'approve')}>
                              <i className="fas fa-check"></i> Setuju
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleApproval(req.id, 'reject')}>
                              <i className="fas fa-times"></i> Tolak
                            </button>
                          </div>
                        )
                      )}
                      {req.status_approval?.toLowerCase() !== 'pending' && (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Sudah diproses</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Detail Aset */}
      {detailModal && selectedAsset && (
        <div className="modal-overlay active" onClick={e => e.target.classList.contains('modal-overlay') && setDetailModal(false)}>
          <div className="modal-content" style={{ maxWidth: '650px' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fas fa-circle-info" style={{ color: '#3b82f6' }}></i>
                Detail Aset: {selectedAsset.asset_number}
              </h3>
              <button className="close-btn" type="button" onClick={() => setDetailModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', padding: '1.25rem' }}>
              {selectedAsset.status_approval === 'Rejected' && selectedAsset.rejection_reason && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  padding: '0.75rem 1rem',
                  borderRadius: '6px',
                  marginBottom: '1.25rem',
                  fontSize: '0.85rem'
                }}>
                  <strong><i className="fas fa-circle-exclamation" style={{ marginRight: 6 }}></i> Aset Ditolak oleh Admin</strong>
                  <p style={{ marginTop: '0.25rem', color: 'var(--text-primary)' }}>Alasan: {selectedAsset.rejection_reason}</p>
                </div>
              )}

              {selectedAsset.change_reason && (
                <div style={{
                  background: 'rgba(59, 130, 246, 0.12)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  color: '#60a5fa',
                  padding: '0.75rem 1rem',
                  borderRadius: '6px',
                  marginBottom: '1.25rem',
                  fontSize: '0.85rem'
                }}>
                  <strong><i className="fas fa-edit" style={{ marginRight: 6 }}></i> Alasan Perubahan Data (Edit)</strong>
                  <p style={{ marginTop: '0.25rem', color: 'var(--text-primary)' }}>{selectedAsset.change_reason}</p>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Media Proof */}
                {selectedAsset.photo_proof && (
                  <div style={{ background: '#1e293b', borderRadius: 8, padding: 8, textAlign: 'center' }}>
                    <img src={selectedAsset.photo_proof} style={{ width: '100%', maxHeight: 280, borderRadius: 6, objectFit: 'contain' }} alt="Bukti Aset" />
                  </div>
                )}

                {/* Details Grid */}
                <div className="form-grid-2" style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Nama Aset</label>
                    <p style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{selectedAsset.name}</p>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Grup Aset</label>
                    <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{selectedAsset.category_name || '-'}</p>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>No. Equipment</label>
                    <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{selectedAsset.equipment_number || '-'}</p>
                  </div>
                  {String(selectedAsset.category_name).toLowerCase() === 'tanah' && (
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Luas Tanah</label>
                      <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{selectedAsset.land_area || '-'}</p>
                    </div>
                  )}
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Lokasi Grup</label>
                    <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{selectedAsset.location_grup || '-'}</p>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Lokasi Detail</label>
                    <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{selectedAsset.location || '-'}</p>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Kondisi Fungsi</label>
                    <p style={{ marginTop: 2 }}><span className="badge optimal">{selectedAsset.function_status}</span></p>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Status Approval</label>
                    <p style={{ marginTop: 2 }}>
                      <span className={`badge ${selectedAsset.status_approval === 'Approved' ? 'optimal' : selectedAsset.status_approval === 'Pending' ? 'warning' : 'rusak'}`}>
                        {selectedAsset.status_approval === 'Approved' ? 'Disetujui' : selectedAsset.status_approval === 'Pending' ? 'Pending' : 'Ditolak'}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Spesifikasi */}
                <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Spesifikasi</label>
                  <p style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{selectedAsset.specification || 'Tidak ada spesifikasi tercatat.'}</p>
                </div>

                {/* History Timeline */}
                {selectedAssetHistory && selectedAssetHistory.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: '0.9rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <i className="fas fa-clock-rotate-left" style={{ color: '#a855f7' }}></i>
                      Riwayat Perubahan Aset
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
                      {selectedAssetHistory.map((h, idx) => (
                        <div key={idx} style={{ padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: 6, fontSize: '0.8rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: 2 }}>
                            <span>Oleh: <strong>{h.changed_by_name || 'Sistem'}</strong></span>
                            <span>{new Date(h.changed_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <p style={{ margin: 0, color: 'var(--text-primary)' }}>
                            {h.field_changed === 'asset_created' ? 'Aset baru didaftarkan' : `Mengubah ${h.field_changed} menjadi "${h.new_value}"`}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setDetailModal(false)}>Tutup</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
