/* ============================================================
   TLeserisme23 — perekam jejak
   ------------------------------------------------------------
   Susunan 4: catatannya disimpan di IndexedDB, bukan localStorage.

   Kenapa dipindah lagi. Percobaan pertama di iPhone menghasilkan
   catatan yang cuma berisi kehidupan TERAKHIR halaman — riwayat
   sebelum halamannya mati tidak ada sama sekali. Itu cocok dengan
   sifat localStorage di WebKit: tulisannya memang langsung terlihat
   oleh halaman yang sedang jalan, tapi turunnya ke penyimpanan
   sungguhan ditunda. Kalau prosesnya dibunuh paksa oleh HP sebelum
   sempat turun, tulisan itu ikut hilang — justru catatan yang paling
   kita butuhkan.

   IndexedDB berbeda: tiap transaksi yang selesai (oncomplete) sudah
   benar-benar tercatat. Dibunuh sekasar apa pun sesudah itu, isinya
   tetap ada waktu halamannya hidup lagi.

   Dibuka lewat: Atur -> Catatan jejak.
   ============================================================ */
(function () {
  const NAMA = 'tleserisme23-jejak';
  const RAK = 'baris';
  const BATAS = 1500;               // baris yang disimpan; yang tua dibuang
  let urut = 0;
  const t0 = Date.now();
  let ioTerakhir = null;
  let gudang = null;
  let antre = [];                   // baris yang belum sempat dicatat
  let jamTulis = null;
  let sejakPangkas = 0;

  function jam() {
    const d = new Date();
    const dua = (n) => (n < 10 ? '0' : '') + n;
    return dua(d.getHours()) + ':' + dua(d.getMinutes()) + ':' + dua(d.getSeconds());
  }

  function buka() {
    if (gudang) return Promise.resolve(gudang);
    return new Promise((ok, gagal) => {
      const r = indexedDB.open(NAMA, 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains(RAK)) {
          db.createObjectStore(RAK, { keyPath: 'n', autoIncrement: true });
        }
      };
      r.onsuccess = () => { gudang = r.result; ok(gudang); };
      r.onerror = () => gagal(r.error);
    });
  }

  /* Ditulis berkelompok tiap setengah detik. Satu transaksi per baris
     terlalu boros; setengah detik sudah cukup rapat untuk menangkap
     detik-detik terakhir sebelum halaman mati. */
  function turunkan() {
    if (!antre.length) return Promise.resolve();
    const kirim = antre;
    antre = [];
    return buka().then(db => new Promise((ok) => {
      const t = db.transaction(RAK, 'readwrite');
      const rak = t.objectStore(RAK);
      kirim.forEach(b => rak.add({ t: b }));
      t.oncomplete = () => {
        if ((sejakPangkas += kirim.length) >= 200) { sejakPangkas = 0; pangkas(); }
        ok();
      };
      t.onerror = () => ok();
      t.onabort = () => ok();
    })).catch(() => { });
  }

  function pangkas() {
    buka().then(db => {
      const t = db.transaction(RAK, 'readwrite');
      const rak = t.objectStore(RAK);
      const c = rak.count();
      c.onsuccess = () => {
        const lebih = c.result - BATAS;
        if (lebih <= 0) return;
        let dibuang = 0;
        rak.openCursor().onsuccess = e => {
          const k = e.target.result;
          if (!k || dibuang >= lebih) return;
          k.delete(); dibuang++; k.continue();
        };
      };
    }).catch(() => { });
  }

  window.JEJAK = function (pesan) {
    try {
      antre.push(jam() + ' [' + (++urut) + '|' +
        Math.round((Date.now() - t0) / 100) / 10 + 'd] ' + pesan);
      if (!jamTulis) jamTulis = setTimeout(() => { jamTulis = null; turunkan(); }, 500);
    } catch (e) { }
  };

  window.JEJAK_BACA = async function () {
    await turunkan();
    try {
      const db = await buka();
      return await new Promise((ok) => {
        const hasil = [];
        const t = db.transaction(RAK, 'readonly');
        t.objectStore(RAK).openCursor().onsuccess = e => {
          const k = e.target.result;
          if (!k) return;
          hasil.push(k.value.t);
          k.continue();
        };
        t.oncomplete = () => ok(hasil.join('\n'));
        t.onerror = () => ok(hasil.join('\n'));
      });
    } catch (e) { return '(catatan tidak bisa dibaca: ' + (e.message || e) + ')'; }
  };

  window.JEJAK_HAPUS = async function () {
    antre = [];
    try {
      const db = await buka();
      await new Promise((ok) => {
        const t = db.transaction(RAK, 'readwrite');
        t.objectStore(RAK).clear();
        t.oncomplete = ok; t.onerror = ok; t.onabort = ok;
      });
    } catch (e) { }
  };

  function alat() {
    let ket = (navigator.userAgent || '').slice(0, 75);
    if (window.performance && performance.memory) {
      ket += ' | ingatan ' + Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB';
    }
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      if (nav) ket += ' | masuk: ' + nav.type;
    } catch (e) { }
    if (document.wasDiscarded) ket += ' | TAB SEMPAT DIBUANG PERAMBAN';
    ket += ' | inti ' + (navigator.hardwareConcurrency || '?') +
           ' | layar ' + screen.width + 'x' + screen.height +
           ' | mandiri: ' + (matchMedia('(display-mode: standalone)').matches ||
                             navigator.standalone ? 'YA' : 'tidak');
    return ket;
  }

  /* Sisa ruang penyimpanan HP ikut ditanyakan. Kalau jatahnya nyaris penuh,
     iOS jadi galak ke semua halaman — dan itu penjelasan yang sama sekali
     tidak ada hubungannya dengan boros atau tidaknya aplikasi ini. */
  function periksaRuang() {
    if (!navigator.storage || !navigator.storage.estimate) return;
    navigator.storage.estimate().then(function (e) {
      const mb = (n) => Math.round((n || 0) / 1048576);
      JEJAK('penyimpanan: dipakai ' + mb(e.usage) + ' MB dari jatah ' +
        mb(e.quota) + ' MB' +
        (e.quota ? ' (' + Math.round((e.usage / e.quota) * 100) + '%)' : ''));
      turunkan();
    }, function () { });
  }

  /* Penanda pamit.
     Menulis "halaman ditutup" ke IndexedDB waktu pagehide sering tidak keburu
     selesai — transaksinya perlu waktu, halamannya sudah pergi duluan. Jadi
     dipakai penanda kecil di localStorage yang penulisannya seketika.
     Kalau penanda itu ADA waktu halaman hidup lagi, berarti sebelumnya
     perambannya pamit baik-baik (muat ulang, pindah halaman, tab ditutup).
     Kalau TIDAK ADA, berarti halamannya dibunuh paksa tanpa sempat pamit —
     dan itulah tanda HP yang kehabisan ingatan. */
  const PAMIT = 'tleserisme23.pamit';
  let pamitLalu = null;
  try {
    pamitLalu = localStorage.getItem(PAMIT);
    localStorage.removeItem(PAMIT);
  } catch (e) { }

  JEJAK('');
  JEJAK('=================== HALAMAN DIBUKA ===================');
  JEJAK(alat());
  turunkan();                       // tanda buka dicatat segera, jangan ditunda
  periksaRuang();

  /* Vonisnya baru ditulis sesudah dipastikan memang ADA kehidupan sebelumnya.
     Kalau tidak diperiksa, pembukaan paling pertama pun akan dituduh
     "dibunuh paksa" — padahal memang belum ada apa-apa sebelumnya. */
  buka().then(db => {
    const t = db.transaction(RAK, 'readonly');
    const c = t.objectStore(RAK).count();
    t.oncomplete = () => {
      if (c.result <= 4) { JEJAK('(ini pembukaan pertama — belum ada pembanding)'); return; }
      JEJAK(pamitLalu
        ? 'kehidupan sebelumnya: PAMIT BAIK-BAIK (' + pamitLalu + ')'
        : 'kehidupan sebelumnya: TIDAK SEMPAT PAMIT — halaman dibunuh paksa oleh HP');
      turunkan();
    };
  }).catch(() => { });

  window.addEventListener('error', function (e) {
    JEJAK('!! KESALAHAN: ' + (e.message || '') + ' @ ' +
      (e.filename || '').split('/').pop() + ':' + (e.lineno || ''));
    turunkan();
  });
  window.addEventListener('unhandledrejection', function (e) {
    JEJAK('!! JANJI GAGAL: ' + ((e.reason && e.reason.message) || e.reason || ''));
    turunkan();
  });
  window.addEventListener('pagehide', function (e) {
    try { localStorage.setItem(PAMIT, jam() + ', disimpan peramban: ' + !!e.persisted); } catch (x) { }
    JEJAK('>>> halaman ditutup/disembunyikan (disimpan peramban: ' + !!e.persisted + ')');
    turunkan();
  });
  document.addEventListener('visibilitychange', function () {
    JEJAK('layar jadi ' + document.visibilityState);
    turunkan();
  });
  window.addEventListener('freeze', function () { JEJAK('>>> halaman DIBEKUKAN peramban'); turunkan(); });
  window.addEventListener('resume', function () { JEJAK('>>> halaman dihidupkan lagi'); });

  /* ---- denyut nadi: bukti halaman masih hidup, dan sedang apa ---- */
  let denyut = 0;
  setInterval(function () {
    denyut++;
    /* "const S" di skrip lain tidak menempel ke window, tapi namanya tetap
       terlihat dari sini karena sama-sama skrip biasa. Jadi diperiksa
       dengan typeof, bukan lewat window. */
    const layar = (typeof S !== 'undefined' && S.layar) || '?';
    const tirai = document.getElementById('tirai');
    const dasar = 'nadi ' + denyut + ' | layar ' + layar +
      (tirai && tirai.classList.contains('on') ? ' | tirai terbuka' : '') +
      (document.hidden ? ' | LAYAR TERSEMBUNYI' : '') +
      (window.performance && performance.memory
        ? ' | ingatan ' + Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB' : '');

    /* Denyutnya dicatat DULUAN, baru pertanyaan ke pekerja latar dikirim.
       Kalau digabung, satu baris yang hilang bisa berarti dua hal yang jauh
       berbeda: halamannya mati, atau pekerjanya yang menggantung padahal
       halamannya masih hidup. Dipisah begini, keduanya kelihatan bedanya. */
    JEJAK(dasar);

    if (typeof DB !== 'undefined' && DB.catatanIO) {
      let dijawab = false;
      setTimeout(function () {
        if (!dijawab) JEJAK('   !! PEKERJA LATAR TIDAK MENJAWAB dalam 4 detik');
      }, 4000);
      DB.catatanIO().then(function (c) {
        dijawab = true;
        if (!c) return;
        if (c.tidur) { JEJAK('   io: PEKERJA SEDANG TIDUR — tidak ada WebAssembly dipegang'); return; }
        let tambah = '';
        if (ioTerakhir) {
          const dp = c.ambil - ioTerakhir.ambil;
          const db = c.baca - ioTerakhir.baca;
          tambah = ' | sejak nadi lalu: +' + dp + ' potongan, +' + db + ' pembacaan';
          if (dp > 0 && layar !== 'cari') tambah += '  <-- MASIH MENARIK DATA';
        }
        ioTerakhir = { ambil: c.ambil, baca: c.baca };
        const ing = (c.wasmMB != null)
          ? ' | WASM ' + c.wasmMB + ' MB, simpanan ' + c.simpananMB + ' MB (' +
            c.simpananJml + ' potongan)' : '';
        JEJAK('   io: total ' + c.ambil + ' potongan (' + c.awet +
          ' dari simpanan), ' + c.baca + ' pembacaan' + tambah + ing);
      }, function (e) {
        dijawab = true;
        JEJAK('   !! io gagal: ' + ((e && e.message) || e));
      });
    } else {
      JEJAK('   (DB belum siap)');
    }
  }, 4000);
})();
