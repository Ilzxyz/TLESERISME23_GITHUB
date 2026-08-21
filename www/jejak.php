<?php
/* ============================================================
   TLeserisme23 — perekam jejak + pemeriksa server
   ============================================================ */
$dir     = __DIR__;
$berkas  = $dir . '/jejak.txt';

/* ---------- terima catatan dari aplikasi ---------- */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $isi = file_get_contents('php://input');
    if (strlen($isi) > 4000) $isi = substr($isi, 0, 4000);
    $baris = date('H:i:s') . ' | ' . str_replace(["\r", "\n"], ' ', $isi) . "\n";
    @file_put_contents($berkas, $baris, FILE_APPEND | LOCK_EX);
    http_response_code(204);
    exit;
}

if (isset($_GET['hapus'])) { @unlink($berkas); header('Location: jejak.php'); exit; }

$pesanUji = '';
if (isset($_GET['uji'])) {
    $ok = @file_put_contents($berkas, date('H:i:s') . " | UJI TULIS DARI SERVER\n",
                             FILE_APPEND | LOCK_EX);
    $pesanUji = ($ok !== false)
        ? '<b style="color:#5fd8b4">BERHASIL menulis ' . $ok . ' byte</b>'
        : '<b style="color:#e0644a">GAGAL menulis — PHP tidak diizinkan membuat berkas di folder ini</b>';
}

$teks = is_file($berkas) ? file_get_contents($berkas) : '';
$n = $teks === '' ? 0 : substr_count($teks, "\n");

$perlu = ['index.html', 'app.js', 'db.js', 'pekerja-db.js', 'konfigurasi.js',
          'jejak.js', 'app.css', '.htaccess'];
header('Content-Type: text/html; charset=utf-8');
?><!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Jejak TLeserisme23</title>
<style>
body{background:#0b1220;color:#e8eff8;font-family:system-ui,sans-serif;margin:0;padding:16px}
h1{font-size:17px;color:#e9bc6b;margin:0 0 4px}
h2{font-size:13px;color:#e9bc6b;margin:18px 0 7px}
pre{background:#131e30;border:1px solid #1f2e45;border-radius:10px;padding:12px;
  font-size:11.5px;line-height:1.75;white-space:pre-wrap;word-break:break-word;margin:0}
table{width:100%;border-collapse:collapse;font-size:12px}
td,th{text-align:left;padding:5px 8px;border-bottom:1px solid #1a2740}
th{color:#93a4bc;font-weight:600}
.ok{color:#5fd8b4}.no{color:#e0644a}
a{display:inline-block;background:#131e30;border:1px solid #2a3d59;color:#e8eff8;
  padding:10px 15px;border-radius:10px;text-decoration:none;font-size:13.5px;
  margin:10px 8px 0 0}
</style></head><body>
<h1>Jejak TLeserisme23</h1>

<h2>1. Apakah PHP boleh menulis di sini?</h2>
<pre>folder            : <?php echo htmlspecialchars($dir); ?>
folder bisa ditulis: <?php echo is_writable($dir)
    ? '<span class="ok">YA</span>' : '<span class="no">TIDAK</span>'; ?>
berkas jejak.txt   : <?php echo is_file($berkas)
    ? 'ada, ' . filesize($berkas) . ' byte' : 'belum ada'; ?>
PHP dijalankan oleh: <?php echo htmlspecialchars(
    function_exists('posix_getpwuid') && function_exists('posix_geteuid')
    ? (posix_getpwuid(posix_geteuid())['name'] ?? '?') : get_current_user()); ?>
versi PHP          : <?php echo PHP_VERSION; ?></pre>
<?php if ($pesanUji) echo '<pre style="margin-top:10px">' . $pesanUji . '</pre>'; ?>

<h2>2. Berkas aplikasi yang benar-benar ada di server</h2>
<table><tr><th>Berkas</th><th>Ukuran</th><th>Terakhir diubah</th></tr>
<?php foreach ($perlu as $f) {
    $p = $dir . '/' . $f;
    if (is_file($p)) {
        printf('<tr><td class="ok">%s</td><td>%.2f KB</td><td>%s</td></tr>',
            htmlspecialchars($f), filesize($p) / 1024, date('d/m H:i', filemtime($p)));
    } else {
        printf('<tr><td class="no">%s</td><td colspan="2" class="no">TIDAK ADA</td></tr>',
            htmlspecialchars($f));
    }
} ?>
</table>

<h2>3. Apakah index.html memuat perekamnya?</h2>
<pre><?php
$ix = $dir . '/index.html';
if (is_file($ix)) {
    $isi = file_get_contents($ix);
    echo strpos($isi, 'jejak.js') !== false
        ? '<span class="ok">YA — index.html memanggil jejak.js</span>'
        : '<span class="no">TIDAK — index.html masih versi lama, perekamnya tidak ikut dimuat</span>';
} else { echo '<span class="no">index.html tidak ada</span>'; }
?></pre>

<h2>4. Catatan dari aplikasi — <?php echo $n; ?> baris</h2>
<pre id="catatan"><?php echo htmlspecialchars($teks === '' ? '(masih kosong)' : $teks, ENT_QUOTES, 'UTF-8'); ?></pre>

<a href="jejak.php">Muat ulang</a>
<a href="jejak.php?uji=1">Uji tulis</a>
<a href="jejak.php?hapus=1">Hapus catatan</a>
<a href="#" id="salin">Salin semua catatan</a>

<script>
/* Catatannya panjang dan susah difoto. Tombol ini menyalin semuanya
   supaya tinggal ditempel ke percakapan. */
document.getElementById('salin').onclick = function (e) {
  e.preventDefault();
  var t = document.getElementById('catatan').textContent;
  var tombol = this;
  function beres(ok) {
    tombol.textContent = ok ? 'Tersalin! tinggal ditempel' : 'Gagal menyalin — sorot manual';
    setTimeout(function () { tombol.textContent = 'Salin semua catatan'; }, 2500);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(function () { beres(true); }, function () { beres(false); });
  } else {
    var a = document.createElement('textarea');
    a.value = t; document.body.appendChild(a); a.select();
    try { beres(document.execCommand('copy')); } catch (x) { beres(false); }
    document.body.removeChild(a);
  }
};
</script>
</body></html>
