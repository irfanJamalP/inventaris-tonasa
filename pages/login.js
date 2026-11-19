import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import dynamic from 'next/dynamic';

// Komponen background video menggantikan 3D untuk performa dan nuansa sinematik
// Import Scene3D secara dinamis agar tidak dirender di server
const Scene3D = dynamic(() => import('../components/Scene3D'), { 
  ssr: false
});

const isDemo = process.env.NEXT_PUBLIC_PORTFOLIO_DEMO === 'true';

export default function LoginPage() {
  const router = useRouter();
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [showModal, setShowModal] = useState(false); // Mengontrol kemunculan form login
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Login form state
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });

  // Register form state
  const [regForm, setRegForm] = useState({ name: '', email: '', password: '', confirm: '', role: 'user' });

  // Periksa apakah user sudah login, arahkan ke dashboard
  useEffect(() => {
    const token = localStorage.getItem('tonasa_token');
    if (token) {
      router.replace('/dashboard');
    }
  }, [router]);

  const openLogin = async () => {
    if (isDemo) {
      const { startDemo } = await import('../lib/demo');
      startDemo();
      router.replace('/dashboard');
      return;
    }
    setMode('login');
    setShowModal(true);
    fetch('/api/config').then(response => response.json())
      .then(config => setRegistrationEnabled(config.registrationEnabled === true))
      .catch(() => setRegistrationEnabled(false));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginForm.email, password: loginForm.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Login gagal');
      localStorage.setItem('tonasa_token', data.token);
      localStorage.setItem('tonasa_user', JSON.stringify(data.user));
      router.replace('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (regForm.password !== regForm.confirm) {
      setError('Kata sandi tidak cocok'); return;
    }
    if (regForm.password.length < 6) {
      setError('Kata sandi minimal 6 karakter'); return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: regForm.name, email: regForm.email, password: regForm.password, role: regForm.role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Pendaftaran gagal');
      setSuccess('Akun berhasil dibuat! Silakan login.');
      setRegForm({ name: '', email: '', password: '', confirm: '', role: 'user' });
      setTimeout(() => setMode('login'), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>{isDemo ? 'Inventaris Tonasa — Demo Portofolio' : 'Sistem Inventaris — PT Semen Tonasa'}</title>
        <meta name="description" content="Sistem Informasi Manajemen Aset PT Semen Tonasa" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" crossOrigin="anonymous" />
        <style>{`
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          .it-overlay {
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            z-index: 1;
            background: 
              linear-gradient(to bottom, rgba(15,23,42,0.85) 0%, rgba(15,23,42,0.6) 50%, rgba(15,23,42,0.9) 100%),
              repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(59,130,246,0.05) 2px, rgba(59,130,246,0.05) 4px);
            pointer-events: none;
          }
          .scanline {
            position: absolute;
            top: 0; left: 0; width: 100%; height: 10px;
            background: rgba(59,130,246,0.2);
            opacity: 0.4;
            animation: scan 6s linear infinite;
            z-index: 2;
            pointer-events: none;
            box-shadow: 0 0 10px rgba(59,130,246,0.5);
          }
          @keyframes scan {
            0% { top: -10%; }
            100% { top: 110%; }
          }
        `}</style>
      </Head>

      <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden',
        background: 'radial-gradient(ellipse at 50% 35%, #164079, #0f172a 68%)' }}>
        <div className="it-overlay"></div>
        <div className="scanline"></div>

        {/* Layer 1.5: Animasi 3D di atas video */}
        <Scene3D />

        {/* Layer 2: Navbar (di atas 3D) */}
        <nav style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '1.5rem 5%', background: 'linear-gradient(to bottom, rgba(15,23,42,0.8), transparent)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'white' }}>
            <div style={{ width: 40, height: 40, background: 'var(--accent-primary)', borderRadius: 8, display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1.2rem' }}>
              <i className="fas fa-building"></i>
            </div>
            <h2 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 700, letterSpacing: 1 }}>TONASA</h2>
          </div>
          <div>
            <button 
              onClick={openLogin}
              className="btn btn-primary btn-sm"
              style={{ borderRadius: 20, padding: '0.5rem 1.5rem' }}
            >
              <i className="fas fa-sign-in-alt"></i> {isDemo ? 'Buka Demo' : 'Login'}
            </button>
          </div>
        </nav>

        {/* Layer 3: Hero Section (Teks di tengah) */}
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          zIndex: 5, textAlign: 'center', padding: '0 20px',
          pointerEvents: 'none' // Agar mouse event tembus ke 3D Canvas
        }}>
          <h1 style={{ 
            fontSize: 'clamp(2.5rem, 5vw, 4.5rem)', 
            fontWeight: 800, 
            lineHeight: 1.2, 
            marginBottom: '1.5rem',
            color: '#ffffff',
            filter: 'drop-shadow(0px 4px 8px rgba(0,0,0,0.5))'
          }}>
            Manajemen Aset<br />Masa Depan
          </h1>
          <p style={{ 
            fontSize: 'clamp(1rem, 1.5vw, 1.2rem)', 
            color: '#cbd5e1', 
            maxWidth: 600, 
            marginBottom: '2.5rem',
            textShadow: '0 2px 4px rgba(0,0,0,0.8)'
          }}>
            {isDemo
              ? 'Demo portofolio Inventaris Tonasa. Kelola aset fiktif, tinjau persetujuan, dan coba laporan tanpa membuat akun.'
              : 'Sistem Informasi Inventaris Pintar PT Semen Tonasa. Pantau, laporkan, dan setujui aset perusahaan dalam satu dasbor terpadu.'}
          </p>
          <button 
            onClick={openLogin}
            className="btn btn-primary"
            style={{ 
              pointerEvents: 'auto', // Aktifkan klik di sini
              padding: '1rem 2.5rem', 
              fontSize: '1.1rem', 
              borderRadius: 30,
              boxShadow: '0 10px 25px -5px rgba(59, 130, 246, 0.5)'
            }}
          >
            {isDemo ? 'Coba Demo' : 'Mulai Kelola Aset'} <i className="fas fa-arrow-right" style={{ marginLeft: 8 }}></i>
          </button>
        </div>

        {/* Layer 4: Modal Form Login (Tampil jika showModal = true) */}
        {showModal && (
          <div style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(8px)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 50, padding: 20
          }}>
            <div className="login-card" style={{ animation: 'fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '15px', right: '15px' }}>
                <button 
                  onClick={() => setShowModal(false)} 
                  style={{ background: 'var(--bg-tertiary)', border: 'none', color: '#cbd5e1', fontSize: '1.2rem', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
              
              <div className="login-logo" style={{ marginTop: '0.5rem', background: 'transparent' }}>
                <img src="/logo-tonasa-fix.png" alt="Logo Tonasa" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
              <h2>{mode === 'login' ? 'Selamat Datang' : 'Daftar Akun Baru'}</h2>
              <p>{mode === 'login' ? 'Masuk ke Sistem Inventaris Aset Tonasa' : 'Daftarkan akun baru'}</p>

              {error && (
                <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
                  <i className="fas fa-circle-exclamation"></i> {error}
                </div>
              )}
              {success && (
                <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
                  <i className="fas fa-circle-check"></i> {success}
                </div>
              )}

              {mode === 'login' ? (
                <form onSubmit={handleLogin}>
                  <div className="form-group">
                    <label><i className="fas fa-envelope" style={{ marginRight: 6 }}></i>Email</label>
                    <input
                      className="form-control" type="email" placeholder="Masukkan email"
                      value={loginForm.email} onChange={e => setLoginForm({ ...loginForm, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label><i className="fas fa-lock" style={{ marginRight: 6 }}></i>Kata Sandi</label>
                    <input
                      className="form-control" type="password" placeholder="Masukkan kata sandi"
                      value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', marginTop: '1rem' }}>
                    {loading ? <><span className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }}></span> Memproses...</> : <><i className="fas fa-right-to-bracket"></i> Masuk</>}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRegister}>
                  <div className="form-group">
                    <label><i className="fas fa-user" style={{ marginRight: 6 }}></i>Nama Lengkap</label>
                    <input
                      className="form-control" type="text" placeholder="Masukkan nama"
                      value={regForm.name} onChange={e => setRegForm({ ...regForm, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label><i className="fas fa-envelope" style={{ marginRight: 6 }}></i>Email</label>
                    <input
                      className="form-control" type="email" placeholder="Masukkan email"
                      value={regForm.email} onChange={e => setRegForm({ ...regForm, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label><i className="fas fa-lock" style={{ marginRight: 6 }}></i>Kata Sandi</label>
                    <input
                      className="form-control" type="password" placeholder="Minimal 6 karakter"
                      value={regForm.password} onChange={e => setRegForm({ ...regForm, password: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label><i className="fas fa-lock" style={{ marginRight: 6 }}></i>Konfirmasi Sandi</label>
                    <input
                      className="form-control" type="password" placeholder="Ulangi kata sandi"
                      value={regForm.confirm} onChange={e => setRegForm({ ...regForm, confirm: e.target.value })}
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', marginTop: '1rem' }}>
                    {loading ? <><span className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }}></span> Mendaftar...</> : <><i className="fas fa-user-plus"></i> Daftar Akun</>}
                  </button>
                </form>
              )}

              {registrationEnabled && <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                {mode === 'login' ? (
                  <p style={{ fontSize: '0.875rem' }}>
                    Belum punya akun?{' '}
                    <button onClick={() => { setMode('register'); setError(''); setSuccess(''); }} style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontWeight: 600 }}>
                      Daftar di sini
                    </button>
                  </p>
                ) : (
                  <p style={{ fontSize: '0.875rem' }}>
                    Sudah punya akun?{' '}
                    <button onClick={() => { setMode('login'); setError(''); setSuccess(''); }} style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontWeight: 600 }}>
                      Login di sini
                    </button>
                  </p>
                )}
              </div>}
            </div>
          </div>
        )}

      </div>
    </>
  );
}
