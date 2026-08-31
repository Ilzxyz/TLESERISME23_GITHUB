/* ============================================================
   TLeserisme23 — logika aplikasi
   ============================================================ */

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => (s || '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const arab = s => /[؀-ۿ]/.test(s || '');
const angka = n => (n || 0).toLocaleString('id-ID');

/* ---------- pengaturan tersimpan ---------- */
const Setel = {
  data: { harakat: true, besar: 18, terang: false, abaikan: true, hamzah: true },
  muat() {
    try {
      const s = localStorage.getItem('tleser_setel');
      if (s) Object.assign(this.data, JSON.parse(s));
    } catch (e) { }
    this.terap();
  },
  simpan() {
    try { localStorage.setItem('tleser_setel', JSON.stringify(this.data)); } catch (e) { }
    this.terap();
  },
  terap() {
    document.documentElement.style.setProperty('--ukuran-ar', this.data.besar + 'px');
    document.body.classList.toggle('terang', this.data.terang);
  }
};

/* ---------- keadaan ---------- */
const S = {
  layar: 'beranda',
  jenisCari: 'semua',
  frasa: false,
  kitab: null,
  halaman: null,
  bab: [],
  qTerakhir: '',
  kitabCari: null,        // batasi pencarian ke satu kitab
  namaKitabCari: ''
};

/* ============================================================
   MULAI
   ============================================================ */
async function mulai() {
  Setel.muat();
  pasangKendali();

  if (DB.diAndroid()) {
    try {
      await DB.bukaAndroid();
      await lanjutJalan();
    } catch (e) {
      if (String(e.message || e).indexOf('BELUM_ADA_DB') >= 0) { tampilPasang(); siapPasangAndroid(); }
      else tampilPasang('Gagal membuka basis data: ' + (e.message || e));
    }
  } else {
    await mulaiChrome();
  }
}

/* ============================================================
   VERSI CHROME — baca tleserisme.db langsung dari harddisk
   ============================================================ */
const GUDANG = 'tleserisme23.pegangan';

function bukaGudang() {
  return new Promise((ok, gagal) => {
    const p = indexedDB.open(GUDANG, 1);
    p.onupgradeneeded = () => p.result.createObjectStore('berkas');
    p.onsuccess = () => ok(p.result);
    p.onerror = () => gagal(p.error);
  });
}
async function simpanPegangan(h) {
  try {
    const db = await bukaGudang();
    await new Promise(ok => {
      const t = db.transaction('berkas', 'readwrite');
      t.objectStore('berkas').put(h, 'db');
      t.oncomplete = ok; t.onerror = ok;
    });
  } catch (e) { }
}
async function ambilPegangan() {
  try {
    const db = await bukaGudang();
    return await new Promise(ok => {
      const t = db.transaction('berkas', 'readonly');
      const r = t.objectStore('berkas').get('db');
      r.onsuccess = () => ok(r.result || null);
      r.onerror = () => ok(null);
    });
  } catch (e) { return null; }
}

function layarChrome(isi, tombol) {
  $('#pasang-teks').innerHTML =
    'Perpustakaan Digital Fikih &amp; Bahtsul Masail<br>Versi Chrome';
  const k = document.querySelector('#pasang .kotak');
  if (k) k.innerHTML = isi;
  $('#btn-pasang').textContent = tombol;
  $('#btn-cari-sendiri').style.display = 'none';
  $('#btn-periksa').style.display = 'none';
  $('#btn-ulang').style.display = 'none';
  const u = $('#btn-unduh'); if (u) u.style.display = 'none';
  const c = $('#btn-contoh');
  c.style.display = 'block';
  c.onclick = pakaiContoh;
}

const AJAKAN_BARU =
  '<h4>◆ Cara pakai</h4>' +
  '<ol>' +
  '<li>Tekan tombol di bawah</li>' +
  '<li>Pilih berkas <code>tleserisme.db</code> di komputermu</li>' +
  '<li>Selesai — semua kitab langsung bisa dicari</li>' +
  '</ol>' +
  '<p style="font-size:11px;opacity:.75;margin:9px 0 0;line-height:1.8">' +
  'Berkasnya dibaca langsung dari harddisk, sepotong demi sepotong. ' +
  'Tidak disalin, tidak diunggah ke internet, dan tidak memenuhi memori. ' +
  'Boleh ditaruh di drive mana saja.</p>';

async function mulaiChrome() {
  tampilPasang();

  // kalau basis datanya sudah ditaruh di internet, pakai itu
  const alamat = (window.KONFIG && window.KONFIG.ALAMAT_DB) || '';
  if (alamat) return await mulaiDariInternet(alamat);

  layarChrome(AJAKAN_BARU, 'Pilih berkas tleserisme.db');

  const pegangan = await ambilPegangan();
  if (pegangan) {
    layarChrome(
      '<h4>◆ Selamat datang kembali</h4>' +
      '<p style="font-size:12.5px;color:var(--ink2);line-height:1.85;margin:0">' +
      'Chrome sudah ingat berkas <code>' + (pegangan.name || 'tleserisme.db') +
      '</code> yang kamu pakai terakhir kali.<br>' +
      'Karena alasan keamanan, Chrome tetap minta satu ketukan darimu ' +
      'sebelum boleh membacanya lagi.</p>',
      'Buka perpustakaan');
    $('#btn-pasang').onclick = () => pakaiPegangan(pegangan);
    const ganti = $('#btn-cari-sendiri');
    ganti.textContent = 'Pilih berkas lain…';
    ganti.style.display = 'block';
    ganti.onclick = pilihBerkasChrome;
    return;
  }
  $('#btn-pasang').onclick = pilihBerkasChrome;
}

/* ---------- basis data yang tinggal di internet (terkunci) ---------- */
const SIMPAN_KUNCI = 'tleserisme23.kunci';
function kunciTersimpan() {
  try { return localStorage.getItem(SIMPAN_KUNCI) || ''; } catch (e) { return ''; }
}
function simpanKunci(k) {
  try { localStorage.setItem(SIMPAN_KUNCI, k); } catch (e) { }
}

async function mulaiDariInternet(alamat) {
  layarChrome(
    '<h4>◆ Menyambung ke perpustakaan</h4>' +
    '<p style="font-size:12.5px;color:var(--ink2);line-height:1.85;margin:0">' +
    'Tidak ada yang perlu kamu unduh. Kitabnya dibaca langsung dari internet, ' +
    'sepotong demi sepotong, sesuai yang kamu cari saja.</p>',
    'Coba sambungkan lagi');
  $('#btn-pasang').onclick = () => mulaiDariInternet(alamat);
  $('#btn-contoh').style.display = 'none';
  laporPasang('Menyambung…');
  try {
    const info = await DB.bukaJauh(alamat, kunciTersimpan());
    laporPasang('Tersambung — ' +
      Number(info.jml_kitab).toLocaleString('id-ID') + ' kitab.');
    await lanjutJalan();
  } catch (e) {
    const m = (e && e.message) || String(e);
    if (/ditolak|401|403/.test(m)) {
      // hosting yang memakai sandi bawaan peramban: cukup muat ulang halaman
      if (window.KONFIG && window.KONFIG.SANDI_PERAMBAN) {
        laporPasang('Perpustakaan ini terkunci dan sesi masukmu sudah berakhir.' +
          '<br><br>Muat ulang halaman ini (tekan F5 atau tarik layar ke bawah), ' +
          'lalu masukkan lagi nama pengguna dan sandinya.', 'var(--bahaya)');
        return;
      }
      return mintaKunci(alamat);
    }
    laporPasang('Tidak bisa menyambung.<br><br>' +
      '<span style="font-size:11.5px;line-height:1.9;opacity:.9">' + esc(m) + '</span>' +
      '<br><br>Periksa sambungan internetmu, lalu tekan tombol di atas.',
      'var(--bahaya)');
  }
}

function mintaKunci(alamat) {
  layarChrome(
    '<h4>◆ Perpustakaan ini terkunci</h4>' +
    '<p style="font-size:12.5px;color:var(--ink2);line-height:1.85;margin:0 0 12px">' +
    'Masukkan kunci yang diberikan pemilik perpustakaan.</p>' +
    '<div class="cari-kotak" style="margin:0">' +
    '<span style="color:var(--gold)">⚿</span>' +
    '<input id="kunci" type="password" placeholder="Kunci…" autocomplete="current-password">' +
    '</div>',
    'Masuk');
  const kirim = async () => {
    const k = (($('#kunci') || {}).value || '').trim();
    if (!k) { laporPasang('Kuncinya belum diisi.', 'var(--bahaya)'); return; }
    simpanKunci(k);
    laporPasang('Memeriksa kunci…');
    await mulaiDariInternet(alamat);
  };
  $('#btn-pasang').onclick = kirim;
  const inp = $('#kunci');
  if (inp) {
    inp.onkeydown = (e) => { if (e.key === 'Enter') kirim(); };
    setTimeout(() => inp.focus(), 60);
  }
}

/** contoh kecil supaya orang bisa mencicipi tanpa punya berkas aslinya */
async function pakaiContoh() {
  try {
    laporPasang('Mengambil contoh…');
    const r = await fetch('uji/uji.db');
    if (!r.ok) throw new Error('berkas contoh tidak ada di server');
    const berkas = new File([await r.blob()], 'tleserisme.db');
    await bukaBerkasChrome(berkas);
  } catch (e) {
    laporPasang('Gagal mengambil contoh: ' + (e.message || e), 'var(--bahaya)');
  }
}

async function pakaiPegangan(h) {
  try {
    laporPasang('Meminta izin membaca berkas…');
    let izin = await h.queryPermission({ mode: 'read' });
    if (izin !== 'granted') izin = await h.requestPermission({ mode: 'read' });
    if (izin !== 'granted') throw new Error('izin membaca berkas tidak diberikan');
    const berkas = await h.getFile();
    await bukaBerkasChrome(berkas);
  } catch (e) {
    laporPasang('Gagal: ' + (e.message || e) +
      '<br><br>Coba tekan “Pilih berkas lain…”.', 'var(--bahaya)');
  }
}

async function pilihBerkasChrome() {
  try {
    if (window.showOpenFilePicker) {
      const [h] = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: 'Basis data TLeserisme', accept: { 'application/octet-stream': ['.db'] } }]
      });
      await simpanPegangan(h);
      const berkas = await h.getFile();
      await bukaBerkasChrome(berkas);
      return;
    }
    // peramban lama: pakai jendela pemilih biasa
    const inp = $('#berkas-pilih');
    inp.onchange = async function () {
      const f = this.files && this.files[0];
      if (f) await bukaBerkasChrome(f);
    };
    inp.click();
  } catch (e) {
    if (e && e.name === 'AbortError') return;      // pengguna membatalkan
    laporPasang('Gagal: ' + (e.message || e), 'var(--bahaya)');
  }
}

async function bukaBerkasChrome(berkas) {
  try {
    laporPasang('Membuka <b>' + berkas.name + '</b> (' +
      rapiUkuran(berkas.size) + ')…');
    const info = await DB.bukaLokal(berkas);
    laporPasang('Berhasil — ' + Number(info.jml_kitab).toLocaleString('id-ID') +
      ' kitab siap dicari.');
    await lanjutJalan();
  } catch (e) {
    const m = (e && e.message) || String(e);
    laporPasang('Gagal membuka: ' + m +
      (/bukan tleserisme/.test(m)
        ? '<br><br>Pastikan yang dipilih benar-benar <code>tleserisme.db</code>, ' +
          'bukan <code>perpustakaan.db</code> atau <code>uji coba.db</code>.'
        : ''), 'var(--bahaya)');
  }
}

/* ------------------------------------------------------------
   Kembali ke tempat terakhir
   ------------------------------------------------------------
   HP boleh saja membunuh halaman ini kapan pun ingatannya sempit —
   itu di luar kuasa kita. Yang ada di tangan kita: begitu halamannya
   hidup lagi, kembalikan orangnya ke tempat dia tadi berhenti.
   Dengan begini "aplikasinya nge-crash" berubah jadi "layarnya
   berkedip sebentar".
   ------------------------------------------------------------ */
const KUNCI_POSISI = 'tleserisme23.posisi';

function simpanPosisi() {
  try {
    sessionStorage.setItem(KUNCI_POSISI, JSON.stringify({
      layar: S.layar,
      q: ($('#q') || {}).value || '',
      jenisCari: S.jenisCari,
      frasa: S.frasa,
      kitabCari: S.kitabCari,
      namaKitabCari: S.namaKitabCari,
      kitab: S.kitab ? S.kitab.id : null,
      urut: S.halaman ? S.halaman.urut : null,
      gulir: (($('#isi') || {}).scrollTop) || 0,
      bagian: S.tampilSampai || 0,
      daftar: (typeof KAT !== 'undefined') ? KAT.jenis : 'kitab',
      waktu: Date.now()
    }));
  } catch (e) { }
}

function ambilPosisi() {
  try {
    const p = JSON.parse(sessionStorage.getItem(KUNCI_POSISI) || 'null');
    // lebih dari sejam berarti bukan lanjutan, tapi kunjungan baru
    if (p && Date.now() - (p.waktu || 0) < 3600000) return p;
  } catch (e) { }
  return null;
}

