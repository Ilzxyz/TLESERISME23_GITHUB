/* ============================================================
   TLeserisme23 — dokumen milik pengguna sendiri
   ------------------------------------------------------------
   Word, PDF, dan teks tempelan disimpan DI PERANGKAT INI SAJA.
   Tidak pernah dikirim ke server, tidak pernah terlihat oleh
   pengguna lain — karena datanya memang tidak ada di tempat mereka.

   PENTING — kenapa teksnya dipotong-potong (susunan 2)
   ------------------------------------------------------------
   Susunan lama menyimpan seluruh isi dokumen di dalam satu baris
   yang sama dengan keterangannya. Akibatnya, tiap kali daftar
   dibuka atau pencarian dijalankan, IndexedDB membongkar SELURUH
   isi dokumen ke dalam ingatan — teks aslinya DAN salinan
   seragamnya sekaligus. Satu PDF 3 juta huruf berarti ±12 MB
   sekali angkat, dan itu terjadi setiap kali huruf diketik di
   kotak pencarian.

   Di iPhone (Chrome maupun Safari) jatah ingatan satu tab itu
   ketat. Lonjakan seperti itu bikin halamannya dibunuh diam-diam
   lalu dimuat ulang sendiri — dari sisi pengguna kelihatan seperti
   "tiba-tiba balik ke halaman awal".

   Sekarang:
   - rak "dok" hanya berisi keterangan (judul, jenis, jumlah huruf)
   - rak "pot" berisi teksnya, dipotong 40.000 huruf per keping
   - pencarian membaca satu keping, memeriksanya, lalu melepaskannya
   Berapa pun besar dokumennya, puncak pemakaian ingatan tetap
   sekitar satu keping saja.
   ============================================================ */

