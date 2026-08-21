/* ============================================================
   TLeserisme23 — pekerja latar untuk versi peramban
   Membaca tleserisme.db sepotong demi sepotong, dari dua tempat:
     - berkas di harddisk sendiri
     - berkas yang tinggal di internet
   Berkasnya tidak pernah dimuat seluruhnya ke ingatan.
   ============================================================ */

import SQLiteFactory from './vendor/wa/wa-sqlite-async.mjs';
import * as SQLite from './vendor/wa/sqlite-api.js';
import * as VFS from './vendor/wa/VFS.js';

/* ---------- sumber 1: berkas di harddisk ---------- */
class SumberLokal {
  constructor(berkas) {
    this.berkas = berkas;
    this.ukuran = berkas.size;
    this.nama = berkas.name || 'tleserisme.db';
    this.blok = 65536;                    // 64 KB — harddisk murah dibaca
  }
  async ambil(awal, akhir) {
    return new Uint8Array(await this.berkas.slice(awal, akhir).arrayBuffer());
  }
}

/* ---------- simpanan awet: potongan yang sudah pernah diambil disimpan
   di penyimpanan peramban, jadi pencarian berikutnya tidak perlu ke
   internet lagi. Inilah yang membuat pemakaian kedua dan seterusnya
   terasa seketika. ---------- */
const NAMA_SIMPANAN = 'tleserisme-potongan-1';
let gudang = null;

async function bukaGudang() {
  if (gudang !== null) return gudang;
  try {
    gudang = (typeof caches !== 'undefined') ? await caches.open(NAMA_SIMPANAN) : false;
  } catch (e) { gudang = false; }
  return gudang;
}

function kunciPotongan(url, nomor) {
  return 'https://potongan.tleserisme/' + encodeURIComponent(url) + '/' + nomor;
}

