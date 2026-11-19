const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('node:crypto');
const db = require('../../lib/db');
const rateLimit = require('express-rate-limit');

const app = express();
const SECRET_KEY = process.env.SECRET_KEY;
const registrationEnabled = process.env.ALLOW_PUBLIC_REGISTRATION === 'true';

const corsOptions = {
    origin: process.env.CORS_ORIGIN || false,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Limit upload foto/video di /api/assets hingga 15mb
app.use('/api/assets', express.json({ limit: '15mb' }));
// Global limit 1mb untuk endpoint lainnya
app.use(express.json({ limit: '1mb' }));

// Rate limiter untuk login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    max: 5, // Maksimal 5 percobaan
    skipSuccessfulRequests: true,
    message: { message: 'Terlalu banyak percobaan login gagal dari IP ini. Silakan coba lagi setelah 15 menit.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Middleware for authentication
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;
    
    if (!token) return res.status(401).json({ message: 'Akses ditolak. Token tidak ada.' });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ message: 'Sesi tidak valid atau kadaluarsa.' });
        req.user = user;
        next();
    });
};

// Middleware for RBAC
const authorizeRole = (roles) => {
    return (req, res, next) => {
        if (req.user.role === 'admin_utama') {
            return next();
        }
        const effectiveRoles = [...roles];
        if (roles.includes('operator') || roles.includes('karyawan')) {
            effectiveRoles.push('user');
        }
        if (!effectiveRoles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Akses ditolak. Peran Anda tidak diizinkan.' });
        }
        next();
    };
};

async function saveAssetPhoto(photo) {
    if (!photo || !photo.startsWith('data:')) return null;
    const match = /^data:(image\/(?:jpeg|png|webp|gif|avif));base64,([A-Za-z0-9+/=]+)$/.exec(photo);
    if (!match) throw new Error('Gunakan foto JPEG, PNG, WebP, GIF, atau AVIF.');
    const [, type, encoded] = match;
    const contents = Buffer.from(encoded, 'base64');
    if (!contents.length || contents.length > 10 * 1024 * 1024) {
        throw new Error('Ukuran foto maksimal 10 MB.');
    }
    const id = randomUUID();
    await db.pool.query(
        'INSERT INTO asset_media (id, content_type, contents) VALUES ($1, $2, $3)',
        [id, type, contents]
    );
    return `/api/media/${id}`;
}

app.get('/api/media/:id', async (req, res) => {
    const { rows: [media] } = await db.pool.query(
        'SELECT content_type, contents FROM asset_media WHERE id = $1',
        [req.params.id]
    );
    if (!media) return res.sendStatus(404);
    res.set('X-Content-Type-Options', 'nosniff');
    res.type(media.content_type).send(media.contents);
});

app.get('/api/config', (_req, res) => res.json({ registrationEnabled }));

// =======================
// SERVER-SENT EVENTS (SSE)
// =======================
let clients = [];

const broadcastEvent = (type, data = {}) => {
    clients.forEach(client => {
        client.res.write(`event: ${type}\n`);
        client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    });
};

app.get('/api/stream', authenticateToken, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = Date.now() + Math.random().toString(36).substr(2, 9);
    const newClient = { id: clientId, res };
    clients.push(newClient);

    req.on('close', () => {
        clients = clients.filter(client => client.id !== clientId);
    });
});

// =======================
// AUTHENTICATION
// =======================
app.post('/api/auth/login', loginLimiter, (req, res) => {
    const { email, password } = req.body;
    if (typeof email !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ message: 'Email dan kata sandi wajib diisi.' });
    }
    db.get("SELECT * FROM users WHERE email = ? AND is_deleted = 0", [email], async (err, user) => {
        const remaining = req.rateLimit ? req.rateLimit.remaining : 0;
        const sisaText = req.rateLimit ? ` Sisa percobaan: ${remaining} kali.` : '';

        if (err) return res.status(503).json({ message: 'Database belum siap.' });
        if (!user) return res.status(401).json({ message: 'Email tidak ditemukan.' + sisaText });
        
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) return res.status(401).json({ message: 'Password salah.' + sisaText });
        
        const token = jwt.sign({ id: user.id, email: user.email, role: (user.role === 'operator' || user.role === 'karyawan') ? 'user' : user.role, name: user.name }, SECRET_KEY, { expiresIn: '8h' });
        res.json({ token, user: { id: user.id, name: user.name, role: (user.role === 'operator' || user.role === 'karyawan') ? 'user' : user.role } });
    });
});

app.post('/api/auth/register', async (req, res) => {
    if (!registrationEnabled) return res.status(403).json({ message: 'Pendaftaran mandiri dinonaktifkan.' });
    const { name, email, password } = req.body;
    const role = 'operator'; // Under-the-hood pendaftaran mandiri disimpan sebagai operator
    
    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Semua kolom wajib diisi.' });
    }
    
    try {
        const hash = await bcrypt.hash(password, 10);
        db.run("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
            [name, email, hash, role],
            function(err) {
                if (err) {
                    if (err.code === '23505') {
                        return res.status(400).json({ message: 'Email sudah terdaftar.' });
                    }
                    return res.status(500).json({ error: err.message });
                }
                const newUserId = this.lastID;
                db.run("INSERT INTO user_history (user_id, field_changed, old_value, new_value, changed_by) VALUES (?, ?, ?, ?, ?)",
                    [newUserId, 'user_created', null, `Pendaftaran mandiri sebagai akun User`, newUserId]);
                
                res.status(201).json({ message: 'Pendaftaran berhasil! Silakan login.' });
            }
        );
    } catch (err) {
        res.status(500).json({ message: 'Gagal memproses registrasi.' });
    }
});

app.get('/api/auth/profile', authenticateToken, (req, res) => {
    db.get("SELECT id, name, email, role FROM users WHERE id = ? AND is_deleted = 0", [req.user.id], (err, user) => {
        if (err || !user) return res.status(404).json({ message: 'User tidak ditemukan.' });
        res.json(user);
    });
});

app.put('/api/auth/profile', authenticateToken, async (req, res) => {
    const { name, email, password, old_password } = req.body;
    db.get("SELECT * FROM users WHERE id = ?", [req.user.id], async (err, user) => {
        if (err || !user) return res.status(404).json({ message: 'User tidak ditemukan.' });
        
        const executeUpdate = (hash) => {
            let query = "UPDATE users SET name = ?, email = ?";
            const params = [name, email];
            if (hash) {
                query += ", password_hash = ?";
                params.push(hash);
            }
            query += " WHERE id = ?";
            params.push(req.user.id);
            
            db.run(query, params, function(err2) {
                if (err2) {
                    if (err2.code === '23505') {
                        return res.status(400).json({ message: 'Email sudah digunakan.' });
                    }
                    return res.status(500).json({ error: err2.message });
                }
                
                db.run("INSERT INTO user_history (user_id, field_changed, old_value, new_value, changed_by) VALUES (?, ?, ?, ?, ?)",
                    [req.user.id, 'profile_updated', null, 'User mengupdate profilnya', req.user.id]);
                
                const token = jwt.sign({ id: user.id, email, role: req.user.role, name }, SECRET_KEY, { expiresIn: '8h' });
                res.json({ message: 'Profil berhasil diupdate.', token, user: { id: user.id, name, role: req.user.role } });
            });
        };

        if (password) {
            const { old_password } = req.body;
            if (!old_password) {
                return res.status(400).json({ message: 'Password saat ini diperlukan untuk mengubah password.' });
            }
            
            try {
                const validOldPassword = await bcrypt.compare(old_password, user.password_hash);
                if (!validOldPassword) {
                    return res.status(401).json({ message: 'Password saat ini salah.' });
                }
                const hash = await bcrypt.hash(password, 10);
                executeUpdate(hash);
            } catch (errHash) {
                res.status(500).json({ message: 'Gagal memproses password.' });
            }
        } else {
            executeUpdate(null);
        }
    });
});

// =======================
// DASHBOARD
// =======================
app.get('/api/dashboard/summary', authenticateToken, (req, res) => {
    const queries = {
        total_active: new Promise((resolve) => db.get("SELECT COUNT(*) as count FROM assets WHERE is_deleted = 0 AND status_approval = 'Approved'", (err, row) => resolve(row ? row.count : 0))),
        total_broken: new Promise((resolve) => db.get("SELECT COUNT(*) as count FROM assets WHERE is_deleted = 0 AND function_status = 'Rusak' AND status_approval = 'Approved'", (err, row) => resolve(row ? row.count : 0))),
        total_suboptimal: new Promise((resolve) => db.get("SELECT COUNT(*) as count FROM assets WHERE is_deleted = 0 AND performance_status = 'Tidak Optimal' AND status_approval = 'Approved'", (err, row) => resolve(row ? row.count : 0)))
    };

    Promise.all([queries.total_active, queries.total_broken, queries.total_suboptimal])
        .then(([total_active, total_broken, total_suboptimal]) => {
            res.json({ total_active, total_broken, total_suboptimal });
        });
});

