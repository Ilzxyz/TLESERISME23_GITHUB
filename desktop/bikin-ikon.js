/* ============================================================
   TLeserisme23 — pembuat berkas ikon Windows (.ico)
   Mengubah www/ikon/ikon_512_solid.png menjadi build/icon.ico
   berisi banyak ukuran (256..16), yang dipakai electron-builder
   untuk ikon .exe, installer, dan pintasan.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

const sumber = path.join(__dirname, '..', 'www', 'ikon', 'ikon_512_solid.png');
const folder = path.join(__dirname, '..', 'build');
const keluar = path.join(folder, 'icon.ico');

async function main() {
  if (!fs.existsSync(sumber)) throw new Error('ikon sumber tidak ada: ' + sumber);
  fs.mkdirSync(folder, { recursive: true });

  const ukuran = [256, 128, 64, 48, 32, 16];
  const potongan = [];
  for (const u of ukuran) {
    potongan.push(await sharp(sumber).resize(u, u, { fit: 'cover' }).png().toBuffer());
  }

  const ico = await pngToIco(potongan);
  fs.writeFileSync(keluar, ico);
  console.log('icon.ico dibuat:', keluar, '(' + ico.length + ' byte)');
}

main().catch((e) => { console.error(e); process.exit(1); });
