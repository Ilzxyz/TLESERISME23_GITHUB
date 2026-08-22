/* ============================================================
   TLeserisme23 — LAPISAN TAMPILAN (perilaku)
   Menyuntik ornamen + gerakan ke layar Beranda & Pemasangan,
   memasang pemilih warna di Atur, dan mengingat pilihan warna.
   Tidak mengubah logika pencarian / basis data sama sekali.
   ============================================================ */
(function () {
  'use strict';

  var WARNA = [
    { n: 'Ijo',   h: 150, h2: 174 },
    { n: 'Biru',  h: 214, h2: 250 },
    { n: 'Toska', h: 186, h2: 205 },
    { n: 'Ungu',  h: 268, h2: 300 },
    { n: 'Emas',  h: 38,  h2: 20  },
    { n: 'Merah', h: 345, h2: 15  }
  ];
  var KUNCI = 'tleser_warna';

  function simpanWarna(h, h2) {
    try { localStorage.setItem(KUNCI, JSON.stringify({ h: h, h2: h2 })); } catch (e) {}
  }
  function muatWarna() {
    try {
      var s = localStorage.getItem(KUNCI);
      if (s) return JSON.parse(s);
    } catch (e) {}
    return { h: 150, h2: 174 };            // bawaan: ijo
  }
  function pasangWarna(h, h2) {
    document.documentElement.style.setProperty('--h', h);
    document.documentElement.style.setProperty('--h2', h2);
    var wp = document.querySelectorAll('.tl-wp');
    for (var i = 0; i < wp.length; i++)
      wp[i].classList.toggle('sel', +wp[i].dataset.h === h);
  }

  /* ---- ornamen SVG bersama ---- */
  var DEFS =
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
    '<g id="tl-star8"><path d="M12 1 14 8.5 21.5 6 17 12 21.5 18 14 15.5 12 23 10 15.5 2.5 18 7 12 2.5 6 10 8.5Z" fill="currentColor"/></g>' +
    '<g id="tl-corner"><path d="M8 56 C8 28 28 8 56 8" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
    '<path d="M8 44 C8 24 24 8 44 8" fill="none" stroke="currentColor" stroke-width="1.1" opacity=".6"/>' +
    '<use href="#tl-star8" x="2" y="2" width="13" height="13"/></g>' +
    '<g id="tl-ring"><circle cx="69" cy="69" r="67" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 7" opacity=".55"/>' +
    '<circle cx="69" cy="69" r="60" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".7"/></g>' +
    '<g id="tl-ring2"><circle cx="58" cy="58" r="56" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="1 10" opacity=".5"/></g>' +
    '</defs></svg>';

  function sealBlok(besar) {
    var d = besar ? 158 : 138;
    var vb = besar ? 158 : 138, vbi = besar ? 136 : 116;
    var sparks = '';
    var kiri = [30, 46, 58, 68, 40], delay = [0, 1.4, 2.6, 3.6, 4.6];
    for (var i = 0; i < 5; i++)
      sparks += '<div class="tl-spark" style="left:' + kiri[i] + '%;animation-delay:' + delay[i] + 's"></div>';
    return '<div class="tl-seal-blk">' + sparks +
      '<div class="tl-seal-wrap"' + (besar ? ' style="width:158px;height:158px"' : '') + '>' +
      '<div class="tl-halo"></div>' +
      '<svg class="tl-ring-o" viewBox="0 0 ' + vb + ' ' + vb + '"><use href="#tl-ring"/></svg>' +
      '<svg class="tl-ring-i" viewBox="0 0 ' + vbi + ' ' + vbi + '"><use href="#tl-ring2"/></svg>' +
      '<div class="tl-seal"><img src="ikon/logo-mark.png" alt="TLeserisme"></div>' +
      '</div>' +
      '<div class="tl-word">T<b>L</b>eserisme</div>' +
      '<div class="tl-tag">Turats &middot; Fikih &middot; Bahtsul Masail</div>' +
      '<div class="tl-div"><svg class="tl-khatam" viewBox="0 0 24 24"><use href="#tl-star8"/></svg></div>' +
      '</div>';
  }

  function sudutHero(el) {
    if (!el || el.querySelector('.tl-sudut')) return;
    ['tl', 'tr', 'bl', 'br'].forEach(function (p) {
      var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('class', 'tl-sudut ' + p);
      s.setAttribute('viewBox', '0 0 64 64');
      s.innerHTML = '<use href="#tl-corner"/>';
      el.appendChild(s);
    });
  }

  function pasangPemilih() {
    var atur = document.querySelector('[data-layar="atur"]');
    if (!atur || atur.querySelector('.tl-warna')) return;
    var bag = document.createElement('div');
    bag.innerHTML =
      '<div class="judul-bag" style="margin-top:2px"><h3>Pilih tampilan warna</h3></div>' +
      '<div class="grup"><div class="tl-warna"></div>' +
      '<div class="tl-wp-l">Pilih satu &mdash; seluruh aplikasi ikut berubah</div></div>';
    atur.insertBefore(bag, atur.firstChild);
    var wrap = bag.querySelector('.tl-warna');
    WARNA.forEach(function (w) {
      var b = document.createElement('div');
      b.className = 'tl-wp';
      b.dataset.h = w.h;
      b.title = w.n;
      b.style.background = 'linear-gradient(135deg,hsl(' + w.h + ' 68% 46%),hsl(' + w.h2 + ' 62% 52%))';
      b.onclick = function () { pasangWarna(w.h, w.h2); simpanWarna(w.h, w.h2); };
      wrap.appendChild(b);
    });
  }

  function jalan() {
    /* defs + aurora */
    if (!document.getElementById('tl-star8')) {
      var box = document.createElement('div');
      box.innerHTML = DEFS;
      document.body.insertBefore(box.firstChild, document.body.firstChild);
    }
    if (!document.querySelector('.tl-aurora')) {
      var au = document.createElement('div');
      au.className = 'tl-aurora';
      au.innerHTML = '<i></i><i></i><i></i>';
      document.body.insertBefore(au, document.body.firstChild);
    }

    /* seal di beranda */
    var beranda = document.querySelector('[data-layar="beranda"]');
    if (beranda && !beranda.querySelector('.tl-seal-blk')) {
      var w1 = document.createElement('div');
      w1.innerHTML = sealBlok(false);
      beranda.insertBefore(w1.firstChild, beranda.firstChild);
      sudutHero(beranda.querySelector('.hero'));
    }

    /* seal di layar pemasangan (ganti logo statis) */
    var pasang = document.getElementById('pasang');
    if (pasang && !pasang.querySelector('.tl-seal-blk')) {
      var imgLama = pasang.querySelector('img');
      if (imgLama) imgLama.style.display = 'none';
      var w2 = document.createElement('div');
      w2.innerHTML = sealBlok(true);
      pasang.insertBefore(w2.firstChild, pasang.firstChild);
    }

    /* logo di bilah -> pakai emblem transparan */
    var mark = document.querySelector('#bilah .mark');
    if (mark) mark.src = 'ikon/logo-mark.png';

    /* pemilih warna + terapkan warna tersimpan */
    pasangPemilih();
    var w = muatWarna();
    pasangWarna(w.h, w.h2);

    /* warnai MATAN (teks dalam kurung) di layar baca */
    pasangMatan();
  }

  /* ---- bungkus "( ... )" jadi span.tl-matan supaya matan beda warna ---- */
  var RE_MATAN = /\(([^()\n]{1,600}?)\)/g;   // grup 1 = isi di dalam kurung
  function warnaiNode(root) {
    if (!root) return;
    var jalan = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var kumpul = [], n;
    while ((n = jalan.nextNode())) {
      if (n.nodeValue && n.nodeValue.indexOf('(') >= 0 &&
          !(n.parentNode && n.parentNode.className === 'tl-matan')) kumpul.push(n);
    }
    kumpul.forEach(function (node) {
      var s = node.nodeValue, frag = document.createDocumentFragment();
      var last = 0, m, ada = false;
      RE_MATAN.lastIndex = 0;
      while ((m = RE_MATAN.exec(s))) {
        ada = true;
        if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
        var sp = document.createElement('span');
        // buang tanda kurung + spasi pinggirnya -> matan bersih & tebal (ala Turots).
        // ini sekalian ngilangin bug arah "( )" di teks RTL yang bikin kurung kebalik.
        sp.className = 'tl-matan'; sp.textContent = m[1].trim();
        frag.appendChild(sp);
        last = m.index + m[0].length;
      }
      if (!ada) return;
      if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
  }
  /* ---- samakan penanda paragraf: kitab Maktabah pakai \r, OpenITI \n\n.
     Ubah \r jadi \n supaya dua-duanya kebaca sebagai ENTER oleh pre-wrap. ---- */
  function normalisasiEnter(root) {
    if (!root) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false), n, list = [];
    while ((n = w.nextNode())) if (n.nodeValue && n.nodeValue.indexOf('\r') >= 0) list.push(n);
    list.forEach(function (node) { node.nodeValue = node.nodeValue.replace(/\r\n?/g, '\n'); });
  }
  function olahNass(nass) {
    try { normalisasiEnter(nass); } catch (e) {}
    try { warnaiNode(nass); } catch (e) {}
  }
  function pasangMatan() {
    var nass = document.getElementById('nass');
    if (!nass || nass.dataset.tlMatan) return;
    nass.dataset.tlMatan = '1';
    var jeda = null;
    var obs = new MutationObserver(function () {
      clearTimeout(jeda);
      jeda = setTimeout(function () {
        obs.disconnect();
        olahNass(nass);
        obs.observe(nass, { childList: true, subtree: true });
      }, 30);
    });
    obs.observe(nass, { childList: true, subtree: true });
    olahNass(nass);
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', jalan);
  else
    jalan();
})();