app.get('/api/dashboard/charts', authenticateToken, (req, res) => {
    const queries = {
        by_category: new Promise((resolve) => {
            db.all("SELECT c.name as label, COUNT(a.id) as value FROM assets a LEFT JOIN categories c ON a.category_id = c.id WHERE a.is_deleted = 0 AND a.status_approval = 'Approved' GROUP BY c.id", (err, rows) => resolve(rows || []));
        }),
        by_status: new Promise((resolve) => {
            db.all("SELECT function_status as label, COUNT(id) as value FROM assets WHERE is_deleted = 0 AND status_approval = 'Approved' GROUP BY function_status", (err, rows) => resolve(rows || []));
        })
    };

    Promise.all([queries.by_category, queries.by_status])
        .then(([by_category, by_status]) => {
            res.json({ by_category, by_status });
        });
});

// =======================
// ASSETS CRUD
// =======================
app.get('/api/assets', authenticateToken, (req, res) => {
    const { category, function_status, performance_status, status_approval, search, page, limit } = req.query;
    
    let whereClause = "WHERE a.is_deleted = 0";
    const params = [];
    
    if (req.user.role !== 'admin' && req.user.role !== 'admin_utama') {
        whereClause += " AND (a.status_approval = 'Approved' OR a.created_by = ?)";
        params.push(req.user.id);
    }
    
    if (category) { whereClause += " AND a.category_id = ?"; params.push(category); }
    if (function_status) { whereClause += " AND a.function_status = ?"; params.push(function_status); }
    if (performance_status) { whereClause += " AND a.performance_status = ?"; params.push(performance_status); }
    if (status_approval) { whereClause += " AND a.status_approval = ?"; params.push(status_approval); }
    
    if (search) {
        whereClause += " AND (a.name LIKE ? OR a.asset_number LIKE ? OR a.equipment_number LIKE ? OR a.location LIKE ? OR a.location_grup LIKE ? OR a.specification LIKE ?)";
        const likeSearch = `%${search}%`;
        params.push(likeSearch, likeSearch, likeSearch, likeSearch, likeSearch, likeSearch);
    }

    const countQuery = `
        SELECT COUNT(*) as count 
        FROM assets a 
        LEFT JOIN categories c ON a.category_id = c.id
        LEFT JOIN users u ON a.created_by = u.id
        ${whereClause}
    `;

    db.get(countQuery, params, (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        const total = row ? row.count : 0;

        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 100;
        const offset = (pageNum - 1) * limitNum;

        const dataQuery = `
            SELECT a.*, c.name as category_name, u.name as created_by_name 
            FROM assets a 
            LEFT JOIN categories c ON a.category_id = c.id
            LEFT JOIN users u ON a.created_by = u.id
            ${whereClause}
            ORDER BY a.id DESC LIMIT ? OFFSET ?
        `;
        
        db.all(dataQuery, [...params, limitNum, offset], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ data: rows, total });
        });
    });
});

app.get('/api/assets/:id', authenticateToken, (req, res) => {
    db.get("SELECT a.*, c.name as category_name FROM assets a LEFT JOIN categories c ON a.category_id = c.id WHERE a.id = ? AND a.is_deleted = 0", [req.params.id], (err, asset) => {
        if (err || !asset) return res.status(404).json({ message: 'Asset tidak ditemukan.' });
        
        db.all("SELECT h.*, u.name as changed_by_name FROM asset_history h LEFT JOIN users u ON h.changed_by = u.id WHERE h.asset_id = ? ORDER BY h.changed_at DESC", [req.params.id], (err, history) => {
            res.json({ asset, history: history || [] });
        });
    });
});

