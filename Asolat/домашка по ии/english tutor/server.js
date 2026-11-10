const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const templates = require('./views/templates');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.VERCEL ? '/tmp' : __dirname;
const DB_PATH = path.join(DATA_DIR, 'bookings.db');
const PUBLIC_DIR = path.join(__dirname, 'public');

const SESSION_COOKIE_NAME = 'admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24 hours

const AVAILABLE_SLOTS = [
  '09:00',
  '10:30',
  '12:00',
  '14:00',
  '15:30',
  '17:00',
  '18:30',
  '20:00'
];

const VALID_SERVICES = [
  'General English',
  'IELTS Preparation',
  'Speaking Practice',
  'Trial Lesson'
];

const VALID_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'];

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, salt, storedHashHex) {
  const derivedKey = crypto.scryptSync(password, salt, 64);
  const storedBuffer = Buffer.from(storedHashHex, 'hex');
  if (derivedKey.length !== storedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(derivedKey, storedBuffer);
}

function deriveDeterministicSalt(email) {
  const secretSeed = process.env.AUTH_SALT_SECRET || 'elena-vance-tutor-uz-2026-salt';
  return crypto
    .createHash('sha256')
    .update(`${secretSeed}:${email.toLowerCase().trim()}`)
    .digest('hex')
    .slice(0, 32);
}

function formatLocalDate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

let db = null;
try {
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_name TEXT NOT NULL,
      contact TEXT NOT NULL,
      service TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      notes TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_slot
    ON bookings(date, time)
    WHERE status != 'cancelled';

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      admin_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
    );
  `);
} catch (sqliteErr) {
  const JSON_DB_PATH = path.join(DATA_DIR, 'bookings-store.json');
  function loadStore() {
    try {
      if (fs.existsSync(JSON_DB_PATH)) {
        return JSON.parse(fs.readFileSync(JSON_DB_PATH, 'utf8'));
      }
    } catch {}
    return { nextBookingId: 1, bookings: [], admins: [], sessions: [] };
  }
  function saveStore(state) {
    fs.writeFileSync(JSON_DB_PATH, JSON.stringify(state, null, 2), 'utf8');
  }
  db = {
    _isFallback: true,
    loadStore,
    saveStore
  };
}

const store = {
  ensureSeeded() {
    const initialEmail = (process.env.ADMIN_EMAIL || 'admin@elenavance.uz').toLowerCase().trim();
    const initialPassword = process.env.ADMIN_PASSWORD || 'Admin@2026!';
    const salt = deriveDeterministicSalt(initialEmail);
    const passwordHash = hashPassword(initialPassword, salt);

    if (!db._isFallback) {
      const existingAdmin = db.prepare('SELECT id, password_salt FROM admins WHERE email = ?').get(initialEmail);
      if (!existingAdmin) {
        db.prepare('INSERT INTO admins (email, password_hash, password_salt) VALUES (?, ?, ?)').run(
          initialEmail,
          passwordHash,
          salt
        );
      } else if (existingAdmin.password_salt !== salt) {
        db.prepare('UPDATE admins SET password_hash = ?, password_salt = ? WHERE id = ?').run(
          passwordHash,
          salt,
          existingAdmin.id
        );
      }

      const bookingCount = db.prepare('SELECT COUNT(*) as count FROM bookings').get().count;
      if (bookingCount === 0) {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        const dayAfter = new Date(today);
        dayAfter.setDate(today.getDate() + 2);

        const insertSeed = db.prepare(`
          INSERT INTO bookings (student_name, contact, service, date, time, notes, status)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        insertSeed.run(
          'Азизбек Каримов',
          '+998 (90) 123-45-67 / azizbek@mail.uz',
          'IELTS Preparation',
          formatLocalDate(today),
          '14:00',
          'Цель — сдать Academic IELTS на 7.5 в Ташкенте через 3 месяца',
          'confirmed'
        );
        insertSeed.run(
          'Малика Рахимова',
          '+998 (93) 540-22-11 / @malika_r',
          'Trial Lesson',
          formatLocalDate(today),
          '17:00',
          'Хочу определить текущий уровень и подобрать программу',
          'pending'
        );
        insertSeed.run(
          'Сардор Юсупов',
          '+998 (97) 777-88-99',
          'Speaking Practice',
          formatLocalDate(tomorrow),
          '18:30',
          'Подготовка к собеседованию в международную IT-компанию',
          'confirmed'
        );
        insertSeed.run(
          'Дильноза Ахмедова',
          '@dilnoza_uz / +998 (99) 404-11-22',
          'General English',
          formatLocalDate(dayAfter),
          '10:30',
          'Уровень B1, хочу уверенно общаться в поездках и по работе',
          'pending'
        );
      }
    } else {
      const s = db.loadStore();
      let changed = false;
      const existingAdmin = s.admins.find(a => a.email === initialEmail);
      if (!existingAdmin) {
        s.admins.push({ id: 1, email: initialEmail, password_hash: passwordHash, password_salt: salt });
        changed = true;
      } else if (existingAdmin.password_salt !== salt) {
        existingAdmin.password_salt = salt;
        existingAdmin.password_hash = passwordHash;
        changed = true;
      }

      if (s.bookings.length === 0) {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        const dayAfter = new Date(today);
        dayAfter.setDate(today.getDate() + 2);
        s.bookings.push(
          {
            id: s.nextBookingId++,
            student_name: 'Азизбек Каримов',
            contact: '+998 (90) 123-45-67 / azizbek@mail.uz',
            service: 'IELTS Preparation',
            date: formatLocalDate(today),
            time: '14:00',
            notes: 'Цель — сдать Academic IELTS на 7.5 в Ташкенте через 3 месяца',
            status: 'confirmed'
          },
          {
            id: s.nextBookingId++,
            student_name: 'Малика Рахимова',
            contact: '+998 (93) 540-22-11 / @malika_r',
            service: 'Trial Lesson',
            date: formatLocalDate(today),
            time: '17:00',
            notes: 'Хочу определить текущий уровень и подобрать программу',
            status: 'pending'
          },
          {
            id: s.nextBookingId++,
            student_name: 'Сардор Юсупов',
            contact: '+998 (97) 777-88-99',
            service: 'Speaking Practice',
            date: formatLocalDate(tomorrow),
            time: '18:30',
            notes: 'Подготовка к собеседованию в международную IT-компанию',
            status: 'confirmed'
          },
          {
            id: s.nextBookingId++,
            student_name: 'Дильноза Ахмедова',
            contact: '@dilnoza_uz / +998 (99) 404-11-22',
            service: 'General English',
            date: formatLocalDate(dayAfter),
            time: '10:30',
            notes: 'Уровень B1, хочу уверенно общаться в поездках и по работе',
            status: 'pending'
          }
        );
        changed = true;
      }
      if (changed) db.saveStore(s);
    }
  },

  findAdminByEmail(email) {
    if (!db._isFallback) {
      return db.prepare('SELECT id, email, password_hash, password_salt FROM admins WHERE email = ?').get(email);
    }
    const s = db.loadStore();
    return s.admins.find(a => a.email === email) || null;
  },

  findAdminById(id) {
    if (!db._isFallback) {
      return db.prepare('SELECT id, email, password_hash FROM admins WHERE id = ?').get(id);
    }
    const s = db.loadStore();
    return s.admins.find(a => a.id === id) || null;
  },

  createSession(adminId, passwordHash) {
    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
    const rawId = crypto.randomBytes(24).toString('hex');
    const payload = `${adminId}.${expiresAt}.${rawId}`;
    const sig = crypto.createHmac('sha256', passwordHash).update(payload).digest('hex');
    const token = `${payload}.${sig}`;

    if (!db._isFallback) {
      db.prepare('INSERT INTO sessions (token, admin_id, expires_at) VALUES (?, ?, ?)').run(token, adminId, expiresAt);
    } else {
      const s = db.loadStore();
      s.sessions.push({ token, admin_id: adminId, expires_at: expiresAt });
      db.saveStore(s);
    }
    return token;
  },

  deleteSession(token) {
    if (!db._isFallback) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    } else {
      const s = db.loadStore();
      s.sessions = s.sessions.filter(item => item.token !== token);
      db.saveStore(s);
    }
  },

  verifySessionToken(token) {
    if (!token || typeof token !== 'string') return null;
    const nowUnix = Math.floor(Date.now() / 1000);

    const parts = token.split('.');
    if (parts.length === 4) {
      const [adminIdStr, expiresAtStr, rawId, sig] = parts;
      const adminId = Number(adminIdStr);
      const expiresAt = Number(expiresAtStr);
      if (expiresAt > nowUnix) {
        const admin = this.findAdminById(adminId);
        if (admin) {
          const payload = `${adminId}.${expiresAt}.${rawId}`;
          const expectedSig = crypto.createHmac('sha256', admin.password_hash).update(payload).digest('hex');
          if (
            sig.length === expectedSig.length &&
            crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))
          ) {
            return { id: admin.id, email: admin.email, token };
          }
        }
      }
    }

    if (!db._isFallback) {
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowUnix);
      const row = db.prepare(`
        SELECT s.token, s.expires_at, a.id as admin_id, a.email
        FROM sessions s
        JOIN admins a ON a.id = s.admin_id
        WHERE s.token = ? AND s.expires_at > ?
      `).get(token, nowUnix);
      if (row) {
        return { id: row.admin_id, email: row.email, token: row.token };
      }
    }

    return null;
  },

  getBookedTimesForDate(date) {
    if (!db._isFallback) {
      return db
        .prepare("SELECT time FROM bookings WHERE date = ? AND status != 'cancelled'")
        .all(date)
        .map(r => r.time);
    }
    const s = db.loadStore();
    return s.bookings.filter(b => b.date === date && b.status !== 'cancelled').map(b => b.time);
  },

  getAllBookings() {
    if (!db._isFallback) {
      return db.prepare('SELECT * FROM bookings ORDER BY date ASC, time ASC, id DESC').all();
    }
    const s = db.loadStore();
    return [...s.bookings].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.time !== b.time) return a.time.localeCompare(b.time);
      return b.id - a.id;
    });
  },

  hasActiveBookingAt(date, time, excludeId = null) {
    if (!db._isFallback) {
      if (excludeId !== null) {
        return Boolean(
          db
            .prepare("SELECT id FROM bookings WHERE date = ? AND time = ? AND status != 'cancelled' AND id != ?")
            .get(date, time, excludeId)
        );
      }
      return Boolean(
        db.prepare("SELECT id FROM bookings WHERE date = ? AND time = ? AND status != 'cancelled'").get(date, time)
      );
    }
    const s = db.loadStore();
    return s.bookings.some(b => b.date === date && b.time === time && b.status !== 'cancelled' && b.id !== excludeId);
  },

  createBooking({ student_name, contact, service, date, time, notes }) {
    if (!db._isFallback) {
      const result = db
        .prepare(`
          INSERT INTO bookings (student_name, contact, service, date, time, notes, status)
          VALUES (?, ?, ?, ?, ?, ?, 'pending')
        `)
        .run(student_name, contact, service, date, time, notes);
      return db
        .prepare('SELECT id, student_name, service, date, time, status FROM bookings WHERE id = ?')
        .get(result.lastInsertRowid);
    }
    const s = db.loadStore();
    const created = {
      id: s.nextBookingId++,
      student_name,
      contact,
      service,
      date,
      time,
      notes,
      status: 'pending'
    };
    s.bookings.push(created);
    db.saveStore(s);
    return created;
  },

  getBookingById(id) {
    if (!db._isFallback) {
      return db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    }
    const s = db.loadStore();
    return s.bookings.find(b => b.id === id) || null;
  },

  updateBookingStatus(id, status) {
    if (!db._isFallback) {
      db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, id);
      return db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    }
    const s = db.loadStore();
    const item = s.bookings.find(b => b.id === id);
    if (item) {
      item.status = status;
      db.saveStore(s);
    }
    return item || null;
  },

  deleteBooking(id) {
    if (!db._isFallback) {
      db.prepare('DELETE FROM bookings WHERE id = ?').run(id);
    } else {
      const s = db.loadStore();
      s.bookings = s.bookings.filter(b => b.id !== id);
      db.saveStore(s);
    }
  }
};

