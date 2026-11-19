const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const SECRET_KEY = process.env.SECRET_KEY;

// ===========================
// Middleware: Autentikasi JWT
// ===========================
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;

    if (!token) {
        return res.status(401).json({ message: 'Akses ditolak. Token tidak ada.' });
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Sesi tidak valid atau kadaluarsa.' });
        }
        req.user = user;
        next();
    });
};

// ===========================
// Middleware: Otorisasi Berdasarkan Peran (RBAC)
// admin_utama selalu diizinkan melewati semua pemeriksaan peran
// ===========================
const authorizeRole = (roles) => {
    return (req, res, next) => {
        if (req.user.role === 'admin_utama') {
            return next();
        }
        const effectiveRoles = [...roles];
        // Peran 'user' mencakup 'operator' dan 'karyawan'
        if (roles.includes('operator') || roles.includes('karyawan')) {
            effectiveRoles.push('user');
        }
        if (!effectiveRoles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Akses ditolak. Peran Anda tidak diizinkan.' });
        }
        next();
    };
};

// ===========================
// Rate Limiter: Pembatasan Percobaan Login
// Maksimal 5 percobaan per 15 menit per IP
// ===========================
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    message: { message: 'Terlalu banyak percobaan login gagal dari IP ini. Silakan coba lagi setelah 15 menit.' },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = { authenticateToken, authorizeRole, loginLimiter };
