/* ============================================================
   TLeserisme23 — cangkang Desktop (Windows) berbasis Electron
   ------------------------------------------------------------
   Filosofinya sama persis dengan versi Android:
     - kode "www/" TIDAK diubah sama sekali
     - berkas tleserisme.db (±1,26 GB) tetap TERPISAH dari aplikasi
     - berkasnya dibaca sepotong-sepotong dari harddisk (Range 206),
       bukan dimuat seluruhnya ke ingatan

   Caranya: kita nyalakan server kecil di dalam aplikasi ini
   (127.0.0.1, hanya untuk diri sendiri), yang:
     1. menyajikan berkas-berkas di folder www/
     2. menyajikan tleserisme.db dengan dukungan potongan (HTTP Range)
     3. menyuntikkan konfigurasi desktop (auto-buka DB lokal)

   Jendela aplikasi lalu dibuka menunjuk ke server itu — jadi kode
   web yang sama yang jalan di tleserisme.com pun jalan di sini,
   penuh luring.
   ============================================================ */

const { app, BrowserWindow, dialog, Menu, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

app.setName('TLeserisme23');

const NAMA_DB = 'tleserisme.db';
const WWW = path.join(__dirname, '..', 'www');       // desktop/ bersebelahan dengan www/

/* ---------- ingatan lokasi berkas DB ---------- */
function berkasConfig() {
  return path.join(app.getPath('userData'), 'tleser-desktop.json');
}
function bacaConfig() {
  try { return JSON.parse(fs.readFileSync(berkasConfig(), 'utf8')); }
  catch (e) { return {}; }
}
function tulisConfig(c) {
  try { fs.writeFileSync(berkasConfig(), JSON.stringify(c, null, 2)); }
  catch (e) { /* tidak apa-apa */ }
}

/* Folder tempat aplikasi benar-benar berada (buat cari tleserisme.db di sebelahnya).
   Untuk versi portable, electron-builder mengisi PORTABLE_EXECUTABLE_DIR dengan
   lokasi .exe yang asli (bukan folder sementara tempat ia mengekstrak diri). */
function folderExe() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR;
  if (app.isPackaged) return path.dirname(app.getPath('exe'));
  return path.join(__dirname, '..');                 // mode pengembangan: akar repo
}

function cariDB() {
  const c = bacaConfig();
  const kandidat = [];
  if (c.dbPath) kandidat.push(c.dbPath);             // yang terakhir dipilih
  kandidat.push(path.join(folderExe(), NAMA_DB));    // di sebelah aplikasi
  for (const p of kandidat) {
    try { if (p && fs.existsSync(p) && fs.statSync(p).size > 0) return p; } catch (e) { }
  }
  return null;
}

let dbPathAktif = null;

/* ---------- jenis berkas ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.otf':  'font/otf',
  '.txt':  'text/plain; charset=utf-8',
  '.map':  'application/json; charset=utf-8'
};

/* ---------- konfigurasi desktop yang disuntikkan ----------
   Menggantikan www/konfigurasi.js HANYA saat disajikan lewat server ini,
   sehingga berkas asli di folder www/ (dipakai Android & web) tetap utuh.
   ALAMAT_DB diisi -> aplikasi otomatis membuka DB lokal lewat server ini,
   tanpa perlu pengguna memilih berkas tiap kali. */
function konfigDesktopJS() {
  return '/* dibuat otomatis oleh cangkang desktop */\n' +
         'window.KONFIG = { ALAMAT_DB: ' + JSON.stringify(NAMA_DB) + ', SANDI_PERAMBAN: false };\n';
}

/* ---------- sajikan tleserisme.db dengan dukungan potongan ---------- */
function sajikanDB(req, res) {
  let st;
  try { st = fs.statSync(dbPathAktif); }
  catch (e) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('DB tidak ada'); return; }
  const total = st.size;
  const range = req.headers['range'];

  const dasar = {
    'Content-Type': 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store'
  };

  if (req.method === 'HEAD') {
    res.writeHead(200, Object.assign({ 'Content-Length': total }, dasar));
    res.end();
    return;
  }

  if (!range) {
    // Aplikasi selalu meminta lewat Range; ini cuma jaga-jaga.
    res.writeHead(200, Object.assign({ 'Content-Length': total }, dasar));
    fs.createReadStream(dbPathAktif).pipe(res);
    return;
  }

  const m = /bytes=(\d+)-(\d*)/.exec(range);
  if (!m) { res.writeHead(416, { 'Content-Range': 'bytes */' + total }); res.end(); return; }
  let start = parseInt(m[1], 10);
  let end = m[2] ? parseInt(m[2], 10) : total - 1;
  if (isNaN(start) || start < 0) start = 0;
  if (isNaN(end) || end >= total) end = total - 1;
  if (start > end) { res.writeHead(416, { 'Content-Range': 'bytes */' + total }); res.end(); return; }

  res.writeHead(206, Object.assign({
    'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
    'Content-Length': (end - start + 1)
  }, dasar));
  fs.createReadStream(dbPathAktif, { start, end }).pipe(res);
}