store.ensureSeeded();

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx > -1) {
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      cookies[key] = decodeURIComponent(val);
    }
  });
  return cookies;
}

function getAuthenticatedAdmin(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  return store.verifySessionToken(token);
}

const loginAttempts = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now > record.resetAt) {
    loginAttempts.set(ip, { count: 0, resetAt: now + 15 * 60 * 1000 });
    return false;
  }
  return record.count >= 10;
}

function recordFailedLogin(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now > record.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
  } else {
    record.count += 1;
  }
}

function clearLoginAttempts(ip) {
  loginAttempts.delete(ip);
}

function sendJson(res, statusCode, data, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(JSON.stringify(data));
}

function redirect(res, location) {
  res.writeHead(302, {
    Location: location,
    'Cache-Control': 'no-store'
  });
  res.end();
}

function parseBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) {
      const str = req.body.toString('utf8');
      return Promise.resolve(str ? JSON.parse(str) : {});
    }
    if (typeof req.body === 'string') {
      return Promise.resolve(req.body ? JSON.parse(req.body) : {});
    }
    if (typeof req.body === 'object') {
      return Promise.resolve(req.body);
    }
  }
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString('utf8');
      if (body.length > 1e6) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function serveHtmlTemplate(res, filename) {
  const html = filename === 'admin.html' ? templates.getAdminHtml() : templates.getLoginHtml();
  if (html) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    return res.end(html);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Шаблон страницы не найден');
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  try {
    store.ensureSeeded();
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = parsedUrl.searchParams.get('__pathname') || parsedUrl.pathname;
    if (pathname === '/api/index.js' || pathname === '/api/index') {
      const forwarded = req.headers['x-forwarded-uri'] || req.headers['x-matched-path'] || '';
      if (forwarded) {
        pathname = forwarded.split('?')[0];
      }
    }
    if (!pathname.startsWith('/')) {
      pathname = '/' + pathname;
    }
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }

    // POST /api/auth/login
    if (req.method === 'POST' && pathname === '/api/auth/login') {
      const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').toString();
      if (isRateLimited(clientIp)) {
        return sendJson(res, 429, {
          error: 'Слишком много попыток входа. Пожалуйста, подождите 15 минут.'
        });
      }

      const body = await parseBody(req);
      const email = String(body.email || '').toLowerCase().trim();
      const password = String(body.password || '');

      if (!email || !password) {
        return sendJson(res, 400, { error: 'Введите Email и пароль.' });
      }

      const adminRow = store.findAdminByEmail(email);

      if (!adminRow || !verifyPassword(password, adminRow.password_salt, adminRow.password_hash)) {
        recordFailedLogin(clientIp);
        return sendJson(res, 401, { error: 'Неверный Email или пароль.' });
      }

      clearLoginAttempts(clientIp);

      const sessionToken = store.createSession(adminRow.id, adminRow.password_hash);
      const secureFlag = process.env.VERCEL || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      const cookieHeader = `${SESSION_COOKIE_NAME}=${sessionToken}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secureFlag}`;

      return sendJson(
        res,
        200,
        {
          message: 'Вход выполнен успешно.',
          admin: { id: adminRow.id, email: adminRow.email }
        },
        { 'Set-Cookie': cookieHeader }
      );
    }

    // POST /api/auth/logout
    if (req.method === 'POST' && pathname === '/api/auth/logout') {
      const admin = getAuthenticatedAdmin(req);
      if (admin && admin.token) {
        store.deleteSession(admin.token);
      }

      const clearCookie = `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
      return sendJson(
        res,
        200,
        { message: 'Вы вышли из системы.' },
        { 'Set-Cookie': clearCookie }
      );
    }

    // GET /api/auth/me
    if (req.method === 'GET' && pathname === '/api/auth/me') {
      const admin = getAuthenticatedAdmin(req);
      if (!admin) {
        return sendJson(res, 401, { authenticated: false, error: 'Не авторизован' });
      }
      return sendJson(res, 200, {
        authenticated: true,
        admin: { id: admin.id, email: admin.email }
      });
    }

    // GET /api/slots
    if (req.method === 'GET' && pathname === '/api/slots') {
      const date = parsedUrl.searchParams.get('date');
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return sendJson(res, 400, { error: 'Укажите корректную дату в формате YYYY-MM-DD' });
      }

      const bookedSet = new Set(store.getBookedTimesForDate(date));
      const slots = AVAILABLE_SLOTS.map(time => ({
        time,
        available: !bookedSet.has(time)
      }));

      return sendJson(res, 200, { date, slots });
    }

    // POST /api/bookings
    if (req.method === 'POST' && pathname === '/api/bookings') {
      const body = await parseBody(req);
      const student_name = (body.student_name || '').trim();
      const contact = (body.contact || '').trim();
      const service = (body.service || '').trim();
      const date = (body.date || '').trim();
      const time = (body.time || '').trim();
      const notes = (body.notes || '').trim();

      if (!student_name || student_name.length < 2) {
        return sendJson(res, 400, { error: 'Пожалуйста, укажите ваше имя (минимум 2 символа).' });
      }
      if (!contact || contact.length < 4) {
        return sendJson(res, 400, { error: 'Пожалуйста, укажите телефон или email для связи.' });
      }
      if (!VALID_SERVICES.includes(service)) {
        return sendJson(res, 400, { error: 'Выберите корректную услугу из списка.' });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return sendJson(res, 400, { error: 'Выберите корректную дату занятия.' });
      }
      if (!AVAILABLE_SLOTS.includes(time)) {
        return sendJson(res, 400, { error: 'Выберите доступное время из расписания.' });
      }

      if (store.hasActiveBookingAt(date, time)) {
        return sendJson(res, 409, {
          error: 'К сожалению, это время уже забронировано. Пожалуйста, выберите другой слот.'
        });
      }

      try {
        const createdBooking = store.createBooking({
          student_name,
          contact,
          service,
          date,
          time,
          notes
        });

        return sendJson(res, 201, {
          message: 'Запись успешно создана!',
          booking: createdBooking
        });
      } catch (dbErr) {
        if (String(dbErr.message).includes('UNIQUE')) {
          return sendJson(res, 409, {
            error: 'Это время только что было забронировано другим учеником. Выберите другое время.'
          });
        }
        throw dbErr;
      }
    }

    // PROTECTED ADMIN API ENDPOINTS
    const bookingIdMatch = pathname.match(/^\/api\/bookings\/(\d+)$/);

    if (
      (req.method === 'GET' && pathname === '/api/bookings') ||
      (bookingIdMatch && (req.method === 'PATCH' || req.method === 'DELETE'))
    ) {
      const admin = getAuthenticatedAdmin(req);
      if (!admin) {
        return sendJson(res, 401, {
          error: 'Доступ запрещён. Пожалуйста, войдите как администратор.'
        });
      }

      if (req.method === 'GET' && pathname === '/api/bookings') {
        const bookings = store.getAllBookings();
        return sendJson(res, 200, { bookings });
      }

      if (req.method === 'PATCH' && bookingIdMatch) {
        const id = Number(bookingIdMatch[1]);
        const body = await parseBody(req);
        const { status } = body;

        if (!VALID_STATUSES.includes(status)) {
          return sendJson(res, 400, { error: 'Некорректный статус записи.' });
        }

        const existing = store.getBookingById(id);
        if (!existing) {
          return sendJson(res, 404, { error: 'Запись не найдена.' });
        }

        if (existing.status === 'cancelled' && status !== 'cancelled') {
          if (store.hasActiveBookingAt(existing.date, existing.time, id)) {
            return sendJson(res, 409, {
              error: 'Невозможно восстановить запись: выбранное время уже занято другой активной записью.'
            });
          }
        }

        const updated = store.updateBookingStatus(id, status);
        return sendJson(res, 200, {
          message: 'Статус записи обновлён.',
          booking: updated
        });
      }

      if (req.method === 'DELETE' && bookingIdMatch) {
        const id = Number(bookingIdMatch[1]);
        const existing = store.getBookingById(id);
        if (!existing) {
          return sendJson(res, 404, { error: 'Запись не найдена.' });
        }

        store.deleteBooking(id);
        return sendJson(res, 200, { message: 'Запись удалена.' });
      }
    }

    // PROTECTED PAGE ROUTES (/admin & /login)
    if (pathname === '/admin' || pathname === '/admin.html') {
      const admin = getAuthenticatedAdmin(req);
      if (!admin) {
        return redirect(res, '/login');
      }
      return serveHtmlTemplate(res, 'admin.html');
    }

    if (pathname === '/login' || pathname === '/login.html') {
      const admin = getAuthenticatedAdmin(req);
      if (admin) {
        return redirect(res, '/admin');
      }
      return serveHtmlTemplate(res, 'login.html');
    }

    // Serve public static files
    let filePath = pathname === '/' ? '/index.html' : pathname;
    const resolvedPath = path.normalize(path.join(PUBLIC_DIR, filePath));
    if (!resolvedPath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
      const ext = path.extname(resolvedPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(resolvedPath).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Страница не найдена');
    }
  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { error: 'Внутренняя ошибка сервера' });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    console.log(`Admin login available at http://localhost:${PORT}/login`);
  });
}

module.exports = (req, res) => {
  server.emit('request', req, res);
};
module.exports.server = server;
module.exports.db = db;
