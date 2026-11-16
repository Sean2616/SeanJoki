'use strict';
// /api/admin-prices — baca/tulis daftar harga lewat SERVER (butuh sesi admin).
// GET  -> { success, stored: { regular, gendong } | null }
// PUT  -> body { regular, gendong } (masing-masing 6 tier, angka > 0)
// Browser tidak lagi membaca/menulis Firebase langsung untuk admin;
// halaman utama situs tetap memuat harga publik langsung dari Firebase.

const auth = require('./_lib/adminAuth');

module.exports = async (req, res) => {
  if (!auth.isAuthenticated(req)) {
    return auth.sendJson(res, 401, { success: false, message: 'Sesi berakhir. Login lagi.' });
  }
  if (req.method === 'GET') {
    try {
      const data = await auth.fbGet(auth.PRICES_DB_PATH);
      const stored = (data && auth.validPriceTable(data.regular) && auth.validPriceTable(data.gendong))
        ? { regular: data.regular, gendong: data.gendong }
        : null;
      return auth.sendJson(res, 200, { success: true, stored });
    } catch (e) {
      return auth.sendJson(res, 500, { success: false, message: 'Gagal memuat harga tersimpan.' });
    }
  }
  if (req.method === 'PUT') {
    let body;
    try {
      body = await auth.readJsonBody(req);
    } catch (e) {
      return auth.sendJson(res, 400, { success: false, message: 'Body JSON tidak valid.' });
    }
    if (!body || !auth.validPriceTable(body.regular) || !auth.validPriceTable(body.gendong)) {
      return auth.sendJson(res, 400, { success: false, message: 'Semua harga harus diisi angka lebih dari 0.' });
    }
    try {
      await auth.fbPut(auth.PRICES_DB_PATH, {
        regular: body.regular,
        gendong: body.gendong,
        updatedAt: Date.now(),
      });
      return auth.sendJson(res, 200, { success: true });
    } catch (e) {
      return auth.sendJson(res, 500, { success: false, message: 'Gagal menyimpan harga.' });
    }
  }
  return auth.sendJson(res, 405, { success: false, message: 'Method tidak diizinkan.' });
};