app.post('/api/assets', authenticateToken, (req, res) => {
    const { name, asset_number, equipment_number, category_id, location, location_grup, specification, function_status, performance_status, photo_proof, cum_acq_value, end_book_value, land_area } = req.body;
    
    if (!name || !category_id) {
        return res.status(400).json({ message: 'Field name dan category_id wajib diisi.' });
    }

    const year = new Date().getFullYear();
    db.get("SELECT COUNT(*) as count FROM assets WHERE asset_number LIKE ?", [`GF-${year}-%`], async (err, row) => {
        if (err) return res.status(500).json({ message: 'Gagal membaca nomor aset.' });
        const urutan = String(Number(row.count) + 1).padStart(3, '0');
        const final_asset_number = asset_number || `GF-${year}-${urutan}`;
        const final_equipment_number = equipment_number || `EQ-${year}-${urutan}`;
        
        let isApproved = req.user.role === 'admin' || req.user.role === 'admin_utama' ? 'Approved' : 'Pending';
        let relativePhotoPath;
        try {
            relativePhotoPath = await saveAssetPhoto(photo_proof);
        } catch (error) {
            return res.status(400).json({ message: error.message });
        }
        
        db.run(`INSERT INTO assets (asset_number, equipment_number, name, category_id, location, location_grup, cum_acq_value, end_book_value, specification, function_status, performance_status, created_by, status_approval, photo_proof, land_area) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
        [final_asset_number, final_equipment_number, name, category_id, location, location_grup, cum_acq_value || null, end_book_value || null, specification, function_status, performance_status, req.user.id, isApproved, relativePhotoPath, land_area || null], 
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            
            const newAssetId = this.lastID;
            if (isApproved === 'Approved') {
                db.run("INSERT INTO asset_history (asset_id, field_changed, old_value, new_value, changed_by) VALUES (?, ?, ?, ?, ?)",
                    [newAssetId, 'asset_created', null, 'Aset didaftarkan langsung oleh Admin', req.user.id]);
            } else {
                db.run("INSERT INTO asset_history (asset_id, field_changed, old_value, new_value, changed_by) VALUES (?, ?, ?, ?, ?)",
                    [newAssetId, 'status_approval', null, 'Menunggu persetujuan Admin', req.user.id]);
            }
            
            broadcastEvent('ASSET_CHANGED');
            res.status(201).json({ id: newAssetId, asset_number: final_asset_number, message: isApproved === 'Approved' ? 'Aset berhasil ditambahkan.' : 'Aset berhasil diajukan, menunggu persetujuan Admin.' });
        });
    });
});

// Helper functions for bulk import
const getOrCreateCategory = (name) => {
    return new Promise((resolve, reject) => {
        const trimmedName = (name || 'Umum').trim();
        db.get("SELECT id FROM categories WHERE LOWER(name) = LOWER(?)", [trimmedName], (err, row) => {
            if (err) return reject(err);
            if (row) {
                resolve(row.id);
            } else {
                db.run("INSERT INTO categories (name) VALUES (?)", [trimmedName], function(errInsert) {
                    if (errInsert) return reject(errInsert);
                    resolve(this.lastID);
                });
            }
        });
    });
};

const getAssetCountForYear = (year) => {
    return new Promise((resolve, reject) => {
        db.get("SELECT COUNT(*) as count FROM assets WHERE asset_number LIKE ?", [`GF-${year}-%`], (err, row) => {
            if (err) return reject(err);
            resolve(Number(row?.count || 0));
        });
    });
};

app.post('/api/assets/bulk', authenticateToken, authorizeRole(['admin', 'operator', 'karyawan']), async (req, res) => {
    const { assets } = req.body;
    if (!Array.isArray(assets) || assets.length === 0) {
        return res.status(400).json({ message: 'Data aset tidak valid atau kosong.' });
    }

    try {
        const year = new Date().getFullYear();
        let currentCount = await getAssetCountForYear(year);
        const isApproved = req.user.role === 'admin' || req.user.role === 'admin_utama' ? 'Approved' : 'Pending';
        let anyPending = false;

        const categories = await new Promise((resolveCat, rejectCat) => {
            db.all("SELECT * FROM categories", (err, rows) => {
                if (err) return rejectCat(err);
                resolveCat(rows || []);
            });
        });
        const categoryMap = {};
        categories.forEach(c => {
            categoryMap[c.name.toLowerCase().trim()] = c.id;
        });

        const mapped = [];
        for (const item of assets) {
            const name = (item.name || '').trim();
            const asset_number = item.asset_number;
            const specification = item.specification || null;
            let categoryName = item.category_name ? item.category_name.trim() : null;
            let categoryId = null;

            if (categoryName) {
                categoryId = categoryMap[categoryName.toLowerCase()];
            }

            if (!categoryId) {
                const textToAnalyze = `${name} ${specification || ''} ${categoryName || ''}`;
                const lowerText = textToAnalyze.toLowerCase();
                
                const RAW_MAPPINGS = [
                    { category: 'Tanah & Lahan', keys: ['tanah kosong', 'tanah jalan', 'tanah perumahan', 'tanah kantor', 'tanah gudang', 'tanah pabrik', 'tanah pelabuhan', 'tanah tower', 'tanah transmisi', 'tanah industri', 'tanah fasilitas', 'ex pelabuhan', 'tanah', 'lahan'] },
                    { category: 'Pertambangan & Quarry', keys: ['clay pit', 'tanah liat', 'batu kapur', 'pasir silika', 'pasir besi', 'raw material', 'bahan baku', 'tambang', 'quarry', 'mine', 'mining', 'clay', 'limestone', 'silica', 'gypsum', 'gipsum', 'coal', 'batubara', 'crushing', 'extraction', 'paccola', 'kajuara', 'siloro', 'bontoa', 'tabo-tabo'] },
                    { category: 'Bangunan & Gedung', keys: ['administration office', 'kantor administrasi', 'kantor proyek', 'fasilitas sementara', 'temporary facility', 'control room', 'bangunan', 'gedung', 'building', 'kantor', 'office', 'ruang', 'ruangan', 'auditorium', 'cafeteria', 'ccr', 'posko', 'portir'] },
                    { category: 'Perumahan & Akomodasi', keys: ['rumah dinas', 'rumah direksi', 'rumah tinggal', 'rumah type a', 'rumah type b', 'rumah type c', 'rumah type d', 'rumah type e', 'perumahan staf', 'kepala biro', 'kepala seksi', 'kepala departemen', 'perumahan', 'housing', 'wisma', 'mess', 'asrama', 'barak', 'bangsal', 'kopel', 'rumah'] },
                    { category: 'Pendidikan, Ibadah, Kesehatan & Olahraga', keys: ['taman kanak-kanak', 'rumah sakit', 'ruang perawatan', 'gedung olahraga', 'club house', 'kolam renang', 'sekolah', 'school', 'tk', 'sd', 'smp', 'sma', 'madrasah', 'perpustakaan', 'masjid', 'mesjid', 'musallah', 'musholla', 'gereja', 'poliklinik', 'bkia', 'klinik', 'ugd', 'lapangan', 'tennis', 'tenis', 'badminton', 'basket', 'golf'] },
                    { category: 'Infrastruktur Sipil', keys: ['jalan beton', 'jalan tambang', 'road pavement', 'jembatan timbang', 'retaining wall', 'tiang pancang', 'steel structure', 'cable tunnel', 'jalan', 'road', 'aspal', 'pengaspalan', 'jembatan', 'bridge', 'selokan', 'drainase', 'drainage', 'saluran', 'douker', 'gorong-gorong', 'pagar', 'tanggul', 'bronjong', 'pondasi', 'foundation', 'beton', 'kolom', 'sloof', 'lantai', 'dinding', 'atap', 'roof', 'tunnel', 'trench'] },
                    { category: 'Pelabuhan, Dermaga & Terminal', keys: ['cement terminal', 'ship loader', 'shiploader', 'ship unloader', 'ship unloder', 'rambu suar', 'harbour facility', 'cathodic protection', 'chatodic protection', 'pelabuhan', 'harbour', 'harbor', 'dermaga', 'jetty', 'yetty', 'pier', 'trestle', 'terminal', 'mooring', 'dolphin', 'causeway', 'beacon', 'marine', 'iccp'] },
                    { category: 'Gudang & Penyimpanan', keys: ['ware house', 'material storage', 'coal storage', 'clinker storage', 'gypsum storage', 'clay storage', 'silica storage', 'limestone storage', 'gudang material', 'gudang spare part', 'gudang arsip', 'gudang induk', 'gudang handak', 'gudang detonator', 'gudang bahan kimia', 'gudang', 'warehouse', 'storage', 'stockpile', 'bunker'] },
                    { category: 'Tangki, Silo, Hopper & Bunker', keys: ['fuel tank', 'oil tank', 'water tank', 'cement silo', 'clinker silo', 'fly ash silo', 'cf silo', 'blending silo', 'emergency hopper', 'feed bin', 'bak penampungan', 'tangki', 'tank', 'silo', 'hopper', 'bin', 'bunker', 'reservoir', 'receiver', 'vessel'] },
                    { category: 'Kendaraan', keys: ['sepeda motor', 'mini bus', 'pick up', 'dump truck', 'fire truck', 'mobil pemadam', 'land cruiser', 'nomor polisi', 'mobil', 'kendaraan', 'sedan', 'jeep', 'minibus', 'pickup', 'truk', 'truck', 'ambulance', 'toyota', 'hilux', 'innova', 'avanza', 'pajero', 'kijang', 'dyna', 'nissan', 'hino', 'mitsubishi', 'triton', 'isuzu', 'daihatsu', 'honda', 'suzuki'] },
                    { category: 'Alat Berat & Mobile Equipment', keys: ['alat berat', 'heavy equipment', 'wheel loader', 'front loader', 'front shovel', 'mobile crane', 'overhead crane', 'fork lift', 'dump truck', 'bulldozer', 'dozer', 'excavator', 'backhoe', 'back hoe', 'loader', 'shovel', 'crane', 'hoist', 'forklift', 'grader', 'scraper', 'komatsu', 'caterpillar', 'hitachi'] },
                    { category: 'Mesin & Peralatan Pabrik', keys: ['crushing plant', 'hammer crusher', 'limestone crusher', 'clay crusher', 'silica crusher', 'coal crusher', 'rotary kiln', 'clinker cooler', 'raw mill', 'cement mill', 'finish mill', 'coal mill', 'atox mill', 'grinding plant', 'packing machine', 'mesin', 'machine', 'machinery', 'machinary', 'equipment', 'crusher', 'kiln', 'preheater', 'cooler', 'mill', 'separator', 'boiler', 'turbine', 'generator', 'genset', 'packer', 'pecker'] },
                    { category: 'Conveyor & Transport Material', keys: ['belt conveyor', 'screw conveyor', 'chain conveyor', 'pan conveyor', 'drag conveyor', 'drag chain', 'bucket elevator', 'belt bucket elevator', 'apron feeder', 'rotary feeder', 'weigh feeder', 'bridge reclaimer', 'air slide', 'spillage conveyor', 'transfer tower', 'material transport', 'clinker transport', 'cement transport', 'conveyor', 'feeder', 'reclaimer', 'stacker', 'tripper', 'gallery'] },
                    { category: 'Motor, Drive & Gearbox', keys: ['motor listrik', 'electric motor', 'geared motor', 'drive motor', 'conveyor motor', 'fan motor', 'pump motor', 'motor starter', 'variable frequency drive', 'gear box', 'gear unit', 'motor', 'starter', 'vfd', 'drive', 'gearbox', 'reducer', 'transmission', 'coupling', 'clutch', 'shaft', 'bearing', 'rotor', 'stator', 'pulley'] },
                    { category: 'Pompa, Kompresor, Blower & Fan', keys: ['water pump', 'oil pump', 'fuel pump', 'dosing pump', 'injection pump', 'transfer pump', 'vacuum pump', 'air compressor', 'compression station', 'rotary blower', 'id fan', 'fd fan', 'cooler fan', 'exhaust fan', 'ventilation fan', 'air receiver', 'pompa', 'pump', 'compressor', 'compresor', 'blower', 'fan'] },
                    { category: 'Kelistrikan & Pembangkit', keys: ['power plant', 'power station', 'power supply', 'turbine generator', 'gardu induk', 'switch gear', 'distribution board', 'capacitor bank', 'circuit breaker', 'transmission line', 'jaringan listrik', 'listrik', 'electrical', 'electric', 'generator', 'genset', 'transformer', 'trafo', 'substation', 'sub-station', 'gardu', 'mcc', 'switchgear', 'cubicle', 'feeder', 'incoming feeder', 'outgoing feeder', 'panel', 'pdb', 'inverter', 'ups', 'rectifier', 'battery', 'cable', 'kabel', 'busbar', 'bus tie', 'bus listrik', 'mcb'] },
                    { category: 'Instrumentasi, Kontrol & Otomasi', keys: ['control panel', 'local control panel', 'control room', 'flow meter', 'pressure meter', 'level meter', 'level switch', 'pressure switch', 'flow switch', 'load cell', 'weighing system', 'control valve', 'limit switch', 'instrument', 'instrumentation', 'transmitter', 'transmiter', 'sensor', 'analyzer', 'analyser', 'plc', 'dcs', 'automation', 'lcp', 'ccr', 'meter', 'monitor', 'interlock', 'actuator', 'positioner'] },
                    { category: 'Sistem Air, Cooling & Plumbing', keys: ['water system', 'water supply', 'water treatment', 'waste water', 'wastewater', 'potable water', 'portable water', 'cooling water', 'cooling tower', 'circulating water', 'demineralized water', 'water intake', 'pumping station', 'pump house', 'bak air', 'settling pond', 'water pond', 'recooling', 'desalination', 'pipa', 'pipe', 'piping', 'valve', 'reservoir'] },
                    { category: 'Bahan Bakar, Pelumas & Gas', keys: ['bahan bakar', 'bunker oil', 'bunker c oil', 'fuel pump', 'fuel tank', 'oil pump', 'coal burner', 'fuel distribution', 'fuel', 'solar', 'diesel', 'oil', 'oli', 'lubrication', 'lubricator', 'pelumas', 'grease', 'gas', 'burner'] },
                    { category: 'Packing Plant, Loading & Dispatch', keys: ['packing plant', 'cement packer', 'packing machine', 'bag making plant', 'paper sack', 'kantong semen', 'tubing machine', 'cement loading', 'bulk cement', 'semen curah', 'ship loading', 'ship unloading', 'truck loading', 'truck loader', 'loading spout', 'cement dispatch', 'packer', 'loading', 'unloading', 'jumbo', 'penjumboan'] },
                    { category: 'Workshop, Bengkel & Perkakas', keys: ['work shop', 'mechanical shop', 'electrical shop', 'carpenter shop', 'maintenance shop', 'tool box', 'mesin las', 'mesin bor', 'cutting machine', 'cutting torch', 'mesin potong', 'mesin rumput', 'workshop', 'bengkel', 'tool', 'tools', 'welding', 'welder', 'drill', 'grinder', 'hammer', 'palu', 'wrench', 'kunci', 'jack', 'dongkrak', 'chain block', 'makita'] },
                    { category: 'Komponen & Spare Part', keys: ['spare part', 'mechanical seal', 'bag filter', 'slide gate', 'spare', 'part', 'component', 'bearing', 'shaft', 'gear', 'gearbox', 'coupling', 'seal', 'belt', 'chain', 'roller', 'pulley', 'impeller', 'rotor', 'stator', 'liner', 'plate', 'filter', 'valve', 'gate', 'damper', 'flap', 'nozzle', 'spring', 'bolt', 'nut', 'casing', 'housing'] },
                    { category: 'IT, Komunikasi & Software', keys: ['personal komputer', 'note book', 'laser printer', 'jaringan komputer', 'pesawat telepon', 'radio link', 'handy talky', 'microsoft office', 'komputer', 'pc', 'desktop', 'laptop', 'notebook', 'server', 'monitor', 'printer', 'scanner', 'modem', 'network', 'telephone', 'telepon', 'radio', 'ht', 'icom', 'cctv', 'camera', 'fax', 'software', 'license', 'lisensi', 'programming'] },
                    { category: 'Peralatan Kantor & Furniture', keys: ['meja biro', 'meja kerja', 'kursi kerja', 'kursi tamu', 'lemari besi', 'filing cabinet', 'filling kabinet', 'rak arsip', 'tempat tidur', 'mesin ketik', 'mesin hitung', 'papan tulis', 'meja', 'kursi', 'lemari', 'kabinet', 'cabinet', 'rak', 'sofa', 'bed', 'kalkulator', 'brankas'] },
                    { category: 'HVAC & Peralatan Elektronik Rumah Tangga', keys: ['air conditioner', 'air conditioning', 'ac split', 'lemari es', 'kompor gas', 'mesin cuci', 'water heater', 'kipas angin', 'ac', 'split', 'ahu', 'ventilation', 'exhaust', 'kulkas', 'refrigerator', 'televisi', 'tv', 'kompor', 'dispenser', 'laundry'] },
                    { category: 'Laboratorium & QA/QC', keys: ['quality control', 'spectro photo meter', 'x-ray', 'ph meter', 'moisture analyzer', 'alat uji beton', 'lab beton', 'laboratorium', 'laboratory', 'lab', 'qc', 'qa', 'analyzer', 'spectrophotometer', 'xrd', 'xrf', 'microscope', 'mikroskop', 'calorimeter', 'sampler', 'balance', 'timbangan', 'weighing', 'oven', 'furnace'] },
                    { category: 'K3, Pemadam & Keamanan', keys: ['fire fighting', 'mobil pemadam', 'fire truck', 'fire alarm', 'smoke detector', 'safety valve', 'pos keamanan', 'pos penjagaan', 'guard house', 'pagar pengaman', 'k3', 'safety', 'pemadam', 'hydrant', 'apar', 'emergency', 'security', 'satpam', 'portir', 'cctv'] },
                    { category: 'Lingkungan, Limbah & Pengendalian Debu', keys: ['limbah b3', 'tps limbah b3', 'settling pond', 'cooling pond', 'slag pond', 'dust collector', 'dust transport', 'bag filter', 'baghouse', 'jet pulse filter', 'electrostatic precipitator', 'emission monitor', 'opacity monitor', 'penahan debu', 'limbah', 'waste', 'wastewater', 'sewage', 'presipitator', 'esp', 'ep', 'dedusting', 'cyclone'] },
                    { category: 'Bahan Kimia & Bahan Peledak', keys: ['amonium nitrat', 'amonium nitrate', 'ammonium nitrate', 'bahan peledak', 'chemical storage', 'bahan kimia', 'chemical', 'reagent', 'dynamit', 'dinamit', 'explosive', 'detonator', 'handak', 'acid', 'caustic', 'chlorine'] },
                    { category: 'Proyek, Modifikasi & Aset Kontinjensi', keys: ['asset kontinjensi', 'aset kontinjensi', 'proyek', 'project', 'capex', 'addition', 'additional', 'add', 'penambahan', 'tambahan', 'perluasan', 'modification', 'modifikasi', 'renovation', 'renovasi', 'retrofit', 'replacement', 'replace', 'penggantian', 'repair', 'perbaikan', 'strengthening', 'perkuatan', 'upgrade', 'revamping'] }
                ];
                
                let allKeys = [];
                RAW_MAPPINGS.forEach(mapping => {
                    mapping.keys.forEach(k => {
                        allKeys.push({ key: k.toLowerCase(), category: mapping.category });
                    });
                });
                
                // Urutkan berdasarkan panjang kunci (descending) 
                // agar frasa panjang (seperti "motor listrik") dicek sebelum kata tunggal ("motor")
                allKeys.sort((a, b) => b.key.length - a.key.length);

                let inferredCategoryName = 'Umum';
                for (const item of allKeys) {
                    // Gunakan regex boundaries untuk memastikan pencocokan kata yang tepat
                    const regex = new RegExp(`(?:^|\\W)${item.key}(?:\\W|$)`);
                    if (regex.test(lowerText)) {
                        inferredCategoryName = item.category;
                        break;
                    }
                }
                
                if (inferredCategoryName === 'Umum' && categoryName) {
                    inferredCategoryName = categoryName;
                }

                categoryId = categoryMap[inferredCategoryName.toLowerCase()];
                if (!categoryId) {
                    categoryId = await getOrCreateCategory(inferredCategoryName);
                    categoryMap[inferredCategoryName.toLowerCase()] = categoryId;
                }
            }

            if (!asset_number || !name || !categoryId) {
                continue;
            }

            const location = item.location || null;
            const location_grup = item.location_grup || null;

            const function_status = item.function_status || 'Baik';
            const performance_status = item.performance_status || 'Optimal';

            let itemApproved = isApproved;
            if (itemApproved === 'Pending') {
                anyPending = true;
            }

            mapped.push({
                asset_number,
                equipment_number: item.equipment_number || `EQ-${year}-${String(++currentCount).padStart(3, '0')}`,
                name,
                categoryId,
                location,
                location_grup,
                specification,
                function_status,
                performance_status,
                itemApproved
            });
        }

        if (mapped.length > 0) {
            const client = await db.pool.connect();
            try {
                await client.query("BEGIN");
                
                for (const row of mapped) {
                    const res = await client.query(`
                        INSERT INTO assets (asset_number, equipment_number, name, category_id, location, location_grup, specification, function_status, performance_status, created_by, status_approval) 
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
                    [
                        row.asset_number, row.equipment_number, row.name, row.categoryId, row.location, row.location_grup, row.specification, row.function_status, row.performance_status, req.user.id, row.itemApproved
                    ]);
                    
                    const newAssetId = res.rows[0].id;
                    if (row.itemApproved === 'Approved') {
                        await client.query("INSERT INTO asset_history (asset_id, field_changed, old_value, new_value, changed_by) VALUES ($1, $2, $3, $4, $5)", [newAssetId, 'asset_created', null, 'Aset baru didaftarkan lewat impor Excel', req.user.id]);
                    } else {
                        await client.query("INSERT INTO asset_history (asset_id, field_changed, old_value, new_value, changed_by) VALUES ($1, $2, $3, $4, $5)", [newAssetId, 'status_approval', null, 'Menunggu persetujuan Admin (Impor Excel)', req.user.id]);
                    }
                }
                
                await client.query("COMMIT");
            } catch (errTx) {
                await client.query("ROLLBACK");
                throw errTx;
            } finally {
                client.release();
            }
        }

        broadcastEvent('ASSET_CHANGED');
        res.status(201).json({ 
            message: !anyPending 
                ? 'Semua aset berhasil diimpor.' 
                : 'Aset berhasil diimpor. Aset dengan status Mutasi/yang memerlukan persetujuan sedang menunggu persetujuan Admin.' 
        });

    } catch (error) {
        console.error("Bulk upload error:", error);
        res.status(500).json({ message: 'Gagal mengimpor aset: ' + error.message });
    }
});