async function ambilSimpanan(url, nomor) {
  const g = await bukaGudang();
  if (!g) return null;
  try {
    const r = await g.match(kunciPotongan(url, nomor));
    if (!r) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch (e) { return null; }
}

/* Simpanan ini tidak boleh tumbuh tanpa batas. Berkasnya 1,5 GB; kalau dibiarkan,
   lama-lama seluruh isinya mengendap di HP, jatah penyimpanan penuh, lalu peramban
   membuang simpanan orang itu sendiri — termasuk dokumen pribadinya. Jadi dibatasi
   ±150 MB, yang paling lama dipakai dibuang duluan (kunci di Cache API urut
   sesuai urutan masuk, jadi yang terdepan memang yang paling tua). */
const BATAS_KEPING = 600;          // 600 x 256 KB = ±150 MB
let sejakPangkas = 0;

async function pangkasSimpanan(g) {
  try {
    const kunci = await g.keys();
    const lebih = kunci.length - BATAS_KEPING;
    for (let i = 0; i < lebih; i++) await g.delete(kunci[i]);
  } catch (e) { }
}

async function taruhSimpanan(url, nomor, isi) {
  const g = await bukaGudang();
  if (!g) return;
  try {
    await g.put(kunciPotongan(url, nomor),
      new Response(isi, { headers: { 'Content-Type': 'application/octet-stream' } }));
    if (++sejakPangkas >= 100) { sejakPangkas = 0; pangkasSimpanan(g); }
  } catch (e) { /* penyimpanan penuh -- tidak apa-apa */ }
}

/* ---------- sumber 2: berkas di internet ---------- */
class SumberJauh {
  constructor(url, kunci, ukuranTahu) {
    this.url = url;
    this.kunci = kunci || '';
    /* Ukuran berkas tidak berubah-ubah. Kalau sudah pernah diketahui, dipakai
       lagi — supaya membangunkan pekerja yang tadi ditidurkan tidak perlu
       satu perjalanan bolak-balik ke server cuma untuk menanyakan hal yang
       sama. Itu yang bikin kedipannya terasa lebih pendek. */
    this.ukuran = ukuranTahu || 0;
    this.nama = 'tleserisme.db';
    this.blok = 262144;                   // 256 KB — separuh bolak-balik
  }

  kepala(tambahan) {
    const h = Object.assign({}, tambahan || {});
    if (this.kunci) h['X-Kunci'] = this.kunci;
    return h;
  }

  async siap() {
    if (this.ukuran > 0) return;         // sudah tahu dari pembukaan sebelumnya
    let besar = 0;
    const catatan = [];

    // Cara utama: minta 1 byte saja. Ini yang paling luas didukung,
    // termasuk oleh peramban di iPhone yang rewel soal HEAD.
    try {
      const r = await fetch(this.url, {
        headers: this.kepala({ Range: 'bytes=0-0' }),
        cache: 'no-store'
      });
      if (r.status === 401 || r.status === 403) {
        throw new Error('akses ditolak — perpustakaan ini terkunci');
      }
      if (r.status === 206) {
        const cr = r.headers.get('content-range') || '';
        besar = Number((cr.split('/')[1] || '').trim()) || 0;
        if (!besar) catatan.push('server tidak menyebut ukuran berkas');
      } else if (r.status === 200) {
        throw new Error('server mengirim seluruh berkas sekaligus, bukan potongan (Range tidak dilayani)');
      } else if (r.status === 404) {
        throw new Error('berkas tleserisme.db tidak ada di alamat itu (404)');
      } else {
        catatan.push('minta potongan dijawab ' + r.status);
      }
    } catch (e) {
      const m = (e && e.message) || String(e);
      if (/ditolak|Range tidak dilayani|404/.test(m)) throw e;
      catatan.push('minta potongan gagal: ' + ((e && e.name) || '') + ' ' + m);
    }

    // Cadangan: tanya ukurannya lewat HEAD
    if (!besar) {
      try {
        const r = await fetch(this.url, {
          method: 'HEAD', headers: this.kepala(), cache: 'no-store'
        });
        if (r.status === 401 || r.status === 403) {
          throw new Error('akses ditolak — perpustakaan ini terkunci');
        }
        if (r.ok) besar = Number(r.headers.get('content-length') || 0) || 0;
        else catatan.push('HEAD dijawab ' + r.status);
      } catch (e) {
        const m = (e && e.message) || String(e);
        if (/ditolak/.test(m)) throw e;
        catatan.push('HEAD gagal: ' + ((e && e.name) || '') + ' ' + m);
      }
    }

    if (!besar) {
      throw new Error('tidak bisa membaca berkas di server. ' + catatan.join(' | '));
    }
    this.ukuran = besar;
  }

  async ambil(awal, akhir) {
    const r = await fetch(this.url, {
      headers: this.kepala({ Range: `bytes=${awal}-${akhir - 1}` })
    });
    if (r.status === 401 || r.status === 403) {
      throw new Error('akses ditolak — kunci salah atau sudah kedaluwarsa');
    }
    if (r.status === 200) {
      throw new Error('server mengirim seluruh berkas, bukan potongan yang diminta');
    }
    if (r.status !== 206) {
      throw new Error('server menjawab ' + r.status);
    }
    return new Uint8Array(await r.arrayBuffer());
  }
}

/* ---------- VFS: hanya-baca ---------- */
class BerkasVFS extends VFS.Base {
  name = 'berkas';

  constructor(sumber) {
    super();
    this.sumber = sumber;
    this.berkas = { size: sumber.ukuran };
    this.terbuka = new Set();
    this.UKUR = sumber.blok;
    // HP punya jatah ingatan ketat. Simpanan besar bikin halaman dibunuh
    // lalu dimuat ulang sendiri, jadi untuk mode internet dibuat lebih hemat.
    /* Catatan jejak dari iPhone menunjukkan potongan yang dipakai hampir
       selalu datang dari simpanan awet, bukan dari internet (10 dari 10).
       Jadi simpanan di ingatan boleh dikecilkan: yang dihemat nyata,
       yang dikorbankan hampir tidak ada. */
    /* Diturunkan lagi jadi 3 MB. Catatan jejak menunjukkan satu pencarian
       mengalirkan ±20 potongan 256 KB (±5 MB) lewat ingatan, jadi simpanan
       sebesar apa pun tetap terkuras habis tiap kali cari — menahannya besar
       cuma menambah beban tetap tanpa menambah kegunaan. Yang benar-benar
       menolong adalah simpanan awet di penyimpanan peramban, dan itu tetap. */
    const jatah = sumber.url ? 3145728 : 33554432;    // 3 MB vs 32 MB
    this.MAKS = Math.max(24, Math.floor(jatah / sumber.blok));
    this.simpanan = new Map();
    this.sedang = new Map();
    this.terakhirNomor = -99;
    this.jmlBaca = 0;
    this.jmlAmbil = 0;
    this.jmlAwet = 0;
  }

  async potongan(nomor, dariAncang) {
    const ada = this.simpanan.get(nomor);
    if (ada) {
      this.simpanan.delete(nomor);
      this.simpanan.set(nomor, ada);
      return ada;
    }
    let jalan = this.sedang.get(nomor);
    if (!jalan) {
      const awal = nomor * this.UKUR;
      const akhir = Math.min(awal + this.UKUR, this.berkas.size);
      const awet = this.sumber.url;      // hanya untuk berkas dari internet
      jalan = (async () => {
        if (awet) {
          const lama = await ambilSimpanan(awet, nomor);
          if (lama) { this.jmlAwet++; return lama; }
        }
        const isi = await this.sumber.ambil(awal, akhir);
        if (awet) taruhSimpanan(awet, nomor, isi);
        return isi;
      })().then(isi => {
        this.simpanan.set(nomor, isi);
        this.jmlAmbil++;
        if (this.simpanan.size > this.MAKS) {
          this.simpanan.delete(this.simpanan.keys().next().value);
        }
        this.sedang.delete(nomor);
        return isi;
      }, e => { this.sedang.delete(nomor); throw e; });
      this.sedang.set(nomor, jalan);
    }
    /* Ancang-ancang cuma boleh dipicu oleh pembacaan SUNGGUHAN, dan cuma
       satu potongan ke depan. Kalau ancang-ancang boleh memicu ancang-ancang
       lagi, dia beranting tanpa henti sampai menyapu seluruh berkas — dulu
       inilah yang diam-diam menyedot ratusan MB. */
    if (!dariAncang) {
      const berurutan = (nomor === this.terakhirNomor + 1);
      this.terakhirNomor = nomor;
      if (berurutan) {
        const lanjut = nomor + 1;
        if (!this.simpanan.has(lanjut) && !this.sedang.has(lanjut) &&
            lanjut * this.UKUR < this.berkas.size) {
          this.potongan(lanjut, true).catch(() => { });
        }
      }
    }
    return jalan;
  }

  xOpen(nama, fileId, bendera, pOutFlags) {
    if (!(bendera & VFS.SQLITE_OPEN_MAIN_DB)) return VFS.SQLITE_CANTOPEN;
    this.terbuka.add(fileId);
    pOutFlags.setInt32(0, VFS.SQLITE_OPEN_READONLY, true);
    return VFS.SQLITE_OK;
  }

  xClose(fileId) {
    this.terbuka.delete(fileId);
    return VFS.SQLITE_OK;
  }

  xRead(fileId, pData, iOffset) {
    return this.handleAsync(async () => {
      this.jmlBaca++;
      const perlu = pData.byteLength;
      let sudah = 0;
      while (sudah < perlu) {
        const posisi = iOffset + sudah;
        if (posisi >= this.berkas.size) break;
        const nomor = Math.floor(posisi / this.UKUR);
        const dalam = posisi - nomor * this.UKUR;
        const potong = await this.potongan(nomor);
        const ambil = Math.min(perlu - sudah, potong.length - dalam);
        if (ambil <= 0) break;
        pData.set(potong.subarray(dalam, dalam + ambil), sudah);
        sudah += ambil;
      }
      if (sudah < perlu) {
        pData.fill(0, sudah);
        return VFS.SQLITE_IOERR_SHORT_READ;
      }
      return VFS.SQLITE_OK;
    });
  }

  xWrite() { return VFS.SQLITE_READONLY; }
  xTruncate() { return VFS.SQLITE_READONLY; }
  xSync() { return VFS.SQLITE_OK; }

  xFileSize(fileId, pSize64) {
    pSize64.setBigInt64(0, BigInt(this.berkas.size), true);
    return VFS.SQLITE_OK;
  }

  xLock() { return VFS.SQLITE_OK; }
  xUnlock() { return VFS.SQLITE_OK; }
  xCheckReservedLock(fileId, pResOut) { pResOut.setInt32(0, 0, true); return VFS.SQLITE_OK; }
  xSectorSize() { return 4096; }
  xDeviceCharacteristics() { return VFS.SQLITE_IOCAP_IMMUTABLE; }
  xAccess(nama, bendera, pResOut) { pResOut.setInt32(0, 0, true); return VFS.SQLITE_OK; }
  xDelete() { return VFS.SQLITE_OK; }
}

/* ---------- keadaan ---------- */
let sqlite3 = null;
let db = null;
let vfs = null;
let modulWasm = null;   // dipegang supaya besar ingatannya bisa dilaporkan

async function siapkan(muatan) {
  const sumber = muatan.url
    ? new SumberJauh(muatan.url, muatan.kunci, muatan.ukuran)
    : new SumberLokal(muatan.berkas);
  if (sumber.siap) await sumber.siap();

  const modul = modulWasm = await SQLiteFactory({
    locateFile: (nama) => new URL('./vendor/wa/' + nama, import.meta.url).href
  });
  sqlite3 = SQLite.Factory(modul);
  vfs = new BerkasVFS(sumber);
  sqlite3.vfs_register(vfs, false);
  db = await sqlite3.open_v2('tleserisme.db', SQLite.SQLITE_OPEN_READONLY, 'berkas');

  /* Ingatan SQLite di dalam WebAssembly tidak pernah menyusut lagi setelah
     sempat membesar. Jadi batasnya dipatok dari awal, jangan dibiarkan
     memakai bawaannya. Untuk berkas dari internet dibuat lebih hemat lagi:
     yang mahal di sana bukan ingatan, tapi bolak-baliknya ke server, dan
     itu sudah ditangani simpanan potongan di lapisan bawah. */
  const hemat = !!muatan.url;
  for (const p of [
    'PRAGMA cache_size = ' + (hemat ? -1200 : -4000),   // 1,2 MB / 4 MB
    'PRAGMA temp_store = MEMORY',
    'PRAGMA mmap_size = 0'
  ]) {
    try { await tanya(p); } catch (e) { /* bukan hal yang bikin gagal */ }
  }

  const cek = await tanya('SELECT nilai FROM info WHERE kunci = ?', ['jml_kitab']);
  if (!cek.length) throw new Error('berkas ini bukan tleserisme.db yang benar');
  return {
    jml_kitab: cek[0].nilai,
    ukuran: sumber.ukuran,
    nama: sumber.nama,
    jauh: !!muatan.url
  };
}

async function tanya(sql, param = []) {
  if (!db) throw new Error('basis data belum dibuka');
  const keluar = [];
  for await (const stmt of sqlite3.statements(db, sql)) {
    if (param && param.length) sqlite3.bind_collection(stmt, param);
    const kolom = sqlite3.column_names(stmt);
    while (await sqlite3.step(stmt) === SQLite.SQLITE_ROW) {
      const baris = sqlite3.row(stmt);
      const o = {};
      for (let i = 0; i < kolom.length; i++) {
        let v = baris[i];
        if (v instanceof Uint8Array) v = v.slice();
        o[kolom[i]] = v;
      }
      keluar.push(o);
    }
  }
  return keluar;
}

/* ---------- percakapan dengan halaman ----------
   Mesin SQLite ini hanya boleh mengerjakan satu pertanyaan pada satu waktu,
   jadi semuanya diantre di sini. */
let antre = Promise.resolve();

self.onmessage = (ev) => {
  const { id, jenis, muatan } = ev.data || {};
  antre = antre.then(async () => {
    try {
      let hasil = null;
      if (jenis === 'buka') hasil = await siapkan(muatan);
      else if (jenis === 'tanya') hasil = await tanya(muatan.sql, muatan.param || []);
      else if (jenis === 'catatan') {
        /* Ingatan WebAssembly sekali membesar tidak pernah menyusut lagi.
           Di iPhone tidak ada satu pun cara baku untuk melihat pemakaian
           ingatan halaman — tapi angka INI bisa dibaca langsung, dan
           inilah tumpukan terbesar yang dipegang aplikasi. Kalau dia
           membengkak, ketahuan di sini. */
        let wasm = 0, isiSimpanan = 0;
        try { wasm = modulWasm && modulWasm.HEAPU8 ? modulWasm.HEAPU8.length : 0; } catch (e) { }
        try { isiSimpanan = vfs.simpanan.size * vfs.UKUR; } catch (e) { }
        hasil = {
          baca: vfs.jmlBaca, ambil: vfs.jmlAmbil, awet: vfs.jmlAwet,
          blok: Math.round(vfs.UKUR / 1024),
          wasmMB: Math.round(wasm / 104857.6) / 10,
          simpananMB: Math.round(isiSimpanan / 104857.6) / 10,
          simpananJml: (vfs.simpanan && vfs.simpanan.size) || 0
        };
      }
      else throw new Error('perintah tidak dikenal: ' + jenis);
      self.postMessage({ id, ok: true, hasil });
    } catch (e) {
      self.postMessage({ id, ok: false, galat: (e && e.message) || String(e) });
    }
  });
};