/* Kalau yang bikin halaman mati justru tempat terakhirnya sendiri — misal satu
   halaman kitab yang kelewat besar — mengembalikan orangnya ke situ berarti
   memutar lingkaran mati yang sama terus. Jadi dihitung: tiga kali berturut-turut
   halaman mati sebelum sempat hidup 20 detik, pemulihannya dilepas dan orangnya
   ditaruh di Beranda. */
const KUNCI_ULANG = 'tleserisme23.pulih';

function hitungPulih() {
  let n = 0;
  try { n = (+sessionStorage.getItem(KUNCI_ULANG) || 0) + 1; sessionStorage.setItem(KUNCI_ULANG, n); }
  catch (e) { }
  /* Halamannya mati di rentang 15-60 detik. Kalau hitungan ini disetel ulang
     terlalu cepat, tiap putaran mati dianggap "yang pertama" dan lingkarannya
     tidak pernah dianggap lingkaran. Jadi tunggu 90 detik: baru sesudah
     halaman benar-benar bertahan selama itu, tempat terakhirnya dianggap aman. */
  setTimeout(() => { try { sessionStorage.setItem(KUNCI_ULANG, '0'); } catch (e) { } }, 90000);
  return n;
}

async function pulihkanPosisi() {
  const p = ambilPosisi();
  if (!p || p.layar === 'beranda') { hitungPulih(); return false; }
  if (hitungPulih() > 3) {
    try { sessionStorage.removeItem(KUNCI_POSISI); } catch (e) { }
    return false;
  }
  try {
    if (p.jenisCari) S.jenisCari = p.jenisCari;
    S.frasa = !!p.frasa;
    /* Pembatas "cari di satu kitab saja" sengaja TIDAK dikembalikan.
       Di catatan jejak kelihatan pembatas itu masih menempel berhari-hari
       tanpa disadari: kata seumum "مصلحة مرسلة" dijawab 0 hasil, padahal
       yang salah cuma karena pencariannya dikurung di satu kitab. Itu mode
       yang dipilih dengan sengaja, jadi biar dipilih ulang dengan sengaja. */
    S.kitabCari = null;
    S.namaKitabCari = '';
    if (typeof KAT !== 'undefined' && p.daftar) KAT.jenis = p.daftar;

    if (p.layar === 'baca' && p.kitab) {
      await bukaKitab(p.kitab, p.urut || 1);
      /* Sampai di halaman yang sama tapi terlempar ke paragraf pertama masih
         terasa seperti kehilangan tempat. Bagian lanjutan yang tadi sudah
         dibuka digambar ulang dulu, baru gulirannya dikembalikan. */
      while ((S.tampilSampai || 0) < (p.bagian || 0) &&
             S.halaman && S.tampilSampai < S.halaman.isi.length) {
        tambahBagianHalaman();
      }
      if (p.gulir > 0) {
        requestAnimationFrame(() => { $('#isi').scrollTop = p.gulir; });
      }
      return true;
    }
    if (p.layar === 'cari' && p.q) {
      /* Kata kuncinya dikembalikan, tapi pencariannya TIDAK dijalankan sendiri.
         Kalau pencarian itu sendiri yang bikin halamannya mati, menjalankannya
         otomatis sesudah hidup lagi sama saja dengan memasang lingkaran mati. */
      pergi('cari');
      $('#q').value = p.q;
      $('#q-hapus').style.display = 'block';
      $$('.chip[data-j]').forEach(c => c.classList.toggle('on', c.dataset.j === S.jenisCari));
      $('#hasil').innerHTML = `<div class="kosong" style="padding:22px">
        Kata kuncimu masih tersimpan di atas.<br>
        Tekan <b>Cari</b> untuk menjalankannya lagi.</div>`;
      return true;
    }
    if (p.layar === 'jelajah' || p.layar === 'koleksi' || p.layar === 'atur') {
      if (typeof KAT !== 'undefined') {
        $$('#pilih-daftar .chip').forEach(c =>
          c.classList.toggle('on', c.dataset.daftar === KAT.jenis));
      }
      pergi(p.layar);
      return true;
    }
  } catch (e) { console.warn('pulihkan posisi:', e); }
  return false;
}

async function lanjutJalan() {
  await DB.siapkanTabelPengguna();
  $('#pasang').classList.remove('on');
  $('#aplikasi').style.display = 'flex';
  await isiBeranda();
  await pulihkanPosisi();
}

function tampilPasang(pesan) {
  $('#aplikasi').style.display = 'none';
  $('#pasang').classList.add('on');
  if (pesan) $('#pasang-pesan').textContent = pesan;
}

/* ============================================================
   PEMASANGAN BASIS DATA (Android)
   ============================================================ */
const NAMA_BERKAS = 'tleserisme.db';

/* tempat-tempat yang dicoba, urut dari yang paling tidak butuh izin */
const TEMPAT = [
  { dir: 'EXTERNAL', sub: '', ket: 'folder aplikasi (Android/data)' },
  { dir: 'EXTERNAL_STORAGE', sub: 'Download', ket: 'Download' },
  { dir: 'EXTERNAL_STORAGE', sub: 'Downloads', ket: 'Downloads' },
  { dir: 'DOCUMENTS', sub: '', ket: 'Documents' },
  { dir: 'EXTERNAL_STORAGE', sub: 'Documents', ket: 'Documents (memori utama)' },
  { dir: 'EXTERNAL_STORAGE', sub: '', ket: 'memori utama' }
];

function laporPasang(t, warna) {
  const p = $('#pasang-pesan');
  p.style.color = warna || 'var(--ink2)';
  p.innerHTML = t;
}