app.put('/api/assets/:id', authenticateToken, (req, res) => {
    const assetId = req.params.id;
    const { name, asset_number, equipment_number, category_id, location, location_grup, specification, function_status, performance_status, reason, photo_proof, land_area } = req.body;

    if (!name || !asset_number || !category_id) {
        return res.status(400).json({ message: 'Field name, asset_number, dan category_id wajib diisi.' });
    }

    db.get("SELECT * FROM assets WHERE id = ?", [assetId], async (err, oldAsset) => {
        if (err || !oldAsset) return res.status(404).json({ message: 'Asset not found.' });

        if (req.user.role !== 'admin' && req.user.role !== 'admin_utama') {
            if (oldAsset.created_by !== req.user.id) {
                return res.status(403).json({ message: 'Akses ditolak: Anda hanya dapat mengedit aset yang Anda tambahkan sendiri.' });
            }
        }

        let locationChanged = oldAsset.location !== location || oldAsset.location_grup !== location_grup;
        let isApproved = req.user.role === 'admin' || req.user.role === 'admin_utama' ? 'Approved' : 'Pending';
        if (locationChanged && req.user.role !== 'admin_utama') {
            isApproved = 'Pending';
        }
        
        let relativePhotoPath;
        try {
            relativePhotoPath = await saveAssetPhoto(photo_proof) || oldAsset.photo_proof;
        } catch (error) {
            return res.status(400).json({ message: error.message });
        }

        const newValues = { name, asset_number, equipment_number, category_id, location, location_grup, specification, function_status, performance_status, photo_proof: relativePhotoPath, land_area };
        
        let finalReason = reason;
        if (locationChanged) {
            if (!finalReason) {
                finalReason = `Mutasi ke ${location || location_grup || 'lokasi baru'}`;
            } else if (!finalReason.toLowerCase().includes('mutasi')) {
                finalReason = `Mutasi: ${finalReason}`;
            }
        }
        
        db.serialize(() => {
            db.run(`UPDATE assets SET name = ?, asset_number = ?, equipment_number = ?, category_id = ?, location = ?, location_grup = ?, specification = ?, function_status = ?, performance_status = ?, status_approval = ?, rejection_reason = null, change_reason = ?, photo_proof = ?, land_area = ? WHERE id = ?`,
                [name, asset_number, equipment_number, category_id, location, location_grup, specification, function_status, performance_status, isApproved, finalReason || null, relativePhotoPath, land_area || null, assetId]);
            
            const stmt = db.prepare("INSERT INTO asset_history (asset_id, field_changed, old_value, new_value, changed_by) VALUES (?, ?, ?, ?, ?)");
            for (let field in newValues) {
                if (String(oldAsset[field] !== null ? oldAsset[field] : '') !== String(newValues[field] !== null ? newValues[field] : '')) {
                    let valToSave = newValues[field];
                    if ((field === 'function_status' || field === 'performance_status') && reason) {
                        valToSave += ` (Alasan: ${reason})`;
                    }
                    stmt.run([assetId, field, String(oldAsset[field]), String(valToSave), req.user.id]);
                }
            }
            stmt.finalize();

            if (isApproved === 'Pending' && oldAsset.status_approval !== 'Pending') {
                db.run("INSERT INTO asset_history (asset_id, field_changed, old_value, new_value, changed_by) VALUES (?, ?, ?, ?, ?)",
                    [assetId, 'status_approval', oldAsset.status_approval, 'Pending (Perubahan data oleh ' + req.user.role + ')', req.user.id]);
            }
            
            broadcastEvent('ASSET_CHANGED');
            res.json({ message: isApproved === 'Approved' ? 'Aset berhasil diupdate.' : 'Perubahan aset berhasil diajukan, menunggu persetujuan Admin.' });
        });
    });
});