/* ---------- sajikan berkas statis dari www/ ---------- */
function sajikanStatis(p, res) {
  const rel = path.normalize(p).replace(/^([\\/])+/, '');
  const file = path.join(WWW, rel);
  if (file !== WWW && !file.startsWith(WWW + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('403'); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404'); return; }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}

function buatServer() {
  return http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
    catch (e) { p = (req.url || '/').split('?')[0]; }
    if (p === '/' || p === '') p = '/index.html';

    if (p === '/konfigurasi.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(konfigDesktopJS());
      return;
    }
    if (p === '/' + NAMA_DB) { sajikanDB(req, res); return; }
    sajikanStatis(p, res);
  });
}

/* ---------- jendela & menu ---------- */
let win = null;
let server = null;
let port = 0;

function ikonJendela() {
  const p = path.join(__dirname, '..', 'build', 'icon.ico');
  try { if (fs.existsSync(p)) return p; } catch (e) { }
  return undefined;
}

function buatJendela() {
  win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 380,
    minHeight: 560,
    backgroundColor: '#0C1524',
    title: 'TLeserisme23',
    icon: ikonJendela(),
    autoHideMenuBar: true,     // menu bar disembunyikan; tekan Alt untuk memunculkan sesaat
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });
  win.loadURL('http://127.0.0.1:' + port + '/');
}

async function gantiDB() {
  const r = await dialog.showOpenDialog(win, {
    title: 'Pilih berkas tleserisme.db',
    properties: ['openFile'],
    filters: [
      { name: 'Basis data TLeserisme', extensions: ['db'] },
      { name: 'Semua berkas', extensions: ['*'] }
    ]
  });
  if (r.canceled || !r.filePaths[0]) return;
  dbPathAktif = r.filePaths[0];
  const c = bacaConfig(); c.dbPath = dbPathAktif; tulisConfig(c);
  if (win) win.reload();
}

function buatMenu() {
  const template = [
    {
      label: 'Berkas',
      submenu: [
        { label: 'Ganti berkas tleserisme.db…', click: gantiDB },
        {
          label: 'Tunjukkan berkas DB di folder',
          click: () => { if (dbPathAktif) shell.showItemInFolder(dbPathAktif); }
        },
        { type: 'separator' },
        { role: 'quit', label: 'Keluar' }
      ]
    },
    {
      label: 'Tampilan',
      submenu: [
        { role: 'reload', label: 'Muat ulang' },
        { role: 'forceReload', label: 'Muat ulang paksa' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Ukuran normal' },
        { role: 'zoomIn', label: 'Perbesar' },
        { role: 'zoomOut', label: 'Perkecil' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Layar penuh' },
        { role: 'toggleDevTools', label: 'Alat pengembang' }
      ]
    },
    {
      label: 'Bantuan',
      submenu: [
        {
          label: 'Tentang',
          click: () => dialog.showMessageBox(win, {
            type: 'info',
            title: 'TLeserisme23',
            message: 'TLeserisme23 — Perpustakaan Digital Fikih & Bahtsul Masail',
            detail: 'Versi Desktop (Windows), berjalan penuh tanpa internet.\n\nBerkas data:\n' + (dbPathAktif || '—')
          })
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------- mulai ---------- */

// Cukup satu jendela: kalau diklik dua kali, fokuskan yang sudah ada.
const kunciTunggal = app.requestSingleInstanceLock();
if (!kunciTunggal) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(async () => {
    dbPathAktif = cariDB();

    if (!dbPathAktif) {
      const r = await dialog.showMessageBox({
        type: 'question',
        buttons: ['Cari berkas tleserisme.db…', 'Keluar'],
        defaultId: 0,
        cancelId: 1,
        title: 'Berkas data belum ketemu',
        message: 'Berkas tleserisme.db belum ditemukan.',
        detail: 'Taruh tleserisme.db di folder yang sama dengan aplikasi ini, ' +
                'lalu buka lagi — atau klik "Cari berkas" untuk menunjuk lokasinya sekarang.'
      });
      if (r.response !== 0) { app.quit(); return; }
      const pk = await dialog.showOpenDialog({
        title: 'Pilih berkas tleserisme.db',
        properties: ['openFile'],
        filters: [
          { name: 'Basis data TLeserisme', extensions: ['db'] },
          { name: 'Semua berkas', extensions: ['*'] }
        ]
      });
      if (pk.canceled || !pk.filePaths[0]) { app.quit(); return; }
      dbPathAktif = pk.filePaths[0];
      const c = bacaConfig(); c.dbPath = dbPathAktif; tulisConfig(c);
    }

    server = buatServer();
    await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
    port = server.address().port;

    buatMenu();
    buatJendela();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) buatJendela();
    });
  });

  app.on('window-all-closed', () => { app.quit(); });
}