function rapiUkuran(b) {
  if (!b && b !== 0) return '?';
  if (b > 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
  if (b > 1048576) return (b / 1048576).toFixed(0) + ' MB';
  return b + ' B';
}

/** telusuri semua tempat; kembalikan {sumber, jejak, adaYangKebuka} */
async function telusuriBerkas() {
  const Filesystem = DB.FS();
  const jejak = [];
  let sumber = null, adaYangKebuka = false;
  for (const t of TEMPAT) {
    try {
      const r = await Filesystem.readdir({ path: t.sub, directory: t.dir });
      adaYangKebuka = true;
      const isi = r.files || [];
      const ada = isi.find(f => (f.name || f) === NAMA_BERKAS);
      if (ada) {
        if (!sumber) sumber = t;
        jejak.push('✓ ' + t.ket + ' — KETEMU (' + rapiUkuran(ada.size) + ')');
      } else {
        const mirip = isi.map(f => f.name || f)
          .filter(n => /tleserisme/i.test(n) || /\.db$/i.test(n));
        jejak.push('· ' + t.ket + ' — tidak ada' +
          (mirip.length ? ' (tapi ada: ' + mirip.slice(0, 3).join(', ') + ')' : ''));
      }
    } catch (e) {
      jejak.push('✕ ' + t.ket + ' — tidak bisa dibuka');
    }
  }
  return { sumber, jejak, adaYangKebuka };
}

/** tombol "Periksa lokasi" — cuma melaporkan, tidak mengubah apa pun */
async function periksaLokasi() {
  laporPasang('Memeriksa…');
  try {
    const C = window.Capacitor;
    const daftar = (C && C.Plugins) ? Object.keys(C.Plugins).join(', ') : '(kosong)';
    const { jejak } = await telusuriBerkas();
    laporPasang('<b>Hasil pemeriksaan</b><br><span style="font-size:11px;line-height:2">' +
      jejak.join('<br>') + '<br><br>Colokan: ' + daftar + '</span>');
  } catch (e) {
    laporPasang('Gagal memeriksa: ' + (e.message || e), 'var(--bahaya)');
  }
}

/** salin dari folder (cepat, hitungan detik) */
async function salinDariFolder(sumber) {
  const Filesystem = DB.FS();
  const asal = (sumber.sub ? sumber.sub + '/' : '') + NAMA_BERKAS;
  laporPasang('Ketemu di <b>' + sumber.ket + '</b>.<br>' +
    'Menyalin… bisa beberapa menit, <b>jangan ditutup</b>.');
  try { await Filesystem.deleteFile({ path: NAMA_BERKAS, directory: 'DATA' }); } catch (e) { }
  await Filesystem.copy({
    from: asal, directory: sumber.dir,
    to: NAMA_BERKAS, toDirectory: 'DATA'
  });
}

/** salin dari berkas yang dipilih sendiri lewat jendela pemilih HP
 *  (tidak butuh izin apa pun, tapi lebih lambat) */
function bacaB64(irisan) {
  return new Promise((ok, gagal) => {
    const fr = new FileReader();
    fr.onerror = () => gagal(new Error('gagal membaca potongan berkas'));
    fr.onload = () => {
      const s = String(fr.result);
      ok(s.slice(s.indexOf(',') + 1));
    };
    fr.readAsDataURL(irisan);
  });
}

/** kalau satu langkah menggantung lebih dari sekian detik, laporkan — jangan diam */
function dgnBatas(janji, detik, nama) {
  return Promise.race([
    janji,
    new Promise((_, gagal) => setTimeout(
      () => gagal(new Error('langkah "' + nama + '" menggantung lebih dari ' +
        detik + ' detik — tidak ada jawaban dari Android')), detik * 1000))
  ]);
}

async function salinDariPilihan(berkas) {
  const Filesystem = DB.FS();
  if (!berkas || !berkas.size) {
    throw new Error('berkas yang dipilih kosong / tidak terbaca');
  }
  if (!/\.db$/i.test(berkas.name || '')) {
    throw new Error('yang dipilih bukan berkas .db (' + (berkas.name || '?') + ')');
  }

  laporPasang('Langkah 1/3 — membersihkan sisa lama…');
  try {
    await dgnBatas(
      Filesystem.deleteFile({ path: NAMA_BERKAS, directory: 'DATA' }), 30, 'hapus sisa lama');
  } catch (e) { /* wajar kalau memang belum ada */ }

  // potongan kecil: jembatan Android tidak sanggup menelan potongan besar
  const POTONG = 245760;                 // 240 KB, kelipatan 3 supaya base64-nya rapi
  const total = berkas.size;
  let sudah = 0, pertama = true, t0 = Date.now(), akhirLapor = 0;

  while (sudah < total) {
    const irisan = berkas.slice(sudah, Math.min(sudah + POTONG, total));

    if (pertama) laporPasang('Langkah 2/3 — membaca potongan pertama…');
    const b64 = await dgnBatas(bacaB64(irisan), 60, 'baca potongan');

    if (pertama) laporPasang('Langkah 3/3 — menulis potongan pertama…');
    const tulis = pertama
      ? Filesystem.writeFile({ path: NAMA_BERKAS, directory: 'DATA', data: b64 })
      : Filesystem.appendFile({ path: NAMA_BERKAS, directory: 'DATA', data: b64 });
    await dgnBatas(tulis, 60, pertama ? 'tulis potongan pertama' : 'tulis potongan');
    pertama = false;

    sudah += irisan.size;

    const skr = Date.now();
    if (skr - akhirLapor > 400 || sudah >= total) {
      akhirLapor = skr;
      const persen = (sudah / total) * 100;
      const detik = (skr - t0) / 1000;
      const sisa = detik > 3 ? Math.round((total - sudah) / (sudah / detik) / 60) : null;
      laporPasang('Menyalin <b>' + persen.toFixed(1) + '%</b> (' +
        rapiUkuran(sudah) + ' / ' + rapiUkuran(total) + ')' +
        (sisa !== null ? '<br>kira-kira ' + sisa + ' menit lagi' : '') +
        '<br><b>Jangan tutup aplikasi, jangan kunci layar.</b>');
      await new Promise(r => setTimeout(r, 0));
    }
  }
}

/** langkah terakhir: pindahkan ke tempat mesin basis data, lalu buka */
async function pasangkanDanBuka() {
  laporPasang('Memasang…');
  await DB.pasangDariBerkas(NAMA_BERKAS);
  laporPasang('Membuka perpustakaan…');
  await DB.bukaAndroid();
  await lanjutJalan();
}

function tanganiGagalPasang(e) {
  const m = (e && (e.message || e.errorMessage)) || String(e);
  let saran = '';
  if (/space|ENOSPC|penuh|full/i.test(m)) {
    saran = '<br><br>Sepertinya <b>memori HP penuh</b>. Perlu ruang kosong ±2 GB.';
  }
  laporPasang('Gagal: ' + m + saran, 'var(--bahaya)');
}

/** tombol utama */
async function pilihDanPasang() {
  laporPasang('Mencari berkas…');
  try {
    const Filesystem = DB.FS();
    try {
      const iz = await Filesystem.checkPermissions();
      if (iz && iz.publicStorage !== 'granted') await Filesystem.requestPermissions();
    } catch (e) { }

    const { sumber, jejak, adaYangKebuka } = await telusuriBerkas();

    if (!sumber) {
      laporPasang('Berkas <b>tleserisme.db</b> belum bisa dijangkau otomatis.<br><br>' +
        'Tekan tombol <b>“Cari sendiri berkasnya”</b> di bawah — ' +
        'nanti muncul jendela pemilih berkas bawaan HP, ' +
        'pilih <b>tleserisme.db</b> dari folder Download.<br><br>' +
        '<span style="font-size:11px;line-height:2;opacity:.75">' +
        jejak.join('<br>') + '</span>',
        adaYangKebuka ? 'var(--ink2)' : 'var(--bahaya)');
      $('#btn-cari-sendiri').style.display = 'block';
      return;
    }

    await salinDariFolder(sumber);
    await pasangkanDanBuka();
  } catch (e) {
    tanganiGagalPasang(e);
    $('#btn-cari-sendiri').style.display = 'block';
  }
}

/** dipanggil sesudah pengguna memilih berkas sendiri */
async function pakaiBerkasPilihan(berkas) {
  try {
    laporPasang('Menyiapkan…');
    await salinDariPilihan(berkas);
    await pasangkanDanBuka();
  } catch (e) {
    tanganiGagalPasang(e);
  }
}

/* ============================================================
   UNDUH BASIS DATA LANGSUNG DARI INTERNET (Android)
   ------------------------------------------------------------
   Aplikasi mengunduh tleserisme.db SENDIRI ke penyimpanan miliknya,
   sepotong-sepotong, lewat jembatan asli Android (CapacitorHttp) —
   bukan lewat fetch peramban — sehingga:
     • tidak butuh laptop atau file manager
     • tidak terhalang kunci folder Android/data
     • BISA DILANJUTKAN kalau sinyal putus: potongan yang sudah
       tersimpan tidak diunduh ulang (mulai dari ukuran berkas
       separuh-jadi yang masih ada di penyimpanan aplikasi)
   ============================================================ */
const NAMA_UNDUH = 'tleserisme-unduh.db';   // berkas separuh-jadi di folder DATA
const POTONG_UNDUH = 4 * 1024 * 1024;       // 4 MB per tarikan
let unduhBerhenti = false;

function HTTP() {
  const C = window.Capacitor;
  const h = C && C.Plugins && C.Plugins.CapacitorHttp;
  if (!h) throw new Error('Jembatan unduh (CapacitorHttp) tidak tersedia di aplikasi ini');
  return h;
}

/** ambil satu header tanpa peduli besar/kecil hurufnya */
function ambilHeader(h, nama) {
  if (!h) return '';
  nama = nama.toLowerCase();
  for (const k in h) if (k.toLowerCase() === nama) return h[k];
  return '';
}

/** berapa byte yang sudah pernah terunduh (untuk lanjut) */
async function ukuranParsial() {
  try {
    const st = await DB.FS().stat({ path: NAMA_UNDUH, directory: 'DATA' });
    return Number(st.size) || 0;
  } catch (e) { return 0; }
}

/** tanya ukuran berkas penuh ke server (via minta 1 byte) */
async function ukuranTotalServer(url) {
  const r = await HTTP().request({
    method: 'GET', url, headers: { Range: 'bytes=0-0' }, responseType: 'text',
    connectTimeout: 30000, readTimeout: 30000
  });
  if (r.status === 401 || r.status === 403) throw new Error('akses ditolak (berkas terkunci?)');
  if (r.status === 404) throw new Error('berkas tidak ada di alamat itu (404) — cek tag/rilis GitHub-nya');
  const cr = ambilHeader(r.headers, 'content-range');
  let total = Number((String(cr).split('/')[1] || '').trim()) || 0;
  if (!total && r.status === 200) total = Number(ambilHeader(r.headers, 'content-length')) || 0;
  if (!total) throw new Error('server tidak menyebut ukuran berkas (Range tak dilayani)');
  return total;
}

/** atur tampilan tombol unduh */
function siapkanTombolUnduh(sedangJalan, adaParsial) {
  const b = $('#btn-unduh');
  if (!b) return;
  if (sedangJalan) {
    b.textContent = '■ Jeda unduhan';
    b.onclick = () => { unduhBerhenti = true; b.textContent = 'Menghentikan…'; };
  } else {
    b.textContent = adaParsial ? '⭳ Lanjutkan unduhan' : '⭳ Unduh perpustakaan (±1,3 GB)';
    b.onclick = unduhDanPasang;
  }
}

/** siapkan layar pasang Android: tampilkan tombol unduh kalau alamatnya ada */
async function siapPasangAndroid() {
  const url = (window.KONFIG && window.KONFIG.ALAMAT_UNDUH) || '';
  const b = $('#btn-unduh');
  if (!b) return;
  if (!url) { b.style.display = 'none'; return; }
  b.style.display = 'block';
  let parsial = 0;
  try { parsial = await ukuranParsial(); } catch (e) { }
  siapkanTombolUnduh(false, parsial > 0);
  if (parsial > 0) {
    laporPasang('Ada unduhan yang belum kelar (' + rapiUkuran(parsial) +
      '). Tekan <b>Lanjutkan unduhan</b> untuk nyambung dari situ.');
  }
}

/** unduh berkas penuh, sepotong-sepotong, lalu pasang */
async function unduhDanPasang() {
  const url = (window.KONFIG && window.KONFIG.ALAMAT_UNDUH) || '';
  if (!url) { laporPasang('Alamat unduh belum diatur.', 'var(--bahaya)'); return; }

  unduhBerhenti = false;
  const Filesystem = DB.FS();
  siapkanTombolUnduh(true);
  $('#btn-pasang').style.display = 'none';
  $('#btn-cari-sendiri').style.display = 'none';

  try {
    laporPasang('Menyiapkan unduhan…');
    const total = await ukuranTotalServer(url);
    let sudah = await ukuranParsial();
    if (sudah > total) {                       // berkas separuh rusak/beda → mulai ulang
      try { await Filesystem.deleteFile({ path: NAMA_UNDUH, directory: 'DATA' }); } catch (e) { }
      sudah = 0;
    }

    const t0 = Date.now(), sudah0 = sudah;
    let akhirLapor = 0;

    while (sudah < total) {
      if (unduhBerhenti) {
        laporPasang('Unduhan dijeda di ' + rapiUkuran(sudah) + ' / ' + rapiUkuran(total) +
          '.<br>Tekan <b>Lanjutkan unduhan</b> kapan pun untuk nyambung.');
        siapkanTombolUnduh(false, true);
        return;
      }

      const end = Math.min(sudah + POTONG_UNDUH, total) - 1;
      const r = await HTTP().request({
        method: 'GET', url, headers: { Range: 'bytes=' + sudah + '-' + end },
        responseType: 'blob', connectTimeout: 30000, readTimeout: 120000
      });

      // server HARUS jawab potongan (206). Kalau 200 = kirim seluruhnya → tolak,
      // karena menelan 1,3 GB sekaligus bikin HP kehabisan ingatan.
      if (r.status === 200 && (sudah > 0 || end < total - 1)) {
        throw new Error('server tidak melayani potongan (Range) — host ini tak cocok untuk unduh bertahap');
      }
      if (r.status !== 206 && r.status !== 200) throw new Error('server menjawab ' + r.status);

      const b64 = r.data;
      if (!b64) throw new Error('potongan kosong dari server');
      if (sudah === 0) await Filesystem.writeFile({ path: NAMA_UNDUH, directory: 'DATA', data: b64 });
      else await Filesystem.appendFile({ path: NAMA_UNDUH, directory: 'DATA', data: b64 });
      sudah = end + 1;

      const skr = Date.now();
      if (skr - akhirLapor > 500 || sudah >= total) {
        akhirLapor = skr;
        const persen = (sudah / total) * 100;
        const detik = (skr - t0) / 1000;
        const laju = detik > 1 ? (sudah - sudah0) / detik : 0;    // byte/detik
        const sisa = laju > 0 ? Math.round((total - sudah) / laju / 60) : null;
        laporPasang('Mengunduh <b>' + persen.toFixed(1) + '%</b> (' +
          rapiUkuran(sudah) + ' / ' + rapiUkuran(total) + ')' +
          (laju > 0 ? ' · ' + rapiUkuran(laju) + '/dtk' : '') +
          (sisa !== null ? '<br>kira-kira ' + sisa + ' menit lagi' : '') +
          '<br><span style="font-size:11px;opacity:.8;line-height:1.9">Sinyal putus? Santai — ' +
          'tekan lanjut, gak ngulang dari nol. Jangan tutup aplikasi selama mengunduh.</span>');
        await new Promise(r => setTimeout(r, 0));
      }
    }

    laporPasang('Unduhan selesai — memasang…');
    try { await Filesystem.deleteFile({ path: NAMA_BERKAS, directory: 'DATA' }); } catch (e) { }
    await Filesystem.rename({
      from: NAMA_UNDUH, to: NAMA_BERKAS, directory: 'DATA', toDirectory: 'DATA'
    });
    await pasangkanDanBuka();
  } catch (e) {
    const m = (e && (e.message || e.errorMessage)) || String(e);
    laporPasang('Unduhan terhenti: ' + m +
      '<br><br>Tekan <b>Lanjutkan unduhan</b> untuk nyambung dari potongan terakhir.',
      'var(--bahaya)');
    let parsial = 0; try { parsial = await ukuranParsial(); } catch (e2) { }
    siapkanTombolUnduh(false, parsial > 0);
  }
}

/* ============================================================
   NAVIGASI
   ============================================================ */
const JUDUL = {
  beranda: ['TLeserisme23', 'Perpustakaan Fikih & Bahtsul Masail'],
  cari: ['Pencarian', 'Hasil per paragraf'],
  jelajah: ['Daftar kitab', 'Isi perpustakaan'],
  baca: ['Sedang dibaca', ''],
  koleksi: ['Koleksi saya', 'Catatan pribadi'],
  atur: ['Pengaturan', '']
};

function pergi(nama) {
  if (S.layar === 'jelajah' && nama !== 'jelajah' && typeof KAT !== 'undefined') {
    KAT.lepas();
    const w = $('#daftar-kitab');
    if (w) w.innerHTML = '';          // lepaskan juga baris-baris di layar
  }
  S.layar = nama;
  if (nama === 'jelajah' || nama === 'koleksi') S.sorot = [];
  if (nama === 'koleksi' && window.DOK) isiDaftarDokumen();
  $$('.layar').forEach(e => e.classList.toggle('on', e.dataset.layar === nama));
  $$('.nv').forEach(e => e.classList.toggle('on', e.dataset.pergi === nama));
  const j = JUDUL[nama] || JUDUL.beranda;
  $('#bilah-t').textContent = j[0];
  $('#bilah-s').textContent = j[1] || '—';
  $('#isi').scrollTop = 0;
  if (nama === 'cari') {
    // panaskan mesin cari diam-diam sambil orangnya belum selesai mengetik
    if (window.DB && DB.prapanas) DB.prapanas();
    setTimeout(() => $('#q').focus(), 80);
  }
  if (nama === 'jelajah') gambarJelajah();
  if (nama === 'koleksi') isiKoleksi();
  if (nama === 'atur') isiAtur();
  if (nama === 'beranda') isiBeranda();
  simpanPosisi();
}

/* ============================================================
   BERANDA
   ============================================================ */
async function isiBeranda() {
  try {
    const i = await DB.info();
    $('#kpi').innerHTML = `
      <div class="kpi acc"><div class="lab">Kitab tersimpan</div>
        <div class="val">${angka(i.jml_kitab)}</div>
        <div class="sub">Fikih &amp; Bahtsul Masail</div></div>
      <div class="kpi"><div class="lab">Halaman teks</div>
        <div class="val">${(i.jml_halaman / 1000).toFixed(0)} rb</div>
        <div class="sub">terindeks penuh</div></div>`;
    $('#ket-fan').textContent = angka(i.jml_fan) + ' fan ilmu';
  } catch (e) { console.error(e); }

  try {
    const r = await DB.riwayatAmbil(6);
    const w = $('#riwayat');
    if (!r.length) {
      w.innerHTML = `<div class="kosong" style="padding:24px">Belum ada bacaan.<br>
        Mulai dari <b>Jelajah</b> atau <b>Cari</b>.</div>`;
    } else {
      w.innerHTML = r.map(x => `
        <button class="baris" data-buka="${x.kitab_id}" data-urut="${x.urut}">
          <span class="lencana l-fikih">${arab(x.judul) ? 'كتاب' : 'DOC'}</span>
          <span class="n"><span class="t ${arab(x.judul) ? 'ar' : ''}">${esc(x.judul)}</span>
            <span class="m ${arab(x.fan_nama) ? 'ar' : ''}">${esc(x.fan_nama || '')}</span></span>
          <span style="color:var(--ink3)">›</span>
        </button>`).join('');
    }
  } catch (e) { console.error(e); }
}

/* ============================================================
   PENCARIAN
   ============================================================ */
let jamCari = null;

function pasangCari() {
  /* Pencarian dijalankan waktu DIMINTA, bukan tiap huruf diketik.
     Mencari sambil mengetik berarti kata "الطهارة" dicari tujuh kali — tujuh
     kali menyisir indeks, tujuh kali menarik potongan dari berkas 1,5 GB —
     padahal enam di antaranya kata yang belum selesai. Menunggu tombol Cari
     bikin hasilnya justru terasa lebih cepat, dan HP tidak dipaksa bekerja
     untuk pertanyaan yang tidak pernah ditanyakan. */
  const q = $('#q');
  /* Satu ketukan "Cari" di papan ketik HP memicu DUA peristiwa: keydown Enter,
     lalu change waktu kotaknya kehilangan fokus karena blur() di bawah.
     Tanpa penjaga ini, tiap pencarian dijalankan dua kali — dan itu terbukti
     di catatan jejak dari iPhone: "CARI data siap" muncul dua kali berturut-turut
     untuk kata yang sama. Kerjanya dobel, ingatannya dobel, tepat sebelum
     halamannya dibunuh. */
  let mintaTerakhir = '', mintaJam = 0;
  const minta = () => {
    const kata = q.value.trim();
    const skr = Date.now();
    if (kata === mintaTerakhir && skr - mintaJam < 1200) return;
    mintaTerakhir = kata; mintaJam = skr;
    clearTimeout(jamCari);
    q.blur();                       // papan ketik ditutup, hasilnya kelihatan penuh
    jalankanCari();
  };
  q.addEventListener('input', () => {
    $('#q-hapus').style.display = q.value ? 'block' : 'none';
    if (!q.value.trim() && S.qTerakhir) { clearTimeout(jamCari); jalankanCari(); }
  });
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); minta(); } });
  q.addEventListener('change', minta);        // tombol "OK"/"buka" papan ketik HP
  $('#q-cari').onclick = minta;
  $('#q-hapus').onclick = () => {
    q.value = ''; $('#q-hapus').style.display = 'none'; jalankanCari(); q.focus();
  };
  $$('#saring-jenis .chip').forEach(c => c.onclick = () => {
    $$('#saring-jenis .chip').forEach(x => x.classList.remove('on'));
    c.classList.add('on'); S.jenisCari = c.dataset.j; jalankanCari();
  });
  $('#tg-harakat').onclick = function () {
    Setel.data.abaikan = !Setel.data.abaikan;
    this.classList.toggle('on', Setel.data.abaikan);
    this.textContent = (Setel.data.abaikan ? '✓ ' : '') + 'Abaikan harakat';
    Setel.simpan(); jalankanCari();
  };
  $('#tg-frasa').onclick = function () {
    S.frasa = !S.frasa;
    this.classList.toggle('on', S.frasa);
    this.textContent = (S.frasa ? '✓ ' : '') + 'Frasa persis';
    jalankanCari();
  };
}