app.delete('/api/assets/:id', authenticateToken, authorizeRole(['admin']), (req, res) => {
    const assetId = req.params.id;
    db.run("UPDATE assets SET is_deleted = 1, deleted_at = datetime('now', 'localtime'), deleted_by = ? WHERE id = ?", [req.user.id, assetId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        db.run("INSERT INTO asset_history (asset_id, field_changed, old_value, new_value, changed_by) VALUES (?, ?, ?, ?, ?)",
            [assetId, 'is_deleted', '0', '1', req.user.id], () => {
                broadcastEvent('ASSET_CHANGED');
                res.json({ message: 'Aset berhasil dihapus secara soft-delete.' });
            }
        );
    });
});

app.post('/api/assets/bulk-delete', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Tidak ada aset yang dipilih untuk dihapus.' });
    }

    const client = await db.pool.connect();
    try {
        await client.query("BEGIN");

        const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');
        const updateParams = [req.user.id, ...ids];
        const updateQuery = `UPDATE assets SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, deleted_by = $1 WHERE id IN (${placeholders})`;

        await client.query(updateQuery, updateParams);

        for (const assetId of ids) {
            await client.query("INSERT INTO asset_history (asset_id, field_changed, old_value, new_value, changed_by) VALUES ($1, $2, $3, $4, $5)",
            [assetId, 'is_deleted', '0', '1', req.user.id]);
        }

        await client.query("COMMIT");
        broadcastEvent('ASSET_CHANGED');
        res.json({ message: `${ids.length} aset berhasil dihapus secara massal.` });
    } catch (err) {
        await client.query("ROLLBACK");
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// =======================
// PERSETUJUAN (APPROVAL)
// =======================
app.get('/api/approvals', authenticateToken, authorizeRole(['admin']), (req, res) => {
    db.all(`
        SELECT a.*, c.name as category_name, u.name as created_by_name 
        FROM assets a 
        LEFT JOIN categories c ON a.category_id = c.id
        LEFT JOIN users u ON a.created_by = u.id
        WHERE a.is_deleted = 0 AND a.status_approval IN ('Pending', 'Rejected')
        ORDER BY a.id DESC
    `, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/approvals/count', authenticateToken, authorizeRole(['admin']), (req, res) => {
    db.get("SELECT COUNT(*) as count FROM assets WHERE is_deleted = 0 AND status_approval = 'Pending'", (err, row) => {
        res.json({ count: Number(row?.count || 0) });
    });
});

app.get('/api/notifications/count', authenticateToken, (req, res) => {
    if (req.user.role === 'admin' || req.user.role === 'admin_utama') {
        db.get("SELECT COUNT(*) as count FROM assets WHERE is_deleted = 0 AND status_approval = 'Pending'", (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ count: row ? parseInt(row.count, 10) : 0 });
        });
    } else {
        db.get("SELECT COUNT(*) as count FROM assets WHERE is_deleted = 0 AND status_approval = 'Rejected' AND created_by = ?", [req.user.id], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ count: row ? parseInt(row.count, 10) : 0 });
        });
    }
});

app.post('/api/approvals/:id/approve', authenticateToken, authorizeRole(['admin']), (req, res) => {
    const assetId = req.params.id;
    db.run("UPDATE assets SET status_approval = 'Approved', rejection_reason = null, change_reason = null WHERE id = ?", [assetId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        db.run("INSERT INTO asset_history (asset_id, field_changed, old_value, new_value, changed_by) VALUES (?, ?, ?, ?, ?)",
            [assetId, 'status_approval', 'Pending', 'Approved', req.user.id], () => {
                broadcastEvent('ASSET_CHANGED');
                res.json({ message: 'Aset berhasil disetujui.' });
            }
        );
    });
});

