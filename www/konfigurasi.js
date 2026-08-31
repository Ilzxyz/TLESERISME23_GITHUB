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

  // Alamat UNDUH berkas penuh tleserisme.db (dipakai tombol "Unduh perpustakaan"
  // di Android). Kosongkan -> tombol unduh disembunyikan. Diisi -> app bisa
  // mengunduh sendiri, sepotong-sepotong, dengan lanjut-otomatis kalau sinyal putus.
  ALAMAT_UNDUH: 'https://github.com/Ilzxyz/TLESERISME23_GITHUB/releases/download/db-v1/tleserisme.db',

  // true  = hosting yang mengunci (muncul kotak nama pengguna & sandi bawaan peramban)
  // false = kuncinya diperiksa sendiri oleh aplikasi
  SANDI_PERAMBAN: true
};
