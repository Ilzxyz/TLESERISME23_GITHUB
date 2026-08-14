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
  qTerakhir: ''
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
      if (String(e.message || e).indexOf('BELUM_ADA_DB') >= 0) tampilPasang();
      else tampilPasang('Gagal membuka basis data: ' + (e.message || e));
    }
  } else {
    // mode peramban: coba muat berkas contoh
    try {
      await DB.bukaPeramban('contoh.db');
      await lanjutJalan();
    } catch (e) {
      tampilPasang('Mode peramban: berkas contoh.db tidak ada. ' +
        'Di HP nanti pakai tleserisme.db yang asli.');
    }
  }
}

async function lanjutJalan() {
  await DB.siapkanTabelPengguna();
  $('#pasang').classList.remove('on');
  $('#aplikasi').style.display = 'flex';
  await isiBeranda();
}

function tampilPasang(pesan) {
  $('#aplikasi').style.display = 'none';
  $('#pasang').classList.add('on');
  if (pesan) $('#pasang-pesan').textContent = pesan;
}

/* ============================================================
   PEMASANGAN BASIS DATA (Android)
   ============================================================ */
async function pilihDanPasang() {
  const p = $('#pasang-pesan');
  p.style.color = 'var(--ink2)';
  p.textContent = 'Mencari berkas…';
  try {
    const { Filesystem, Directory } = window.CapacitorFilesystem;
    // 1. cari tleserisme.db di beberapa tempat yang lazim
    const calon = [
      { dir: Directory.Documents, sub: '' },
      { dir: Directory.External, sub: '' },
      { dir: Directory.ExternalStorage, sub: 'Download' },
      { dir: Directory.ExternalStorage, sub: 'Documents' },
      { dir: Directory.ExternalStorage, sub: '' }
    ];
    let sumber = null;
    for (const c of calon) {
      try {
        const r = await Filesystem.readdir({ path: c.sub, directory: c.dir });
        const ada = (r.files || []).find(f =>
          (f.name || f) === 'tleserisme.db');
        if (ada) { sumber = c; break; }
      } catch (e) { }
    }
    if (!sumber) {
      p.style.color = 'var(--bahaya)';
      p.innerHTML = 'Berkas <b>tleserisme.db</b> tidak ketemu.<br>' +
        'Pastikan sudah disalin ke folder <b>Download</b> di HP, ' +
        'dan namanya persis <b>tleserisme.db</b> (huruf kecil semua).';
      return;
    }

    // 2. salin ke folder data aplikasi
    p.style.color = 'var(--ink2)';
    p.textContent = 'Menyalin basis data… ini beberapa menit, jangan ditutup.';
    const asal = (sumber.sub ? sumber.sub + '/' : '') + 'tleserisme.db';
    await Filesystem.copy({
      from: asal, directory: sumber.dir,
      to: 'tleserisme.db', toDirectory: Directory.Data
    });

    // 3. pindahkan ke tempat yang bisa dibaca plugin
    p.textContent = 'Memasang…';
    await DB.pasangDariBerkas('tleserisme.db');

    // 4. buka
    await DB.bukaAndroid();
    await lanjutJalan();
  } catch (e) {
    p.style.color = 'var(--bahaya)';
    p.textContent = 'Gagal: ' + (e.message || e);
  }
}

/* ============================================================
   NAVIGASI
   ============================================================ */
const JUDUL = {
  beranda: ['TLeserisme23', 'Perpustakaan Fikih & Bahtsul Masail'],
  cari: ['Pencarian', 'Hasil per paragraf'],
  jelajah: ['Jelajah', 'Fan ilmu & kitab'],
  baca: ['Sedang dibaca', ''],
  koleksi: ['Koleksi saya', 'Catatan pribadi'],
  atur: ['Pengaturan', '']
};

