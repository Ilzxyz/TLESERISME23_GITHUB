/* ============================================================
   TLeserisme23 — pengaturan alamat basis data
   ------------------------------------------------------------
   Kosongkan ALAMAT_DB  -> aplikasi memakai berkas dari harddisk sendiri.
   Isi ALAMAT_DB        -> aplikasi membaca dari internet.
   ============================================================ */
window.KONFIG = {
  // Kalau basis datanya di hosting yang sama dengan halaman ini,
  // cukup tulis alamat relatif seperti di bawah.
  ALAMAT_DB: '',
  // contoh untuk hosting cPanel:
  // ALAMAT_DB: 'data/tleserisme.db',

  // true  = hosting yang mengunci (muncul kotak nama pengguna & sandi bawaan peramban)
  // false = kuncinya diperiksa sendiri oleh aplikasi
  SANDI_PERAMBAN: true
};
