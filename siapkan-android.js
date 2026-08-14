/* Menyiapkan folder Android sesudah `npx cap add android`.
   Dijalankan otomatis oleh GitHub Actions — tidak perlu disentuh. */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const RES = 'android/app/src/main/res';
const LOGO = 'www/ikon/logo.png';
const BG = { r: 10, g: 21, b: 54, alpha: 1 };

const UKURAN = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

function tulis(p, isi) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, isi);
  console.log('  tulis', p);
}

async function ikon() {
  const logo = sharp(LOGO);
  const meta = await logo.metadata();
  for (const [d, px] of Object.entries(UKURAN)) {
    const folder = `${RES}/mipmap-${d}`;
    fs.mkdirSync(folder, { recursive: true });

    const isi = Math.round(px * 0.70);
    const kecil = await sharp(LOGO)
      .resize({ width: isi, height: isi, fit: 'inside' }).toBuffer();
    const km = await sharp(kecil).metadata();
    const dasar = await sharp({ create: { width: px, height: px, channels: 4, background: BG } })
      .composite([{ input: kecil,
        left: Math.round((px - km.width) / 2), top: Math.round((px - km.height) / 2) }])
      .png().toBuffer();
    fs.writeFileSync(`${folder}/ic_launcher.png`, dasar);
    fs.writeFileSync(`${folder}/ic_launcher_round.png`, dasar);

    const isi2 = Math.round(px * 0.46);
    const kecil2 = await sharp(LOGO)
      .resize({ width: isi2, height: isi2, fit: 'inside' }).toBuffer();
    const km2 = await sharp(kecil2).metadata();
    const depan = await sharp({ create: { width: px, height: px, channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: kecil2,
        left: Math.round((px - km2.width) / 2), top: Math.round((px - km2.height) / 2) }])
      .png().toBuffer();
    fs.writeFileSync(`${folder}/ic_launcher_foreground.png`, depan);
  }
  console.log('  ikon selesai');
}

async function splash() {
  const daftar = [['mdpi',320],['hdpi',480],['xhdpi',720],['xxhdpi',960],['xxxhdpi',1280]];
  for (const [d, px] of daftar) {
    const folder = `${RES}/drawable-${d}`;
    fs.mkdirSync(folder, { recursive: true });
    const t = Math.round(px * 1.8);
    const isi = Math.round(px * 0.34);
    const kecil = await sharp(LOGO).resize({ width: isi, height: isi, fit: 'inside' }).toBuffer();
    const km = await sharp(kecil).metadata();
    const img = await sharp({ create: { width: px, height: t, channels: 4, background: BG } })
      .composite([{ input: kecil,
        left: Math.round((px - km.width) / 2),
        top: Math.round((t - km.height) / 2 - px * 0.06) }])
      .png().toBuffer();
    fs.writeFileSync(`${folder}/splash.png`, img);
  }
  fs.mkdirSync(`${RES}/drawable`, { recursive: true });
  fs.copyFileSync(`${RES}/drawable-xhdpi/splash.png`, `${RES}/drawable/splash.png`);
  console.log('  splash selesai');
}

function warna() {
  // Capacitor SUDAH punya values/ic_launcher_background.xml.
  // Kalau kita bikin warna bernama sama di colors.xml, Gradle menolak
  // dengan "Duplicate resources". Jadi berkas itu kita TIMPA, bukan tambah.
  tulis(`${RES}/values/ic_launcher_background.xml`,
`<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0A1536</color>
</resources>
`);
  tulis(`${RES}/values/colors.xml`,
`<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="colorPrimary">#0A1536</color>
    <color name="colorPrimaryDark">#070E1A</color>
    <color name="colorAccent">#E9BC6B</color>
</resources>
`);
  const ada =
`<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
  tulis(`${RES}/mipmap-anydpi-v26/ic_launcher.xml`, ada);
  tulis(`${RES}/mipmap-anydpi-v26/ic_launcher_round.xml`, ada);
}

function nama() {
  const p = `${RES}/values/strings.xml`;
  let s = fs.readFileSync(p, 'utf8');
  s = s.replace(/<string name="app_name">.*?<\/string>/,
                '<string name="app_name">TLeserisme23</string>');
  s = s.replace(/<string name="title_activity_main">.*?<\/string>/,
                '<string name="title_activity_main">TLeserisme23</string>');
  fs.writeFileSync(p, s);
  console.log('  nama aplikasi diatur');
}

function izin() {
  const p = 'android/app/src/main/AndroidManifest.xml';
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('xmlns:tools')) {
    s = s.replace('<manifest xmlns:android="http://schemas.android.com/apk/res/android"',
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android"\n    xmlns:tools="http://schemas.android.com/tools"');
  }
  if (!s.includes('requestLegacyExternalStorage')) {
    s = s.replace('<application', '<application\n        android:requestLegacyExternalStorage="true"');
  }
  if (!s.includes('MANAGE_EXTERNAL_STORAGE')) {
    s = s.replace('</manifest>',
`    <!-- untuk membaca tleserisme.db yang disalin pengguna -->
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"
        android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"
        android:maxSdkVersion="29" />
    <uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE"
        tools:ignore="ScopedStorage" />
</manifest>`);
  }
  fs.writeFileSync(p, s);
  console.log('  izin dipasang');
}

(async () => {
  console.log('Menyiapkan Android…');
  await ikon();
  await splash();
  warna();
  nama();
  izin();
  console.log('Selesai.');
})().catch(e => { console.error(e); process.exit(1); });
