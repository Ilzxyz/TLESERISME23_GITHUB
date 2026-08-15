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

  /* ---------- jalan masuk ke Android ----------
     Capacitor menaruh semua colokan di window.Capacitor.Plugins.
     (window.CapacitorFilesystem / window.CapacitorSQLitePlugin TIDAK pernah ada
      kecuali kodenya dibundel pakai npm — punya kita tidak.) */
  function colokan() {
    const C = window.Capacitor;
    if (!C || !C.Plugins) throw new Error('Jembatan Capacitor tidak ditemukan');
    return C.Plugins;
  }
  function FS() {
    const f = colokan().Filesystem;
    if (!f) throw new Error('Colokan Filesystem tidak ada di aplikasi ini');
    return f;
  }
  function SQ() {
    const s = colokan().CapacitorSQLite;
    if (!s) throw new Error('Colokan CapacitorSQLite tidak ada di aplikasi ini');
    return s;
  }
  const MAP = {
    Data: 'DATA', Cache: 'CACHE', Documents: 'DOCUMENTS',
    External: 'EXTERNAL', ExternalStorage: 'EXTERNAL_STORAGE', Library: 'LIBRARY'
  };

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

  /* ---------- mode Chrome: baca berkas dari harddisk ---------- */
  let pekerja = null, noPesan = 0;
  const menunggu = new Map();

  function kirimPekerja(jenis, muatan) {
    return new Promise((ok, gagal) => {
      const id = ++noPesan;
      menunggu.set(id, { ok, gagal });
      pekerja.postMessage({ id, jenis, muatan });
    });
  }

  /** buka tleserisme.db yang dipilih pengguna dari komputernya */
  async function bukaLokal(berkas) {
    if (!berkas || !berkas.size) throw new Error('berkas kosong / tidak terbaca');
    if (pekerja) { pekerja.terminate(); pekerja = null; }
    pekerja = new Worker('pekerja-db.js', { type: 'module' });
    pekerja.onmessage = (ev) => {
      const d = ev.data || {};
      const t = menunggu.get(d.id);
      if (!t) return;
      menunggu.delete(d.id);
      d.ok ? t.ok(d.hasil) : t.gagal(new Error(d.galat));
    };
    pekerja.onerror = (e) => {
      menunggu.forEach(t => t.gagal(new Error('pekerja gagal: ' + (e.message || ''))));
      menunggu.clear();
    };
    const info = await kirimPekerja('buka', { berkas });
    MILIK.muat();
    mode = 'lokal';
    siap = true;
    return info;
  }

  async function bukaAndroid() {
    const s = SQ();
    const ada = await s.isDatabase({ database: NAMA_DB });
    if (!ada || !ada.result) throw new Error('BELUM_ADA_DB');
    try {
      await s.createConnection({
        database: NAMA_DB, version: 1, encrypted: false,
        mode: 'no-encryption', readonly: false
      });
    } catch (e) { /* sudah pernah dibuat, tidak apa-apa */ }
    await s.open({ database: NAMA_DB, readonly: false });
    cap = s;
    mode = 'android';
    siap = true;
  }

  /** pindahkan tleserisme.db dari folder data aplikasi ke tempat plugin
   *  Directory.Data di Android = .../files  -> folder 'files' bagi plugin.
   *  ('default' menunjuk ke .../databases, bukan ke situ) */
  async function pasangDariBerkas(namaBerkas) {
    const s = SQ();
    let galat = null;
    for (const folder of ['files', 'default']) {
      try {
        await s.moveDatabasesAndAddSuffix({
          folderPath: folder, dbNameList: [namaBerkas]
        });
        const ada = await s.isDatabase({ database: NAMA_DB });
        if (ada && ada.result) return;
        galat = new Error('berkas tidak sampai ke tempatnya');
      } catch (e) {
        galat = e;
      }
    }
    throw galat || new Error('gagal memasang');
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
    if (mode === 'lokal') {
      return kirimPekerja('tanya', { sql, param });
    }
    const r = await SQ().query({
      database: NAMA_DB, statement: sql, values: param, readonly: false
    });
    return (r && r.values) || [];
  }

  async function jalankan(sql, param = []) {
    if (mode === 'lokal') return;      // basis data kitab hanya-baca di Chrome
    if (mode === 'peramban') {
      sqljs.run(sql, param);
      return;
    }
    await SQ().run({
      database: NAMA_DB, statement: sql, values: param,
      transaction: false, readonly: false
    });
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

  /* ---------- pembatas: cari di satu kitab saja ---------- */
  const rentangKitab = new Map();

  /** id halaman satu kitab itu berurutan, jadi cukup tahu ujung-ujungnya */
  async function rentang(kitabId) {
    if (rentangKitab.has(kitabId)) return rentangKitab.get(kitabId);
    const r = await satu(
      'SELECT MIN(id) a, MAX(id) b FROM halaman WHERE kitab_id = ?', [kitabId]);
    const v = (r && r.a != null) ? { a: r.a, b: r.b } : null;
    rentangKitab.set(kitabId, v);
    return v;
  }

  /** ambil bagian daftar terurut yang nilainya antara a dan b */
  function potongRentang(id, a, b) {
    let lo = 0, hi = id.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (id[m] < a) lo = m + 1; else hi = m; }
    const awal = lo;
    hi = id.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (id[m] <= b) lo = m + 1; else hi = m; }
    return id.slice(awal, lo);
  }

  /** saring daftar id halaman supaya benar-benar cuma dari kitab itu */
  async function saringKitab(id, kitabId) {
    if (!id.length) return [];
    const r = await rentang(kitabId);
    if (!r) return [];
    const sempit = potongRentang(id, r.a, r.b);
    if (!sempit.length) return [];
    const keluar = [];
    for (let i = 0; i < sempit.length; i += 900) {
      const p = sempit.slice(i, i + 900);
      const rows = await tanya(
        `SELECT id FROM halaman WHERE id IN (${p.map(() => '?').join(',')})
         AND kitab_id = ? ORDER BY id`, p.concat([kitabId]));
      rows.forEach(x => keluar.push(x.id));
    }
    return keluar;
  }

  async function hitungCari(q, frasa, fanId, kitabId) {
    const kata = kataKunci(q);
    if (!kata.length) return 0;
    let id = await idHalaman(kata);
    if (kitabId) id = await saringKitab(id, kitabId);
    if (!fanId) return id.length;
    const rows = await ambilInfoHalaman(id.slice(0, 4000), fanId);
    return rows.length;
  }

  /** ambil keterangan halaman berdasarkan daftar id */
  async function ambilInfoHalaman(id, fanId, batas, lewati, kitabId) {
    if (!id.length) return [];
    const potong = id.slice(0, 900);          // batas aman panjang kueri
    const tanda = potong.map(() => '?').join(',');
    const sql = `SELECT h.id, h.kitab_id, h.urut, h.juz, h.hal, h.teks,
                        k.judul, k.pengarang, k.fan_nama, k.fan_id
                 FROM halaman h JOIN kitab k ON k.id = h.kitab_id
                 WHERE h.id IN (${tanda})` +
                (fanId ? ' AND k.fan_id = ?' : '') +
                (kitabId ? ' AND h.kitab_id = ?' : '') +
                ' ORDER BY h.kitab_id, h.urut' +
                (batas ? ' LIMIT ' + (+batas) + ' OFFSET ' + (+(lewati || 0)) : '');
    let par = potong.slice();
    if (fanId) par.push(fanId);
    if (kitabId) par.push(kitabId);
    return tanya(sql, par);
  }

  /** periksa frasa persis di dalam teks */
  function adaFrasa(teks, frasaSeragam) {
    return seragam(teks).indexOf(frasaSeragam) >= 0;
  }

  async function cari(q, { frasa = false, fanId = null, kitabId = null, batas = 30 } = {}) {
    const kata = kataKunci(q);
    if (!kata.length) return [];
    let id = await idHalaman(kata);
    if (kitabId) id = await saringKitab(id, kitabId);
    if (!id.length) return [];
    const frasaS = frasa ? kata.join(' ') : null;
    const hasil = [];
    let mulai = 0;
    // ambil bertahap sampai cukup (perlu, karena frasa disaring belakangan)
    while (hasil.length < batas && mulai < id.length) {
      const potong = id.slice(mulai, mulai + 600);
      mulai += 600;
      const rows = await ambilInfoHalaman(potong, fanId, null, null, kitabId);
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

  /* ============================================================
     Di Chrome, berkas kitab hanya-baca. Jadi catatan, penanda,
     dan riwayat disimpan terpisah di penyimpanan peramban.
     ============================================================ */
  const MILIK = {
    kunci: 'tleserisme23.milik',
    data: null,
    muat() {
      if (this.data) return this.data;
      try { this.data = JSON.parse(localStorage.getItem(this.kunci) || 'null'); }
      catch (e) { this.data = null; }
      if (!this.data) this.data = { catatan: [], tanda: [], riwayat: [], nomor: 1 };
      for (const k of ['catatan', 'tanda', 'riwayat']) {
        if (!Array.isArray(this.data[k])) this.data[k] = [];
      }
      return this.data;
    },
    simpan() {
      try { localStorage.setItem(this.kunci, JSON.stringify(this.data)); }
      catch (e) { console.warn('penyimpanan peramban penuh', e); }
    }
  };

  /** ambil judul kitab untuk sederet id sekaligus */
  async function judulKitab(ids) {
    const bersih = [...new Set(ids.filter(x => x != null))];
    if (!bersih.length) return {};
    const baris = await tanya(
      'SELECT id, judul, fan_nama FROM kitab WHERE id IN (' +
      bersih.map(() => '?').join(',') + ')', bersih);
    const peta = {};
    baris.forEach(b => peta[b.id] = b);
    return peta;
  }

  const LOKAL = {
    async catatanSemua() {
      return MILIK.muat().catatan.slice().sort((a, b) =>
        String(b.diubah).localeCompare(String(a.diubah)));
    },
    async catatanSimpan(c) {
      const d = MILIK.muat(), skr = new Date().toISOString();
      if (c.id) {
        const a = d.catatan.find(x => x.id === c.id);
        if (a) { a.judul = c.judul; a.isi = c.isi; a.label = c.label || ''; a.diubah = skr; }
        MILIK.simpan();
        return c.id;
      }
      const id = d.nomor++;
      d.catatan.push({
        id, judul: c.judul, isi: c.isi, label: c.label || '',
        tempel_kitab: c.tempel_kitab || null, tempel_urut: c.tempel_urut || null,
        asal: c.asal || 'ketik', dibuat: skr, diubah: skr
      });
      MILIK.simpan();
      return id;
    },
    async catatanHapus(id) {
      const d = MILIK.muat();
      d.catatan = d.catatan.filter(x => x.id !== id);
      MILIK.simpan();
    },
    async catatanCari(q) {
      const n = String(q || '').toLowerCase();
      return (await LOKAL.catatanSemua()).filter(c =>
        String(c.judul || '').toLowerCase().includes(n) ||
        String(c.isi || '').toLowerCase().includes(n)).slice(0, 50);
    },
    async tandaTambah(kitabId, urut, nama) {
      const d = MILIK.muat();
      if (!d.tanda.some(t => t.kitab_id === kitabId && t.urut === urut)) {
        d.tanda.push({
          id: d.nomor++, kitab_id: kitabId, urut,
          nama: nama || '', dibuat: new Date().toISOString()
        });
        MILIK.simpan();
      }
    },
    async tandaHapus(kitabId, urut) {
      const d = MILIK.muat();
      d.tanda = d.tanda.filter(t => !(t.kitab_id === kitabId && t.urut === urut));
      MILIK.simpan();
    },
    async tandaAda(kitabId, urut) {
      return MILIK.muat().tanda.some(t => t.kitab_id === kitabId && t.urut === urut);
    },
    async tandaSemua() {
      const t = MILIK.muat().tanda.slice().sort((a, b) =>
        String(b.dibuat).localeCompare(String(a.dibuat))).slice(0, 200);
      const peta = await judulKitab(t.map(x => x.kitab_id));
      return t.map(x => Object.assign({}, x, { judul: (peta[x.kitab_id] || {}).judul || '' }));
    },
    async riwayatSimpan(kitabId, urut) {
      const d = MILIK.muat();
      d.riwayat = d.riwayat.filter(r => r.kitab_id !== kitabId);
      d.riwayat.unshift({ kitab_id: kitabId, urut, waktu: new Date().toISOString() });
      d.riwayat = d.riwayat.slice(0, 60);
      MILIK.simpan();
    },
    async riwayatAmbil(batas = 12) {
      const r = MILIK.muat().riwayat.slice(0, batas);
      const peta = await judulKitab(r.map(x => x.kitab_id));
      return r.map(x => Object.assign({}, x, {
        judul: (peta[x.kitab_id] || {}).judul || '',
        fan_nama: (peta[x.kitab_id] || {}).fan_nama || ''
      }));
    }
  };

  const SQLAN = {
    catatanSemua, catatanSimpan, catatanHapus, catatanCari,
    tandaTambah, tandaHapus, tandaAda, tandaSemua,
    riwayatSimpan, riwayatAmbil
  };
  /** pilih sendiri: kalau di Chrome pakai penyimpanan peramban, selain itu pakai SQL */
  function bagi(nama) {
    return (...a) => (mode === 'lokal' ? LOKAL : SQLAN)[nama](...a);
  }

  return {
    seragam, kataKunci, bukaTeks, diAndroid,
    FS, SQ, MAP,
    bukaPeramban, bukaAndroid, bukaLokal, pasangDariBerkas, siapkanTabelPengguna,
    get mode() { return mode; },
    get siap() { return siap; },
    tanya, jalankan, satu,
    info, daftarFan, kitabDiFan, kitab,
    halaman, halamanPertama, halamanSebelahnya, babKitab,
    cari, hitungCari, cariJudul, daftarKata, bukaDaftar, saringKitab,
    catatanSemua: bagi('catatanSemua'),
    catatanSimpan: bagi('catatanSimpan'),
    catatanHapus: bagi('catatanHapus'),
    catatanCari: bagi('catatanCari'),
    tandaTambah: bagi('tandaTambah'),
    tandaHapus: bagi('tandaHapus'),
    tandaAda: bagi('tandaAda'),
    tandaSemua: bagi('tandaSemua'),
    riwayatSimpan: bagi('riwayatSimpan'),
    riwayatAmbil: bagi('riwayatAmbil')
  };
})();
