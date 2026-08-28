import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 5000;
const SECRET_KEY = 'delta_robot_super_secret_key';

// Middleware
app.use(cors());
app.use(express.json());

// MySQL Database Pool Configuration
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'robot_delta_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let pool = null;

async function getPool() {
  if (!pool) {
    pool = mysql.createPool(DB_CONFIG);
  }
  return pool;
}

// Inisialisasi Database & Tabel Otomatis
async function initDB() {
  try {
    // Buat database jika belum ada
    const tempConn = await mysql.createConnection({
      host: DB_CONFIG.host,
      user: DB_CONFIG.user,
      password: DB_CONFIG.password
    });
    await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\``);
    await tempConn.end();

    const db = await getPool();

    // Tabel Users
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'admin'
      )
    `);

    // Tambahkan default user admin jika belum ada
    const [existingUsers] = await db.query('SELECT * FROM users WHERE username = ?', ['admin']);
    if (existingUsers.length === 0) {
      const defaultHash = 'scrypt:32768:8:1$kYdO9gQ1iIeP9nN4$4f4c8032c2538b71d9e7943c7263fb39b1a7d65fc54d8b8cc7fa6fbe147e4eb1a4b67d5cb1ed0583b4b087095c5c029312b9d885eb26d2e482200dc832fcff37';
      await db.query('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['admin', defaultHash, 'admin']);
      console.log('Default admin user created.');
    }

    // Tabel Robot Settings
    await db.query(`
      CREATE TABLE IF NOT EXISTS robot_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        profile_name VARCHAR(50) UNIQUE NOT NULL,
        x FLOAT NOT NULL DEFAULT 0,
        y FLOAT NOT NULL DEFAULT 0,
        z FLOAT NOT NULL DEFAULT 0
      )
    `);

    // Tabel Coordinate Templates
    await db.query(`
      CREATE TABLE IF NOT EXISTS coordinate_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        template_name VARCHAR(100) UNIQUE NOT NULL,
        pickA_x FLOAT, pickA_y FLOAT, pickA_z FLOAT,
        dropA_x FLOAT, dropA_y FLOAT, dropA_z FLOAT,
        pickB_x FLOAT, pickB_y FLOAT, pickB_z FLOAT,
        dropB_x FLOAT, dropB_y FLOAT, dropB_z FLOAT
      )
    `);

    // Tabel App Settings (3D Layout)
    await db.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        setting_key VARCHAR(50) PRIMARY KEY,
        setting_value JSON
      )
    `);

    console.log('✓ Database MySQL robot_delta_db siap digunakan.');
  } catch (err) {
    console.error('Peringatan: Gagal inisialisasi MySQL:', err.message);
  }
}

// Verifikasi password (Mendukung hash scrypt/pbkdf2 dari Werkzeug Python & Plaintext)
function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  if (password === storedHash) return true;

  try {
    // Format Werkzeug: scrypt:N:r:p$salt$hash
    if (storedHash.startsWith('scrypt:')) {
      const parts = storedHash.split('$');
      if (parts.length === 3) {
        const params = parts[0].split(':'); // ['scrypt', '32768', '8', '1']
        const N = parseInt(params[1], 10) || 32768;
        const r = parseInt(params[2], 10) || 8;
        const p = parseInt(params[3], 10) || 1;
        const salt = parts[1];
        const expectedHash = parts[2];

        const derived = crypto.scryptSync(password, salt, 64, { N, r, p, maxmem: 128 * 1024 * 1024 });
        return derived.toString('hex') === expectedHash;
      }
    }

    // Format Werkzeug: pbkdf2:sha256:iterations$salt$hash
    if (storedHash.startsWith('pbkdf2:')) {
      const parts = storedHash.split('$');
      if (parts.length === 3) {
        const params = parts[0].split(':');
        const iterations = parseInt(params[2], 10) || 260000;
        const salt = parts[1];
        const expectedHash = parts[2];

        const derived = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
        return derived.toString('hex') === expectedHash;
      }
    }
  } catch (e) {
    console.error('Password verify error:', e);
  }

  return false;
}

// Middleware Autentikasi JWT
function tokenRequired(req, res, next) {
  if (req.method === 'OPTIONS') return next();

  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ status: 'error', message: 'Token is missing!' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ status: 'error', message: 'Token format is invalid!' });
  }

  const token = parts[1];
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.userId = decoded.user_id;
    next();
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Token is invalid!' });
  }
}

// =================================================================
// API ROUTES
// =================================================================

// 1. Auth: Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ status: 'error', message: 'Missing username or password' });
  }

  try {
    const db = await getPool();
    const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    if (users.length === 0) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }

    const user = users[0];
    if (verifyPassword(password, user.password_hash)) {
      const token = jwt.sign(
        { user_id: user.id },
        SECRET_KEY,
        { expiresIn: '24h' }
      );
      return res.json({ status: 'success', token, username: user.username });
    }

    return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// 2. Settings: Get Settings