function petunjukCari() {
  return `<div class="kosong">Ketik kata kunci di atas.<br>
    Hasilnya muncul <b>per paragraf</b>, bukan cuma nama kitab.
    <div style="margin-top:18px;font-size:12px;opacity:.8">
      Contoh: <span class="ar" style="font-size:16px">الطهارة</span> &middot;
      <span class="ar" style="font-size:16px">البيع</span> &middot; zakat &middot; hukum</div></div>`;
}

let sedangCari = false;
let cariKotor = false;      // ada permintaan baru selagi yang lama masih jalan
let sambungCari = null;     // keadaan untuk "tampilkan lebih banyak" (paginasi)
async function jalankanCari() {
  if (sedangCari) { cariKotor = true; return; }
  sedangCari = true;
  cariKotor = false;
  try {
    await jalankanCariSekali();
  } finally {
    sedangCari = false;
  }
  // ulangi kalau pengguna sempat mengetik ATAU mengganti saringan tadi
  const skr = $('#q').value.trim();
  if (cariKotor || skr !== S.qTerakhir) jalankanCari();
}

async function jalankanCariSekali() {
  const w = $('#hasil');
  if (window.JEJAK) JEJAK('CARI mulai: "' + $('#q').value.trim() + '"');
  const q = $('#q').value.trim();
  S.qTerakhir = q;
  simpanPosisi();
  S.sorot = q ? DB.kataKunci(q) : [];
  if (!q) { w.innerHTML = petunjukCari(); return; }
  w.innerHTML = `<div class="muat"><div class="puter"></div>mencari…</div>`;

  try {
    if (S.jenisCari === 'judul') return tampilJudul(await DB.cariJudul(q), q);
    if (S.jenisCari === 'catatan') return tampilPunyaSaya(q);

    const t0 = performance.now();
    // Kalau kitabnya dibaca dari internet, tiap hasil berarti satu bolak-balik
    // ke server. Ambil sedikit dulu supaya cepat muncul.
    const dariInternet = !!(window.KONFIG && window.KONFIG.ALAMAT_DB);
    const hasil = await Promise.race([
      DB.cariLengkap(q, {
        frasa: S.frasa, kitabId: S.kitabCari, batas: dariInternet ? 10 : 30
      }),
      new Promise((_, gagal) => setTimeout(
        () => gagal(new Error('KELAMAAN')), dariInternet ? 30000 : 60000))
    ]);
    const jml = hasil.jml, rows = hasil.rows;
    const ms = Math.round(performance.now() - t0);
    if (window.JEJAK) JEJAK('CARI data siap: ' + jml + ' hasil, ' + rows.length + ' baris, ' +
      rows.reduce((x, r) => x + (r.isi || '').length, 0) + ' huruf, ' + ms + ' md');
    if (q !== S.qTerakhir) return;

    // dokumen milik sendiri dicari duluan, supaya tetap tampil
    // walaupun di kitab kuning tidak ada yang cocok
    let kartuMilik = '';
    if (S.jenisCari === 'semua' && window.DOK) {
      try {
        const milik = await DOK.cari(q, 5);
        if (milik.length) kartuMilik = milik.map(r => kartuDokumen(r, DB.kataKunci(q))).join('');
      } catch (e) { console.warn('cari dokumen:', e); }
    }

    if (!rows.length && kartuMilik) {
      w.innerHTML = `<div class="hitung">Tidak ada di kitab, tapi ada di
        <b>dokumen milikmu</b></div>` + kartuMilik;
      return;
    }

    if (!rows.length) {
      w.innerHTML = `<div class="kosong">Tidak ketemu` +
        (S.kitabCari
          ? ` di <b class="ar">${esc(S.namaKitabCari)}</b>.<br>
             Tekan tanda <b>✕</b> pada nama kitab di atas untuk mencari di semua kitab.`
          : `.<br>Coba kata yang lebih pendek, atau matikan <b>frasa persis</b>.`) +
        `</div>`;
      return;
    }

    const kata = DB.kataKunci(q);
    let h = `<div class="hitung">Ketemu <b>${angka(jml)}</b> paragraf
      ${S.kitabCari ? '&middot; hanya di <b class="ar">' + esc(S.namaKitabCari) + '</b>' : ''}
      ${Setel.data.abaikan ? '&middot; harakat diabaikan' : ''}
      ${S.frasa ? '&middot; frasa persis' : ''} &middot; ${ms} md</div>`;
    if (window.JEJAK) JEJAK('CARI mulai menggambar ' + rows.length + ' kartu');
    // dokumen milik sendiri ditaruh paling atas — itu yang paling dicari pemiliknya
    h += kartuMilik;
    h += `<div id="cari-daftar">` + rows.map(r => kartuHasil(r, kata)).join('') + `</div>`;
    h += `<div id="cari-lanjut"></div>`;
    if (window.JEJAK) JEJAK('CARI kartu jadi, panjang html ' + h.length);
    w.innerHTML = h;

    // siapkan "tampilkan lebih banyak" — semua hasil tetap bisa dibuka,
    // dicicil sepuluh-sepuluh (atau tiga puluh dari HP) tanpa memberatkan.
    if (hasil.lanjut != null) {
      sambungCari = {
        q, frasa: S.frasa, kitabId: S.kitabCari, kata, jml,
        lewati: hasil.lanjut, sudah: rows.length,
        batas: dariInternet ? 10 : 30, perkiraan: !!hasil.perkiraan
      };
      gambarTombolLanjut();
    } else {
      sambungCari = null;
    }
  if (window.JEJAK) JEJAK('CARI selesai tampil di layar');
  if (window.JEJAK && DB.catatanIO) {
    DB.catatanIO().then(c => {
      if (c) JEJAK('IO: ' + c.ambil + ' potongan ' + c.blok + ' KB (' +
        c.awet + ' dari simpanan), ' + c.baca + ' pembacaan');
    });
  }
  } catch (e) {
    if (String(e.message || e) === 'KELAMAAN') {
      if (window.JEJAK) JEJAK('CARI DIHENTIKAN karena kelamaan');
      w.innerHTML = `<div class="kosong">Pencarian ini terlalu lama.<br><br>
        Kata yang sangat umum harus menyisir sangat banyak halaman.
        Coba kata yang lebih khas, atau batasi ke satu kitab lewat tombol
        <b>▤ Semua kitab</b> di atas.</div>`;
      return;
    }
    w.innerHTML = `<div class="kosong">Ada yang salah: ${esc(String(e.message || e))}</div>`;
  }
}

/* Tombol "tampilkan lebih banyak" di bawah daftar hasil. */
function gambarTombolLanjut() {
  const box = $('#cari-lanjut');
  if (!box) return;
  const s = sambungCari;
  if (!s || s.lewati == null) { box.innerHTML = ''; return; }
  // frasa/fan = jumlah pasti belum dihitung -> jangan tampilkan "sisa"
  const sisa = s.perkiraan ? null : Math.max(0, s.jml - s.sudah);
  box.innerHTML =
    `<button class="muat-lagi" id="btn-muat-lagi">Tampilkan ${s.batas} lagi` +
    (sisa != null ? ` &middot; sisa ${angka(sisa)}` : '') + `</button>` +
    `<div class="lanjut-cat">${angka(s.sudah)} dari ${angka(s.jml)}${s.perkiraan ? '+' : ''} paragraf ditampilkan</div>`;
  $('#btn-muat-lagi').onclick = muatLebihCari;
}

async function muatLebihCari() {
  const s = sambungCari;
  if (!s) return;
  const btn = $('#btn-muat-lagi');
  if (btn) { btn.disabled = true; btn.textContent = 'memuat…'; }
  try {
    const hasil = await DB.cariLengkap(s.q, {
      frasa: s.frasa, kitabId: s.kitabId, batas: s.batas, lewati: s.lewati
    });
    // pencarian sudah berganti selagi menunggu -> buang hasil basi
    if (s !== sambungCari || s.q !== S.qTerakhir) return;
    const daftar = $('#cari-daftar');
    if (daftar && hasil.rows.length)
      daftar.insertAdjacentHTML('beforeend', hasil.rows.map(r => kartuHasil(r, s.kata)).join(''));
    s.sudah += hasil.rows.length;
    s.lewati = hasil.lanjut;
    if (hasil.lanjut == null) sambungCari = null;
    gambarTombolLanjut();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Coba lagi'; }
  }
}

function kartuHasil(r, kata) {
  const isAr = arab(r.isi);
  const pos = cariPosisi(r.isi, kata);
  const lebar = isAr ? 230 : 200;
  let cup = potong(r.isi, pos, lebar);
  cup = tandai(cup, kata);
  return `<button class="hit" data-buka="${r.kitab_id}" data-urut="${r.urut}">
      <div class="src"><span class="kt">${esc(r.judul)}</span>
        <span class="loc">&middot; juz ${r.juz} &middot; hal ${r.hal}</span></div>
      <div class="cup ${isAr ? 'ar' : ''}">…${cup}…</div>
    </button>`;
}

function tampilJudul(rows, q) {
  const w = $('#hasil');
  if (!rows.length) { w.innerHTML = `<div class="kosong">Tidak ada judul yang cocok.</div>`; return; }
  w.innerHTML = `<div class="hitung">Ketemu <b>${rows.length}</b> kitab</div>` +
    rows.map(k => `
      <button class="baris" data-buka="${k.id}" data-urut="1">
        <span class="lencana l-fikih">كتاب</span>
        <span class="n"><span class="t ar">${esc(k.judul)}</span>
          <span class="m ar">${esc(k.pengarang || k.fan_nama || '')}</span>
          <span class="m">${angka(k.jml_halaman)} halaman</span></span>
        <span style="color:var(--ink3)">›</span>
      </button>`).join('');
}

function tampilCatatanCari(rows, q) {
  const w = $('#hasil');
  if (!rows.length) {
    w.innerHTML = `<div class="kosong">Belum ada catatan yang cocok.<br>
      Tulis catatan di menu <b>Koleksi</b>.</div>`; return;
  }
  const kata = DB.kataKunci(q);
  w.innerHTML = `<div class="hitung">Ketemu <b>${rows.length}</b> catatan</div>` +
    rows.map(c => `<button class="hit" data-catatan="${c.id}">
      <div class="src"><span>${esc(c.judul || '(tanpa judul)')}</span>
        <span class="loc">&middot; catatan saya</span></div>
      <div class="cup">${tandai(potong(c.isi, cariPosisi(c.isi, kata), 200), kata)}</div>
    </button>`).join('');
}

