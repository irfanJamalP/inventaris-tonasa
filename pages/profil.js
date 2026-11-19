import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import useAuth from '../lib/useAuth';
import { apiGet, apiPut } from '../lib/api';

export default function ProfilPage() {
  const { token, user, loading } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', old_password: '' });
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    if (!token) return;
    loadProfile();
  }, [token]);

  const loadProfile = async () => {
    try {
      const data = await apiGet('/auth/profile', token);
      if (data && data.name) {
        setForm({ name: data.name, email: data.email, password: '', old_password: '' });
      }
    } catch (e) {
      console.error(e);
      setMessage({ text: 'Gagal memuat profil', type: 'error' });
    } finally {
      setFetching(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ text: '', type: '' });

    try {
      const res = await apiPut('/auth/profile', form, token);
      const data = await res.json();
      
      if (res.ok) {
        setMessage({ text: data.message || 'Profil berhasil diperbarui.', type: 'success' });
        // Update local storage if token changed
        if (data.token && data.user) {
          localStorage.setItem('tonasa_token', data.token);
          localStorage.setItem('tonasa_user', JSON.stringify(data.user));
          // Reset password field
          setForm(prev => ({ ...prev, password: '', old_password: '' }));
          // Give user a brief moment to see success, then reload to update sidebar
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        }
      } else {
        setMessage({ text: data.message || 'Gagal memperbarui profil.', type: 'error' });
      }
    } catch (e) {
      setMessage({ text: 'Terjadi kesalahan sistem.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading || fetching) {
    return (
      <Layout user={user} title="Profil Saya">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div className="loading-spinner"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout user={user} title="Profil Saya" subtitle="Kelola informasi akun Anda">
      <div style={{ maxWidth: 600, margin: '0 auto', background: 'var(--bg-secondary)', padding: '2rem', borderRadius: 12, border: '1px solid var(--border-color)', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '2.5rem', fontWeight: 'bold' }}>
            {form.name ? form.name.slice(0, 2).toUpperCase() : '?'}
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{form.name}</h2>
            <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)' }}>Role: {user?.role === 'admin_utama' ? 'Admin Utama' : user?.role === 'admin' ? 'Admin' : 'User'}</p>
          </div>
        </div>

        {message.text && (
          <div style={{ 
            padding: '1rem', 
            borderRadius: 8, 
            marginBottom: '1.5rem', 
            background: message.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${message.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            color: message.type === 'success' ? '#10b981' : '#ef4444',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <i className={`fas ${message.type === 'success' ? 'fa-check-circle' : 'fa-circle-exclamation'}`}></i>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSave}>
          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nama Lengkap *</label>
            <input 
              type="text" 
              className="form-control" 
              required 
              value={form.name} 
              onChange={e => setForm({...form, name: e.target.value})}
              style={{ width: '100%' }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Email *</label>
            <input 
              type="email" 
              className="form-control" 
              required 
              value={form.email} 
              onChange={e => setForm({...form, email: e.target.value})}
              style={{ width: '100%' }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Password Baru (Opsional)</label>
            <input 
              type="password" 
              className="form-control" 
              placeholder="Kosongkan jika tidak ingin mengubah password"
              value={form.password} 
              onChange={e => setForm({...form, password: e.target.value})}
              style={{ width: '100%' }}
            />
          </div>

          {form.password && (
            <div className="form-group" style={{ marginBottom: '2rem', padding: '1rem', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8 }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: '#d97706', fontWeight: 500 }}>
                <i className="fas fa-lock" style={{ marginRight: 6 }}></i>
                Password Saat Ini *
              </label>
              <input 
                type="password" 
                className="form-control" 
                placeholder="Masukkan password lama Anda untuk keamanan"
                required={!!form.password}
                value={form.old_password} 
                onChange={e => setForm({...form, old_password: e.target.value})}
                style={{ width: '100%' }}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Dibutuhkan untuk memverifikasi perubahan password.</p>
            </div>
          )}

          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={saving}
            style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
          >
            {saving ? (
              <><div className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }}></div> Menyimpan...</>
            ) : (
              <><i className="fas fa-save"></i> Simpan Perubahan</>
            )}
          </button>
        </form>

      </div>
    </Layout>
  );
}
