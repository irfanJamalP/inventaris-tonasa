import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import useAuth from '../lib/useAuth';
import { apiGet, apiPost, apiDelete } from '../lib/api';

export default function PenggunaPage() {
  const { token, user, loading } = useAuth('admin_utama');
  const [users, setUsers] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [passwordModal, setPasswordModal] = useState(false);
  const [passwordModalUser, setPasswordModalUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (!token) return;
    loadUsers();
  }, [token]);

  const loadUsers = async () => {
    setFetching(true);
    try {
      const data = await apiGet('/users', token);
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    finally { setFetching(false); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = await apiPost('/users', form, token);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Gagal membuat pengguna');
      setModal(false);
      setForm({ name: '', email: '', password: '', role: 'user' });
      loadUsers();
    } catch (err) {
      setError(err.message);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Hapus pengguna "${name}"?`)) return;
    try {
      const res = await apiDelete(`/users/${id}`, token);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Gagal menghapus pengguna');
      loadUsers();
    } catch (e) { console.error(e); }
  };

  const handleChangeRole = async (id, role) => {
    try {
      const targetUser = users.find(u => u.id === id);
      if (!targetUser) return;
      await apiPost(`/users/${id}`, { name: targetUser.name, email: targetUser.email, role }, token, 'PUT');
      loadUsers();
    } catch (e) { console.error(e); }
  };

  const handleImpersonate = async (id) => {
    if (!confirm('Anda yakin ingin login sebagai (login as) akun ini?')) return;
    try {
      const res = await apiPost(`/auth/impersonate/${id}`, {}, token);
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('original_admin_token', token);
        localStorage.setItem('original_admin_user', JSON.stringify(user));
        localStorage.setItem('tonasa_token', data.token);
        localStorage.setItem('tonasa_user', JSON.stringify(data.user));
        window.location.href = '/dashboard';
      } else {
        alert(data.message || 'Gagal login sebagai pengguna.');
      }
    } catch (e) {
      console.error(e);
      alert('Gagal melakukan login as.');
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      alert('Password minimal 6 karakter.');
      return;
    }
    setSaving(true);
    try {
      const res = await apiPost(`/users/${passwordModalUser.id}`, {
        name: passwordModalUser.name,
        email: passwordModalUser.email,
        role: passwordModalUser.role,
        password: newPassword
      }, token, 'PUT');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Gagal mengubah password');
      alert('Password berhasil diperbarui.');
      setPasswordModal(false);
      setPasswordModalUser(null);
      setNewPassword('');
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const filtered = users.filter(u => {
    if (!search) return true;
    return u.name?.toLowerCase().includes(search.toLowerCase()) ||
           u.email?.toLowerCase().includes(search.toLowerCase()) ||
           u.role?.toLowerCase().includes(search.toLowerCase());
  });

  const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const roleColors = { admin_utama: '#ec4899', admin: '#a855f7', user: '#3b82f6', operator: '#3b82f6', karyawan: '#94a3b8' };
  const roleClass = { admin_utama: 'admin_utama', admin: 'admin', user: 'operator', operator: 'operator', karyawan: 'karyawan' };
  const roleNames = { admin_utama: 'Admin Utama', admin: 'Admin', user: 'User', operator: 'User', karyawan: 'User' };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0f172a' }}><div className="loading-spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div></div>;

  return (
    <Layout user={user} title="Kelola Pengguna" subtitle="Manajemen akun dan hak akses pengguna">
      <div className="table-container">
        <div className="table-header">
          <div className="table-filters">
            <input
              className="search-input"
              placeholder="Cari pengguna..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="table-actions">
            <button id="btn-tambah-user" className="btn btn-primary btn-sm" onClick={() => { setModal(true); setError(''); }}>
              <i className="fas fa-user-plus"></i> Tambah Pengguna
            </button>
          </div>
        </div>

        {fetching ? (
          <div className="loading-state"><div className="loading-spinner"></div> Memuat...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><i className="fas fa-users"></i><p>Tidak ada pengguna</p></div>
        ) : (
                  <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 240px)' }}>
                    <table style={{ position: 'relative' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-secondary)', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                <tr>
                  <th>#</th>
                  <th>Nama Lengkap</th>
                  <th>Email</th>
                  <th>Peran</th>
                  <th>Dibuat</th>
                  <th>Ubah Peran</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => (
                  <tr key={u.id}>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{i + 1}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div className="avatar" style={{ width: 32, height: 32, fontSize: '0.75rem', background: `rgba(${(roleColors[u.role] || '#94a3b8').slice(1)}, 0.2)`, color: roleColors[u.role] || '#94a3b8' }}>
                          {u.name?.slice(0, 2).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 500 }}>{u.name}</span>
                        {u.id === user?.id && <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>(Anda)</span>}
                      </div>
                    </td>
                    <td>{u.email}</td>
                    <td><span className={`badge ${roleClass[u.role] || 'karyawan'}`}>{roleNames[u.role] || u.role}</span></td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{formatDate(u.created_at)}</td>
                    <td>
                      {(() => {
                        const targetIsAdminOrAdminUtama = u.role === 'admin_utama' || u.role === 'admin';
                        const showRoleSelect = u.id !== user?.id && u.role !== 'admin_utama' && (user?.role === 'admin_utama' || u.role !== 'admin');
                        return showRoleSelect ? (
                          <select
                            className="filter-select"
                            value={u.role === 'operator' || u.role === 'karyawan' ? 'user' : u.role}
                            onChange={e => handleChangeRole(u.id, e.target.value)}
                          >
                             <option value="admin">Admin</option>
                             <option value="user">User</option>
                          </select>
                        ) : <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>-</span>;
                      })()}
                    </td>
                    <td>
                      {(() => {
                        const targetIsAdminOrAdminUtama = u.role === 'admin_utama' || u.role === 'admin';
                        const showDeleteAndImpersonate = u.id !== user?.id && (user?.role === 'admin_utama' || !targetIsAdminOrAdminUtama);
                        const showChangePassword = user?.role === 'admin_utama' || u.id === user?.id || !targetIsAdminOrAdminUtama;
                        return (
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            {showDeleteAndImpersonate && (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleImpersonate(u.id)}
                                style={{ background: 'var(--accent-primary)', color: 'white', border: 'none' }}
                                title="Login As (Masuk sebagai akun ini)"
                              >
                                <i className="fas fa-user-secret"></i>
                              </button>
                            )}
                            {showChangePassword && (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => { setPasswordModalUser(u); setNewPassword(''); setPasswordModal(true); }}
                                style={{ background: 'var(--warning)', color: 'white', border: 'none' }}
                                title="Ubah Password"
                              >
                                <i className="fas fa-key"></i>
                              </button>
                            )}
                            {showDeleteAndImpersonate && (
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleDelete(u.id, u.name)}
                              >
                                <i className="fas fa-trash"></i>
                              </button>
                            )}
                            {!showDeleteAndImpersonate && !showChangePassword && (
                              <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>-</span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      <div className={`modal-overlay ${modal ? 'active' : ''}`} onClick={e => e.target.classList.contains('modal-overlay') && setModal(false)}>
        <div className="modal-content">
          <div className="modal-header">
            <h3 style={{ margin: 0 }}><i className="fas fa-user-plus" style={{ marginRight: 8, color: '#3b82f6' }}></i>Tambah Pengguna Baru</h3>
            <button className="close-btn" onClick={() => setModal(false)}>×</button>
          </div>
          <form onSubmit={handleCreate}>
            <div className="modal-body">
              {error && <div className="alert alert-danger"><i className="fas fa-circle-exclamation"></i> {error}</div>}
              <div className="form-group">
                <label>Nama Lengkap</label>
                <input className="form-control" type="text" required placeholder="Nama lengkap pengguna"
                  value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input className="form-control" type="email" required placeholder="nama@tonasa.co.id"
                  value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Kata Sandi</label>
                <input className="form-control" type="password" required placeholder="Minimal 6 karakter"
                  value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Peran</label>
                <select className="form-control" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  <option value="admin">Admin</option>
                  <option value="user">User</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Batal</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Menyimpan...' : <><i className="fas fa-user-plus"></i> Buat Akun</>}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Change Password Modal */}
      <div className={`modal-overlay ${passwordModal ? 'active' : ''}`} onClick={e => e.target.classList.contains('modal-overlay') && setPasswordModal(false)}>
        <div className="modal-content">
          <div className="modal-header">
            <h3 style={{ margin: 0 }}><i className="fas fa-key" style={{ marginRight: 8, color: '#f59e0b' }}></i>Ubah Password</h3>
            <button className="close-btn" onClick={() => setPasswordModal(false)}>×</button>
          </div>
          <form onSubmit={handleUpdatePassword}>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
                Mengubah password untuk akun <strong>{passwordModalUser?.name}</strong> ({passwordModalUser?.email})
              </p>
              <div className="form-group">
                <label>Password Baru</label>
                <input 
                  className="form-control" 
                  type="password" 
                  required 
                  placeholder="Minimal 6 karakter"
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)} 
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setPasswordModal(false)}>Batal</button>
              <button type="submit" className="btn btn-primary" style={{ background: '#f59e0b', color: 'white' }} disabled={saving}>
                {saving ? 'Menyimpan...' : <><i className="fas fa-key"></i> Simpan Password</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}