/* ---------- alat sorot ---------- */
function cariPosisi(teks, kata) {
  if (!kata.length) return 0;
  const p = DB.seragam(teks, true);
  const i = p.n.indexOf(kata[0]);
  if (i < 0) return 0;
  return p.peta[i] !== undefined ? p.peta[i] : 0;
}
function potong(t, pos, lebar) {
  const a = Math.max(0, pos - Math.floor(lebar / 2));
  return (t || '').slice(a, a + lebar);
}
const HARAKAT_RE = /[ً-ْٰـۖ-ۭ]/;
function tandai(s, kata) {
  const p = DB.seragam(s, true);
  const asli = Array.from(s || '');
  const tan = new Array(asli.length).fill(false);
  for (const w of kata) {
    if (!w) continue;
    let i = 0;
    while ((i = p.n.indexOf(w, i)) >= 0) {
      for (let j = i; j < i + w.length && j < p.peta.length; j++) {
        let a = p.peta[j];
        tan[a] = true;
        let b = a + 1;
        while (b < asli.length && HARAKAT_RE.test(asli[b])) { tan[b] = true; b++; }
      }
      i += w.length;
    }
  }
  let out = '', buka = false;
  for (let i = 0; i < asli.length; i++) {
    if (tan[i] && !buka) { out += '<mark>'; buka = true; }
    if (!tan[i] && buka) { out += '</mark>'; buka = false; }
    out += esc(asli[i]);
  }
  if (buka) out += '</mark>';
  return out.replace(/&lt;ص:\s*(\d+)&gt;/g, '<span class="tanda-hal">ص $1</span>');
}

/* ============================================================
   BATASI PENCARIAN KE SATU KITAB
   ============================================================ */
function perbaruiChipKitab() {
  const c = $('#tg-kitab');
  if (S.kitabCari) {
    const n = S.namaKitabCari || 'kitab terpilih';
    c.innerHTML = '✕ ' + esc(n.length > 26 ? n.slice(0, 26) + '…' : n);
    c.classList.add('on');
  } else {
    c.innerHTML = '▤ Semua kitab';
    c.classList.remove('on');
  }
}

function pakaiKitabCari(id, nama) {
  S.kitabCari = id || null;
  S.namaKitabCari = nama || '';
  perbaruiChipKitab();
  tutupTirai();
  pergi('cari');
  if ($('#q').value.trim()) jalankanCari();
}

async function bukaPemilihKitab() {
  tirai('Cari di kitab mana?',
    `<div class="cari-kotak" style="margin-bottom:12px">
       <span style="color:var(--gold)">⌕</span>
       <input id="q-pilih-kitab" placeholder="Ketik nama kitab…" autocomplete="off">
     </div>
     <button class="tombol lembut" id="btn-semua-kitab"
             style="margin-bottom:12px">▤ Semua kitab (tanpa batas)</button>
     <div id="hasil-pilih-kitab"></div>`);

  $('#btn-semua-kitab').onclick = () => pakaiKitabCari(null, '');

  const kotak = $('#hasil-pilih-kitab');
  const inp = $('#q-pilih-kitab');

  async function gambar(q) {
    if (!q || q.trim().length < 2) {
      kotak.innerHTML =
        `<div class="kosong">Ketik minimal 2 huruf nama kitabnya.<br>
         Contoh: <b>فتح</b> atau <b>fathul</b></div>`;
      return;
    }
    kotak.innerHTML = `<div class="muat"><div class="puter"></div>mencari…</div>`;
    try {
      const kt = await DB.cariJudul(q.trim(), 40);
      if (!kt.length) {
        kotak.innerHTML = `<div class="kosong">Tidak ada kitab dengan nama itu.</div>`;
        return;
      }
      kotak.innerHTML = kt.map(k => `
        <button class="baris" data-pilih-kitab="${k.id}"
                data-nama="${esc(k.judul || '')}">
          <span class="lencana l-fikih">KTB</span>
          <span class="n">
            <span class="t ${arab(k.judul) ? 'ar' : ''}">${esc(k.judul || '')}</span>
            <span class="m ${arab(k.pengarang) ? 'ar' : ''}">${esc(k.pengarang || '—')}
              <span class="titik"></span>${angka(k.jml_halaman)} halaman</span>
          </span>
          <span style="color:var(--ink3)">›</span>
        </button>`).join('');
      kotak.querySelectorAll('[data-pilih-kitab]').forEach(b => {
        b.onclick = () => pakaiKitabCari(+b.dataset.pilihKitab, b.dataset.nama);
      });
    } catch (e) {
      kotak.innerHTML = `<div class="kosong">Gagal: ${esc(String(e.message || e))}</div>`;
    }
  }

  let jeda = null;
  inp.oninput = () => { clearTimeout(jeda); jeda = setTimeout(() => gambar(inp.value), 220); };
  gambar('');
  setTimeout(() => inp.focus(), 60);
}

/* ============================================================
   DOKUMEN MILIK SENDIRI
   ============================================================ */
async function tampilPunyaSaya(q) {
  const w = $('#hasil');
  const kata = DB.kataKunci(q);
  let h = '';
  try {
    const dok = window.DOK ? await DOK.cari(q, 30) : [];
    const cat = await DB.catatanCari(q);
    if (!dok.length && !cat.length) {
      w.innerHTML = `<div class="kosong">Tidak ada catatan atau dokumenmu
        yang memuat kata itu.</div>`;
      return;
    }
    h = `<div class="hitung">Ketemu <b>${dok.length}</b> dokumen
         dan <b>${cat.length}</b> catatan</div>`;
    h += dok.map(r => kartuDokumen(r, kata)).join('');
    h += cat.map(c => `
      <button class="baris" data-catatan="${c.id}">
        <span class="lencana l-catatan">✎</span>
        <span class="n"><span class="t">${esc(c.judul || 'Tanpa judul')}</span>
          <span class="m">${esc((c.isi || '').slice(0, 90))}…</span></span>
        <span style="color:var(--ink3)">›</span>
      </button>`).join('');
    w.innerHTML = h;
  } catch (e) {
    w.innerHTML = `<div class="kosong">Gagal: ${esc(String(e.message || e))}</div>`;
  }
}


const IKON_DOK = { word: 'DOC', pdf: 'PDF', teks: 'TXT' };

function rapiHuruf(n) {
  if (n > 1000000) return (n / 1000000).toFixed(1) + ' juta huruf';
  if (n > 1000) return Math.round(n / 1000) + ' rb huruf';
  return n + ' huruf';
}

async function isiDaftarDokumen() {
  const w = $('#daftar-dokumen');
  if (!w) return;
  try {
    const d = await DOK.semua();
    $('#jml-dokumen').textContent = d.length ? d.length + ' dokumen' : '';
    if (!d.length) {
      w.innerHTML = `<div class="kosong">Belum ada dokumen.<br>
        Masukkan berkas Word, PDF, atau tempel teks — semuanya
        ikut tercari bersama kitab kuning.</div>`;
      return;
    }
    w.innerHTML = d.map(x => `
      <button class="baris" data-dok="${x.id}">
        <span class="lencana l-dok">${IKON_DOK[x.jenis] || 'DOC'}</span>
        <span class="n">
          <span class="t ${arab(x.judul) ? 'ar' : ''}">${esc(x.judul)}</span>
          <span class="m">${rapiHuruf(x.huruf)}${x.halaman ? ' · ' + x.halaman + ' halaman' : ''}
            <span class="titik"></span>${String(x.dibuat).slice(0, 10)}</span>
        </span>
        <span style="color:var(--ink3)">›</span>
      </button>`).join('');
  } catch (e) {
    w.innerHTML = `<div class="kosong">Gagal membaca daftar dokumen: ${esc(String(e.message || e))}</div>`;
  }
}

/* ------------------------------------------------------------
   Peringatan sebelum memasukkan dokumen.
   Orang biasanya mengira berkas yang dimasukkan ikut terbit untuk
   semua orang. Jadi katakan dulu, sebelum berkasnya dipilih —
   bukan sesudahnya, waktu sudah terlanjur.
   ------------------------------------------------------------ */
const KUNCI_INGAT = 'tleserisme23.ingat_pribadi';

function ingatkanPribadi(lanjut, labelTombol) {
  let diam = false;
  try { diam = localStorage.getItem(KUNCI_INGAT) === '1'; } catch (e) { }
  if (diam) { lanjut(); return; }

  tirai('Sebelum dimasukkan, harap dibaca',
    `<div style="font-size:13.5px;line-height:1.95;color:var(--ink2)">
       <p style="margin:0 0 12px">Dokumen yang kamu masukkan
         <b style="color:var(--gold)">tersimpan di perangkat ini saja</b>.</p>
       <div style="background:var(--raise);border:1px solid var(--line2);
            border-radius:12px;padding:12px 14px;margin-bottom:12px">
         <div style="margin-bottom:7px">✓ Kamu sendiri yang bisa membacanya.</div>
         <div style="margin-bottom:7px">✓ Ia ikut tercari bersama kitab kuning,
           dan muncul di <b>Daftar kitab → Kitab punyaku</b>.</div>
         <div style="margin-bottom:7px">✗ Pengguna lain
           <b>tidak</b> bisa melihatnya — dokumenmu tidak dikirim ke mana pun.</div>
         <div>✗ Ia <b>tidak</b> ikut pindah kalau kamu ganti HP, ganti peramban,
           atau menghapus data peramban.</div>
       </div>
       <p style="margin:0 0 14px;color:var(--ink3);font-size:12.5px">
         Jadi simpan tetap berkas aslinya. Ini salinan untuk dibaca dan dicari,
         bukan tempat menyimpan satu-satunya.</p>
       <label style="display:flex;gap:9px;align-items:center;font-size:12.5px;
              color:var(--ink3);margin-bottom:14px;cursor:pointer">
         <input type="checkbox" id="ingat-diam" style="width:16px;height:16px">
         Saya sudah paham, jangan ingatkan lagi
       </label>
       <button class="tombol" id="ingat-lanjut">Saya mengerti, ${
         esc(labelTombol || 'pilih berkas')}</button>
     </div>`);
  $('#ingat-lanjut').onclick = () => {
    if ($('#ingat-diam').checked) {
      try { localStorage.setItem(KUNCI_INGAT, '1'); } catch (e) { }
    }
    tutupTirai();
    setTimeout(lanjut, 60);
  };
}

async function imporBerkas(daftar) {
  const w = $('#daftar-dokumen');
  const lapor = (t) => {
    if (w) w.innerHTML = `<div class="muat"><div class="puter"></div>${esc(t)}</div>`;
  };
  let berhasil = 0;
  const gagal = [];
  for (const b of daftar) {
    try {
      // satu berkas OpenITI bisa jadi beberapa dokumen (satu per juz)
      const jadi = await DOK.masukkanBerkas(b, lapor);
      berhasil += (jadi && jadi.length) || 1;
    } catch (e) {
      gagal.push((b.name || 'berkas') + ' — ' + (e.message || e));
    }
  }
  await isiDaftarDokumen();
  if (gagal.length) {
    tirai('Sebagian tidak bisa dimasukkan',
      `<p style="color:var(--ink2);font-size:13px;line-height:1.9">
         Berhasil: <b>${berhasil}</b> dokumen.</p>` +
      gagal.map(g => `<div class="baris" style="cursor:default">
          <span class="lencana l-dok" style="background:rgba(224,100,74,.16);
            color:#F0907A;border-color:rgba(224,100,74,.45)">!</span>
          <span class="n"><span class="m" style="color:var(--ink2)">${esc(g)}</span></span>
        </div>`).join(''));
  } else if (berhasil) {
    tirai('Selesai',
      `<p style="color:var(--ink2);font-size:13.5px;line-height:1.9">
        <b style="color:var(--gold)">${berhasil} dokumen</b> sudah masuk.
        Ia langsung bisa dicari bersama kitab kuning, dan namanya muncul
        di <b>Daftar kitab → Kitab punyaku</b>.<br><br>
        Ingat: tersimpan di perangkat ini saja — tidak dikirim ke mana pun,
        dan tidak terlihat oleh pengguna lain.</p>`);
  }
}

function formTempelTeks() {
  tirai('Tempel teks',
    `<div class="cari-kotak" style="margin-bottom:10px">
       <input id="dok-judul" placeholder="Judul, misal: Rumusan Bahtsul Kamis">
     </div>
     <textarea id="dok-isi" placeholder="Tempel teksnya di sini…"
       style="width:100%;min-height:220px;background:var(--raise);color:var(--ink);
       border:1px solid var(--line2);border-radius:12px;padding:12px;
       font-size:14px;line-height:1.8;resize:vertical"></textarea>
     <div style="height:10px"></div>
     <button class="tombol" id="dok-simpan">Simpan</button>
     <div class="pesan" id="dok-pesan" style="color:var(--bahaya);font-size:12.5px"></div>`);
  $('#dok-simpan').onclick = async () => {
    const j = $('#dok-judul').value.trim();
    const i = $('#dok-isi').value.trim();
    if (!i) { $('#dok-pesan').textContent = 'Teksnya masih kosong.'; return; }
    try {
      await DOK.simpanTeks(j || 'Teks tempelan', i, 'teks', 0);
      tutupTirai();
      await isiDaftarDokumen();
    } catch (e) {
      $('#dok-pesan').textContent = 'Gagal: ' + (e.message || e);
    }
  };
  setTimeout(() => $('#dok-judul') && $('#dok-judul').focus(), 60);
}