app.get('/api/settings', async (req, res) => {
  try {
    const db = await getPool();
    const [settings] = await db.query('SELECT * FROM robot_settings');
    return res.json({ status: 'success', data: settings });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// 3. Settings: Update Settings
app.post('/api/settings', tokenRequired, async (req, res) => {
  const { profile_name, x, y, z } = req.body;
  if (!profile_name || x === undefined || y === undefined || z === undefined) {
    return res.status(400).json({ status: 'error', message: 'Missing data' });
  }

  try {
    const db = await getPool();
    await db.query(`
      INSERT INTO robot_settings (profile_name, x, y, z) 
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE x=?, y=?, z=?
    `, [profile_name, x, y, z, x, y, z]);

    return res.json({ status: 'success', message: 'Settings updated' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// 4. Templates: Get All Templates
app.get('/api/templates', async (req, res) => {
  try {
    const db = await getPool();
    const [templates] = await db.query('SELECT * FROM coordinate_templates ORDER BY id ASC');
    return res.json({ status: 'success', data: templates });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// 5. Templates: Save Template
app.post('/api/templates', tokenRequired, async (req, res) => {
  const {
    template_name,
    pickA_x = 0, pickA_y = 0, pickA_z = 0,
    dropA_x = 0, dropA_y = 0, dropA_z = 0,
    pickB_x = 0, pickB_y = 0, pickB_z = 0,
    dropB_x = 0, dropB_y = 0, dropB_z = 0
  } = req.body;

  if (!template_name) {
    return res.status(400).json({ status: 'error', message: 'Template name required' });
  }

  try {
    const db = await getPool();
    await db.query(`
      INSERT INTO coordinate_templates 
      (template_name, pickA_x, pickA_y, pickA_z, dropA_x, dropA_y, dropA_z, pickB_x, pickB_y, pickB_z, dropB_x, dropB_y, dropB_z) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
      pickA_x=VALUES(pickA_x), pickA_y=VALUES(pickA_y), pickA_z=VALUES(pickA_z),
      dropA_x=VALUES(dropA_x), dropA_y=VALUES(dropA_y), dropA_z=VALUES(dropA_z),
      pickB_x=VALUES(pickB_x), pickB_y=VALUES(pickB_y), pickB_z=VALUES(pickB_z),
      dropB_x=VALUES(dropB_x), dropB_y=VALUES(dropB_y), dropB_z=VALUES(dropB_z)
    `, [
      template_name,
      pickA_x, pickA_y, pickA_z,
      dropA_x, dropA_y, dropA_z,
      pickB_x, pickB_y, pickB_z,
      dropB_x, dropB_y, dropB_z
    ]);

    return res.json({ status: 'success', message: 'Template saved' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// 6. Templates: Delete Template
app.delete('/api/templates/:name', tokenRequired, async (req, res) => {
  const { name } = req.params;
  try {
    const db = await getPool();
    const [result] = await db.query('DELETE FROM coordinate_templates WHERE template_name = ?', [name]);
    if (result.affectedRows > 0) {
      return res.json({ status: 'success', message: 'Template deleted' });
    } else {
      return res.status(404).json({ status: 'error', message: 'Template not found' });
    }
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// 7. 3D Layout: Get App Layout
app.get('/api/layout', async (req, res) => {
  try {
    const db = await getPool();
    const [rows] = await db.query('SELECT setting_key, setting_value FROM app_settings');
    const settings = {};
    for (const row of rows) {
      let val = row.setting_value;
      if (typeof val === 'string') {
        try { val = JSON.parse(val); } catch {}
      }
      settings[row.setting_key] = val;
    }
    return res.json({ status: 'success', data: settings });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// 8. 3D Layout: Save App Layout
app.post('/api/layout', tokenRequired, async (req, res) => {
  const data = req.body;
  if (!data || Object.keys(data).length === 0) {
    return res.status(400).json({ status: 'error', message: 'No data provided' });
  }

  try {
    const db = await getPool();
    for (const [key, value] of Object.entries(data)) {
      const jsonVal = JSON.stringify(value);
      await db.query(`
        INSERT INTO app_settings (setting_key, setting_value) 
        VALUES (?, ?) 
        ON DUPLICATE KEY UPDATE setting_value = ?
      `, [key, jsonVal, jsonVal]);
    }
    return res.json({ status: 'success', message: 'Settings saved' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// Start Server
app.listen(PORT, async () => {
  console.log(`=========================================`);
  console.log(` Delta Robot Node.js Backend Running `);
  console.log(` Port: http://localhost:${PORT} `);
  console.log(`=========================================`);
  await initDB();
});