app.post('/api/approvals/bulk-approve', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Tidak ada aset yang dipilih.' });
    }

    const client = await db.pool.connect();
    try {
        await client.query("BEGIN");

        const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
        const updateParams = [...ids];
        const updateQuery = `UPDATE assets SET status_approval = 'Approved', rejection_reason = null, change_reason = null WHERE id IN (${placeholders})`;

        await client.query(updateQuery, updateParams);

        for (const id of ids) {
            await client.query("INSERT INTO asset_history (asset_id, field_changed, old_value, new_value, changed_by) VALUES ($1, $2, $3, $4, $5)",
            [id, 'status_approval', 'Pending', 'Approved', req.user.id]);
        }

        await client.query("COMMIT");
        broadcastEvent('ASSET_CHANGED');
        res.json({ message: `${ids.length} aset berhasil disetujui.` });
    } catch (err) {
        await client.query("ROLLBACK");
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.post('/api/approvals/bulk-reject', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const { ids, rejection_reason } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Tidak ada aset yang dipilih.' });
    }

    const client = await db.pool.connect();
    try {
        await client.query("BEGIN");

        const reason = rejection_reason || 'Ditolak tanpa alasan spesifik';
        const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');
        const updateParams = [reason, ...ids];
        const updateQuery = `UPDATE assets SET status_approval = 'Rejected', rejection_reason = $1 WHERE id IN (${placeholders})`;

        await client.query(updateQuery, updateParams);

        for (const id of ids) {
            await client.query("INSERT INTO asset_history (asset_id, field_changed, old_value, new_value, changed_by) VALUES ($1, $2, $3, $4, $5)",
            [id, 'status_approval', 'Pending', `Rejected (Alasan: ${reason})`, req.user.id]);
        }

        await client.query("COMMIT");
        broadcastEvent('ASSET_CHANGED');
        res.json({ message: `${ids.length} aset berhasil ditolak.` });
    } catch (err) {
        await client.query("ROLLBACK");
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.post('/api/approvals/:id/reject', authenticateToken, authorizeRole(['admin']), (req, res) => {
    const assetId = req.params.id;
    const { rejection_reason } = req.body;
    db.run("UPDATE assets SET status_approval = 'Rejected', rejection_reason = ? WHERE id = ?", [rejection_reason || 'Ditolak tanpa alasan spesifik', assetId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        db.run("INSERT INTO asset_history (asset_id, field_changed, old_value, new_value, changed_by) VALUES (?, ?, ?, ?, ?)",
            [assetId, 'status_approval', 'Pending', `Rejected (Alasan: ${rejection_reason || 'Tidak ada'})`, req.user.id], () => {
                broadcastEvent('ASSET_CHANGED');
                res.json({ message: 'Aset telah ditolak.' });
            }
        );
    });
});



// =======================
// MANAGEMENT AKUN (USERS)
// =======================
app.get('/api/users', authenticateToken, authorizeRole(['admin_utama']), (req, res) => {
    db.all("SELECT id, name, email, role FROM users WHERE is_deleted = 0 ORDER BY id DESC", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const mapped = rows.map(u => ({
            ...u,
            role: (u.role === 'operator' || u.role === 'karyawan') ? 'user' : u.role
        }));
        res.json(mapped);
    });
});

app.post('/api/users', authenticateToken, authorizeRole(['admin_utama']), async (req, res) => {
    let { name, email, password, role } = req.body;
    if (role === 'user') {
        role = 'operator';
    }
    if (!['admin_utama', 'admin', 'operator', 'karyawan'].includes(role)) {
        return res.status(400).json({ message: 'Peran tidak valid.' });
    }
    if (role === 'admin_utama' && req.user.role !== 'admin_utama') {
        return res.status(403).json({ message: 'Hanya Admin Utama yang dapat membuat akun Admin Utama.' });
    }
    try {
        const hash = await bcrypt.hash(password, 10);
        db.run("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
            [name, email, hash, role],
            function(err) {
                if (err) {
                    if (err.code === '23505') {
                        return res.status(400).json({ message: 'Email sudah terdaftar.' });
                    }
                    return res.status(500).json({ error: err.message });
                }
                const newUserId = this.lastID;
                const displayRole = (role === 'operator' || role === 'karyawan') ? 'user' : role;
                db.run("INSERT INTO user_history (user_id, field_changed, old_value, new_value, changed_by) VALUES (?, ?, ?, ?, ?)",
                    [newUserId, 'user_created', null, `Akun ${name} dengan role ${displayRole} didaftarkan`, req.user.id]);
                res.status(201).json({ id: newUserId, message: 'Akun pengguna berhasil ditambahkan.' });
            }
        );
    } catch (err) {
        res.status(500).json({ message: 'Gagal memproses password.' });
    }
});

app.put('/api/users/:id', authenticateToken, authorizeRole(['admin_utama']), async (req, res) => {
    let { name, email, password, role } = req.body;
    if (role === 'user') {
        role = 'operator';
    }
    
    db.get("SELECT name, email, role FROM users WHERE id = ?", [req.params.id], (err, oldUser) => {
        if (err || !oldUser) return res.status(404).json({ message: 'User tidak ditemukan.' });
        
        if (!['admin_utama', 'admin', 'operator', 'karyawan'].includes(role)) {
            return res.status(400).json({ message: 'Peran tidak valid.' });
        }
        
        if (req.user.role === 'admin') {
            if (req.user.id !== parseInt(req.params.id) && (oldUser.role === 'admin_utama' || oldUser.role === 'admin')) {
                return res.status(403).json({ message: 'Admin tidak diperbolehkan mengubah data sesama Admin atau Admin Utama.' });
            }
            if (role === 'admin_utama') {
                return res.status(403).json({ message: 'Hanya Admin Utama yang dapat menetapkan peran Admin Utama.' });
            }
        }
        
        const executeUpdate = (hash) => {
            let query = "UPDATE users SET name = ?, email = ?, role = ?";
            const params = [name, email, role];
            if (hash) {
                query += ", password_hash = ?";
                params.push(hash);
            }
            query += " WHERE id = ? AND is_deleted = 0";
            params.push(req.params.id);
            
            db.run(query, params, function(err2) {
                if (err2) {
                    if (err2.code === '23505') {
                        return res.status(400).json({ message: 'Email sudah terdaftar.' });
                    }
                    return res.status(500).json({ error: err2.message });
                }
                
                const newValues = { name, email, role };
                const stmt = db.prepare("INSERT INTO user_history (user_id, field_changed, old_value, new_value, changed_by) VALUES (?, ?, ?, ?, ?)");
                for (let field in newValues) {
                    if (String(oldUser[field]) !== String(newValues[field])) {
                        stmt.run([req.params.id, field, String(oldUser[field]), String(newValues[field]), req.user.id]);
                    }
                }
                if (hash) {
                    stmt.run([req.params.id, 'password_hash', '••••••••', 'Diubah', req.user.id]);
                }
                stmt.finalize();
                
                res.json({ message: 'Akun pengguna berhasil diperbarui.' });
            });
        };

        if (password) {
            bcrypt.hash(password, 10).then(executeUpdate).catch(() => res.status(500).json({ message: 'Gagal memproses password.' }));
        } else {
            executeUpdate(null);
        }
    });
});

app.delete('/api/users/:id', authenticateToken, authorizeRole(['admin_utama']), (req, res) => {
    const userId = req.params.id;
    if (parseInt(userId) === req.user.id) {
        return res.status(400).json({ message: 'Anda tidak dapat menghapus akun Anda sendiri.' });
    }
    
    db.get("SELECT email, role FROM users WHERE id = ?", [userId], (err, u) => {
        if (err || !u) return res.status(404).json({ message: 'User tidak ditemukan.' });
        
        if (req.user.role === 'admin' && (u.role === 'admin_utama' || u.role === 'admin')) {
            return res.status(403).json({ message: 'Admin tidak diperbolehkan menghapus sesama Admin atau Admin Utama.' });
        }
        
        const suffix = `_deleted_${Date.now()}`;
        const newEmail = u.email + suffix;
        
        db.run("UPDATE users SET is_deleted = 1, email = ?, deleted_at = datetime('now', 'localtime') WHERE id = ?", 
            [newEmail, userId], 
            function(err2) {
                if (err2) return res.status(500).json({ error: err2.message });
                
                db.run("INSERT INTO user_history (user_id, field_changed, old_value, new_value, changed_by) VALUES (?, ?, ?, ?, ?)",
                    [userId, 'is_deleted', '0', '1', req.user.id]);
                res.json({ message: 'Akun berhasil dihapus secara soft-delete.' });
            }
        );
    });
});

app.post('/api/auth/impersonate/:id', authenticateToken, authorizeRole(['admin_utama']), (req, res) => {
    const targetUserId = req.params.id;
    db.get("SELECT * FROM users WHERE id = ? AND is_deleted = 0", [targetUserId], (err, targetUser) => {
        if (err || !targetUser) return res.status(404).json({ message: 'Pengguna target tidak ditemukan atau tidak aktif.' });
        
        if (req.user.role === 'admin' && (targetUser.role === 'admin_utama' || targetUser.role === 'admin')) {
            return res.status(403).json({ message: 'Admin tidak dapat melakukan login as ke sesama Admin atau Admin Utama.' });
        }
        
        const token = jwt.sign(
            { id: targetUser.id, email: targetUser.email, role: targetUser.role, name: targetUser.name }, 
            SECRET_KEY, 
            { expiresIn: '8h' }
        );
        res.json({ token, user: { id: targetUser.id, name: targetUser.name, role: targetUser.role } });
    });
});

// =======================
// LAPORAN AUDIT API
// =======================
app.get('/api/reports/audit', authenticateToken, (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const offset = (page - 1) * limit;
    const { start_date, end_date, category, search } = req.query;

    let baseQuery = `
        FROM asset_history h
        LEFT JOIN users u ON h.changed_by = u.id
        LEFT JOIN assets a ON h.asset_id = a.id
        LEFT JOIN categories c ON a.category_id = c.id
        WHERE 1=1
    `;
    const params = [];

    if (start_date) {
        baseQuery += " AND date(h.changed_at) >= date(?)";
        params.push(start_date);
    }
    if (end_date) {
        baseQuery += " AND date(h.changed_at) <= date(?)";
        params.push(end_date);
    }
    if (category) {
        baseQuery += " AND a.category_id = ?";
        params.push(category);
    }
    if (search) {
        baseQuery += " AND (a.name LIKE ? OR a.asset_number LIKE ? OR u.name LIKE ? OR h.field_changed LIKE ? OR h.old_value LIKE ? OR h.new_value LIKE ?)";
        const sq = `%${search}%`;
        params.push(sq, sq, sq, sq, sq, sq);
    }

    db.get(`SELECT COUNT(*) as count ${baseQuery}`, params, (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        const total = row ? row.count : 0;
        
        const selectQuery = `
            SELECT h.*, u.name as actor_name, a.asset_number, a.name as asset_name, c.name as category_name
            ${baseQuery}
            ORDER BY h.id DESC LIMIT ? OFFSET ?
        `;
        db.all(selectQuery, [...params, limit, offset], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ data: rows, total });
        });
    });
});

