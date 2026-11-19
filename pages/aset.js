import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import useAuth from '../lib/useAuth';
import { apiGet, apiPost, apiDelete } from '../lib/api';

const BLANK_FORM = {
  asset_number: '',
  name: '',
  equipment_number: '',
  category_id: '',
  land_area: '',
  location: '',
  location_grup: '',
  function_status: 'Baik',
  performance_status: 'Optimal',
  specification: '',
  reason: '',
  photo_proof: null,
};

export default function AsetPage() {
  const router = useRouter();
  const { token, user, loading } = useAuth();
  const [assets, setAssets] = useState([]);
  const [totalAssets, setTotalAssets] = useState(0);
  const [categories, setCategories] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [modal, setModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterKondisi, setFilterKondisi] = useState('');
  const [filterKategori, setFilterKategori] = useState('');
  const [filterApproval, setFilterApproval] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Detail Modal states
  const [detailModal, setDetailModal] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [selectedAssetHistory, setSelectedAssetHistory] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleteMode, setDeleteMode] = useState(false);

  useEffect(() => {
    if (router.query.status) {
      setFilterApproval(router.query.status);
    }
  }, [router.query]);

  // Photo & Camera states
  const [cameraActive, setCameraActive] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileExcelRef = useRef(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'admin_utama';
  const isOperator = user?.role === 'user' || user?.role === 'operator' || user?.role === 'karyawan' || isAdmin;

  const paginatedAssets = assets;
  const totalPages = Math.ceil(totalAssets / pageSize) || 1;

  useEffect(() => {
    if (!token) return;
    loadCategories();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const handler = setTimeout(() => {
      loadAssets();
    }, 400);
    return () => clearTimeout(handler);
  }, [token, search, filterKondisi, filterKategori, filterApproval, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterKondisi, filterKategori, filterApproval, pageSize]);

  useEffect(() => {
    const handleAssetChanged = () => {
      console.log("SSE: Refreshing aset.js");
      loadAssets();
    };
    window.addEventListener('ASSET_CHANGED', handleAssetChanged);
    return () => window.removeEventListener('ASSET_CHANGED', handleAssetChanged);
  }, [token, search, filterKondisi, filterKategori, filterApproval, currentPage, pageSize]);

  const loadAssets = async () => {
    setFetching(true);
    try {
      const q = new URLSearchParams({
        page: currentPage,
        limit: pageSize,
        search,
        function_status: filterKondisi,
        category: filterKategori,
        status_approval: filterApproval
      }).toString();
      const res = await apiGet(`/assets?${q}`, token);
      setAssets(res?.data ? res.data : (Array.isArray(res) ? res : []));
      setTotalAssets(res?.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setFetching(false);
      setSelectedIds([]);
      setDeleteMode(false);
    }
  };

  const loadCategories = async () => {
    try {
      const data = await apiGet('/categories', token);
      setCategories(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    }
  };

  const openCreate = () => {
    setEditMode(false);
    setEditId(null);
    setForm(BLANK_FORM);
    setPhotoPreview(null);
    setCameraActive(false);
    setModal(true);
  };

  const openEdit = async (asset) => {
    setEditMode(true);
    setEditId(asset.id);
    setForm({
      asset_number: asset.asset_number || '',
      name: asset.name || '',
      equipment_number: asset.equipment_number || '',
      category_id: asset.category_id || '',
      land_area: asset.land_area || '',
      location: asset.location || '',
      location_grup: asset.location_grup || '',
      function_status: (asset.function_status === 'Mutasi' ? 'Baik' : asset.function_status) || 'Baik',
      performance_status: asset.performance_status || 'Optimal',
      specification: asset.specification || '',
      reason: '',
      photo_proof: asset.photo_proof || null,
    });
    setPhotoPreview(asset.photo_proof || null);
    setModal(true);
  };

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

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Berkas harus berupa foto/gambar!');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setForm(f => ({ ...f, photo_proof: reader.result }));
      setPhotoPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!window.ExcelJS) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.3.0/dist/exceljs.min.js';
      document.head.appendChild(script);
      await new Promise(resolve => (script.onload = resolve));
    }

    const ExcelJS = window.ExcelJS;
    const reader = new FileReader();
    
    reader.onload = async (evt) => {
      try {
        const buffer = evt.target.result;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        
        const worksheet = workbook.worksheets[0];
        const assetsToImport = [];
        
        let headerRow = null;
        let colIndices = {
          name: -1,
          category_name: -1,
          location_grup: -1,
          location: -1,
          specification: -1,
          function_status: -1,
          performance_status: -1
        };

        worksheet.eachRow((row, rowNumber) => {
          if (headerRow) return;
          const values = row.values;
          const hasAssetDesc = values.some(v => v && String(v).toLowerCase().includes('asset description') || v && String(v).toLowerCase().includes('nama aset'));
          if (hasAssetDesc) {
            headerRow = rowNumber;
            row.eachCell((cell, colIndex) => {
              const text = String(cell.value || '').toLowerCase();
              if (text.includes('asset description') || text.includes('nama aset') || text.includes('nama barang')) colIndices.name = colIndex;
              if (text.includes('grup of aset') || text.includes('kategori') || text.includes('grup aset')) colIndices.category_name = colIndex;
              if (text.includes('location grup')) colIndices.location_grup = colIndex;
              if (text.includes('lokasi (detail)') || text.includes('lokasi detail') || text.includes('lokasi')) colIndices.location = colIndex;
              if (text.includes('spesifikasi') || text.includes('spec')) colIndices.specification = colIndex;
              if (text.includes('kondisi fungsi') || text.includes('kondisi')) colIndices.function_status = colIndex;
              if (text.includes('kinerja') || text.includes('status kinerja') || text.includes('status')) colIndices.performance_status = colIndex;
            });
          }
        });

        if (!headerRow || colIndices.name === -1) {
          alert('Format Excel tidak dikenali. Pastikan terdapat kolom "Asset description" atau "Nama Aset".');
          e.target.value = '';
          return;
        }

        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber <= headerRow) return;

          const name = colIndices.name !== -1 ? getCellValue(row.getCell(colIndices.name)) : '';
          if (!name) return;

          const category_name = colIndices.category_name !== -1 ? getCellValue(row.getCell(colIndices.category_name)) : 'Umum';
          const location_grup = colIndices.location_grup !== -1 ? getCellValue(row.getCell(colIndices.location_grup)) : '';
          const location = colIndices.location !== -1 ? getCellValue(row.getCell(colIndices.location)) : '';
          const specification = colIndices.specification !== -1 ? getCellValue(row.getCell(colIndices.specification)) : '';
          const function_status = colIndices.function_status !== -1 ? getCellValue(row.getCell(colIndices.function_status)) : 'Baik';
          const performance_status = colIndices.performance_status !== -1 ? getCellValue(row.getCell(colIndices.performance_status)) : 'Optimal';

          assetsToImport.push({
            name,
            category_name,
            location_grup,
            location,
            specification,
            function_status,
            performance_status
          });
        });

        if (assetsToImport.length === 0) {
          alert('Tidak ada data aset untuk diimpor.');
          e.target.value = '';
          return;
        }

        if (!confirm(`Apakah Anda yakin ingin mengimpor ${assetsToImport.length} aset dari Excel?`)) {
          e.target.value = '';
          return;
        }

        setSaving(true);
        const res = await apiPost('/assets/bulk', { assets: assetsToImport }, token);
        const data = await res.json();
        
        if (res.ok) {
          alert(data.message || 'Impor data berhasil.');
          loadAssets();
        } else {
          alert(data.message || 'Gagal mengimpor data.');
        }

      } catch (err) {
        console.error(err);
        alert('Gagal mengurai file Excel: ' + err.message);
      } finally {
        setSaving(false);
        e.target.value = '';
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const getCellValue = (cell) => {
    if (!cell || cell.value === null || cell.value === undefined) return '';
    if (typeof cell.value === 'object') {
      if (cell.value.result !== undefined) return String(cell.value.result);
      if (cell.value.richText) return cell.value.richText.map(t => t.text).join('');
      return String(cell.value);
    }
    return String(cell.value);
  };

  const startCamera = async () => {
    setCameraActive(true);
    setPhotoPreview(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'environment' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      console.error(err);
      alert('Gagal mengakses kamera: ' + err.message);
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg');
      
      setForm(f => ({ ...f, photo_proof: dataUrl }));
      setPhotoPreview(dataUrl);
      
      stopCamera();
    }
  };

  const closeModal = () => {
    stopCamera();
    setModal(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();

    if (!editMode && !form.photo_proof) {
      alert('Anda wajib menyertakan bukti foto aset!');
      return;
    }

    setSaving(true);
    try {
      let res;
      if (editMode) {
        res = await apiPost(`/assets/${editId}`, form, token, 'PUT');
      } else {
        res = await apiPost('/assets', form, token);
      }
      const data = await res.json();
      if (res.ok) {
        setModal(false);
        alert(data.message || 'Data berhasil disimpan.');
        loadAssets();
      } else {
        alert(data.message || 'Terjadi kesalahan');
      }
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan data.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Anda yakin ingin mengarsipkan/hapus aset "${name}"? (Soft Delete)`)) return;
    try {
      const res = await apiDelete(`/assets/${id}`, token);
      const data = await res.json();
      if (res.ok) {
        alert(data.message || 'Aset berhasil diarsipkan.');
        loadAssets();
      } else {
        alert(data.message || 'Gagal menghapus aset.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Anda yakin ingin menghapus ${selectedIds.length} aset terpilih? (Soft Delete)`)) return;
    try {
      const res = await apiPost('/assets/bulk-delete', { ids: selectedIds }, token);
      const data = await res.json();
      if (res.ok) {
        alert(data.message || 'Aset berhasil dihapus secara massal.');
        setSelectedIds([]);
        setDeleteMode(false);
        loadAssets();
      } else {
        alert(data.message || 'Gagal menghapus aset.');
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan saat menghapus massal.');
    }
  };

  const handleExport = async () => {
    let filtered = [];
    try {
      const q = new URLSearchParams({ limit: 999999, search, function_status: filterKondisi, category: filterKategori, status_approval: filterApproval }).toString();
      const res = await apiGet(`/assets?${q}`, token);
      filtered = res?.data ? res.data : (Array.isArray(res) ? res : []);
    } catch (e) {
      alert('Gagal mengambil data untuk ekspor.');
      return;
    }

    if (!window.ExcelJS) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.3.0/dist/exceljs.min.js';
      document.head.appendChild(script);
      await new Promise(resolve => (script.onload = resolve));
    }

    const ExcelJS = window.ExcelJS;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data Aset Tonasa');

    // Title Font & Styling
    const titleFont = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FF0F172A' } };
    const companyFont = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF475569' } };
    const printTimeFont = { name: 'Segoe UI', size: 9, italic: true, color: { argb: 'FF64748B' } };

    const rowTitle = sheet.addRow(['LAPORAN INVENTARIS DATA ASET']);
    rowTitle.font = titleFont;
    rowTitle.height = 30;
    rowTitle.alignment = { vertical: 'middle' };
    sheet.mergeCells(1, 1, 1, 10);
 
    const rowCompany = sheet.addRow(['PT SEMEN TONASA - SISTEM MANAJEMEN INVENTARIS']);
    rowCompany.font = companyFont;
    rowCompany.height = 20;
    rowCompany.alignment = { vertical: 'middle' };
    sheet.mergeCells(2, 1, 2, 10);
 
    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID');
    const timeStr = now.toLocaleTimeString('id-ID').replace(/:/g, '.');
    const rowPrintTime = sheet.addRow([`Dicetak Pada: ${dateStr}, ${timeStr} WITA`]);
    rowPrintTime.font = printTimeFont;
    rowPrintTime.height = 18;
    rowPrintTime.alignment = { vertical: 'middle' };
    sheet.mergeCells(3, 1, 3, 10);
 
    sheet.addRow([]); // spacing row
 
    const headers = ['No', 'No. Aset', 'No. Equipment', 'Asset description', 'Grup of aset', 'Location Grup', 'Lokasi (Detail)', 'Spesifikasi', 'Kondisi Fungsi', 'Kinerja'];
    const rowHeaders = sheet.addRow(headers);
    rowHeaders.height = 28;
    rowHeaders.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }; // Royal Blue #1e40af
      cell.font = { name: 'Segoe UI', color: { argb: 'FFFFFFFF' }, bold: true, size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF94A3B8' } },
        left: { style: 'thin', color: { argb: 'FF94A3B8' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        right: { style: 'thin', color: { argb: 'FF94A3B8' } },
      };
    });
 
    filtered.forEach((a, i) => {
      const rowValues = [
        i + 1,
        a.asset_number,
        a.equipment_number || '-',
        a.name,
        a.category_name || '-',
        a.location_grup || '-',
        a.location || '-',
        a.specification || '-',
        a.function_status,
        a.performance_status
      ];
      const row = sheet.addRow(rowValues);
      row.height = 22;
 
      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF334155' } };
        if (i % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F7FF' } }; // Soft Blue Highlight #f0f7ff
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
        }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
        if (colNumber === 1 || colNumber === 2 || colNumber === 3) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      });
    });
 
    // Auto-fit Columns Width
    headers.forEach((h, colIndex) => {
      let maxLen = h.length;
      filtered.forEach((a, i) => {
        const val = [
          i + 1,
          a.asset_number,
          a.equipment_number || '-',
          a.name,
          a.category_name || '-',
          a.location_grup || '-',
          a.location || '-',
          a.specification || '-',
          a.function_status,
          a.performance_status
        ][colIndex];
        const len = val ? String(val).length : 0;
        if (len > maxLen) maxLen = len;
      });
      sheet.getColumn(colIndex + 1).width = Math.min(Math.max(maxLen + 4, 10), 50);
    });

    const buf = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Inventaris_Aset_Tonasa_${new Date().toLocaleDateString('id-ID').replace(/\//g, '-')}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    let filtered = [];
    try {
      const q = new URLSearchParams({ limit: 999999, search, function_status: filterKondisi, category: filterKategori, status_approval: filterApproval }).toString();
      const res = await apiGet(`/assets?${q}`, token);
      filtered = res?.data ? res.data : (Array.isArray(res) ? res : []);
    } catch (e) {
      alert('Gagal mengambil data untuk ekspor.');
      return;
    }

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
    const doc = new jsPDF('landscape'); // use landscape for more columns

    // Add Title Banner (Matching original styling)
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42); // #0F172A
    doc.text("LAPORAN INVENTARIS DATA ASET", 14, 20);

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105); // #475569
    doc.text("PT SEMEN TONASA - SISTEM MANAJEMEN INVENTARIS", 14, 26);

    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID');
    const timeStr = now.toLocaleTimeString('id-ID').replace(/:/g, '.');
    doc.setFont("Helvetica", "oblique");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139); // #64748B
    doc.text(`Dicetak Pada: ${dateStr}, ${timeStr} WITA`, 14, 32);

    doc.autoTable({
      head: [['No. Aset', 'No. Equip', 'Nama Aset', 'Grup Aset', 'Lokasi Grup', 'Lokasi Detail']],
      body: filtered.map(a => [
        a.asset_number,
        a.equipment_number || '-',
        a.name.length > 30 ? a.name.slice(0,30) + '...' : a.name,
        a.category_name || '-',
        a.location_grup || '-',
        a.location || '-'
      ]),
      startY: 38,
      theme: 'grid',
      headStyles: { fillColor: [30, 64, 175] }, // Royal Blue #1e40af
      styles: { fontSize: 7, font: "Helvetica" }
    });

    doc.save("Data_Aset_Semen_Tonasa.pdf");
  };

  const kondisiClass = {
    'Baik': 'baik',
    'Rusak': 'rusak',
    'Tidak Ada Fisik': 'rusak',
  };

  const statusClass = {
    'Optimal': 'optimal',
    'Tidak Optimal': 'tidak-optimal',
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0f172a' }}>
      <div className="loading-spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div>
    </div>
  );

  return (
    <Layout user={user} title="Manajemen Aset" subtitle={`Total ${assets.length} aset terdaftar`}>
      <div className="table-container">
        <div className="table-header">
          <div className="table-filters">
            <input
              className="search-input"
              placeholder="Cari nama, kode, lokasi..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              id="search-aset"
            />
            <select className="filter-select" value={filterKondisi} onChange={e => setFilterKondisi(e.target.value)}>
              <option value="">Semua Kondisi</option>
              <option value="Baik">Baik</option>
              <option value="Rusak">Rusak</option>
              <option value="Tidak Ada Fisik">Tidak Ada Fisik</option>
            </select>
            <select className="filter-select" value={filterKategori} onChange={e => setFilterKategori(e.target.value)}>
              <option value="">Semua Grup Aset</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="filter-select" value={filterApproval} onChange={e => setFilterApproval(e.target.value)}>
              <option value="">Semua Status Approval</option>
              <option value="Approved">Disetujui</option>
              <option value="Pending">Pending</option>
              <option value="Rejected">Ditolak</option>
            </select>
          </div>
          <div className="table-actions" style={{ display: 'flex', gap: '0.5rem' }}>
            {isOperator && (
              <>
                <button id="btn-tambah-aset" className="btn btn-primary btn-sm" onClick={openCreate}>
                  <i className="fas fa-plus"></i> Tambah Aset
                </button>
                <button 
                  id="btn-import-excel" 
                  className="btn btn-secondary btn-sm" 
                  style={{ background: '#10b981', color: 'white', border: 'none' }} 
                  onClick={() => fileExcelRef.current?.click()}
                >
                  <i className="fas fa-file-import"></i> Impor Excel
                </button>
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  ref={fileExcelRef}
                  onChange={handleExcelUpload}
                  style={{ display: 'none' }}
                />
              </>
            )}
            {isAdmin && (
              <>
                {selectedIds.length > 0 && (
                  <button className="btn btn-danger btn-sm" onClick={handleBulkDelete} title="Hapus Terpilih">
                    <i className="fas fa-trash"></i> Hapus Terpilih ({selectedIds.length})
                  </button>
                )}
                <button className="btn btn-secondary btn-sm" onClick={handleExport} title="Ekspor Excel">
                  <i className="fas fa-file-excel"></i> Excel
                </button>
                <button className="btn btn-secondary btn-sm" onClick={handleExportPDF} title="Ekspor PDF">
                  <i className="fas fa-file-pdf"></i> PDF
                </button>
              </>
            )}
          </div>
        </div>

        {fetching ? (
          <div className="loading-state"><div className="loading-spinner"></div> Memuat data aset...</div>
        ) : assets.length === 0 ? (
          <div className="empty-state"><i className="fas fa-boxes-stacked"></i><p>Tidak ada aset ditemukan</p></div>
        ) : (
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 240px)' }}>
            <table style={{ position: 'relative' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-secondary)', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                <tr>
                  <th>Aset Diajukan</th>
                  <th>Spesifikasi & Lokasi</th>
                  <th>Bukti Aset</th>
                  <th>Kondisi</th>
                  <th>Status</th>
                  {isOperator && (
                    <th style={{ minWidth: deleteMode ? '90px' : 'auto' }}>
                      {deleteMode && isAdmin ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input 
                            type="checkbox" 
                            checked={assets.length > 0 && selectedIds.length === assets.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedIds(assets.map(a => a.id));
                              } else {
                                setSelectedIds([]);
                              }
                            }}
                            title="Pilih Semua (Terfilter)"
                          />
                          <button 
                            type="button" 
                            className="btn btn-sm btn-secondary" 
                            style={{ padding: '1px 6px', fontSize: '0.75rem' }} 
                            onClick={() => { setDeleteMode(false); setSelectedIds([]); }}
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        'Aksi'
                      )}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {paginatedAssets.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center', marginBottom: '4px' }}>
                        <code style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem' }}>
                          {a.asset_number}
                        </code>
                        {a.equipment_number && (
                          <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', padding: '1px 6px', borderRadius: 4, color: 'var(--text-secondary)' }}>
                            Eq: {a.equipment_number}
                          </span>
                        )}
                      </div>
                      <strong 
                        style={{ fontSize: '0.92rem', color: '#60a5fa', cursor: 'pointer', textDecoration: 'underline' }} 
                        onClick={() => openDetail(a)}
                        title="Klik untuk melihat deskripsi lengkap"
                      >
                        {a.name}
                      </strong>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Grup: {a.category_name || '-'}</p>
                      {a.change_reason && (
                        <div style={{ fontSize: '0.78rem', color: '#60a5fa', marginTop: '4px', background: 'rgba(59,130,246,0.1)', padding: '4px 8px', borderRadius: 4, display: 'inline-block' }}>
                          <i className="fas fa-edit" style={{ marginRight: 4 }}></i>
                          <strong>Alasan Perubahan:</strong> {a.change_reason}
                        </div>
                      )}
                    </td>
                    <td>
                      <p style={{ fontSize: '0.82rem', fontWeight: 500 }}>{a.location || '-'}</p>
                      {a.location_grup && <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Grup: {a.location_grup}</p>}
                      {a.specification && <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px', whiteSpace: 'normal', maxWidth: '200px' }}>Spec: {a.specification.length > 60 ? a.specification.slice(0, 60) + '...' : a.specification}</p>}
                    </td>
                    <td>
                      {a.photo_proof ? (
                        <div style={{ padding: '2px 0' }}>
                          {a.photo_proof && (
                            <img src={a.photo_proof} style={{ maxHeight: '60px', maxWidth: '100px', borderRadius: 4, objectFit: 'contain', background: '#000', cursor: 'pointer' }} onClick={() => window.open(a.photo_proof, '_blank')} title="Klik untuk lihat ukuran penuh" />
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Tidak ada bukti</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${kondisiClass[a.function_status] || 'optimal'}`}>{a.function_status}</span>
                      {a.status_approval === 'Pending' && a.change_reason && (
                        <div style={{ fontSize: '0.72rem', color: '#f59e0b', marginTop: '0.25rem', whiteSpace: 'normal', maxWidth: '180px' }}>
                          <i className="fas fa-circle-info" style={{ marginRight: 4 }}></i>
                          {a.change_reason.toLowerCase().includes('mutasi') || a.change_reason.toLowerCase().includes('lokasi') ? (a.change_reason.toLowerCase().startsWith('mutasi') ? a.change_reason : `Mutasi: ${a.change_reason}`) : `Info: ${a.change_reason}`}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${a.status_approval === 'Approved' ? 'optimal' : a.status_approval === 'Pending' ? 'warning' : 'rusak'}`}
                            style={{
                              background: a.status_approval === 'Pending' ? 'rgba(245,158,11,0.15)' : a.status_approval === 'Rejected' ? 'rgba(239,68,68,0.15)' : '',
                              color: a.status_approval === 'Pending' ? '#f59e0b' : a.status_approval === 'Rejected' ? '#ef4444' : '',
                              display: 'inline-block'
                            }}>
                        {a.status_approval === 'Approved' ? 'Disetujui' : a.status_approval === 'Pending' ? 'Pending' : 'Ditolak'}
                      </span>
                      {a.status_approval === 'Rejected' && a.rejection_reason && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '0.25rem', whiteSpace: 'normal', maxWidth: '180px' }}>
                          <i className="fas fa-circle-info" style={{ marginRight: 4 }}></i>Alasan: {a.rejection_reason}
                        </div>
                      )}
                    </td>
                    {isOperator && (
                      <td>
                        {deleteMode && isAdmin ? (
                          <input 
                            type="checkbox" 
                            checked={selectedIds.includes(a.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedIds([...selectedIds, a.id]);
                              } else {
                                setSelectedIds(selectedIds.filter(id => id !== a.id));
                              }
                            }}
                            style={{ transform: 'scale(1.2)', marginLeft: '10px' }}
                          />
                        ) : (
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            {(isAdmin || user?.id === a.created_by) && (
                              <button className="btn btn-secondary btn-sm" onClick={() => openEdit(a)} title="Edit">
                                <i className="fas fa-pen"></i>
                              </button>
                            )}
                            {isAdmin && (
                              <button className="btn btn-danger btn-sm" onClick={() => {
                                setSelectedIds([a.id]);
                                setDeleteMode(true);
                              }} title="Pilih untuk Dihapus">
                                <i className="fas fa-trash"></i>
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {!fetching && assets.length > 0 && (
          <div className="pagination-container" style={{ marginTop: '1rem', padding: '1rem', display: 'flex', justifyContent: 'center' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
               <button 
                 disabled={currentPage === 1} 
                 onClick={() => setCurrentPage(p => p - 1)} 
                 className="btn btn-secondary btn-sm"
               >
                 <i className="fas fa-angle-left"></i> Sebelumnya
               </button>
               <span style={{ fontSize: '0.85rem' }}>
                 Halaman <strong>{currentPage}</strong> dari <strong>{totalPages}</strong> (Total {totalAssets.toLocaleString('id-ID')} aset)
               </span>
               <button 
                 disabled={currentPage >= totalPages} 
                 onClick={() => setCurrentPage(p => p + 1)} 
                 className="btn btn-secondary btn-sm"
               >
                 Selanjutnya <i className="fas fa-angle-right"></i>
               </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Tambah/Edit Aset */}
      <div className={`modal-overlay ${modal ? 'active' : ''}`} onClick={e => e.target.classList.contains('modal-overlay') && closeModal()}>
        <div className="modal-content" style={{ maxWidth: '700px' }}>
          <div className="modal-header">
            <h3 style={{ margin: 0 }}>
              <i className={`fas ${editMode ? 'fa-pen' : 'fa-plus'}`} style={{ marginRight: 8, color: '#3b82f6' }}></i>
              {editMode ? `Edit Aset: ${assets.find(a => a.id === editId)?.asset_number || ''}` : 'Tambah Aset Baru'}
            </h3>
            <button className="close-btn" type="button" onClick={closeModal}>×</button>
          </div>
          <form onSubmit={handleSave}>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {editMode && assets.find(a => a.id === editId)?.status_approval === 'Rejected' && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#f87171',
                  padding: '0.75rem 1rem',
                  borderRadius: '6px',
                  marginBottom: '1rem',
                  fontSize: '0.85rem'
                }}>
                  <strong><i className="fas fa-circle-exclamation" style={{ marginRight: 8 }}></i>Aset ini Ditolak oleh Admin</strong>
                  <p style={{ marginTop: '0.25rem', color: 'var(--text-primary)' }}>
                    Alasan: {assets.find(a => a.id === editId)?.rejection_reason || 'Tidak ada alasan spesifik.'}
                  </p>
                </div>
              )}
              <div className="form-grid-2">
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Nama Aset (Asset description) *</label>
                  <input className="form-control" type="text" required placeholder="Nama lengkap aset"
                    value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>No. Aset</label>
                  <input className="form-control" type="text" placeholder="Dibuat Otomatis" disabled={!isAdmin}
                    value={form.asset_number || ''} onChange={e => setForm({ ...form, asset_number: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>No. Equipment</label>
                  <input className="form-control" type="text" placeholder="Dibuat Otomatis" disabled={!isAdmin}
                    value={form.equipment_number || ''} onChange={e => setForm({ ...form, equipment_number: e.target.value })} />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Grup of Aset (Kategori) *</label>
                  <select className="form-control" required value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                    <option value="">-- Pilih Grup --</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                {categories.find(c => c.id == form.category_id)?.name.toLowerCase() === 'tanah' && (
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label>Luas Tanah (Otomatis format m2) *</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Contoh: 12.5"
                      required
                      value={form.land_area} 
                      onChange={e => setForm({ ...form, land_area: e.target.value })}
                      onBlur={(e) => {
                        let val = e.target.value.replace(/[^\d.]/g, '');
                        if (val) {
                          setForm({ ...form, land_area: `${val} m2` });
                        }
                      }}
                    />
                  </div>
                )}

                <div className="form-group">
                  <label>Location Grup</label>
                  <input className="form-control" type="text" placeholder="Contoh: General Maintenance"
                    value={form.location_grup || ''} onChange={e => setForm({ ...form, location_grup: e.target.value })} />
                </div>

                <div className="form-group">
                  <label>Lokasi (Detail) *</label>
                  <input className="form-control" type="text" required placeholder="Gedung / Ruangan"
                    value={form.location || ''} onChange={e => setForm({ ...form, location: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Kondisi Fungsi</label>
                  <select className="form-control" value={form.function_status} onChange={e => setForm({ ...form, function_status: e.target.value })}>
                    <option value="Baik">Baik</option>
                    <option value="Rusak">Rusak</option>
                    <option value="Tidak Ada Fisik">Tidak Ada Fisik</option>
                  </select>
                </div>
              </div>
              
              <div className="form-group" style={{ marginTop: '0.75rem' }}>
                <label>Spesifikasi</label>
                <textarea className="form-control" rows="2" placeholder="Spesifikasi teknis aset..."
                  value={form.specification || ''} onChange={e => setForm({ ...form, specification: e.target.value })}
                  style={{ resize: 'vertical' }}></textarea>
              </div>

              {editMode && (
                <div className="form-group" style={{ marginTop: '0.75rem' }}>
                  <label>Alasan Perubahan (Opsional)</label>
                  <input className="form-control" type="text" placeholder="Jelaskan alasan jika mengubah data penting/lokasi"
                    value={form.reason || ''} onChange={e => setForm({ ...form, reason: e.target.value })} />
                </div>
              )}
              <div className="form-group" style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span>Bukti Foto Aset *</span>
                  {photoPreview && <span style={{ fontSize: '0.75rem', color: '#10b981' }}><i className="fas fa-check-circle"></i> Foto Siap</span>}
                </label>
                
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    onChange={handlePhotoUpload}
                    style={{ display: 'none' }}
                  />
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { stopCamera(); fileInputRef.current?.click(); }}>
                    <i className="fas fa-upload"></i> Unggah Foto
                  </button>
                  
                  {!cameraActive ? (
                    <button type="button" className="btn btn-danger btn-sm" onClick={startCamera}>
                      <i className="fas fa-camera"></i> Kamera Langsung
                    </button>
                  ) : (
                    <button type="button" className="btn btn-danger btn-sm" onClick={capturePhoto}>
                      <i className="fas fa-camera"></i> Ambil Foto
                    </button>
                  )}
                </div>

                {cameraActive && (
                  <div style={{ background: '#1e293b', borderRadius: 8, padding: 8, position: 'relative', marginTop: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <video ref={videoRef} style={{ width: '100%', maxHeight: 240, borderRadius: 6, transform: 'scaleX(-1)' }} playsInline muted />
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <button type="button" className="btn btn-primary btn-sm" onClick={capturePhoto}>
                        <i className="fas fa-camera"></i> Ambil Foto
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={stopCamera}>
                        Batal
                      </button>
                    </div>
                    <canvas ref={canvasRef} style={{ display: 'none' }} />
                  </div>
                )}

                {photoPreview && (
                  <div style={{ background: '#1e293b', borderRadius: 8, padding: 8, position: 'relative', marginTop: '0.75rem' }}>
                    <img src={photoPreview} style={{ width: '100%', maxHeight: 250, borderRadius: 6, objectFit: 'contain' }} />
                    <button
                      type="button"
                      style={{
                        position: 'absolute', top: 12, right: 12,
                        background: 'rgba(239,68,68,0.85)', color: 'white',
                        border: 'none', borderRadius: '50%', width: 24, height: 24,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                      }}
                      onClick={() => {
                        setPhotoPreview(null);
                        setForm(f => ({ ...f, photo_proof: null }));
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={closeModal}>Batal</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Menyimpan...' : <><i className={`fas ${editMode ? 'fa-save' : 'fa-plus'}`}></i> {editMode ? 'Simpan Perubahan' : 'Tambah Aset'}</>}
              </button>
            </div>
          </form>
        </div>
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
                    <p style={{ marginTop: 2 }}><span className={`badge ${kondisiClass[selectedAsset.function_status] || 'optimal'}`}>{selectedAsset.function_status}</span></p>
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
                          <div style={{ display: 'flex', justifycontent: 'space-between', color: 'var(--text-secondary)', marginBottom: 2 }}>
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