function pergi(nama) {
  S.layar = nama;
  $$('.layar').forEach(e => e.classList.toggle('on', e.dataset.layar === nama));
  $$('.nv').forEach(e => e.classList.toggle('on', e.dataset.pergi === nama));
  const j = JUDUL[nama] || JUDUL.beranda;
  $('#bilah-t').textContent = j[0];
  $('#bilah-s').textContent = j[1] || '—';
  $('#isi').scrollTop = 0;
  if (nama === 'cari') setTimeout(() => $('#q').focus(), 80);
  if (nama === 'jelajah') isiPohon();
  if (nama === 'koleksi') isiKoleksi();
  if (nama === 'atur') isiAtur();
  if (nama === 'beranda') isiBeranda();
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
  const q = $('#q');
  q.addEventListener('input', () => {
    $('#q-hapus').style.display = q.value ? 'block' : 'none';
    clearTimeout(jamCari);
    jamCari = setTimeout(jalankanCari, 260);
  });
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

async function jalankanCari() {
  const w = $('#hasil');
  const q = $('#q').value.trim();
  S.qTerakhir = q;
  if (!q) { w.innerHTML = petunjukCari(); return; }
  w.innerHTML = `<div class="muat"><div class="puter"></div>mencari…</div>`;

  try {
    if (S.jenisCari === 'judul') return tampilJudul(await DB.cariJudul(q), q);
    if (S.jenisCari === 'catatan') return tampilCatatanCari(await DB.catatanCari(q), q);

    const t0 = performance.now();
    const [jml, rows] = await Promise.all([
      DB.hitungCari(q, S.frasa, null),
      DB.cari(q, { frasa: S.frasa, batas: 30 })
    ]);
    const ms = Math.round(performance.now() - t0);
    if (q !== S.qTerakhir) return;

    if (!rows.length) {
      w.innerHTML = `<div class="kosong">Tidak ketemu.<br>
        Coba kata yang lebih pendek, atau matikan <b>frasa persis</b>.</div>`;
      return;
    }

    const kata = DB.kataKunci(q);
    let h = `<div class="hitung">Ketemu <b>${angka(jml)}</b> paragraf
      ${Setel.data.abaikan ? '&middot; harakat diabaikan' : ''}
      ${S.frasa ? '&middot; frasa persis' : ''} &middot; ${ms} md</div>`;
    h += rows.map(r => kartuHasil(r, kata)).join('');
    if (jml > rows.length) {
      h += `<div class="kosong" style="padding:16px;font-size:12px">
        Menampilkan ${rows.length} teratas dari ${angka(jml)} paragraf.<br>
        Persempit kata kunci untuk hasil yang lebih tepat.</div>`;
    }
    w.innerHTML = h;
  } catch (e) {
    w.innerHTML = `<div class="kosong">Ada yang salah: ${esc(String(e.message || e))}</div>`;
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
   JELAJAH
   ============================================================ */
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

  let t = esc(h.isi).replace(/&lt;ص:\s*(\d+)&gt;/g, '<span class="tanda-hal">ص $1</span>');
  if (!Setel.data.harakat) t = t.replace(/[ً-ْٰ]/g, '');
  const el = $('#nass');
  el.innerHTML = t;
  el.classList.toggle('latin', !arab(h.isi));

  const persen = k.jml_halaman ? Math.min(100, h.urut / k.jml_halaman * 100) : 0;
  $('#p-bar').style.width = Math.max(1, persen) + '%';
  $('#p-pos').textContent = h.hal + ' / ' + angka(k.jml_halaman);
  DB.tandaAda(k.id, h.urut).then(a => $('#a-tanda').classList.toggle('on', a));
  $('#isi').scrollTop = 0;
}

async function lompat(arah) {
  if (!S.kitab || !S.halaman) return;
  const h = await DB.halamanSebelahnya(S.kitab.id, S.halaman.urut, arah);
  if (!h) return;
  S.halaman = h;
  gambarBaca();
  DB.riwayatSimpan(S.kitab.id, h.urut).catch(() => { });
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
        <div class="s">${DB.mode === 'android' ? 'SQLite bawaan HP' : 'peramban (uji coba)'}
        &middot; teks dimampatkan</div></div></div>`;
  } catch (e) { }
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

  $$('.nv').forEach(b => b.onclick = () => pergi(b.dataset.pergi));
  $('#ke-cari').onclick = () => pergi('cari');
  $('#btn-tema').onclick = () => {
    Setel.data.terang = !Setel.data.terang; Setel.simpan();
  };

  pasangCari();

  // klik menyebar
  document.addEventListener('click', ev => {
    const buka = ev.target.closest('[data-buka]');
    if (buka) { bukaKitab(+buka.dataset.buka, +(buka.dataset.urut || 1)); return; }
    const pg = ev.target.closest('[data-pergi]');
    if (pg && !pg.classList.contains('nv')) { pergi(pg.dataset.pergi); return; }
    const simpul = ev.target.closest('.simpul > .hd');
    if (simpul) { bukaFan(simpul.parentNode); return; }
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

  $('#tirai').onclick = e => { if (e.target.id === 'tirai') tutupTirai(); };
  $('#tirai-tutup').onclick = tutupTirai;

  $('#p-maju').onclick = () => lompat(1);
  $('#p-mundur').onclick = () => lompat(-1);
  $('#a-isi').onclick = bukaDaftarIsi;
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
  $('#s-tema').onclick = () => { Setel.data.terang = !Setel.data.terang; Setel.simpan(); isiAtur(); };
  $('#s-abaikan').onclick = () => { Setel.data.abaikan = !Setel.data.abaikan; Setel.simpan(); isiAtur(); };
  $('#s-hamzah').onclick = () => { Setel.data.hamzah = !Setel.data.hamzah; Setel.simpan(); isiAtur(); };
  $('#s-besar').onclick = () => {
    Setel.data.besar += 2; if (Setel.data.besar > 26) Setel.data.besar = 15;
    Setel.simpan(); isiAtur();
  };

  $('#q-fan').addEventListener('input', function () {
    const v = DB.seragam(this.value.trim());
    $$('#pohon .simpul').forEach(s => {
      const nm = DB.seragam(s.querySelector('.nm').textContent);
      s.style.display = (!v || nm.indexOf(v) >= 0) ? '' : 'none';
    });
  });

  // tombol kembali Android
  document.addEventListener('backbutton', () => {
    if ($('#tirai').classList.contains('on')) { tutupTirai(); return; }
    if (S.layar !== 'beranda') { pergi('beranda'); return; }
  }, false);
}

document.addEventListener('DOMContentLoaded', mulai);