app.delete('/api/history/logs/assets/permanent', authenticateToken, authorizeRole(['admin']), (req, res) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'Tidak ada data yang dipilih.' });
    
    const placeholders = ids.map(() => '?').join(',');
    db.run(`DELETE FROM asset_history WHERE id IN (${placeholders})`, ids, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Riwayat audit berhasil dihapus secara permanen.' });
    });
});

// =======================
// SYSTEM WIDE HISTORY & RESTORE API
// =======================
app.get('/api/history/deleted-assets', authenticateToken, authorizeRole(['admin']), (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    let baseQuery = `
        FROM assets a 
        LEFT JOIN categories c ON a.category_id = c.id
        LEFT JOIN users u ON a.deleted_by = u.id
        WHERE a.is_deleted = 1
    `;
    const params = [];

    if (search) {
        baseQuery += " AND (a.name LIKE ? OR a.asset_number LIKE ? OR a.location LIKE ?)";
        const sq = `%${search}%`;
        params.push(sq, sq, sq);
    }

    db.get(`SELECT COUNT(*) as count ${baseQuery}`, params, (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        const total = row ? row.count : 0;
        
        db.all(`
            SELECT a.*, c.name as category_name, u.name as deleted_by_name 
            ${baseQuery}
            ORDER BY a.deleted_at DESC LIMIT ? OFFSET ?
        `, [...params, limit, offset], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ data: rows, total });
        });
    });
});

app.delete('/api/history/assets/permanent', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'Tidak ada data yang dipilih.' });
    
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    
    const client = await db.pool.connect();
    try {
        await client.query("BEGIN");
        
        await client.query(`DELETE FROM asset_history WHERE asset_id IN (${placeholders})`, ids);
        await client.query(`DELETE FROM assets WHERE id IN (${placeholders}) AND is_deleted = 1`, ids);
        
        await client.query("COMMIT");
        res.json({ message: 'Aset berhasil dihapus secara permanen beserta log riwayatnya.' });
    } catch (err) {
        await client.query("ROLLBACK");
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.post('/api/assets/:id/restore', authenticateToken, authorizeRole(['admin']), (req, res) => {
    const assetId = req.params.id;
    db.run("UPDATE assets SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL WHERE id = ?", [assetId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        db.run("INSERT INTO asset_history (asset_id, field_changed, old_value, new_value, changed_by) VALUES (?, ?, ?, ?, ?)",
            [assetId, 'is_deleted', '1', '0', req.user.id], () => {
                broadcastEvent('ASSET_CHANGED');
                res.json({ message: 'Aset berhasil dipulihkan.' });
            }
        );
    });
});



app.get('/api/history/deleted-users', authenticateToken, authorizeRole(['admin']), (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    let baseQuery = `FROM users WHERE is_deleted = 1`;
    const params = [];

    if (search) {
        baseQuery += " AND (name LIKE ? OR email LIKE ? OR role LIKE ?)";
        const sq = `%${search}%`;
        params.push(sq, sq, sq);
    }

    db.get(`SELECT COUNT(*) as count ${baseQuery}`, params, (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        const total = row ? row.count : 0;
        
        db.all(`
            SELECT id, name, email, role, deleted_at 
            ${baseQuery}
            ORDER BY deleted_at DESC LIMIT ? OFFSET ?
        `, [...params, limit, offset], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ data: rows, total });
        });
    });
});

app.delete('/api/history/users/permanent', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'Tidak ada data yang dipilih.' });
    
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    
    const client = await db.pool.connect();
    try {
        await client.query("BEGIN");
        
        // Set NULL for foreign keys in other tables referencing this user
        await client.query(`UPDATE assets SET created_by = NULL WHERE created_by IN (${placeholders})`, ids);
        await client.query(`UPDATE assets SET deleted_by = NULL WHERE deleted_by IN (${placeholders})`, ids);
        await client.query(`UPDATE asset_history SET changed_by = NULL WHERE changed_by IN (${placeholders})`, ids);
        await client.query(`UPDATE user_history SET changed_by = NULL WHERE changed_by IN (${placeholders})`, ids);
        
        // Hapus log riwayat target pengguna (child table)
        await client.query(`DELETE FROM user_history WHERE user_id IN (${placeholders})`, ids);
        
        // Hapus pengguna utama
        await client.query(`DELETE FROM users WHERE id IN (${placeholders}) AND is_deleted = 1`, ids);
        
        await client.query("COMMIT");
        res.json({ message: 'Pengguna berhasil dihapus secara permanen.' });
    } catch (err) {
        await client.query("ROLLBACK");
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.post('/api/users/:id/restore', authenticateToken, authorizeRole(['admin']), (req, res) => {
    const userId = req.params.id;
    db.get("SELECT email, role FROM users WHERE id = ? AND is_deleted = 1", [userId], (err, u) => {
        if (err || !u) return res.status(404).json({ message: 'Akun terhapus tidak ditemukan.' });
        
        if (req.user.role === 'admin' && (u.role === 'admin_utama' || u.role === 'admin')) {
            return res.status(403).json({ message: 'Admin tidak diperbolehkan memulihkan sesama Admin atau Admin Utama.' });
        }
        
        const origEmail = u.email.replace(/_deleted_\d+$/, '');
        
        db.get("SELECT id FROM users WHERE email = ? AND is_deleted = 0", [origEmail], (err2, activeUser) => {
            if (err2) return res.status(500).json({ error: err2.message });
            if (activeUser) {
                return res.status(400).json({ message: 'Gagal memulihkan. Email ini sudah digunakan oleh akun aktif lain.' });
            }
            
            db.run("UPDATE users SET is_deleted = 0, email = ?, deleted_at = NULL WHERE id = ?", [origEmail, userId], function(err3) {
                if (err3) return res.status(500).json({ error: err3.message });
                
                db.run("INSERT INTO user_history (user_id, field_changed, old_value, new_value, changed_by) VALUES (?, ?, ?, ?, ?)",
                    [userId, 'is_deleted', '1', '0', req.user.id], () => {
                        res.json({ message: 'Akun pengguna berhasil dipulihkan.' });
                    }
                );
            });
        });
    });
});

app.get('/api/history/logs/assets', authenticateToken, authorizeRole(['admin']), (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    let baseQuery = `
        FROM asset_history h 
        LEFT JOIN assets a ON h.asset_id = a.id 
        LEFT JOIN users u ON h.changed_by = u.id 
        WHERE 1=1
    `;
    const params = [];

    if (search) {
        baseQuery += " AND (a.name LIKE ? OR a.asset_number LIKE ? OR u.name LIKE ? OR h.field_changed LIKE ? OR h.old_value LIKE ? OR h.new_value LIKE ?)";
        const sq = `%${search}%`;
        params.push(sq, sq, sq, sq, sq, sq);
    }

    db.get(`SELECT COUNT(*) as count ${baseQuery}`, params, (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        const total = row ? row.count : 0;
        
        db.all(`
            SELECT h.*, a.name as asset_name, a.asset_number, u.name as actor_name 
            ${baseQuery}
            ORDER BY h.id DESC LIMIT ? OFFSET ?
        `, [...params, limit, offset], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ data: rows, total });
        });
    });
});

