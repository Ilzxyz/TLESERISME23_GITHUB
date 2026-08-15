/* ============================================================
   TLeserisme23 — pekerja latar untuk versi Chrome
   Membaca tleserisme.db LANGSUNG dari harddisk, sepotong demi
   sepotong. Berkas tidak disalin, tidak diunggah, dan tidak
   dimuat seluruhnya ke memori.
   ============================================================ */

import SQLiteFactory from './vendor/wa/wa-sqlite-async.mjs';
import * as SQLite from './vendor/wa/sqlite-api.js';
import * as VFS from './vendor/wa/VFS.js';

/* ---------- VFS: berkas di harddisk, hanya-baca ---------- */
class BerkasVFS extends VFS.Base {
  name = 'berkas';

  constructor(berkas) {
    super();
    this.berkas = berkas;
    this.terbuka = new Set();
    this.UKUR = 65536;        // baca 64 KB sekali ambil
    this.MAKS = 512;          // simpan 512 potongan (~32 MB) di ingatan
    this.simpanan = new Map();
    this.jmlBaca = 0;
    this.jmlAmbil = 0;
  }

  async potongan(nomor) {
    const ada = this.simpanan.get(nomor);
    if (ada) {                                   // dipakai lagi -> taruh paling belakang
      this.simpanan.delete(nomor);
      this.simpanan.set(nomor, ada);
      return ada;
    }
    const awal = nomor * this.UKUR;
    const akhir = Math.min(awal + this.UKUR, this.berkas.size);
    const buf = await this.berkas.slice(awal, akhir).arrayBuffer();
    const isi = new Uint8Array(buf);
    this.simpanan.set(nomor, isi);
    this.jmlAmbil++;
    if (this.simpanan.size > this.MAKS) {
      this.simpanan.delete(this.simpanan.keys().next().value);
    }
    return isi;
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
    // wajib lewat handleAsync: begitulah cara wa-sqlite menunggu janji
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

  // tidak ada berkas jurnal / -wal di sebelahnya
  xAccess(nama, bendera, pResOut) { pResOut.setInt32(0, 0, true); return VFS.SQLITE_OK; }
  xDelete() { return VFS.SQLITE_OK; }
}

/* ---------- keadaan ---------- */
let sqlite3 = null;
let db = null;
let vfs = null;

async function siapkan(berkas) {
  const modul = await SQLiteFactory({
    locateFile: (nama) => new URL('./vendor/wa/' + nama, import.meta.url).href
  });
  sqlite3 = SQLite.Factory(modul);
  vfs = new BerkasVFS(berkas);
  sqlite3.vfs_register(vfs, false);
  db = await sqlite3.open_v2(
    'tleserisme.db',
    SQLite.SQLITE_OPEN_READONLY,
    'berkas'
  );
  // periksa isinya benar
  const cek = await tanya('SELECT nilai FROM info WHERE kunci = ?', ['jml_kitab']);
  if (!cek.length) throw new Error('berkas ini bukan tleserisme.db yang benar');
  return {
    jml_kitab: cek[0].nilai,
    ukuran: berkas.size,
    nama: berkas.name
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
        if (v instanceof Uint8Array) v = v.slice();   // salin, jangan tunjuk ingatan wasm
        o[kolom[i]] = v;
      }
      keluar.push(o);
    }
  }
  return keluar;
}

/* ---------- percakapan dengan halaman ----------
   PENTING: mesin SQLite ini hanya boleh mengerjakan satu pertanyaan
   pada satu waktu. Kalau dua pertanyaan masuk bersamaan, bacaannya
   saling menyerobot dan basis data dikira rusak. Jadi semuanya
   diantre rapi di sini. */
let antre = Promise.resolve();

self.onmessage = (ev) => {
  const { id, jenis, muatan } = ev.data || {};
  antre = antre.then(async () => {
    try {
      let hasil = null;
      if (jenis === 'buka') hasil = await siapkan(muatan.berkas);
      else if (jenis === 'tanya') hasil = await tanya(muatan.sql, muatan.param || []);
      else if (jenis === 'catatan') hasil = { baca: vfs.jmlBaca, ambil: vfs.jmlAmbil };
      else throw new Error('perintah tidak dikenal: ' + jenis);
      self.postMessage({ id, ok: true, hasil });
    } catch (e) {
      self.postMessage({ id, ok: false, galat: (e && e.message) || String(e) });
    }
  });
};
