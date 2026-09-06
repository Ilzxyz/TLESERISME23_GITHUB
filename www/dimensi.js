/* ============================================================
   TLeserisme23 — LAPISAN KEDALAMAN (perilaku)

   Menukar lencana bertulisan (CARI / FAN / TULIS / DOC) dengan
   ikon isometrik, memasang kemiringan mengikuti kursor, dan
   memunculkan baris sambil digulir.

   ATURAN KERAS: apa pun di dalam [data-layar="baca"] dilewati.
   Tidak ada ikon yang ditukar di situ, tidak ada kartu yang
   dimiringkan, tidak ada yang dianimasikan. Bacaannya sudah pas.
   ============================================================ */
(function () {
  'use strict';

  var HEMAT = false;
  try {
    HEMAT = window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { }

  /* ---------- penjaga: jangan sentuh layar baca ---------- */
  function diBaca(el) {
    return !!(el && el.closest && el.closest('[data-layar="baca"]'));
  }

  /* ============================================================
     1. IKON — digambar isometrik, warnanya putih/hitam tembus
        pandang saja supaya cocok di atas pelat warna apa pun
        (dan ikut berubah waktu tema warna diganti).
     ============================================================ */
  var DEFS =
    '<svg id="d3-defs" width="0" height="0" aria-hidden="true" ' +
    'style="position:absolute;pointer-events:none"><defs>' +
      '<linearGradient id="d3gA" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#fff" stop-opacity=".97"/>' +
        '<stop offset="1" stop-color="#fff" stop-opacity=".66"/></linearGradient>' +
      '<linearGradient id="d3gB" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#fff" stop-opacity=".80"/>' +
        '<stop offset="1" stop-color="#fff" stop-opacity=".42"/></linearGradient>' +
      '<linearGradient id="d3gC" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#000" stop-opacity=".14"/>' +
        '<stop offset="1" stop-color="#000" stop-opacity=".40"/></linearGradient>' +
    '</defs></svg>';

  function svg(isi) {
    return '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">' + isi + '</svg>';
  }

  /* tiga buku bertumpuk, dilihat dari sudut — untuk "Jelajah per fan" */
  var IK_FAN = svg(
    '<path d="M7 33 L24 24.5 L41 33 L24 41.5 Z" fill="url(#d3gB)"/>' +
    '<path d="M7 33 L7 37 L24 45.5 L24 41.5 Z" fill="url(#d3gC)"/>' +
    '<path d="M41 33 L41 37 L24 45.5 L24 41.5 Z" fill="#000" opacity=".26"/>' +
    '<path d="M8.5 26.5 L24 18.75 L39.5 26.5 L24 34.25 Z" fill="url(#d3gA)"/>' +
    '<path d="M8.5 26.5 L8.5 30.5 L24 38.25 L24 34.25 Z" fill="url(#d3gC)"/>' +
    '<path d="M39.5 26.5 L39.5 30.5 L24 38.25 L24 34.25 Z" fill="#000" opacity=".26"/>' +
    '<path d="M10 20 L24 13 L38 20 L24 27 Z" fill="url(#d3gA)"/>' +
    '<path d="M10 20 L10 24 L24 31 L24 27 Z" fill="url(#d3gC)"/>' +
    '<path d="M38 20 L38 24 L24 31 L24 27 Z" fill="#000" opacity=".26"/>');

  /* kaca pembesar bertangkai tebal — untuk "Pencarian ibarat" */
  var IK_CARI = svg(
    '<path d="M27.2 32.4 L32.4 27.2 L42.2 37 A3.2 3.2 0 0 1 37 42.2 Z" fill="#000" opacity=".30"/>' +
    '<path d="M26.4 30.8 L30.8 26.4 L40.6 36.2 A2.8 2.8 0 0 1 36.2 40.6 Z" fill="url(#d3gA)"/>' +
    '<circle cx="21" cy="22.4" r="12.4" stroke="#000" stroke-opacity=".28" stroke-width="4.6"/>' +
    '<circle cx="21" cy="21" r="12.4" stroke="url(#d3gA)" stroke-width="4.4"/>' +
    '<circle cx="21" cy="21" r="10.2" fill="#fff" fill-opacity=".18"/>' +
    '<path d="M13.6 17.6 A8.6 8.6 0 0 1 20.4 12.7" stroke="#fff" stroke-opacity=".85" ' +
      'stroke-width="2.6" stroke-linecap="round"/>');

  /* pena di atas kartu — untuk "Catatan pribadi" */
  var IK_TULIS = svg(
    '<path d="M10 12 h17 a3.2 3.2 0 0 1 3.2 3.2 v23.6 a3.2 3.2 0 0 1 -3.2 3.2 ' +
      'h-17 a3.2 3.2 0 0 1 -3.2 -3.2 v-23.6 A3.2 3.2 0 0 1 10 12 Z" fill="url(#d3gB)"/>' +
    '<rect x="11.4" y="18.5" width="14" height="2.3" rx="1.15" fill="#000" opacity=".24"/>' +
    '<rect x="11.4" y="24"   width="14" height="2.3" rx="1.15" fill="#000" opacity=".20"/>' +
    '<rect x="11.4" y="29.5" width="9"  height="2.3" rx="1.15" fill="#000" opacity=".17"/>' +
    '<path d="M20.6 27.4 L36.4 11.6 L41.2 16.4 L25.4 32.2 Z" fill="url(#d3gA)"/>' +
    '<path d="M20.6 27.4 L25.4 32.2 L18.4 34.4 Z" fill="#fff" fill-opacity=".92"/>' +
    '<path d="M18.4 34.4 L20.9 33.6 L19.2 31.9 Z" fill="#000" opacity=".45"/>' +
    '<path d="M36.4 11.6 L38.8 9.2 A3.4 3.4 0 0 1 43.6 14 L41.2 16.4 Z" fill="#000" opacity=".32"/>');

  /* satu kitab tertutup, dilihat menyudut — untuk baris kitab */
  var IK_KITAB = svg(
    '<path d="M9 30 L24 21.5 L39 30 L24 38.5 Z" fill="url(#d3gA)"/>' +
    '<path d="M9 30 L9 35 L24 43.5 L24 38.5 Z" fill="url(#d3gC)"/>' +
    '<path d="M39 30 L39 35 L24 43.5 L24 38.5 Z" fill="#000" opacity=".26"/>' +
    '<path d="M24 21.5 L24 38.5" stroke="#000" stroke-opacity=".22" stroke-width="1.4"/>' +
    '<path d="M15 25.2 L24 20 L33 25.2" stroke="#fff" stroke-opacity=".55" ' +
      'stroke-width="1.6" stroke-linecap="round"/>');

  /* lembar rumusan terlipat — untuk arsip Bahtsul Masail */
  var IK_BM = svg(
    '<path d="M12 7 h15 l11 11 v23 a3 3 0 0 1 -3 3 h-23 a3 3 0 0 1 -3 -3 ' +
      'v-31 a3 3 0 0 1 3 -3 Z" fill="url(#d3gB)"/>' +
    '<path d="M27 7 l11 11 h-8.4 A2.6 2.6 0 0 1 27 15.4 Z" fill="#000" opacity=".30"/>' +
    '<rect x="14" y="23" width="19" height="2.4" rx="1.2" fill="#000" opacity=".24"/>' +
    '<rect x="14" y="29" width="19" height="2.4" rx="1.2" fill="#000" opacity=".20"/>' +
    '<rect x="14" y="35" width="12" height="2.4" rx="1.2" fill="#000" opacity=".17"/>');

  /* berkas milik sendiri — sudutnya terlipat */
  var IK_DOK = svg(
    '<path d="M12 7 h15 l11 11 v23 a3 3 0 0 1 -3 3 h-23 a3 3 0 0 1 -3 -3 ' +
      'v-31 a3 3 0 0 1 3 -3 Z" fill="url(#d3gA)"/>' +
    '<path d="M27 7 l11 11 h-8.4 A2.6 2.6 0 0 1 27 15.4 Z" fill="#000" opacity=".32"/>' +
    '<path d="M17 33 l4.6 4.6 L31 28" stroke="#000" stroke-opacity=".30" ' +
      'stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M17 31.8 l4.6 4.6 L31 26.8" stroke="#fff" stroke-opacity=".9" ' +
      'stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>');

  /* pita penanda halaman */
  var IK_TANDA = svg(
    '<path d="M14 6 h20 a2.6 2.6 0 0 1 2.6 2.6 v33.4 L24 33.6 L11.4 42 V8.6 ' +
      'A2.6 2.6 0 0 1 14 6 Z" fill="url(#d3gA)"/>' +
    '<path d="M24 33.6 L36.6 42 V8.6 A2.6 2.6 0 0 0 34 6 h-4.6 v27.2 Z" ' +
      'fill="#000" opacity=".24"/>');

  var IKON = {
    cari: IK_CARI, fan: IK_FAN, tulis: IK_TULIS,
    kitab: IK_KITAB, bm: IK_BM, dok: IK_DOK, tanda: IK_TANDA
  };

  /* ---------- ikon navigasi bawah (satu warna, ikut currentColor) ---------- */
  function nsvg(isi) {
    return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + isi + '</svg>';
  }
  var NAV = {
    beranda: nsvg('<path d="M12 2.6 22 11.2h-2.9v8.6a1.6 1.6 0 0 1-1.6 1.6h-3.1v-6H9.6v6H6.5' +
                  'a1.6 1.6 0 0 1-1.6-1.6v-8.6H2Z"/>'),
    cari:    nsvg('<path d="M10.6 3a7.6 7.6 0 1 1-4.7 13.6l-2.5 2.5a1.4 1.4 0 0 1-2-2l2.5-2.5' +
                  'A7.6 7.6 0 0 1 10.6 3Zm0 2.6a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"/>' +
                  '<path d="M15.9 15.9a1.4 1.4 0 0 1 2 0l3.7 3.7a1.4 1.4 0 0 1-2 2l-3.7-3.7' +
                  'a1.4 1.4 0 0 1 0-2Z"/>'),
    jelajah: nsvg('<rect x="2.6" y="4" width="18.8" height="4.2" rx="1.5"/>' +
                  '<rect x="2.6" y="10.1" width="18.8" height="4.2" rx="1.5" opacity=".72"/>' +
                  '<rect x="2.6" y="16.2" width="18.8" height="4.2" rx="1.5" opacity=".48"/>'),
    koleksi: nsvg('<path d="M16.9 2.5a2 2 0 0 1 2.9 0l1.7 1.7a2 2 0 0 1 0 2.9L10.9 17.7' +
                  'l-4.8 1.6 1.6-4.8Z"/>' +
                  '<rect x="2.4" y="20.2" width="19.2" height="1.9" rx=".95" opacity=".55"/>'),
    atur:    nsvg('<path fill-rule="evenodd" d="M13.5 2h-3l-.42 2.5a7.7 7.7 0 0 0-1.83.76L6.3 3.8' +
                  ' 3.8 6.3l1.46 1.95a7.7 7.7 0 0 0-.76 1.83L2 10.5v3l2.5.42c.19.65.45 1.26.76 1.83' +
                  'L3.8 17.7l2.5 2.5 1.95-1.46c.57.31 1.18.57 1.83.76L10.5 22h3l.42-2.5' +
                  'a7.7 7.7 0 0 0 1.83-.76l1.95 1.46 2.5-2.5-1.46-1.95c.31-.57.57-1.18.76-1.83' +
                  'L22 13.5v-3l-2.5-.42a7.7 7.7 0 0 0-.76-1.83l1.46-1.95-2.5-2.5-1.95 1.46' +
                  'a7.7 7.7 0 0 0-1.83-.76ZM12 15.3a3.3 3.3 0 1 1 0-6.6 3.3 3.3 0 0 1 0 6.6Z"/>')
  };

  /* ============================================================
     2. MENUKAR LENCANA JADI PELAT BERIKON
     ============================================================ */
  var WARNA_LAMA = ['l-fikih', 'l-bahtsul', 'l-catatan', 'l-dok'];

  /* Tentukan ikon apa yang pantas untuk sebuah lencana.
     Angka (mis. "1", "2" pada daftar berkas sejudul) TIDAK ditukar —
     angkanya justru keterangan yang dibutuhkan. */
  function jenisIkon(el) {
    var t = (el.textContent || '').trim();
    if (/^\d+$/.test(t)) return null;
    var T = t.toUpperCase();
    if (T === 'CARI') return 'cari';
    if (T === 'FAN') return 'fan';
    if (T === 'TULIS') return 'tulis';
    if (t === '★') return 'tanda';
    if (t === '✎') return 'tulis';
    if (el.classList.contains('l-dok')) return 'dok';
    if (el.classList.contains('l-catatan')) return 'tulis';
    if (el.classList.contains('l-bahtsul')) return 'bm';
    if (el.classList.contains('l-fikih')) return 'kitab';
    return null;
  }

  function jadikanPelat(el, jenis, kecil) {
    WARNA_LAMA.forEach(function (c) { el.classList.remove(c); });
    el.classList.add('d3-pelat', 'p-' + jenis);
    if (kecil) el.classList.add('kecil');
    el.innerHTML = IKON[jenis] || '';
    el.dataset.d3 = jenis;
  }

  /* Lencana kecil pada daftar kitab menyimpan keterangan jenis berkas
     (PDF / TXT / كتاب / BM). Keterangan itu berguna, jadi tulisannya
     dipertahankan — yang ditambahkan cuma tepian timbulnya. */
  function jadikanPelatTeks(el) {
    var teks = (el.textContent || '').trim();
    var jenis = el.classList.contains('l-dok') ? 'dok'
              : el.classList.contains('l-bahtsul') ? 'bm'
              : el.classList.contains('l-catatan') ? 'tulis' : 'kitab';
    WARNA_LAMA.forEach(function (c) { el.classList.remove(c); });
    el.classList.add('d3-pelat', 'kecil', 'teks', 'p-' + jenis);
    if (/[؀-ۿ]/.test(teks)) el.classList.add('ar');
    el.dataset.d3 = 'teks';
  }

  /* ============================================================
     3. KEMIRINGAN MENGIKUTI KURSOR
        Hanya untuk tetikus. Di layar sentuh, gerakan jari itu
        gulir — memiringkan kartu sambil menggulir cuma bikin
        pusing, dan boros. Sentuhan cukup dapat efek "tertekan".
     ============================================================ */
  var aktif = null, tunggu = null, minta = null;

  function lepaskan() {
    if (!aktif) return;
    aktif.classList.remove('d3-hot');
    aktif.style.removeProperty('--d3-rx');
    aktif.style.removeProperty('--d3-ry');
    aktif.style.removeProperty('--d3-tz');
    aktif = null;
  }

  function hitung() {
    tunggu = null;
    var p = minta;
    if (!p || !p.el.isConnected) { lepaskan(); return; }
    var r = p.el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var px = (p.x - r.left) / r.width;
    var py = (p.y - r.top) / r.height;
    if (px < 0 || px > 1 || py < 0 || py > 1) { lepaskan(); return; }
    var maks = p.el.classList.contains('hero') ? 4.5 : 7;
    var s = p.el.style;
    s.setProperty('--d3-ry', ((px - .5) * 2 * maks).toFixed(2) + 'deg');
    s.setProperty('--d3-rx', ((.5 - py) * 2 * maks).toFixed(2) + 'deg');
    s.setProperty('--d3-mx', (px * 100).toFixed(1) + '%');
    s.setProperty('--d3-my', (py * 100).toFixed(1) + '%');
    s.setProperty('--d3-tz', '10px');
    if (aktif !== p.el) { lepaskan(); aktif = p.el; p.el.classList.add('d3-hot'); }
  }

  function pasangTetikus() {
    var isi = document.getElementById('isi');
    if (!isi) return;
    isi.addEventListener('pointermove', function (ev) {
      if (ev.pointerType !== 'mouse') return;
      var el = ev.target.closest ? ev.target.closest('.d3-kartu,.hero') : null;
      if (!el || diBaca(el)) { lepaskan(); return; }
      minta = { el: el, x: ev.clientX, y: ev.clientY };
      if (!tunggu) tunggu = requestAnimationFrame(hitung);
    }, { passive: true });
    isi.addEventListener('pointerleave', lepaskan, { passive: true });
    isi.addEventListener('scroll', lepaskan, { passive: true });
  }

  /* ============================================================
     4. MUNCUL SAMBIL DIGULIR
        Dibatasi 40 baris sekali sapu: daftar kitab bisa ratusan
        baris, dan mengawasi semuanya justru bikin berat.
     ============================================================ */
  var pengintai = null;
  if (!HEMAT && window.IntersectionObserver) {
    pengintai = new IntersectionObserver(function (daftar) {
      daftar.forEach(function (x) {
        if (!x.isIntersecting) return;
        x.target.classList.add('d3-in');
        pengintai.unobserve(x.target);
      });
    }, { threshold: .04, rootMargin: '0px 0px -6% 0px' });
  }

  /* ============================================================
     5. RANGKA KUBUS MELAYANG DI HERO
     ============================================================ */
  var KUBUS = [
    { atas: '12%', kiri: '78%', px: 30 },
    { atas: '58%', kiri: '88%', px: 20 },
    { atas: '70%', kiri: '10%', px: 24 }
  ];
  function pasangKubus(hero) {
    if (HEMAT || !hero || hero.querySelector('.d3-bentuk')) return;
    KUBUS.forEach(function (k, i) {
      var b = document.createElement('span');
      b.className = 'd3-bentuk';
      b.style.cssText = 'top:' + k.atas + ';left:' + k.kiri + ';width:' + k.px +
        'px;height:' + k.px + 'px;--d3-r:' + (k.px / 2) + 'px';
      b.innerHTML = '<span class="d3-kubus" style="animation-duration:' +
        (17 + i * 6) + 's;animation-delay:-' + (i * 4) + 's"><i></i><i></i><i></i></span>';
      hero.appendChild(b);
    });
  }

  /* ============================================================
     6. SAPU BERSIH — dijalankan tiap isi layar berubah
     ============================================================ */
  var jatah = 0;

  function hiasi(akar) {
    if (!akar) return;
    jatah = 40;

    /* lencana besar -> pelat berikon */
    var lenc = akar.querySelectorAll('.lencana:not([data-d3])');
    for (var i = 0; i < lenc.length; i++) {
      if (diBaca(lenc[i])) continue;
      var j = jenisIkon(lenc[i]);
      if (j) jadikanPelat(lenc[i], j, false);
    }

    /* lencana kecil di daftar kitab -> tepian timbul, tulisan tetap */
    var tnd = akar.querySelectorAll('.tanda:not([data-d3])');
    for (var t = 0; t < tnd.length; t++) {
      if (diBaca(tnd[t])) continue;
      if (/^\d+$/.test((tnd[t].textContent || '').trim())) continue;
      jadikanPelatTeks(tnd[t]);
    }

    /* kartu yang boleh dimiringkan + dimunculkan sambil digulir */
    var kartu = akar.querySelectorAll('.baris,.hit,.kpi,.kt-baris,.grup,.simpul');
    for (var k = 0; k < kartu.length; k++) {
      var el = kartu[k];
      if (diBaca(el) || el.dataset.d3k) continue;
      el.dataset.d3k = '1';
      el.classList.add('d3-kartu');
      if (pengintai && jatah > 0) {
        jatah--;
        el.classList.add('d3-reveal');
        pengintai.observe(el);
      }
    }

    /* hero: kubus + kemiringan */
    var hero = akar.querySelectorAll('.hero');
    for (var h = 0; h < hero.length; h++) {
      if (diBaca(hero[h])) continue;
      pasangKubus(hero[h]);
    }
  }

  function pasangNav() {
    var tbl = document.querySelectorAll('#nav .nv');
    for (var i = 0; i < tbl.length; i++) {
      var ic = tbl[i].querySelector('.ic');
      var nama = tbl[i].dataset.pergi;
      if (ic && NAV[nama] && !ic.dataset.d3) {
        ic.innerHTML = NAV[nama];
        ic.dataset.d3 = '1';
      }
    }
  }

  /* ============================================================
     7. PENGAWAS — isi layar digambar ulang terus oleh app.js,
        jadi hiasannya dipasang lagi tiap kali, dengan jeda kecil
        supaya tidak ikut menggambar berkali-kali.
        Pengawasnya dilepas dulu sebelum menghias, kalau tidak
        perubahan kita sendiri akan memanggil dirinya lagi.
     ============================================================ */
  function pasangPengawas() {
    var isi = document.getElementById('isi');
    if (!isi || !window.MutationObserver) return;
    var jeda = null;
    var obs = new MutationObserver(function () {
      clearTimeout(jeda);
      jeda = setTimeout(function () {
        obs.disconnect();
        try { hiasi(isi); } catch (e) { }
        obs.observe(isi, { childList: true, subtree: true });
      }, 60);
    });
    obs.observe(isi, { childList: true, subtree: true });
  }

  function jalan() {
    if (!document.getElementById('d3-defs')) {
      var kotak = document.createElement('div');
      kotak.innerHTML = DEFS;
      document.body.insertBefore(kotak.firstChild, document.body.firstChild);
    }
    pasangNav();
    hiasi(document.getElementById('isi'));
    if (!HEMAT) pasangTetikus();
    pasangPengawas();
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', jalan);
  else
    jalan();
})();