app.get('/api/history/logs/users', authenticateToken, authorizeRole(['admin']), (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    let baseQuery = `
        FROM user_history h 
        LEFT JOIN users u_target ON h.user_id = u_target.id 
        LEFT JOIN users u ON h.changed_by = u.id 
        WHERE 1=1
    `;
    const params = [];

    if (search) {
        baseQuery += " AND (u_target.name LIKE ? OR u.name LIKE ? OR h.field_changed LIKE ? OR h.old_value LIKE ? OR h.new_value LIKE ?)";
        const sq = `%${search}%`;
        params.push(sq, sq, sq, sq, sq);
    }

    db.get(`SELECT COUNT(*) as count ${baseQuery}`, params, (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        const total = row ? row.count : 0;
        
        db.all(`
            SELECT h.*, u_target.name as target_name, u.name as actor_name 
            ${baseQuery}
            ORDER BY h.id DESC LIMIT ? OFFSET ?
        `, [...params, limit, offset], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ data: rows, total });
        });
    });
});

app.delete('/api/history/logs/users/permanent', authenticateToken, authorizeRole(['admin']), (req, res) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'Tidak ada data yang dipilih.' });
    
    const placeholders = ids.map(() => '?').join(',');
    db.run(`DELETE FROM user_history WHERE id IN (${placeholders})`, ids, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Riwayat pengguna berhasil dihapus secara permanen.' });
    });
});

app.get('/api/categories', authenticateToken, (req, res) => {
    db.all("SELECT * FROM categories", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/stats', authenticateToken, async (req, res) => {
    try {
        const queries = {
            total_aset: new Promise((resolve) => db.get("SELECT COUNT(*) as count FROM assets WHERE is_deleted = 0 AND status_approval = 'Approved'", (err, row) => resolve(row ? row.count : 0))),
            kondisi_baik: new Promise((resolve) => db.get("SELECT COUNT(*) as count FROM assets WHERE is_deleted = 0 AND function_status = 'Baik' AND status_approval = 'Approved'", (err, row) => resolve(row ? row.count : 0))),
            kondisi_rusak: new Promise((resolve) => db.get("SELECT COUNT(*) as count FROM assets WHERE is_deleted = 0 AND function_status = 'Rusak' AND status_approval = 'Approved'", (err, row) => resolve(row ? row.count : 0))),
            pending_approvals: new Promise((resolve) => db.get("SELECT COUNT(*) as count FROM assets WHERE is_deleted = 0 AND status_approval = 'Pending'", (err, row) => resolve(row ? row.count : 0))),
            kondisi_list: new Promise((resolve) => {
                db.all("SELECT function_status as label, COUNT(id) as value FROM assets WHERE is_deleted = 0 AND status_approval = 'Approved' GROUP BY function_status", (err, rows) => resolve(rows || []));
            }),
            status_list: new Promise((resolve) => {
                db.all("SELECT performance_status as label, COUNT(id) as value FROM assets WHERE is_deleted = 0 AND status_approval = 'Approved' GROUP BY performance_status", (err, rows) => resolve(rows || []));
            })
        };

        const [total_aset, kondisi_baik, kondisi_rusak, pending_approvals, kondisi_list, status_list] = await Promise.all([
            queries.total_aset,
            queries.kondisi_baik,
            queries.kondisi_rusak,
            queries.pending_approvals,
            queries.kondisi_list,
            queries.status_list
        ]);

        const kondisi_summary = {};
        kondisi_list.forEach(item => {
            kondisi_summary[item.label] = item.value;
        });

        const status_summary = {};
        status_list.forEach(item => {
            status_summary[item.label] = item.value;
        });

        res.json({
            total_aset,
            kondisi_baik,
            kondisi_rusak,
            pending_approvals,
            kondisi_summary,
            status_summary
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/history', authenticateToken, (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit) : 100;
    const query = `
        SELECT 'asset' as source, h.id, h.changed_at, h.field_changed, h.old_value, h.new_value, u.name as username, a.name as asset_name, h.asset_id
        FROM asset_history h
        LEFT JOIN users u ON h.changed_by = u.id
        LEFT JOIN assets a ON h.asset_id = a.id
        
        UNION ALL
        
        SELECT 'user' as source, h.id, h.changed_at, h.field_changed, h.old_value, h.new_value, u.name as username, u_target.name as asset_name, h.user_id as asset_id
        FROM user_history h
        LEFT JOIN users u ON h.changed_by = u.id
        LEFT JOIN users u_target ON h.user_id = u_target.id
        
        ORDER BY changed_at DESC
        LIMIT ?
    `;
    db.all(query, [limit], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const formatted = rows.map(r => {
            let action = '';
            let description = '';
            
            if (r.field_changed === 'asset_created') {
                action = 'Tambah Aset';
                description = `Aset baru didaftarkan: ${r.asset_name || 'Aset Baru'}`;
            } else if (r.field_changed === 'inventory_created') {
                action = 'Tambah Barang';
                description = `Barang habis pakai ditambahkan: ${r.asset_name || 'Barang Baru'}`;
            } else if (r.field_changed === 'user_created') {
                action = 'Tambah Pengguna';
                description = `Pengguna baru didaftarkan: ${r.asset_name || 'User Baru'}`;
            } else if (r.field_changed === 'is_deleted') {
                const status = r.new_value === '1' ? 'dihapus' : 'dipulihkan';
                action = r.new_value === '1' ? 'Hapus Data' : 'Pulihkan Data';
                description = `${r.source === 'asset' ? 'Aset' : r.source === 'inventory' ? 'Barang' : 'Pengguna'} "${r.asset_name || ''}" ${status}`;
            } else {
                action = 'Edit Data';
                let fieldLabel = r.field_changed;
                if (r.field_changed === 'name') fieldLabel = 'Nama';
                if (r.field_changed === 'location') fieldLabel = 'Lokasi';
                if (r.field_changed === 'specification') fieldLabel = 'Spesifikasi';
                if (r.field_changed === 'function_status') fieldLabel = 'Status Fungsi';
                if (r.field_changed === 'performance_status') fieldLabel = 'Status Kinerja';
                if (r.field_changed === 'role') fieldLabel = 'Peran';
                if (r.field_changed === 'current_stock') fieldLabel = 'Stok Saat Ini';
                
                description = `Mengubah ${fieldLabel} pada ${r.source === 'asset' ? 'aset' : r.source === 'inventory' ? 'barang' : 'pengguna'} "${r.asset_name || ''}" dari "${r.old_value || ''}" menjadi "${r.new_value || ''}"`;
            }
            
            if (description.includes('Aset dummy baru didaftarkan lewat skrip migrasi') || r.new_value === 'Aset dummy baru didaftarkan lewat skrip migrasi' || r.new_value?.includes('Aset dummy baru didaftarkan lewat skrip migrasi') || r.old_value?.includes('Aset dummy baru didaftarkan lewat skrip migrasi')) {
                description = 'Aset baru didaftarkan';
            }
            
            return {
                id: r.id,
                action,
                description,
                username: r.username || 'Sistem',
                created_at: r.changed_at,
                asset_id: r.asset_id
            };
        });
        
        res.json(formatted);
    });
});

// Jalankan Express app sebagai handler Next.js API.
export default async function handler(req, res) {
    if (!SECRET_KEY || SECRET_KEY.length < 32) {
        console.error('Atur SECRET_KEY dengan nilai acak minimal 32 karakter.');
        return res.status(503).json({ message: 'Konfigurasi server belum lengkap.' });
    }
    if (req.url.split('?')[0] !== '/api/config') {
        try {
            await db.ready();
        } catch (error) {
            console.error('Gagal menyiapkan PostgreSQL:', error.message);
            return res.status(503).json({ message: 'Database belum siap.' });
        }
    }

    return new Promise(resolve => {
        const finish = () => {
            res.off('finish', finish);
            res.off('close', finish);
            resolve();
        };
        res.on('finish', finish);
        res.on('close', finish);
        app(req, res, err => {
            if (err) {
                console.error('Express in Next.js error:', err);
                if (!res.headersSent) res.status(500).json({ message: 'Terjadi kesalahan server.' });
                else res.end();
            } else if (!res.headersSent) {
                res.status(404).json({ message: 'Rute tidak ditemukan.' });
            }
        });
    });
}

// Menonaktifkan bodyParser Next.js agar Express bebas mengurai body (misalnya limit JSON 25MB)
export const config = {
    api: {
        bodyParser: false,
        externalResolver: true,
    },
};
