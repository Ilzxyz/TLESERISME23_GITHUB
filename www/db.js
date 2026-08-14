/* ============================================================
   TLeserisme23 — lapisan basis data
   Bekerja di dua tempat:
     - di peramban  : pakai sql.js (untuk uji coba)
     - di Android   : pakai @capacitor-community/sqlite
   ============================================================ */

const DB = (() => {
  let mode = null;          // 'peramban' | 'android'
  let sqljs = null;         // objek basis data sql.js
  let cap = null;           // sambungan Capacitor
  let siap = false;

  const NAMA_DB = 'tleserisme';

  /* ---------- penyeragaman kata (HARUS sama dengan penyiap.py) ---------- */
  const HARAKAT = /[ً-ٰٕـۖ-ۜ۟-۪ۤۧۨ-ۭ]/;
  const GANTI = {
    'آ': 'ا', 'أ': 'ا', 'إ': 'ا', 'ٱ': 'ا',
    'ى': 'ي', 'ة': 'ه',
    'ؤ': 'و', 'ئ': 'ي'
  };

  /** seragamkan teks; kalau perluPeta true, ikut kembalikan peta posisi */
  function seragam(t, perluPeta) {
    if (!t) return perluPeta ? { n: '', peta: [] } : '';
    t = t.replace(/<ص:\s*\d+>/g, ' ');
    let n = '', peta = perluPeta ? [] : null;
    for (let i = 0; i < t.length; i++) {
      let c = t[i];
      if (HARAKAT.test(c)) continue;
      c = GANTI[c] || c;
      c = c.toLowerCase();
      // samakan semua tanda baca / pemisah jadi spasi
      if (!/[\w؀-ۿ]/.test(c)) c = ' ';
      n += c;
      if (peta) peta.push(i);
    }
    return perluPeta ? { n, peta } : n;
  }

  function kataKunci(q) {
    return seragam(q).split(/\s+/).filter(Boolean);
  }

  /* ---------- buka mampatan teks ---------- */
  const PEMBACA = new TextDecoder('utf-8');
  function bukaTeks(b64) {
    if (!b64) return '';
    if (typeof b64 !== 'string') return String(b64);
    try {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return PEMBACA.decode(pako.inflate(arr));
    } catch (e) {
      console.error('gagal buka teks', e);
      return '';
    }
  }

  /* ---------- pengenalan lingkungan ---------- */
  function diAndroid() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform
      && window.Capacitor.isNativePlatform());
  }

  /* ---------- pembuka ---------- */

  const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/';
  let asalSql = 'vendor/';

  function muatSkrip(src) {
    return new Promise((ok, gagal) => {
      const s = document.createElement('script');
      s.src = src; s.onload = ok;
      s.onerror = () => gagal(new Error('gagal memuat ' + src));
      document.head.appendChild(s);
    });
  }

  /** sql.js hanya dipakai saat uji di peramban; di HP tidak pernah dipanggil */
  async function muatSqlJs() {
    if (window.initSqlJs) return;
    try {
      await muatSkrip('vendor/sql-wasm.js');       // salinan lokal kalau ada
      asalSql = 'vendor/';
    } catch (e) {
      await muatSkrip(CDN + 'sql-wasm.js');        // kalau tidak, ambil dari internet
      asalSql = CDN;
    }
  }

  async function bukaPeramban(urlAtauBuffer) {
    await muatSqlJs();
    const SQL = await initSqlJs({ locateFile: f => asalSql + f });
    let buf;
    if (urlAtauBuffer instanceof ArrayBuffer) {
      buf = new Uint8Array(urlAtauBuffer);
    } else {
      const r = await fetch(urlAtauBuffer);
      if (!r.ok) throw new Error('berkas contoh tidak ketemu');
      buf = new Uint8Array(await r.arrayBuffer());
    }
    sqljs = new SQL.Database(buf);
    mode = 'peramban';
    siap = true;
  }

  async function bukaAndroid() {
    const { CapacitorSQLite, SQLiteConnection } = window.CapacitorSQLitePlugin;
    const sq = new SQLiteConnection(CapacitorSQLite);
    const ada = await sq.isDatabase(NAMA_DB);
    if (!ada.result) throw new Error('BELUM_ADA_DB');
    const ret = await sq.checkConnectionsConsistency();
    const punya = (await sq.isConnection(NAMA_DB, false)).result;
    cap = (ret.result && punya)
      ? await sq.retrieveConnection(NAMA_DB, false)
      : await sq.createConnection(NAMA_DB, false, 'no-encryption', 1, false);
    await cap.open();
    mode = 'android';
    siap = true;
  }

  /** pindahkan tleserisme.db dari folder data aplikasi ke tempat plugin */
  async function pasangDariBerkas(namaBerkas) {
    const { CapacitorSQLite, SQLiteConnection } = window.CapacitorSQLitePlugin;
    const sq = new SQLiteConnection(CapacitorSQLite);
    await sq.moveDatabasesAndAddSuffix('default', [namaBerkas]);
  }

  /* ---------- penanya ---------- */

  async function tanya(sql, param = []) {
    if (!siap) throw new Error('basis data belum dibuka');
    if (mode === 'peramban') {
      const st = sqljs.prepare(sql);
      st.bind(param);
      const out = [];
      while (st.step()) out.push(st.getAsObject());
      st.free();
      return out;
    }
    const r = await cap.query(sql, param);
    return r.values || [];
  }

  async function jalankan(sql, param = []) {
    if (mode === 'peramban') {
      sqljs.run(sql, param);
      return;
    }
    await cap.run(sql, param, false);
  }

  async function satu(sql, param = []) {
    const r = await tanya(sql, param);
    return r.length ? r[0] : null;
  }

  /* ---------- tabel milik pengguna (catatan pribadi) ---------- */
  const SKEMA_PENGGUNA = [
    `CREATE TABLE IF NOT EXISTS catatan (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       judul TEXT, isi TEXT, label TEXT,
       tempel_kitab INTEGER, tempel_urut INTEGER,
       asal TEXT, dibuat TEXT, diubah TEXT)`,
    `CREATE TABLE IF NOT EXISTS tanda (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       kitab_id INTEGER, urut INTEGER, nama TEXT, dibuat TEXT)`,
    `CREATE TABLE IF NOT EXISTS riwayat (
       kitab_id INTEGER PRIMARY KEY, urut INTEGER, waktu TEXT)`,
    `CREATE TABLE IF NOT EXISTS riwayat_cari (
       id INTEGER PRIMARY KEY AUTOINCREMENT, kata TEXT, waktu TEXT, jml INTEGER)`
  ];

  async function siapkanTabelPengguna() {
    for (const s of SKEMA_PENGGUNA) {
      try { await jalankan(s); } catch (e) { console.warn('skema pengguna:', e); }
    }
  }

  /* ---------- kueri siap pakai ---------- */

  async function info() {
    const r = await tanya('SELECT kunci, nilai FROM info');
    const o = {};
    r.forEach(x => o[x.kunci] = x.nilai);
    const t = await satu(
      `SELECT (SELECT COUNT(*) FROM kitab) k,
              (SELECT COUNT(*) FROM halaman) h,
              (SELECT COUNT(*) FROM fan) f`);
    o.jml_kitab = t.k; o.jml_halaman = t.h; o.jml_fan = t.f;
    return o;
  }

  async function daftarFan() {
    return tanya(`SELECT id, nama, sumber, jml_kitab FROM fan
                  ORDER BY jml_kitab DESC, nama`);
  }

  async function kitabDiFan(fanId, batas = 400) {
    return tanya(`SELECT id, judul, pengarang, jml_halaman, jml_bab
                  FROM kitab WHERE fan_id = ?
                  ORDER BY jml_halaman DESC LIMIT ?`, [fanId, batas]);
  }

  async function kitab(id) {
    return satu(`SELECT * FROM kitab WHERE id = ?`, [id]);
  }

  async function halaman(kitabId, urut) {
    const r = await satu(
      `SELECT id, urut, juz, hal, teks FROM halaman
       WHERE kitab_id = ? AND urut >= ? ORDER BY urut LIMIT 1`, [kitabId, urut]);
    if (r) r.isi = bukaTeks(r.teks);
    return r;
  }

  async function halamanPertama(kitabId) {
    const r = await satu(
      `SELECT id, urut, juz, hal, teks FROM halaman
       WHERE kitab_id = ? ORDER BY urut LIMIT 1`, [kitabId]);
    if (r) r.isi = bukaTeks(r.teks);
    return r;
  }

  async function halamanSebelahnya(kitabId, urut, arah) {
    const sql = arah > 0
      ? `SELECT id,urut,juz,hal,teks FROM halaman WHERE kitab_id=? AND urut>? ORDER BY urut LIMIT 1`
      : `SELECT id,urut,juz,hal,teks FROM halaman WHERE kitab_id=? AND urut<? ORDER BY urut DESC LIMIT 1`;
    const r = await satu(sql, [kitabId, urut]);
    if (r) r.isi = bukaTeks(r.teks);
    return r;
  }

  async function babKitab(kitabId) {
    return tanya(`SELECT tuju, tingkat, judul FROM bab
                  WHERE kitab_id = ? ORDER BY tuju, id`, [kitabId]);
  }

  /* ---------- mesin cari: indeks kata (cara Syamilah) ----------
     tabel kata: w = kata seragam, n = jumlah halaman,
     p = daftar id halaman disimpan sebagai selisih varint          */

  /** buka daftar id halaman dari blob varint */
  function bukaDaftar(blob) {
    let a;
    if (blob instanceof Uint8Array) a = blob;
    else if (Array.isArray(blob)) a = Uint8Array.from(blob);
    else if (typeof blob === 'string') {
      const bin = atob(blob);
      a = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    } else if (blob && blob.buffer) a = new Uint8Array(blob.buffer);
    else return [];
    const out = [];
    let n = 0, geser = 0, akhir = 0;
    for (let i = 0; i < a.length; i++) {
      const b = a[i];
      n |= (b & 0x7F) << geser;
      if (b & 0x80) { geser += 7; }
      else { akhir += n; out.push(akhir); n = 0; geser = 0; }
    }
    return out;
  }

  /** irisan dua daftar terurut */
  function iris(a, b) {
    const out = [];
    let i = 0, j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { out.push(a[i]); i++; j++; }
      else if (a[i] < b[j]) i++;
      else j++;
    }
    return out;
  }

  /** ambil daftar halaman untuk satu kata */
  async function daftarKata(w) {
    const r = await satu('SELECT n, p FROM kata WHERE w = ?', [w]);
    if (!r) return [];
    return bukaDaftar(r.p);
  }

  /** kumpulkan id halaman untuk semua kata kunci (AND) */
  async function idHalaman(kata) {
    if (!kata.length) return [];
    // urutkan dari kata paling jarang supaya irisan cepat
    const jml = [];
    for (const w of kata) {
      const r = await satu('SELECT n FROM kata WHERE w = ?', [w]);
      if (!r) return [];
      jml.push({ w, n: r.n });
    }
    jml.sort((a, b) => a.n - b.n);
    let hasil = await daftarKata(jml[0].w);
    for (let i = 1; i < jml.length && hasil.length; i++) {
      hasil = iris(hasil, await daftarKata(jml[i].w));
    }
    return hasil;
  }

  async function hitungCari(q, frasa, fanId) {
    const kata = kataKunci(q);
    if (!kata.length) return 0;
    const id = await idHalaman(kata);
    if (!fanId) return id.length;
    const rows = await ambilInfoHalaman(id.slice(0, 4000), fanId);
    return rows.length;
  }

  /** ambil keterangan halaman berdasarkan daftar id */
  async function ambilInfoHalaman(id, fanId, batas, lewati) {
    if (!id.length) return [];
    const potong = id.slice(0, 900);          // batas aman panjang kueri
    const tanda = potong.map(() => '?').join(',');
    const sql = `SELECT h.id, h.kitab_id, h.urut, h.juz, h.hal, h.teks,
                        k.judul, k.pengarang, k.fan_nama, k.fan_id
                 FROM halaman h JOIN kitab k ON k.id = h.kitab_id
                 WHERE h.id IN (${tanda})` +
                (fanId ? ' AND k.fan_id = ?' : '') +
                ' ORDER BY h.kitab_id, h.urut' +
                (batas ? ' LIMIT ' + (+batas) + ' OFFSET ' + (+(lewati || 0)) : '');
    const par = fanId ? potong.concat([fanId]) : potong;
    return tanya(sql, par);
  }

  /** periksa frasa persis di dalam teks */
  function adaFrasa(teks, frasaSeragam) {
    return seragam(teks).indexOf(frasaSeragam) >= 0;
  }

  async function cari(q, { frasa = false, fanId = null, batas = 30 } = {}) {
    const kata = kataKunci(q);
    if (!kata.length) return [];
    const id = await idHalaman(kata);
    if (!id.length) return [];
    const frasaS = frasa ? kata.join(' ') : null;
    const hasil = [];
    let mulai = 0;
    // ambil bertahap sampai cukup (perlu, karena frasa disaring belakangan)
    while (hasil.length < batas && mulai < id.length) {
      const potong = id.slice(mulai, mulai + 600);
      mulai += 600;
      const rows = await ambilInfoHalaman(potong, fanId);
      for (const r of rows) {
        r.isi = bukaTeks(r.teks);
        delete r.teks;
        if (frasaS && !adaFrasa(r.isi, frasaS)) continue;
        hasil.push(r);
        if (hasil.length >= batas) break;
      }
      if (!frasa && !fanId) break;   // tanpa saringan, satu putaran cukup
    }
    return hasil;
  }

  async function cariJudul(q, batas = 60) {
    const n = seragam(q).trim();
    if (!n) return [];
    return tanya(
      `SELECT id, judul, pengarang, fan_nama, jml_halaman FROM kitab
       WHERE judul LIKE ? OR pengarang LIKE ? LIMIT ?`,
      ['%' + q + '%', '%' + q + '%', batas]);
  }

  /* ---------- catatan pribadi ---------- */
  async function catatanSemua() {
    return tanya(`SELECT * FROM catatan ORDER BY diubah DESC`);
  }
  async function catatanSimpan(c) {
    const skr = new Date().toISOString();
    if (c.id) {
      await jalankan(
        `UPDATE catatan SET judul=?, isi=?, label=?, diubah=? WHERE id=?`,
        [c.judul, c.isi, c.label || '', skr, c.id]);
      return c.id;
    }
    await jalankan(
      `INSERT INTO catatan (judul,isi,label,tempel_kitab,tempel_urut,asal,dibuat,diubah)
       VALUES (?,?,?,?,?,?,?,?)`,
      [c.judul, c.isi, c.label || '', c.tempel_kitab || null,
       c.tempel_urut || null, c.asal || 'ketik', skr, skr]);
    const r = await satu(`SELECT MAX(id) id FROM catatan`);
    return r ? r.id : null;
  }
  async function catatanHapus(id) {
    await jalankan(`DELETE FROM catatan WHERE id=?`, [id]);
  }
  async function catatanCari(q) {
    return tanya(
      `SELECT * FROM catatan WHERE judul LIKE ? OR isi LIKE ? ORDER BY diubah DESC LIMIT 50`,
      ['%' + q + '%', '%' + q + '%']);
  }

  /* ---------- penanda & riwayat ---------- */
  async function tandaTambah(kitabId, urut, nama) {
    await jalankan(`INSERT INTO tanda (kitab_id,urut,nama,dibuat) VALUES (?,?,?,?)`,
      [kitabId, urut, nama || '', new Date().toISOString()]);
  }
  async function tandaHapus(kitabId, urut) {
    await jalankan(`DELETE FROM tanda WHERE kitab_id=? AND urut=?`, [kitabId, urut]);
  }
  async function tandaAda(kitabId, urut) {
    const r = await satu(`SELECT id FROM tanda WHERE kitab_id=? AND urut=?`, [kitabId, urut]);
    return !!r;
  }
  async function tandaSemua() {
    return tanya(`SELECT t.*, k.judul FROM tanda t JOIN kitab k ON k.id=t.kitab_id
                  ORDER BY t.dibuat DESC LIMIT 200`);
  }
  async function riwayatSimpan(kitabId, urut) {
    await jalankan(`INSERT OR REPLACE INTO riwayat (kitab_id,urut,waktu) VALUES (?,?,?)`,
      [kitabId, urut, new Date().toISOString()]);
  }
  async function riwayatAmbil(batas = 12) {
    return tanya(`SELECT r.*, k.judul, k.fan_nama FROM riwayat r
                  JOIN kitab k ON k.id=r.kitab_id ORDER BY r.waktu DESC LIMIT ?`, [batas]);
  }

  return {
    seragam, kataKunci, bukaTeks, diAndroid,
    bukaPeramban, bukaAndroid, pasangDariBerkas, siapkanTabelPengguna,
    get mode() { return mode; },
    get siap() { return siap; },
    tanya, jalankan, satu,
    info, daftarFan, kitabDiFan, kitab,
    halaman, halamanPertama, halamanSebelahnya, babKitab,
    cari, hitungCari, cariJudul, daftarKata, bukaDaftar,
    catatanSemua, catatanSimpan, catatanHapus, catatanCari,
    tandaTambah, tandaHapus, tandaAda, tandaSemua,
    riwayatSimpan, riwayatAmbil
  };
})();
