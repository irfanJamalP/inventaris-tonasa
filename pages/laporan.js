import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import useAuth from '../lib/useAuth';
import { apiGet, apiPost } from '../lib/api';

export default function LaporanPage() {
  const { token, user, loading } = useAuth();
  const [history, setHistory] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterKategori, setFilterKategori] = useState('');
  const [fetching, setFetching] = useState(false);

  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  const isAdmin = user?.role === 'admin' || user?.role === 'admin_utama';

  useEffect(() => {
    if (!token) return;
    loadCategories();
  }, [token]);

  useEffect(() => { setPage(1); }, [search, dateFrom, dateTo, filterKategori]);

  useEffect(() => {
    if (!token) return;
    const handler = setTimeout(() => {
      loadHistory();
    }, 400);
    return () => clearTimeout(handler);
  }, [token, page, search, dateFrom, dateTo, filterKategori]);

  const loadCategories = async () => {
    try {
      const data = await apiGet('/categories', token);
      setCategories(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadHistory = async () => {
    setFetching(true);
    try {
      let url = '/reports/audit?page=' + page + '&limit=' + pageSize;
      if (search) url += '&search=' + encodeURIComponent(search);
      if (dateFrom) url += '&start_date=' + dateFrom;
      if (dateTo) url += '&end_date=' + dateTo;
      if (filterKategori) url += '&category=' + filterKategori;
      
      const res = await apiGet(url, token);
      setHistory(res?.data || []);
      setTotal(res?.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setFetching(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (!selectedIds || selectedIds.length === 0) return;
    if (!confirm('Hapus permanen ' + selectedIds.length + ' data ini? Tindakan ini tidak dapat dibatalkan.')) return;

    try {
      const res = await apiPost('/history/logs/assets/permanent', { ids: selectedIds }, token, 'DELETE');
      if (res.ok) {
        alert('Data berhasil dihapus permanen.');
        setDeleteMode(false);
        setSelectedIds([]);
        loadHistory();
      } else {
        const err = await res.json();
        alert(err.message || 'Gagal menghapus data.');
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan.');
    }
  };

  const toggleSelect = (id) => {
    if (selectedIds.includes(id)) setSelectedIds(selectedIds.filter(i => i !== id));
    else setSelectedIds([...selectedIds, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === history.length && history.length > 0) setSelectedIds([]);
    else setSelectedIds(history.map(d => d.id));
  };

  const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const cleanDescription = (desc, field, oldVal, newVal) => {
    if (newVal === 'Aset dummy baru didaftarkan lewat skrip migrasi' || desc?.includes('Aset dummy baru didaftarkan lewat skrip migrasi')) {
      return 'Aset baru didaftarkan';
    }
    return desc || 'Mengubah ' + field + ' dari ' + (oldVal || '') + ' menjadi ' + (newVal || '');
  };

  const handleExportExcel = async () => {
    if (!window.ExcelJS) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.3.0/dist/exceljs.min.js';
      document.head.appendChild(script);
      await new Promise(resolve => (script.onload = resolve));
    }
    const ExcelJS = window.ExcelJS;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Laporan Audit');

    const titleFont = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FF0F172A' } };
    const companyFont = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF475569' } };
    const printTimeFont = { name: 'Segoe UI', size: 9, italic: true, color: { argb: 'FF64748B' } };

    const rowTitle = sheet.addRow(['LAPORAN AUDIT RIWAYAT AKTIVITAS ASET']);
    rowTitle.font = titleFont; rowTitle.height = 30; rowTitle.alignment = { vertical: 'middle' };
    sheet.mergeCells(1, 1, 1, 8);

    const rowCompany = sheet.addRow(['PT SEMEN TONASA - SISTEM MANAJEMEN INVENTARIS']);
    rowCompany.font = companyFont; rowCompany.height = 20; rowCompany.alignment = { vertical: 'middle' };
    sheet.mergeCells(2, 1, 2, 8);

    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID');
    const timeStr = now.toLocaleTimeString('id-ID').replace(/:/g, '.');
    const rowPrintTime = sheet.addRow(['Dicetak Pada: ' + dateStr + ', ' + timeStr + ' WITA']);
    rowPrintTime.font = printTimeFont; rowPrintTime.height = 18; rowPrintTime.alignment = { vertical: 'middle' };
    sheet.mergeCells(3, 1, 3, 8);

    sheet.addRow([]);

    const headers = ['Waktu', 'Nama Aset', 'No. Aset', 'Kategori', 'Field Perubahan', 'Nilai Lama', 'Nilai Baru', 'Aktor Pelaksana'];
    const rowHeaders = sheet.addRow(headers);
    rowHeaders.height = 28;
    rowHeaders.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
      cell.font = { name: 'Segoe UI', color: { argb: 'FFFFFFFF' }, bold: true, size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF94A3B8' } },
        left: { style: 'thin', color: { argb: 'FF94A3B8' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        right: { style: 'thin', color: { argb: 'FF94A3B8' } },
      };
    });

    history.forEach((h, i) => {
      let valBaru = h.new_value || '-';
      if (h.field_changed === 'asset_created' || h.new_value?.includes('Aset dummy baru didaftarkan lewat skrip migrasi') || h.old_value?.includes('Aset dummy baru didaftarkan lewat skrip migrasi')) {
        valBaru = 'Aset baru didaftarkan';
      }
      const rowValues = [
        formatDate(h.changed_at),
        h.asset_name || 'Aset Terhapus',
        h.asset_number || '-',
        h.category_name || '-',
        h.field_changed || '-',
        h.old_value || '-',
        valBaru,
        h.actor_name || 'Sistem',
      ];
      const row = sheet.addRow(rowValues);
      row.height = 22;

      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF334155' } };
        if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F7FF' } };
        else cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      });
    });

    const buf = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Laporan_Audit_Aset_Tonasa.xlsx';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    if (!window.jspdf) {
      const script1 = document.createElement('script');
      script1.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      document.head.appendChild(script1);
      await new Promise(resolve => (script1.onload = resolve));
    }
    if (!window.jspdf.jsPDF.API.autoTable) {
      const script2 = document.createElement('script');
      script2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js';
      document.head.appendChild(script2);
      await new Promise(resolve => (script2.onload = resolve));
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text("LAPORAN AUDIT RIWAYAT AKTIVITAS ASET", 14, 20);

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text("PT SEMEN TONASA - SISTEM MANAJEMEN INVENTARIS", 14, 26);

    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID');
    const timeStr = now.toLocaleTimeString('id-ID').replace(/:/g, '.');
    doc.setFont("Helvetica", "oblique");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Dicetak Pada: ' + dateStr + ', ' + timeStr + ' WITA', 14, 32);

    doc.autoTable({
      head: [['Waktu', 'Nama Aset', 'No. Aset', 'Kategori', 'Kolom Diubah', 'Nilai Lama', 'Nilai Baru', 'Aktor Pelaksana']],
      body: history.map(h => {
        let valBaru = h.new_value || '-';
        if (h.field_changed === 'asset_created' || h.new_value?.includes('Aset dummy baru didaftarkan lewat skrip migrasi') || h.old_value?.includes('Aset dummy baru didaftarkan lewat skrip migrasi')) {
          valBaru = 'Aset baru didaftarkan';
        }
        return [
          formatDate(h.changed_at),
          h.asset_name || 'Aset Terhapus',
          h.asset_number || '-',
          h.category_name || '-',
          h.field_changed || '-',
          h.old_value || '-',
          valBaru,
          h.actor_name || 'Sistem'
        ];
      }),
      startY: 38,
      theme: 'grid',
      headStyles: { fillColor: [30, 64, 175] },
      styles: { fontSize: 7, font: "Helvetica" }
    });

    doc.save("Laporan_Audit_Aset_Tonasa.pdf");
  };

  const PaginationNav = () => {
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
    <Layout user={user} title="Laporan Audit" subtitle="Riwayat seluruh aktivitas dan perubahan sistem">
      <div className="table-container">
        <div className="table-header" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="table-filters" style={{ flexWrap: 'wrap', gap: '0.5rem', display: 'flex', alignItems: 'center' }}>
            <input className="search-input" placeholder="Cari aktivitas, user..." value={search} onChange={e => setSearch(e.target.value)} />
            <select className="filter-select" value={filterKategori} onChange={e => setFilterKategori(e.target.value)}>
              <option value="">Semua Kategori</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="date" className="search-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ minWidth: 'auto' }} />
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>s/d</span>
            <input type="date" className="search-input" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ minWidth: 'auto' }} />
            
            {isAdmin && (
              <>
                <button className="btn btn-sm" onClick={() => setDeleteMode(!deleteMode)} style={{ marginLeft: 'auto' }}>
                  {deleteMode ? 'Batal' : 'Pilih untuk Dihapus'}
                </button>
                {deleteMode && selectedIds.length > 0 && (
                  <button className="btn btn-danger btn-sm" onClick={handlePermanentDelete}>
                    Hapus Terpilih ({selectedIds.length})
                  </button>
                )}
              </>
            )}
          </div>
          {isAdmin && (
            <div className="table-actions" style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-secondary btn-sm" onClick={handleExportExcel} title="Export Excel">
                <i className="fas fa-file-excel"></i> Excel
              </button>
              <button className="btn btn-secondary btn-sm" onClick={handleExportPDF} title="Export PDF">
                <i className="fas fa-file-pdf"></i> PDF
              </button>
            </div>
          )}
        </div>

        {fetching && history.length === 0 ? (
          <div className="loading-state" style={{ padding: '3rem 0' }}><div className="loading-spinner"></div> Memuat data...</div>
        ) : history.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem' }}><i className="fas fa-scroll"></i><p>Tidak ada catatan audit</p></div>
        ) : (
                  <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 240px)' }}>
                    <table style={{ position: 'relative' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-secondary)', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                <tr>
                  {deleteMode && (
                    <th style={{ width: 40 }}>
                      <input type="checkbox" checked={selectedIds.length === history.length && history.length > 0} onChange={toggleSelectAll} />
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
                {history.map((h, i) => (
                  <tr key={h.id} className={selectedIds.includes(h.id) ? 'selected-row' : ''}>
                    {deleteMode && (
                      <td>
                        <input type="checkbox" checked={selectedIds.includes(h.id)} onChange={() => toggleSelect(h.id)} />
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
            {total > 0 && <PaginationNav />}
          </div>
        )}
      </div>
    </Layout>
  );
}