/* Dokumen dibaca sekeping demi sekeping.
   Dulu seluruh isi dokumen ditumpahkan sekaligus ke dalam halaman. Satu PDF
   tiga juta huruf berarti tiga juta huruf teks + jutaan huruf HTML + puluhan
   ribu elemen di layar sekali angkat — di HP itu berakhir dengan halaman
   dibunuh lalu dimuat ulang sendiri. */
async function bukaDokumen(id, sorot) {
  tirai('Memuat…', `<div class="muat"><div class="puter"></div>membuka…</div>`);
  try {
    const d = await DOK.ambil(id);
    if (!d) { $('#tirai-badan').innerHTML = `<div class="kosong">Dokumen tidak ada.</div>`; return; }
    $('#tirai-judul').textContent = d.judul;
    const kata = sorot && sorot.length ? sorot : (S.sorot || []);

    $('#tirai-badan').innerHTML =
      `<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
         <button class="chip" id="dok-hapus">🗑 Hapus dokumen ini</button>
         <span class="chip" style="cursor:default">${rapiHuruf(d.huruf)}</span>
         ${d.keping > 1 ? `<span class="chip" style="cursor:default"
             id="dok-bagian">bagian 1 dari ${d.keping}</span>` : ''}
       </div>
       <div class="dok-baca" id="dok-isi-baca"></div>
       <div id="dok-lanjut-kotak"></div>`;

    const badan = $('#dok-isi-baca');
    let no = 0;

    async function tampilkanKeping() {
      const k = await DOK.keping(id, no);
      if (!k) return;
      // huruf depan yang terulang dari keping sebelumnya dipotong
      const mentah = no === 0 ? k.teks : k.teks.slice(k.ulang || 0);
      const bagian = document.createElement('div');
      if (arab(mentah)) badan.classList.add('ar');
      bagian.innerHTML = kata.length ? tandai(mentah, kata) : esc(mentah);
      badan.appendChild(bagian);
      no++;

      const kotak = $('#dok-lanjut-kotak');
      const nomor = $('#dok-bagian');
      if (nomor) nomor.textContent = 'bagian ' + no + ' dari ' + d.keping;
      if (no < (d.keping || 1)) {
        kotak.innerHTML = `<button class="kt-lagi" id="dok-lanjut">
          Lanjutkan bacaan — bagian ${no + 1} dari ${d.keping}</button>`;
        $('#dok-lanjut').onclick = () => {
          $('#dok-lanjut').textContent = 'memuat…';
          tampilkanKeping();
        };
      } else {
        kotak.innerHTML = d.keping > 1
          ? `<div class="kosong" style="padding:14px;font-size:12px">— habis —</div>` : '';
      }
    }

    await tampilkanKeping();

    $('#dok-hapus').onclick = async () => {
      if (!confirm('Hapus "' + d.judul + '" dari perangkat ini?')) return;
      await DOK.hapus(id);
      tutupTirai();
      await isiDaftarDokumen();
      if (S.layar === 'jelajah' && KAT.jenis === 'milik') gambarDaftarKitab();
    };
  } catch (e) {
    $('#tirai-badan').innerHTML = `<div class="kosong">Gagal: ${esc(String(e.message || e))}</div>`;
  }
}

function kartuDokumen(r, kata) {
  const isAr = arab(r.isi);
  const pos = cariPosisi(r.isi, kata);
  let cup = potong(r.isi, pos, isAr ? 230 : 200);
  cup = tandai(cup, kata);
  return `<button class="hit milik" data-dok="${r.dokumen_id}">
      <div class="src"><span class="${isAr ? 'kt' : ''}">${esc(r.judul)}</span>
        <span class="loc">&middot; punya saya &middot; ${IKON_DOK[r.jenis] || 'DOC'}</span></div>
      <div class="cup ${isAr ? 'ar' : ''}">…${cup}…</div>
    </button>`;
}

/* ============================================================
   DAFTAR KITAB — katalog perpustakaan
   ------------------------------------------------------------
   Pemisahnya BUKAN nama fan, tapi judulnya sendiri. Fan bernama
   Arab seperti "المسائل المجموعات" ternyata isinya 1.091 berkas
   rumusan berbahasa Indonesia — kalau dipisah per fan, seribu
   dokumen itu akan menyamar jadi kitab.
   ============================================================ */
/* Hanya HURUF yang dihitung. Angka, kurung, dan titik sengaja diabaikan,
   supaya judul seperti "الأم (108)" tidak ikut terlempar ke rak bahtsul
   gara-gara tiga angka di belakangnya. */
const HURUF_ARAB = /[ء-يٮٯٱ-ۓݐ-ݿ]/g;
const HURUF_LATIN = /[A-Za-z]/g;

function kadarArab(t) {
  const s = String(t || '');
  const a = (s.match(HURUF_ARAB) || []).length;
  const l = (s.match(HURUF_LATIN) || []).length;
  if (!a && !l) return 0;              // judul berisi angka saja → rak bahtsul
  return a / (a + l);
}

