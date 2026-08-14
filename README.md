# TLeserisme23

**Perpustakaan Digital Fikih & Bahtsul Masail** — aplikasi Android yang berjalan
sepenuhnya tanpa internet.

Berisi 4.847 kitab: fikih empat madzhab pilihan, dan arsip Bahtsul Masail
(LBM 2009–2020, FMPP, Hasil Rumusan, dan lainnya).

## Yang membuatnya beda

- **Cari satu kata, ketemu satu paragraf** — bukan cuma nama kitabnya.
  Lengkap dengan nama kitab, pengarang, juz, dan halaman cetak.
- **Abaikan harakat** — ketik `الطهارة` polos, yang ketemu `الطَّهَارَةِ` berharakat.
  Bentuk أ إ آ ٱ dianggap sama dengan ا, ة dengan ه, ى dengan ي.
- **Arab dan Indonesia sekaligus** — satu mesin cari untuk kitab kuning
  maupun hasil bahtsul yang bahasanya campur.
- **Catatan pribadi** — tulisanmu sendiri ikut tercari bareng kitab kuning.
  Ini yang tidak ada di Maktabah Syamilah.

## Cara memasang

1. Unduh `TLeserisme23.apk` dari halaman **Releases**
2. Buka berkasnya di HP, izinkan pemasangan dari sumber luar
3. Salin `tleserisme.db` dari komputer ke folder **Download** di HP
4. Buka aplikasi, tekan **Pilih berkas tleserisme.db**, tunggu sampai selesai

Sekali saja. Sesudah itu aplikasi langsung jalan tanpa internet.

## Susunan teknis

| Bagian | Pilihan |
|---|---|
| Kerangka | Capacitor 7 (Android) |
| Basis data | SQLite, dibaca lewat `@capacitor-community/sqlite` |
| Teks | dimampatkan zlib + base64 (hemat 2/3 tempat) |
| Mesin cari | indeks kata buatan sendiri (cara Maktabah Syamilah) |
| Huruf Arab | Amiri, ikut di dalam aplikasi |

Indeks pencarian tidak memakai FTS5 supaya dijamin jalan di semua HP.
Susunannya: tabel `kata` berisi kata yang sudah diseragamkan, jumlah halaman,
dan daftar id halaman yang disimpan sebagai selisih varint — hemat dan cepat.

## Membangun APK

APK dibangun otomatis oleh GitHub Actions setiap kali ada perubahan.
Lihat tab **Actions**. Hasilnya muncul di **Releases** dan di bagian
**Artifacts** pada halaman jalannya.

Untuk membangun sendiri di komputer:

```bash
npm install
npx cap sync android
cd android && ./gradlew assembleDebug
```

## Menyiapkan basis data

Berkas `tleserisme.db` dibuat dari data Maktabah Syamilah memakai dua alat
terpisah (`bongkar.py` dan `penyiap.py`), tidak disertakan di sini karena
ukurannya sekitar 1,5 GB.