const DOK = (() => {
  const NAMA_GUDANG = 'tleserisme23-dokumen';
  const SUSUNAN = 2;
  const RAK = 'dok';                    // keterangan saja
  const RAK_POT = 'pot';                // kepingan teks
  const BATAS_HURUF = 3000000;          // ±3 juta huruf per dokumen
  const POT = 40000;                    // huruf per keping
  const ULANG = 400;                    // tumpang tindih, supaya kata di
                                        // sambungan keping tidak terbelah
  let gudang = null;

  /* ---------------- gudang di perangkat ---------------- */
  function buka() {
    if (gudang) return Promise.resolve(gudang);
    return new Promise((ok, gagal) => {
      const p = indexedDB.open(NAMA_GUDANG, SUSUNAN);
      p.onupgradeneeded = () => {
        const db = p.result;
        if (!db.objectStoreNames.contains(RAK)) {
          const r = db.createObjectStore(RAK, { keyPath: 'id', autoIncrement: true });
          r.createIndex('dibuat', 'dibuat');
        }
        if (!db.objectStoreNames.contains(RAK_POT)) {
          db.createObjectStore(RAK_POT, { keyPath: ['dok', 'no'] });
        }
        /* Isi dokumen lama TIDAK dipindahkan di sini. Membongkar berkas
           3 juta huruf di dalam transaksi pembaruan justru mengulang
           persoalan yang mau diperbaiki. Pemindahannya dikerjakan
           belakangan, satu dokumen sekali jalan, lewat rapikan(). */
      };
      p.onsuccess = () => { gudang = p.result; ok(gudang); };
      p.onerror = () => gagal(p.error || new Error('gudang dokumen tidak bisa dibuka'));
    });
  }

  function kerja(mode, rak, fn) {
    return buka().then(db => new Promise((ok, gagal) => {
      const t = db.transaction(rak, mode);
      const r = fn(t.objectStore(rak), t);
      t.oncomplete = () => ok(r && r.result !== undefined ? r.result : r);
      t.onerror = () => gagal(t.error);
      t.onabort = () => gagal(t.error || new Error('dibatalkan'));
    }));
  }

  /* ---------------- memotong teks ---------------- */

  /** potong jadi keping ±POT huruf; tiap keping bawa salinan seragamnya */
  function potongTeks(teks) {
    const keping = [];
    const langkah = POT - ULANG;
    for (let a = 0; a < teks.length; a += langkah) {
      const bagian = teks.slice(a, a + POT);
      keping.push({
        teks: bagian,
        norm: DB.seragam(bagian),
        ulang: a === 0 ? 0 : ULANG        // berapa huruf depan yang terulang
      });
      if (a + POT >= teks.length) break;
    }
    return keping.length ? keping : [{ teks: '', norm: '', ulang: 0 }];
  }

  async function tulisKeping(id, teks) {
    const keping = potongTeks(teks);
    // ditulis bertahap, bukan sekali angkat, supaya ingatan tidak menumpuk
    for (let i = 0; i < keping.length; i++) {
      const k = keping[i];
      keping[i] = null;                   // lepaskan begitu sudah ditulis
      await kerja('readwrite', RAK_POT, rak =>
        rak.put({ dok: id, no: i, teks: k.teks, norm: k.norm, ulang: k.ulang }));
    }
    return keping.length;
  }

  /* ---------------- membereskan dokumen susunan lama ---------------- */
  let sudahRapi = false;

  /** pindahkan isi dokumen lama ke rak keping, satu per satu */
  async function rapikan() {
    if (sudahRapi) return;
    sudahRapi = true;
    let tertinggal;
    try {
      // ambil daftar id yang isinya masih menempel di keterangannya
      tertinggal = await kerja('readonly', RAK, rak => {
        const daftar = [];
        const c = rak.openCursor();
        c.onsuccess = e => {
          const k = e.target.result;
          if (!k) return;
          if (k.value && k.value.teks != null) daftar.push(k.value.id);
          k.continue();
        };
        return { get result() { return daftar; } };
      });
    } catch (e) { return; }

    for (const id of tertinggal) {
      try {
        const lama = await kerja('readonly', RAK, rak => rak.get(id));
        if (!lama || lama.teks == null) continue;
        const jml = await tulisKeping(id, lama.teks);
        await kerja('readwrite', RAK, rak => rak.put({
          id: lama.id, judul: lama.judul, jenis: lama.jenis,
          huruf: lama.huruf, halaman: lama.halaman,
          dibuat: lama.dibuat, keping: jml
        }));
      } catch (e) { console.warn('membereskan dokumen lama:', e); }
    }
  }

  /* ---------------- membaca ---------------- */

  /** daftar dokumen — ringan, isinya tidak ikut terangkat */
  async function semua() {
    await rapikan();
    const keluar = await kerja('readonly', RAK, rak => {
      const hasil = [];
      const c = rak.openCursor();
      c.onsuccess = e => {
        const k = e.target.result;
        if (!k) return;
        const d = k.value;
        hasil.push({
          id: d.id, judul: d.judul, jenis: d.jenis,
          huruf: d.huruf, halaman: d.halaman, dibuat: d.dibuat,
          keping: d.keping || 0
        });
        k.continue();
      };
      return { get result() { return hasil; } };
    });
    return keluar.sort((a, b) => String(b.dibuat).localeCompare(String(a.dibuat)));
  }

  /** keterangan satu dokumen (tanpa isinya) */
  async function ambil(id) {
    await rapikan();
    const d = await kerja('readonly', RAK, rak => rak.get(id));
    if (!d) return null;
    return {
      id: d.id, judul: d.judul, jenis: d.jenis, huruf: d.huruf,
      halaman: d.halaman, dibuat: d.dibuat, keping: d.keping || 0
    };
  }

  /** satu keping teks; inilah satu-satunya jalan mengambil isi dokumen */
  async function keping(id, no) {
    const k = await kerja('readonly', RAK_POT, rak => rak.get([id, no]));
    return k || null;
  }

  async function hapus(id) {
    const d = await kerja('readonly', RAK, rak => rak.get(id));
    const jml = (d && d.keping) || 0;
    for (let i = 0; i < jml; i++) {
      await kerja('readwrite', RAK_POT, rak => rak.delete([id, i]));
    }
    return kerja('readwrite', RAK, rak => rak.delete(id));
  }

  /* ---------------- pembaca berkas ---------------- */

  /** buka satu berkas di dalam zip (dipakai untuk .docx) */
  function dariZip(buf, namaDicari) {
    const dv = new DataView(buf);
    const n = buf.byteLength;
    // cari penanda akhir daftar isi zip, dari belakang
    let eocd = -1;
    for (let i = n - 22; i >= Math.max(0, n - 66000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('berkas Word ini tidak utuh');
    let pos = dv.getUint32(eocd + 16, true);        // awal daftar isi
    const jml = dv.getUint16(eocd + 10, true);
    const byteKe = new Uint8Array(buf);
    const teksdari = (a, p) => new TextDecoder('utf-8').decode(byteKe.subarray(a, a + p));

    for (let i = 0; i < jml; i++) {
      if (dv.getUint32(pos, true) !== 0x02014b50) break;
      const cara = dv.getUint16(pos + 10, true);
      const besarMampat = dv.getUint32(pos + 20, true);
      const pjNama = dv.getUint16(pos + 28, true);
      const pjTambah = dv.getUint16(pos + 30, true);
      const pjKomen = dv.getUint16(pos + 32, true);
      const awalLokal = dv.getUint32(pos + 42, true);
      const nama = teksdari(pos + 46, pjNama);
      if (nama === namaDicari) {
        const pjNamaL = dv.getUint16(awalLokal + 26, true);
        const pjTambahL = dv.getUint16(awalLokal + 28, true);
        const mulai = awalLokal + 30 + pjNamaL + pjTambahL;
        const isi = byteKe.subarray(mulai, mulai + besarMampat);
        if (cara === 0) return new TextDecoder('utf-8').decode(isi);
        if (cara === 8) {
          return new TextDecoder('utf-8').decode(pako.inflateRaw(isi));
        }
        throw new Error('cara pemampatan Word ini belum didukung');
      }
      pos += 46 + pjNama + pjTambah + pjKomen;
    }
    throw new Error('isi dokumen Word tidak ketemu di dalamnya');
  }

  function lepasTag(xml) {
    return xml
      .replace(/<w:tab[^>]*\/?>/g, '\t')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<w:br[^>]*\/?>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async function dariWord(berkas) {
    const buf = await berkas.arrayBuffer();
    const xml = dariZip(buf, 'word/document.xml');
    const teks = lepasTag(xml);
    if (!teks) throw new Error('dokumen Word ini kosong, atau isinya berupa gambar');
    return { teks, halaman: 0 };
  }

  let pdfjs = null;
  async function muatPdfjs() {
    if (pdfjs) return pdfjs;
    // berkas ini dimuat sebagai skrip biasa, jadi acuannya alamat halaman
    const akar = new URL('.', location.href).href;
    pdfjs = await import(akar + 'vendor/pdf/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = akar + 'vendor/pdf/pdf.worker.min.mjs';
    return pdfjs;
  }

  async function dariPdf(berkas, lapor) {
    const p = await muatPdfjs();
    const buf = await berkas.arrayBuffer();
    const dok = await p.getDocument({ data: new Uint8Array(buf) }).promise;
    const bagian = [];
    for (let i = 1; i <= dok.numPages; i++) {
      if (lapor) lapor('Membaca halaman ' + i + ' dari ' + dok.numPages + '…');
      const hal = await dok.getPage(i);
      const isi = await hal.getTextContent();
      const baris = isi.items.map(x => x.str).join(' ')
        .replace(/[ \t]{2,}/g, ' ').trim();
      if (baris) bagian.push('<ص: ' + i + '>\n' + baris);
      hal.cleanup();
    }
    const jml = dok.numPages;
    await dok.destroy();
    const teks = bagian.join('\n\n');
    if (!teks.trim()) {
      throw new Error('PDF ini tidak punya lapisan teks — kemungkinan hasil pindaian/foto. ' +
        'Perlu diubah dulu jadi teks (OCR) di luar aplikasi ini.');
    }
    return { teks, halaman: jml };
  }

  /* ---------------- berkas mentah OpenITI ----------------
     OpenITI (openiti.org) membagikan ribuan kitab dalam bentuk teks
     bertanda "mARkdown". Berkasnya sering tanpa akhiran nama sama sekali,
     dan isinya penuh penanda yang tidak enak dibaca. Di sini penandanya
     dibersihkan, lalu kitabnya dipecah per juz — karena satu kitab besar
     seperti Ihya' melewati batas 3 juta huruf per dokumen.
     ------------------------------------------------------------------ */
  const TANDA_OPENITI = '######OpenITI#';
  const AKHIR_KEPALA = '#META#Header#End#';
  const RE_HALAMAN = /\s*PageV(\d+)P(\d+)([AB]?)\s*/g;
  const RE_MS = /\s+ms[A-Z]?\d+/g;
  const RE_JUDUL = /^#{1,6}\s*\|+\s*/;
  const RE_ALINEA = /^#\s*/;
  const RE_SAMBUNG = /^~~\s*/;

  function inikahOpenITI(teks) {
    return String(teks || '').slice(0, 300).indexOf(TANDA_OPENITI) >= 0;
  }

  function bersihBaris(t) {
    return t.replace(RE_MS, ' ')
      .replace(/@QB@/g, '﴿').replace(/@QE@/g, '﴾')
      .replace(/%~%/g, '    ');
  }

  /** ubah teks mentah OpenITI jadi daftar {juz, teks} */
  function dariOpenITI(mentah) {
    const baris = mentah.split('\n');
    const ket = {};
    let mulai = 0;
    for (let i = 0; i < baris.length; i++) {
      const b = baris[i];
      if (b.indexOf(AKHIR_KEPALA) === 0) { mulai = i + 1; break; }
      if (b.indexOf('#META#') !== 0) continue;
      const isi = b.slice(6).trim();
      const p = isi.indexOf('::');
      if (p < 0) continue;
      const nilai = isi.slice(p + 2).trim();
      if (!nilai || nilai === 'NODATA') continue;
      const kunci = isi.slice(0, p).trim();
      ket[kunci.slice(kunci.indexOf('.') + 1)] = nilai;
    }

    const hasil = [];
    let alineaJuz = [], sekarang = [], juzKini = 1;

    const tutupAlinea = () => {
      if (!sekarang.length) return;
      const t = sekarang.join(' ').trim();
      sekarang = [];
      if (!t) return;
      // " + " di berkas turunan Shamela memisahkan sisipan takhrij
      t.split(' + ').forEach(x => { x = x.trim(); if (x) alineaJuz.push(x); });
    };
    const tutupJuz = (juz) => {
      tutupAlinea();
      if (alineaJuz.length) hasil.push({ juz, teks: alineaJuz.join('\n\n') });
      alineaJuz = [];
    };

    for (let i = mulai; i < baris.length; i++) {
      let b = baris[i].replace(/\s+$/, '');
      if (!b || b === '#') { tutupAlinea(); continue; }

      const tanda = [];
      RE_HALAMAN.lastIndex = 0;
      b = b.replace(RE_HALAMAN, (m, j, h, sisi) => {
        const nj = parseInt(j, 10), nh = parseInt(h, 10);
        if (nj && nj !== juzKini) tanda.push(['JUZ', nj]);
        if (nh) tanda.push(['HAL', nh + (sisi || '')]);
        return ' ';
      });

      if (RE_JUDUL.test(b)) {
        tutupAlinea();
        const j = bersihBaris(b.replace(RE_JUDUL, '')).trim();
        if (j) alineaJuz.push('\n■ ' + j);
        b = '';
      } else if (RE_SAMBUNG.test(b)) {
        b = bersihBaris(b.replace(RE_SAMBUNG, ''));   // sambungan, bukan alinea baru
      } else if (RE_ALINEA.test(b)) {
        tutupAlinea();
        b = bersihBaris(b.replace(RE_ALINEA, ''));
      } else {
        b = bersihBaris(b);
      }

      if (b.trim()) sekarang.push(b.trim());
      for (const [jenis, nilai] of tanda) {
        if (jenis === 'JUZ') { tutupJuz(juzKini); juzKini = nilai; }
        else sekarang.push('<ص: ' + nilai + '>');
      }
    }
    tutupJuz(juzKini);

    const judul = ket.BookTITLE || '';
    const pengarang = ket.AuthorNAME || ket.AuthorAKA || '';
    const wafat = /^\d+$/.test(ket.AuthorDIED || '') ? ket.AuthorDIED : '';
    return { judul, pengarang, wafat, bagian: hasil };
  }

  /* ---------------- memasukkan dokumen ---------------- */

  /** kembaliannya SELALU larik — satu berkas OpenITI bisa jadi beberapa juz */
  async function masukkanBerkas(berkas, lapor) {
    const nama = berkas.name || 'tanpa nama';
    const kecil = nama.toLowerCase();

    if (lapor) lapor('Membaca ' + nama + '…');

    if (kecil.endsWith('.docx')) {
      const h = await dariWord(berkas);
      return [await simpanTeks(bersihNama(nama), h.teks, 'word', h.halaman, lapor)];
    }
    if (kecil.endsWith('.pdf')) {
      const h = await dariPdf(berkas, lapor);
      return [await simpanTeks(bersihNama(nama), h.teks, 'pdf', h.halaman, lapor)];
    }
    if (kecil.endsWith('.doc')) {
      throw new Error('Format .doc yang lama belum didukung. Buka di Word lalu ' +
        'simpan ulang sebagai .docx, atau salin isinya lalu pakai "Tempel teks".');
    }

    /* Sisanya dicoba sebagai teks — termasuk berkas OpenITI yang memang
       tidak punya akhiran nama sama sekali. */
    let teks;
    try { teks = await berkas.text(); }
    catch (e) { throw new Error('berkas ini tidak bisa dibaca sebagai teks'); }

    if (inikahOpenITI(teks)) {
      if (lapor) lapor('Berkas OpenITI — membersihkan penandanya…');
      const k = dariOpenITI(teks);
      teks = null;                                   // lepaskan yang mentah
      if (!k.bagian.length) throw new Error('berkas OpenITI ini kosong');
      const judul = k.judul || bersihNama(nama);
      const banyak = k.bagian.length > 1;
      const keluar = [];
      for (let i = 0; i < k.bagian.length; i++) {
        const b = k.bagian[i];
        if (lapor) lapor('Menyimpan ' + judul + (banyak ? ' — juz ' + b.juz : '') +
          ' (' + (i + 1) + ' dari ' + k.bagian.length + ')…');
        const kepala = [
          judul + (banyak ? ' — الجزء ' + b.juz : ''),
          k.pengarang + (k.wafat ? ' (ت ' + k.wafat + ')' : ''),
          'Sumber: OpenITI — lisensi CC BY-NC-SA 4.0, wajib menyebut sumber,',
          'tidak untuk diperjualbelikan.',
          '=============================================='
        ].filter(Boolean).join('\n');
        keluar.push(await simpanTeks(
          judul + (banyak ? ' - ج' + b.juz : ''),
          kepala + '\n\n' + b.teks, 'teks', 0, lapor));
        k.bagian[i] = null;                          // lepaskan tiap juz yang sudah masuk
      }
      return keluar;
    }

    const bersih = String(teks).trim();
    if (!bersih) throw new Error('berkasnya kosong');
    if (!kecil.endsWith('.txt') && !kecil.endsWith('.md') &&
        !(berkas.type || '').startsWith('text/') && /[\x00-\x08\x0e-\x1f]/.test(bersih.slice(0, 500))) {
      throw new Error('Jenis berkas ini belum didukung. Yang bisa: .docx, .pdf, ' +
        '.txt, dan berkas mentah OpenITI.');
    }
    return [await simpanTeks(bersihNama(nama), bersih, 'teks', 0, lapor)];
  }

  function bersihNama(nama) {
    return String(nama).replace(/\.[^.]+$/, '') || 'Tanpa judul';
  }

  async function simpanTeks(judul, teks, jenis, halaman, lapor) {
    await rapikan();
    teks = String(teks || '').trim();
    if (!teks) throw new Error('tidak ada tulisan yang bisa diambil');
    if (teks.length > BATAS_HURUF) teks = teks.slice(0, BATAS_HURUF);
    if (lapor) lapor('Menyiapkan pencarian…');

    const ket = {
      judul: judul || 'Tanpa judul',
      jenis: jenis || 'teks',
      huruf: teks.length,
      halaman: halaman || 0,
      dibuat: new Date().toISOString(),
      keping: 0
    };
    const id = await kerja('readwrite', RAK, rak => rak.add(ket));
    const jml = await tulisKeping(id, teks);
    await kerja('readwrite', RAK, rak =>
      rak.put(Object.assign({}, ket, { id, keping: jml })));
    return { id, judul: ket.judul, jenis: ket.jenis, huruf: ket.huruf, halaman: ket.halaman };
  }

  /* ---------------- pencarian ---------------- */

  /* Diperiksa satu keping demi satu keping, lalu kepingnya dilepas.
     Sengaja TIDAK memakai openCursor di rak keping: kursor mengangkat
     satu baris utuh setiap langkah dan menahannya selama transaksi
     berjalan — persis kebiasaan yang bikin ingatan HP jebol. */
  async function cariDiDokumen(m, kata) {
    const jml = m.keping || 0;
    for (let i = 0; i < jml; i++) {
      const k = await keping(m.id, i);
      if (!k) continue;
      const n = k.norm || '';
      let cocok = true, posN = -1;
      for (const w of kata) {
        const j = n.indexOf(w);
        if (j < 0) { cocok = false; break; }
        if (posN < 0) posN = j;
      }
      if (!cocok) continue;
      // perkiraan letak di teks asli: bandingkan panjangnya
      const kira = Math.round(posN * (k.teks.length / Math.max(1, n.length)));
      const a = Math.max(0, kira - 300);
      return {
        dokumen_id: m.id,
        judul: m.judul,
        jenis: m.jenis,
        isi: k.teks.slice(a, a + 900),
        huruf: m.huruf
      };
    }
    return null;
  }

  /** cari di semua dokumen milik sendiri; kembalikan cuplikan seperti hasil kitab */
  async function cari(q, batas = 10) {
    const kata = DB.kataKunci(q);
    if (!kata.length) return [];
    const daftar = await semua();
    const keluar = [];
    for (const m of daftar) {
      if (keluar.length >= batas) break;
      try {
        const h = await cariDiDokumen(m, kata);
        if (h) keluar.push(h);
      } catch (e) { console.warn('cari dokumen ' + m.id + ':', e); }
    }
    return keluar;
  }

  async function jumlah() {
    const s = await semua();
    return s.length;
  }

  return {
    semua, ambil, keping, hapus, masukkanBerkas, simpanTeks,
    cari, jumlah, rapikan, POT, inikahOpenITI, dariOpenITI
  };
})();

/* "const" di tingkat teratas tidak otomatis menempel ke window,
   padahal berkas lain memeriksanya lewat window. Jadi didaftarkan sendiri. */
window.DOK = DOK;