function kunciJudul(j) {
  return String(j || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const KAT = {
  siap: false,
  kitab: [],
  bahtsul: [],
  jenis: 'kitab',
  tampil: 0,
  BATCH: 120,
  LANGKAH: 400,      // baris kitab yang diangkat sekali jalan

  async muat(paksa) {
    if (this.siap && !paksa) return;
    const w = $('#daftar-kitab');
    w.innerHTML = `<div class="muat"><div class="puter"></div>menyusun daftar kitab…</div>`;

    /* Sengaja TIDAK disimpan di localStorage. Daftarnya ±5.000 baris ≈ 1–2 MB,
       sedangkan catatan, tanda, dan riwayat pengguna juga menumpang di sana;
       kalau jatahnya habis, justru catatan pribadi yang gagal tersimpan.
       Tabel kitab sendiri kecil, dan potongannya sudah tersimpan di Cache API,
       jadi memuat ulang tetap cepat. */

    /* Hemat ingatan: nama fan cuma 45 macam untuk ±4.800 baris, jadi
       dipakai ulang satu untai yang sama. Dan judul yang cuma punya satu
       berkas — hampir semuanya — tidak perlu bikin larik anggota sendiri. */
    const namaFan = new Map();
    const pakai = (s) => {
      const t = s || '';
      const ada = namaFan.get(t);
      if (ada !== undefined) return ada;
      namaFan.set(t, t);
      return t;
    };

    /* Diambil BERTAHAP, bukan sekali tarik.
       ------------------------------------------------------------------
       Ini yang ketahuan dari catatan jejak di iPhone: begitu layar Jelajah
       dibuka, pembacaan melonjak dari 15 ke 249 dalam satu denyut, dan
       tak lama kemudian halamannya mati. Sebabnya satu kueri yang menyapu
       seluruh tabel kitab sekaligus: ±4.800 baris dibentuk jadi obyek di
       pekerja latar, disalin utuh melewati batas pesan, lalu dibentuk
       ulang jadi obyek di halaman. Tiga tumpukan besar hidup berbarengan,
       padahal yang akhirnya disimpan cuma ringkasannya.
       Sekarang 400 baris sekali jalan, langsung diringkas, lalu dilepas —
       yang menumpuk cuma ringkasannya. */
    const LANGKAH = this.LANGKAH;
    const kitab = new Map(), bahtsul = new Map();
    let batas = 0, jml = 0;

    for (;;) {
      const baris = await DB.tanya(
        `SELECT id i, judul j, fan_nama f, jml_halaman h FROM kitab
         WHERE id > ? ORDER BY id LIMIT ?`, [batas, LANGKAH]);
      if (!baris.length) break;
      batas = baris[baris.length - 1].i;
      jml += baris.length;

      for (const r of baris) {
        const j = String(r.j || '').trim();
        if (!j) continue;
        if (j.startsWith('~$')) continue;          // berkas autosave Word, bukan dokumen
        const rak = kadarArab(j) > 0.5 ? kitab : bahtsul;
        const k = kunciJudul(j);
        const f = pakai(r.f), h = r.h || 0;
        let g = rak.get(k);
        if (!g) { rak.set(k, { j, h, i: r.i, f, n: 1 }); continue; }
        if (g.n === 1) g.anggota = [{ i: g.i, f: g.f, h: g.h }];
        g.anggota.push({ i: r.i, f, h });
        g.n++;
        if (h > g.h) g.h = h;
      }
      const habis = baris.length < LANGKAH;
      baris.length = 0;                            // lepaskan sebelum ambil lagi
      w.innerHTML = `<div class="muat"><div class="puter"></div>
        menyusun daftar kitab… ${angka(jml)}</div>`;
      if (habis) break;
      // beri napas sejenak supaya pemulung ingatan sempat bekerja
      await new Promise(r => setTimeout(r, 0));
    }

    const urut = (m) => Array.from(m.values())
      .sort((a, b) => a.j.localeCompare(b.j, 'ar'));
    this.kitab = urut(kitab);
    this.bahtsul = urut(bahtsul);
    this.siap = true;
  },

  saring(q) {
    const n = DB.seragam(q || '').trim();
    const asal = this.jenis === 'bahtsul' ? this.bahtsul : this.kitab;
    if (!n) return asal;
    return asal.filter(x => DB.seragam(x.j).indexOf(n) >= 0);
  },

  /* Daftar ini ±3.500 baris dan tetap menempel di ingatan selama aplikasi
     hidup, padahal cuma dipakai di satu layar. Di HP, beban tetap seperti itu
     yang bikin halaman jadi sasaran empuk waktu HP-nya butuh ingatan. Jadi
     dilepas begitu ditinggalkan — menyusunnya ulang cuma perlu sepersekian
     detik, karena potongannya sudah ada di simpanan awet. */
  lepas() {
    if (!this.siap) return;
    this.kitab = [];
    this.bahtsul = [];
    this.siap = false;
    this.tampil = 0;
  }
};

function barisKitab(g, tanda, warna) {
  const banyak = g.n > 1;
  const i = banyak ? g.anggota[0].i : g.i;
  const f = banyak ? g.anggota[0].f : g.f;
  return `<button class="kt-baris" data-kt="${i}"
      ${banyak ? 'data-grup="' + esc(kunciJudul(g.j)) + '"' : ''}>
      <span class="tanda ${warna}">${tanda}</span>
      <span class="nm">
        <span class="j ${arab(g.j) ? 'ar' : ''}">${esc(g.j)}</span>
        <span class="k ${arab(f) ? 'ar' : ''}">${esc(f)}${
          banyak ? ' &middot; ' + g.n + ' berkas' : ''}</span>
      </span>
      <span class="jml">${angka(g.h)} hal</span>
    </button>`;
}

async function gambarDaftarKitab(tambah) {
  const w = $('#daftar-kitab');
  const q = ($('#q-fan') || {}).value || '';

  if (KAT.jenis === 'milik') return gambarKitabMilik(q);

  const hasil = KAT.saring(q);
  if (!tambah) KAT.tampil = 0;
  KAT.tampil = Math.min(hasil.length, KAT.tampil + KAT.BATCH);

  if (!hasil.length) {
    w.innerHTML = q.trim()
      ? `<div class="kosong">Tidak ada yang cocok dengan
          "<b>${esc(q)}</b>" di daftar ini.</div>`
      : `<div class="kosong">Daftar ini masih kosong.</div>`;
    return;
  }

  const tanda = KAT.jenis === 'bahtsul' ? 'BM' : 'كتاب';
  const warna = KAT.jenis === 'bahtsul' ? 'l-bahtsul' : 'l-fikih';
  let h = `<div class="kt-kepala">Menampilkan <b>${angka(KAT.tampil)}</b>
    dari <b>${angka(hasil.length)}</b>
    ${KAT.jenis === 'bahtsul' ? 'dokumen bahtsul' : 'kitab'}${q ? ' yang cocok' : ''}</div>`;
  h += hasil.slice(0, KAT.tampil).map(g => barisKitab(g, tanda, warna)).join('');
  if (KAT.tampil < hasil.length) {
    h += `<button class="kt-lagi" id="kt-lagi">Tampilkan ${
      Math.min(KAT.BATCH, hasil.length - KAT.tampil)} lagi</button>`;
  }
  w.innerHTML = h;
  const lagi = $('#kt-lagi');
  if (lagi) lagi.onclick = () => gambarDaftarKitab(true);
}

async function gambarKitabMilik(q) {
  const w = $('#daftar-kitab');
  if (!window.DOK) { w.innerHTML = `<div class="kosong">Belum siap.</div>`; return; }
  const d = await DOK.semua();
  const n = String(q || '').toLowerCase().trim();
  const pilih = n ? d.filter(x => String(x.judul).toLowerCase().indexOf(n) >= 0) : d;
  if (!pilih.length) {
    w.innerHTML = `<div class="kosong">Belum ada kitab yang kamu masukkan sendiri.<br><br>
      Buka <b>Koleksi</b> lalu tekan <b>Masukkan dokumen</b> —
      berkas Word atau PDF apa pun bisa jadi kitabmu sendiri di sini.</div>`;
    return;
  }
  w.innerHTML = `<div class="kt-kepala">Ada <b>${pilih.length}</b> kitab milikmu sendiri
      &middot; tersimpan di perangkat ini saja</div>` +
    pilih.map(x => `
      <button class="kt-baris" data-dok="${x.id}">
        <span class="tanda l-dok">${IKON_DOK[x.jenis] || 'DOC'}</span>
        <span class="nm">
          <span class="j ${arab(x.judul) ? 'ar' : ''}">${esc(x.judul)}</span>
          <span class="k">punyaku &middot; ${String(x.dibuat).slice(0, 10)}</span>
        </span>
        <span class="jml">${x.halaman ? angka(x.halaman) + ' hal' : rapiHuruf(x.huruf)}</span>
      </button>`).join('');
}

/** kalau satu judul dipakai beberapa berkas, tampilkan anggotanya */
async function bukaGrupKitab(kunci) {
  const asal = KAT.jenis === 'bahtsul' ? KAT.bahtsul : KAT.kitab;
  const g = asal.find(x => kunciJudul(x.j) === kunci);
  if (!g || !g.anggota) return;
  tirai(g.j, `<p style="color:var(--ink2);font-size:12.5px;margin:0 0 12px">
      Ada <b style="color:var(--gold)">${g.n} berkas</b> dengan judul sama,
      dari folder yang berbeda. Pilih salah satu:</p>` +
    g.anggota.map((x, n) => `
      <button class="kt-baris" data-buka="${x.i}" data-urut="1">
        <span class="tanda l-fikih">${n + 1}</span>
        <span class="nm"><span class="j" style="font-size:13px">${esc(x.f || '(tanpa fan)')}</span></span>
        <span class="jml">${angka(x.h)} hal</span>
      </button>`).join(''));
}

/* ============================================================
   JELAJAH
   ============================================================ */

/** dipanggil setiap kali layar Jelajah dibuka atau chip diganti */
async function gambarJelajah() {
  const perFan = KAT.jenis === 'fan';
  $('#pohon').style.display = perFan ? '' : 'none';
  $('#daftar-kitab').style.display = perFan ? 'none' : '';
  if (perFan) { await isiPohon(); saringPohon(); return; }
  if (KAT.jenis !== 'milik') {
    try { await KAT.muat(); nomorChip(); }
    catch (e) {
      $('#daftar-kitab').innerHTML =
        `<div class="kosong">Gagal menyusun daftar: ${esc(String(e.message || e))}</div>`;
      return;
    }
  }
  await gambarDaftarKitab();
}

/** tempelkan jumlahnya di chip, supaya pertanyaan "isinya apa saja"
    sudah separuh terjawab sebelum orang menggulir */
function nomorChip() {
  if (!KAT.siap) return;
  const set = (jenis, teks) => {
    const c = $(`#pilih-daftar .chip[data-daftar="${jenis}"]`);
    if (c) c.textContent = teks;
  };
  set('kitab', 'Kitab · ' + angka(KAT.kitab.length));
  set('bahtsul', 'Bahtsul Masail · ' + angka(KAT.bahtsul.length));
}

/** kotak ketik — arahkan ke daftar kitab atau ke pohon fan */
function saringJelajah() {
  if (KAT.jenis === 'fan') saringPohon();
  else gambarDaftarKitab();
}

function saringPohon() {
  const v = DB.seragam(($('#q-fan').value || '').trim());
  $$('#pohon .simpul').forEach(s => {
    const nm = DB.seragam(s.querySelector('.nm').textContent);
    s.style.display = (!v || nm.indexOf(v) >= 0) ? '' : 'none';
  });
}

let fanTermuat = false;
async function isiPohon(paksa) {
  if (fanTermuat && !paksa) return;
  const w = $('#pohon');
  w.innerHTML = `<div class="muat"><div class="puter"></div>memuat…</div>`;
  try {
    const fan = await DB.daftarFan();
    w.innerHTML = fan.map(f => `
      <div class="simpul" data-fan="${f.id}">
        <div class="hd"><span class="cx">▶</span>
          <span class="nm ${arab(f.nama) ? '' : 'latin'}">${esc(f.nama)}</span>
          <span class="ct">${angka(f.jml_kitab)}</span></div>
        <div class="anak"></div>
      </div>`).join('');
    fanTermuat = true;
  } catch (e) {
    w.innerHTML = `<div class="kosong">Gagal memuat fan: ${esc(String(e))}</div>`;
  }
}

async function bukaFan(simpul) {
  const id = simpul.dataset.fan;
  const anak = simpul.querySelector('.anak');
  simpul.classList.toggle('buka');
  if (!simpul.classList.contains('buka') || anak.dataset.isi) return;
  anak.innerHTML = `<div class="muat"><div class="puter"></div>memuat…</div>`;
  const kitab = await DB.kitabDiFan(id, 400);
  anak.innerHTML = kitab.map(k => `
    <button class="daun" data-buka="${k.id}" data-urut="1">
      <span class="jd ${arab(k.judul) ? '' : 'latin'}">${esc(k.judul)}</span>
      <span class="hl">${angka(k.jml_halaman)} hal</span>
    </button>`).join('') || `<div class="kosong" style="padding:18px">kosong</div>`;
  anak.dataset.isi = '1';
}

/* ============================================================
   BACA
   ============================================================ */
async function bukaKitab(kitabId, urut) {
  pergi('baca');
  $('#nass').innerHTML = `<div class="muat"><div class="puter"></div>memuat…</div>`;
  try {
    S.kitab = await DB.kitab(kitabId);
    S.bab = [];
    const h = await DB.halaman(kitabId, urut || 1) || await DB.halamanPertama(kitabId);
    S.halaman = h;
    gambarBaca();
    DB.riwayatSimpan(kitabId, h ? h.urut : 1).catch(() => { });
    simpanPosisi();
  } catch (e) {
    $('#nass').innerHTML = `<div class="kosong">Gagal membuka: ${esc(String(e))}</div>`;
  }
}

function gambarBaca() {
  const k = S.kitab, h = S.halaman;
  if (!k) return;
  $('#baca-judul').textContent = k.judul || '';
  $('#baca-judul').style.direction = arab(k.judul) ? 'rtl' : 'ltr';
  $('#baca-judul').style.textAlign = arab(k.judul) ? 'right' : 'left';
  $('#baca-pengarang').textContent = k.pengarang || '';
  $('#baca-pengarang').style.display = k.pengarang ? 'block' : 'none';
  $('#bilah-t').textContent = k.judul ? (k.judul.length > 26 ? k.judul.slice(0, 26) + '…' : k.judul) : 'Baca';
  $('#bilah-s').textContent = k.fan_nama || '';

  if (!h) { $('#nass').innerHTML = `<div class="kosong">Kitab ini kosong.</div>`; return; }
  $('#baca-meta').innerHTML =
    `juz ${h.juz} <span class="titik"></span> halaman ${h.hal}
     <span class="titik"></span> ${angka(k.jml_halaman)} halaman`;

  const el = $('#nass');
  el.innerHTML = '';
  el.classList.toggle('latin', !arab(h.isi));
  S.tampilSampai = 0;
  tambahBagianHalaman();

  const persen = k.jml_halaman ? Math.min(100, h.urut / k.jml_halaman * 100) : 0;
  $('#p-bar').style.width = Math.max(1, persen) + '%';
  $('#p-pos').textContent = h.hal + ' / ' + angka(k.jml_halaman);
  DB.tandaAda(k.id, h.urut).then(a => $('#a-tanda').classList.toggle('on', a));
  $('#isi').scrollTop = 0;
}

/* Sebagian "halaman" di Syamilah sebenarnya satu bab utuh — bisa ratusan ribu
   huruf. Menumpahkannya sekaligus berarti teksnya, salinan HTML-nya, dan puluhan
   ribu elemen layar sekali angkat; di HP halamannya keburu dibunuh. Jadi
   ditampilkan sepotong-sepotong, dengan tombol lanjut kalau memang sepanjang itu. */
const BATAS_TAMPIL = 60000;

function tambahBagianHalaman() {
  const h = S.halaman;
  if (!h) return;
  const el = $('#nass');
  const a = S.tampilSampai || 0;
  const b = Math.min(h.isi.length, a + BATAS_TAMPIL);
  if (a >= b && a > 0) return;

  let t = (S.sorot && S.sorot.length)
    ? tandai(h.isi.slice(a, b), S.sorot)
    : esc(h.isi.slice(a, b)).replace(/&lt;ص:\s*(\d+)&gt;/g, '<span class="tanda-hal">ص $1</span>');
  if (!Setel.data.harakat) t = t.replace(/[ً-ْٰ]/g, '');
  if (window.JEJAK) JEJAK('BACA menggambar ' + t.length + ' huruf html (dari ' + a + ')');

  const lama = $('#nass-lanjut');
  if (lama) lama.remove();
  const bagian = document.createElement('div');
  bagian.innerHTML = t;
  el.appendChild(bagian);
  S.tampilSampai = b;

  if (b < h.isi.length) {
    const tb = document.createElement('button');
    tb.className = 'kt-lagi';
    tb.id = 'nass-lanjut';
    tb.textContent = 'Lanjutkan halaman ini — ' +
      angka(Math.round((h.isi.length - b) / 1000)) + ' rb huruf lagi';
    tb.onclick = tambahBagianHalaman;
    el.appendChild(tb);
  }
  if (window.JEJAK) JEJAK('BACA selesai tampil');
}

async function lompat(arah) {
  if (!S.kitab || !S.halaman) return;
  const h = await DB.halamanSebelahnya(S.kitab.id, S.halaman.urut, arah);
  if (!h) return;
  S.halaman = h;
  gambarBaca();
  DB.riwayatSimpan(S.kitab.id, h.urut).catch(() => { });
  simpanPosisi();
}

async function bukaDaftarIsi() {
  if (!S.kitab) return;
  tirai('Daftar isi', `<div class="muat"><div class="puter"></div>memuat…</div>`);
  if (!S.bab.length) S.bab = await DB.babKitab(S.kitab.id);
  if (!S.bab.length) {
    $('#tirai-badan').innerHTML = `<div class="kosong">Kitab ini tidak punya daftar isi.</div>`;
    return;
  }
  $('#tirai-badan').innerHTML = S.bab.slice(0, 3000).map(b => `
    <button class="bab-baris" data-tuju="${b.tuju}">
      <span class="jd" style="padding-right:${(Math.max(1, b.tingkat) - 1) * 12}px">${esc(b.judul)}</span>
      <span class="hl">${b.tuju}</span>
    </button>`).join('');
}

/* ============================================================
   KOLEKSI
   ============================================================ */
async function isiKoleksi() {
  try {
    const c = await DB.catatanSemua();
    $('#jml-catatan').textContent = c.length ? c.length + ' catatan' : '';
    $('#daftar-catatan').innerHTML = c.length ? c.map(x => `
      <button class="baris" data-catatan="${x.id}">
        <span class="lencana l-catatan">✎</span>
        <span class="n"><span class="t">${esc(x.judul || '(tanpa judul)')}</span>
          <span class="m">${esc((x.isi || '').slice(0, 70))}…</span></span>
        <span style="color:var(--ink3)">›</span>
      </button>`).join('')
      : `<div class="kosong" style="padding:26px">Belum ada catatan.<br>
         Tekan tombol di atas untuk menulis yang pertama.</div>`;

    const t = await DB.tandaSemua();
    $('#daftar-tanda').innerHTML = t.length ? t.map(x => `
      <button class="baris" data-buka="${x.kitab_id}" data-urut="${x.urut}">
        <span class="lencana l-bahtsul">★</span>
        <span class="n"><span class="t ${arab(x.judul) ? 'ar' : ''}">${esc(x.judul)}</span>
          <span class="m">halaman ${x.urut}</span></span>
        <span style="color:var(--ink3)">›</span>
      </button>`).join('')
      : `<div class="kosong" style="padding:22px">Belum ada halaman bertanda.</div>`;
  } catch (e) { console.error(e); }
}

function formCatatan(c) {
  c = c || {};
  tirai(c.id ? 'Ubah catatan' : 'Catatan baru', `
    <input class="isian" id="c-judul" placeholder="Judul catatan" value="${esc(c.judul || '')}">
    <textarea class="isian" id="c-isi" placeholder="Tulis di sini…">${esc(c.isi || '')}</textarea>
    <input class="isian" id="c-label" placeholder="Label, pisahkan koma (mis: zakat, muamalah)" value="${esc(c.label || '')}">
    ${c.tempel_kitab ? `<div style="font-size:11.5px;color:var(--ink3);margin-bottom:10px">
       Menempel pada kitab #${c.tempel_kitab}, halaman ${c.tempel_urut}</div>` : ''}
    <button class="tombol" id="c-simpan">Simpan</button>
    ${c.id ? `<div style="height:8px"></div>
      <button class="tombol lembut" id="c-hapus" style="color:var(--bahaya)">Hapus catatan</button>` : ''}
  `);
  $('#c-simpan').onclick = async () => {
    const isi = $('#c-isi').value.trim();
    if (!isi) { alert('Isinya masih kosong.'); return; }
    await DB.catatanSimpan({
      id: c.id, judul: $('#c-judul').value.trim() || 'Tanpa judul',
      isi, label: $('#c-label').value.trim(),
      tempel_kitab: c.tempel_kitab, tempel_urut: c.tempel_urut, asal: c.asal
    });
    tutupTirai(); if (S.layar === 'koleksi') isiKoleksi();
  };
  if (c.id) $('#c-hapus').onclick = async () => {
    if (!confirm('Hapus catatan ini?')) return;
    await DB.catatanHapus(c.id); tutupTirai(); isiKoleksi();
  };
}

/* ============================================================
   ATUR
   ============================================================ */
async function isiAtur() {
  $('#s-harakat .sw').classList.toggle('on', Setel.data.harakat);
  $('#s-tema .sw').classList.toggle('on', Setel.data.terang);
  $('#s-abaikan .sw').classList.toggle('on', Setel.data.abaikan);
  $('#s-hamzah .sw').classList.toggle('on', Setel.data.hamzah);
  $('#v-besar').textContent = Setel.data.besar + ' pt';
  try {
    const i = await DB.info();
    $('#info-db').innerHTML = `
      <div class="set"><div class="n"><div class="t">Isi perpustakaan</div>
        <div class="s">${angka(i.jml_kitab)} kitab &middot; ${angka(i.jml_halaman)} halaman
        &middot; ${angka(i.jml_fan)} fan</div></div>
        <span class="nilai" style="color:var(--ok)">● Siap</span></div>
      <div class="set"><div class="n"><div class="t">Dibuat</div>
        <div class="s">${esc(i.dibuat || '-')}</div></div></div>
      <div class="set"><div class="n"><div class="t">Cara baca</div>
        <div class="s">${DB.mode === 'android' ? 'SQLite bawaan HP' : DB.mode === 'lokal' ? 'dibaca langsung dari harddisk' : 'peramban (uji coba)'}
        &middot; teks dimampatkan</div></div></div>`;
  } catch (e) { }

  const v = $('#v-jejak');
  if (v && window.JEJAK_BACA) {
    v.textContent = '…';
    JEJAK_BACA().then(t => {
      const mati = (t.match(/HALAMAN DIBUKA/g) || []).length;
      v.textContent = t ? (mati > 1 ? mati + '× dibuka' : 'ada') : 'kosong';
      v.style.color = mati > 2 ? 'var(--ok)' : mati > 1 ? 'var(--gold)' : 'var(--ink3)';
    }, () => { v.textContent = '—'; });
  }
}

/* ------------------------------------------------------------
   Catatan jejak — dibaca dari dalam aplikasi, bukan dari server.
   Tiap kali halaman mati lalu hidup lagi, muncul garis
   "HALAMAN DIBUKA" baru. Baris tepat SEBELUM garis itulah yang
   memberi tahu apa yang sedang berjalan waktu halamannya mati.
   ------------------------------------------------------------ */
async function bukaCatatanJejak() {
  tirai('Catatan jejak', `<div class="muat"><div class="puter"></div>membaca catatan…</div>`);
  const t = window.JEJAK_BACA ? await JEJAK_BACA() : '';
  if (!t) {
    tirai('Catatan jejak', `<div class="kosong">Belum ada catatan.<br><br>
      Perekamnya baru mulai mencatat sejak berkas ini terpasang.
      Coba pakai aplikasinya sebentar, lalu buka lagi halaman ini.</div>`);
    return;
  }
  const mati = (t.match(/HALAMAN DIBUKA/g) || []).length;
  tirai('Catatan jejak',
    `<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
       <button class="chip" id="jejak-salin">⧉ Salin semua</button>
       <button class="chip" id="jejak-hapus">🗑 Kosongkan</button>
       <span class="chip" style="cursor:default">${mati}× halaman dibuka</span>
       <span class="chip" style="cursor:default">${angka(t.length)} huruf</span>
     </div>
     <div style="color:var(--ink3);font-size:11.5px;line-height:1.8;margin-bottom:10px">
       Tekan <b>Salin semua</b>, lalu tempel ke percakapan. Tidak perlu difoto.
     </div>
     <pre id="jejak-isi" style="background:var(--raise);border:1px solid var(--line2);
       border-radius:12px;padding:11px;font-size:10.5px;line-height:1.7;
       white-space:pre-wrap;word-break:break-word;margin:0;
       max-height:52vh;overflow:auto;direction:ltr;text-align:left"></pre>`);
  $('#jejak-isi').textContent = t;
  $('#jejak-isi').scrollTop = $('#jejak-isi').scrollHeight;

  $('#jejak-salin').onclick = async function () {
    const tombol = this;
    const beres = (ok) => {
      tombol.textContent = ok ? '✓ Tersalin, tinggal ditempel' : 'Gagal — sorot manual';
      setTimeout(() => { tombol.textContent = '⧉ Salin semua'; }, 2500);
    };
    try { await navigator.clipboard.writeText(t); beres(true); }
    catch (e) {
      const a = document.createElement('textarea');
      a.value = t; document.body.appendChild(a); a.select();
      try { beres(document.execCommand('copy')); } catch (x) { beres(false); }
      document.body.removeChild(a);
    }
  };
  $('#jejak-hapus').onclick = async () => {
    if (!confirm('Kosongkan catatan jejak?')) return;
    if (window.JEJAK_HAPUS) await JEJAK_HAPUS();
    tutupTirai();
    isiAtur();
  };
}

/* ============================================================
   TIRAI
   ============================================================ */
function tirai(judul, isi) {
  $('#tirai-judul').textContent = judul;
  $('#tirai-badan').innerHTML = isi;
  $('#tirai').classList.add('on');
}
function tutupTirai() { $('#tirai').classList.remove('on'); }

/* ============================================================
   KENDALI
   ============================================================ */
function pasangKendali() {
  $('#btn-pasang').onclick = pilihDanPasang;
  $('#btn-ulang').onclick = () => location.reload();
  $('#btn-periksa').onclick = periksaLokasi;
  $('#btn-cari-sendiri').onclick = () => $('#berkas-pilih').click();
  $('#berkas-pilih').onchange = function () {
    const f = this.files && this.files[0];
    if (f) pakaiBerkasPilihan(f);
  };

  $$('.nv').forEach(b => b.onclick = () => pergi(b.dataset.pergi));
  $('#ke-cari').onclick = () => pergi('cari');
  $('#btn-tema').onclick = () => {
    Setel.data.terang = !Setel.data.terang; Setel.simpan();
  };

  pasangCari();

  // klik menyebar
  document.addEventListener('click', ev => {
    const grup = ev.target.closest('[data-grup]');
    if (grup) { bukaGrupKitab(grup.dataset.grup); return; }
    const kt = ev.target.closest('[data-kt]');
    if (kt) { bukaKitab(+kt.dataset.kt, 1); return; }
    const buka = ev.target.closest('[data-buka]');
    if (buka) {
      if ($('#tirai').classList.contains('on')) tutupTirai();
      bukaKitab(+buka.dataset.buka, +(buka.dataset.urut || 1));
      return;
    }
    const pg = ev.target.closest('[data-pergi]');
    if (pg && !pg.classList.contains('nv')) { pergi(pg.dataset.pergi); return; }
    const simpul = ev.target.closest('.simpul > .hd');
    if (simpul) { bukaFan(simpul.parentNode); return; }
    const dk = ev.target.closest('[data-dok]');
    if (dk) { bukaDokumen(+dk.dataset.dok); return; }
    const cat = ev.target.closest('[data-catatan]');
    if (cat) {
      DB.catatanSemua().then(l => {
        const c = l.find(x => x.id === +cat.dataset.catatan);
        if (c) formCatatan(c);
      });
      return;
    }
    const tuju = ev.target.closest('[data-tuju]');
    if (tuju && S.kitab) {
      tutupTirai();
      DB.halaman(S.kitab.id, +tuju.dataset.tuju).then(h => {
        if (h) { S.halaman = h; gambarBaca(); }
      });
    }
  });

  /* Balik ke aplikasi di layar Cari -> panaskan mesin lagi diam-diam,
     supaya pencarian berikutnya tidak dingin. Sengaja hanya di layar Cari:
     di layar Baca pekerja memang dibiarkan tidur demi menghemat ingatan. */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && S.layar === 'cari' && window.DB && DB.prapanas) DB.prapanas();
  });

  $('#tirai').onclick = e => { if (e.target.id === 'tirai') tutupTirai(); };
  $('#tirai-tutup').onclick = tutupTirai;

  $('#p-maju').onclick = () => lompat(1);
  $('#p-mundur').onclick = () => lompat(-1);
  $('#a-isi').onclick = bukaDaftarIsi;
  $('#btn-impor').onclick = () => ingatkanPribadi(() => $('#berkas-dokumen').click());
  $('#berkas-dokumen').onchange = function () {
    const f = Array.from(this.files || []);
    this.value = '';
    if (f.length) imporBerkas(f);
  };
  $('#btn-tempel').onclick = () => ingatkanPribadi(formTempelTeks, 'lanjut tempel teks');
  $('#tg-kitab').onclick = () => {
    if (S.kitabCari) { pakaiKitabCari(null, ''); return; }   // ✕ = lepas batasan
    bukaPemilihKitab();
  };
  $('#a-cari-sini').onclick = () => {
    if (!S.kitab) return;
    pakaiKitabCari(S.kitab.id, S.kitab.judul || '');
    setTimeout(() => $('#q').focus(), 80);
  };
  $('#a-harakat').onclick = function () {
    Setel.data.harakat = !Setel.data.harakat; Setel.simpan();
    this.classList.toggle('on', Setel.data.harakat); gambarBaca();
  };
  $('#a-salin').onclick = async () => {
    if (!S.halaman) return;
    const k = S.kitab, h = S.halaman;
    const t = h.isi + '\n\n(' + (k.judul || '') + '، ج ' + h.juz + ' ص ' + h.hal + ')';
    try { await navigator.clipboard.writeText(t); alert('Teks tersalin lengkap dengan sumbernya.'); }
    catch (e) { alert('Gagal menyalin.'); }
  };
  $('#a-catat').onclick = () => {
    if (!S.kitab || !S.halaman) return;
    formCatatan({
      judul: 'Catatan atas ' + (S.kitab.judul || ''),
      tempel_kitab: S.kitab.id, tempel_urut: S.halaman.urut, asal: 'ketik'
    });
  };
  $('#a-tanda').onclick = async function () {
    if (!S.kitab || !S.halaman) return;
    const ada = await DB.tandaAda(S.kitab.id, S.halaman.urut);
    if (ada) await DB.tandaHapus(S.kitab.id, S.halaman.urut);
    else await DB.tandaTambah(S.kitab.id, S.halaman.urut, S.kitab.judul);
    this.classList.toggle('on', !ada);
  };
  $('#btn-catatan-baru').onclick = () => formCatatan();

  $('#s-harakat').onclick = () => {
    Setel.data.harakat = !Setel.data.harakat; Setel.simpan(); isiAtur();
    $('#a-harakat').classList.toggle('on', Setel.data.harakat);
  };
  /* Posisi guliran ikut dicatat sambil dibaca — dijarangkan supaya menulisnya
     tidak ikut membebani. Tanpa ini, halaman yang mati akan kembali ke
     paragraf pertama, dan itu yang paling terasa waktu sedang serius membaca. */
  let jamGulir = null;
  const kotakIsi = $('#isi');
  if (kotakIsi) {
    kotakIsi.addEventListener('scroll', () => {
      if (jamGulir) return;
      jamGulir = setTimeout(() => { jamGulir = null; simpanPosisi(); }, 700);
    }, { passive: true });
  }

  $('#s-tema').onclick = () => { Setel.data.terang = !Setel.data.terang; Setel.simpan(); isiAtur(); };
  $('#s-abaikan').onclick = () => { Setel.data.abaikan = !Setel.data.abaikan; Setel.simpan(); isiAtur(); };
  $('#s-hamzah').onclick = () => { Setel.data.hamzah = !Setel.data.hamzah; Setel.simpan(); isiAtur(); };
  $('#s-besar').onclick = () => {
    Setel.data.besar += 2; if (Setel.data.besar > 26) Setel.data.besar = 15;
    Setel.simpan(); isiAtur();
  };

  /* --- kotak ketik di Jelajah: menyaring daftar kitab, atau pohon fan --- */
  let jedaKetik = null;
  $('#q-fan').addEventListener('input', function () {
    $('#q-fan-hapus').style.display = this.value ? '' : 'none';
    clearTimeout(jedaKetik);
    jedaKetik = setTimeout(saringJelajah, 140);
  });
  $('#q-fan-hapus').onclick = () => {
    $('#q-fan').value = '';
    $('#q-fan-hapus').style.display = 'none';
    saringJelajah();
  };

  /* --- pilih daftar: Kitab / Bahtsul / Punyaku / Per fan --- */
  $$('#pilih-daftar .chip').forEach(c => {
    c.onclick = () => {
      $$('#pilih-daftar .chip').forEach(x => x.classList.toggle('on', x === c));
      KAT.jenis = c.dataset.daftar;
      $('#q-fan').placeholder = KAT.jenis === 'fan'
        ? 'Ketik nama fan…' : 'Ketik nama kitab…';
      gambarJelajah();
    };
  });

  // tombol kembali Android
  document.addEventListener('backbutton', () => {
    if ($('#tirai').classList.contains('on')) { tutupTirai(); return; }
    if (S.layar !== 'beranda') { pergi('beranda'); return; }
  }, false);
}

document.addEventListener('DOMContentLoaded', mulai);
