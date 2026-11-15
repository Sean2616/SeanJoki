'use strict';
// POST /api/check-nick { userId, zoneId }
// Mengecek nickname Mobile Legends dari User ID + Zone ID untuk Sean Joki.
//
// Diadaptasi dari file check-id.js kiriman Fuda (2026-11-16), dengan
// perubahan penting:
//  - File aslinya memakai `export default` (ESM). Repo ini tidak punya
//    package.json, jadi Vercel memperlakukan api/*.js sebagai CommonJS;
//    file ini memakai module.exports agar tidak error saat deploy.
//  - File aslinya mengembalikan nickname PALSU (nama buatan dari
//    potongan ID) kalau ID tidak ditemukan atau API-nya error. Itu
//    berbahaya untuk joki: ID yang salah ketik akan terlihat valid.
//    Di sini, ID tidak ditemukan / API error selalu dijawab jujur
//    dengan found:false, dan form membiarkan customer mengisi
//    nickname secara manual.
//  - Filter "server luar negeri" dan blokir IP non-Indonesia dihapus:
//    filter itu untuk SKU top-up, bukan joki. Joki melayani semua
//    server, jadi yang divalidasi hanya format angkanya.
//
// Sumber default: api.isan.eu.org (tanpa API key, tanpa konfigurasi).
// Kalau suatu hari ingin memakai provider lain, set variabel
// NICKNAME_API_URL (+ NICKNAME_API_KEY bila perlu) di Vercel; provider
// itu akan dipakai sebagai ganti Isan. Lihat CARA_PASANG.md.
//
// Environment Variables (opsional, Vercel > Settings > Environment Variables):
//   NICKNAME_API_URL      URL endpoint dengan placeholder {userId} dan {zoneId}
//   NICKNAME_API_KEY      (opsional) API key provider tersebut
//   NICKNAME_API_KEY_MODE (opsional) 'header' (default, key di header X-Api-Key)
//                         atau 'query' (ditambah ?api_key=...)

const ISAN_URL = 'https://api.isan.eu.org/nickname/ml';

function pickNickname(json) {
  if (!json || typeof json !== 'object') return null;
  const candidates = [
    json.nickname,
    json.name,
    json.username,
    json.data && json.data.nickname,
    json.data && json.data.name,
    json.data && json.data.username,
    json.result && json.result.nickname,
    json.result && json.result.name,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

// Provider sendiri (opsional, lewat env var). Mengembalikan nickname
// string, atau null kalau tidak ditemukan / gagal.
async function checkWithProvider(userId, zoneId) {
  const apiUrl = process.env.NICKNAME_API_URL;
  const url = apiUrl
    .replace('{userId}', encodeURIComponent(userId))
    .replace('{zoneId}', encodeURIComponent(zoneId));
  const headers = {};
  let finalUrl = url;
  const apiKey = process.env.NICKNAME_API_KEY || '';
  if (apiKey) {
    if ((process.env.NICKNAME_API_KEY_MODE || 'header') === 'query') {
      finalUrl += (url.includes('?') ? '&' : '?') + 'api_key=' + encodeURIComponent(apiKey);
    } else {
      headers['X-Api-Key'] = apiKey;
    }
  }
  const r = await fetch(finalUrl, { headers, signal: AbortSignal.timeout(10000) });
  const json = await r.json().catch(() => null);
  if (!r.ok || (json && json.success === false)) return null;
  return pickNickname(json);
}

// Sumber default: Isan (tanpa key). Mengembalikan nickname string,
// atau null kalau tidak ditemukan / gagal.
async function checkWithIsan(userId, zoneId) {
  const url = ISAN_URL
    + '?id=' + encodeURIComponent(userId)
    + '&zone=' + encodeURIComponent(zoneId);
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const json = await r.json().catch(() => null);
  if (!r.ok || (json && json.success === false)) return null;
  return pickNickname(json);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, message: 'Method tidak diizinkan. Pakai POST.' });
  }
  let body;
  try {
    body = await readJson(req);
  } catch {
    return sendJson(res, 400, { success: false, message: 'Body JSON tidak valid.' });
  }
  const userId = String(body.userId || '').trim();
  const zoneId = String(body.zoneId || '').trim();
  if (!/^\d{5,20}$/.test(userId) || !/^\d{3,6}$/.test(zoneId)) {
    return sendJson(res, 400, { success: false, message: 'User ID harus 5-20 digit angka dan Zone ID 3-6 digit angka.' });
  }
  try {
    let nickname = null;
    if (process.env.NICKNAME_API_URL) {
      nickname = await checkWithProvider(userId, zoneId);
    } else {
      nickname = await checkWithIsan(userId, zoneId);
    }
    if (nickname) {
      return sendJson(res, 200, { success: true, available: true, found: true, nickname });
    }
    return sendJson(res, 200, {
      success: true,
      available: true,
      found: false,
      message: 'ID atau Server tidak ditemukan. Periksa kembali ID dan Server-nya, atau isi nickname secara manual.',
    });
  } catch (err) {
    return sendJson(res, 200, {
      success: true,
      available: true,
      found: false,
      message: 'Layanan cek nickname sedang bermasalah. Isi nickname secara manual dan periksa kembali ID-nya.',
    });
  }
};
