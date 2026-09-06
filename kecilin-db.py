#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
kecilin-db.py — mengecilkan tleserisme.db dengan MENGOMPRES ULANG teks
kitab memakai KAMUS BERSAMA (shared zlib dictionary). Aman:
  - teks tetap disimpan base64 (jalur baca aplikasi tidak berubah bentuknya)
  - index cari `kata` + semua tabel lain DISALIN apa adanya (search tetap ngebut)
  - hasilnya DB baru yang padat (tleserisme-kecil.db); yang lama tidak disentuh

DUA LANGKAH:
  1) python kecilin-db.py --ukur
     -> bangun kamus dari isi kitabmu, ukur penghematan di SAMPEL,
        proyeksikan ukuran akhir. Menulis kamus.bin + kamus-b64.txt.
        (belum bikin DB baru — cuma mengukur, cepat)

  2) python kecilin-db.py --tulis
     -> pakai kamus.bin yang tadi, tulis tleserisme-kecil.db penuh.
        (beberapa menit; 618 ribu halaman)

Opsi path DB:  python kecilin-db.py --ukur "D:\\...\\tleserisme.db"
"""
import os, sys, zlib, base64, sqlite3, collections, time

DIR = os.path.dirname(os.path.abspath(__file__))
KAMUS_BIN = os.path.join(DIR, "kamus.bin")
KAMUS_B64 = os.path.join(DIR, "kamus-b64.txt")
MAKS_KAMUS = 32768          # batas preset-dictionary zlib
CONTOH_UNTUK_KAMUS = 8000   # jumlah halaman disampel utk membangun kamus
CONTOH_UNTUK_UKUR = 4000    # jumlah halaman disampel utk mengukur hemat

def cari_db():
    kand = [
        r"D:\Tleserisme For All\pembongkar-baru\pembongkar-baru\tleserisme.db",
        r"D:\Tleserisme For All\File jadi\tleserisme.db",
        os.path.join(DIR, "tleserisme.db"),
    ]
    for p in kand:
        if os.path.exists(p): return p
    akar = r"D:\Tleserisme For All"
    if os.path.isdir(akar):
        for root, _d, files in os.walk(akar):
            if "tleserisme.db" in files:
                return os.path.join(root, "tleserisme.db")
    return None

def mb(b): return f"{b/1048576:.1f} MB"

def buka_teks(v):
    """teks tersimpan = base64(zlib(utf8)). Kembalikan str asli, atau None."""
    if v is None: return None
    try:
        if isinstance(v, (bytes, bytearray)):
            raw = bytes(v)
        else:
            raw = base64.b64decode(v)
        return zlib.decompress(raw).decode("utf-8")
    except Exception:
        return None

def bangun_kamus(cur, n_total):
    print(f"Membangun kamus dari maksimal {CONTOH_UNTUK_KAMUS} halaman contoh…")
    langkah = max(1, n_total // CONTOH_UNTUK_KAMUS)
    freq = collections.Counter()
    diambil = 0
    for row in cur.execute(
            f"SELECT teks FROM halaman WHERE teks IS NOT NULL "
            f"AND (id % {langkah})=0"):
        t = buka_teks(row[0])
        if not t: continue
        diambil += 1
        for kata in t.split():
            if 2 <= len(kata) <= 40:
                freq[kata] += 1
        if diambil >= CONTOH_UNTUK_KAMUS: break
    print(f"  {diambil} halaman dibaca, {len(freq):,} kata unik")

    # kata paling sering ditaruh PALING BELAKANG (zlib lebih suka ekor kamus)
    urut = [w for w, _ in freq.most_common()]
    urut.reverse()
    buf = (" ".join(urut)).encode("utf-8")
    if len(buf) > MAKS_KAMUS:
        buf = buf[-MAKS_KAMUS:]           # simpan ekor = yang paling sering
    with open(KAMUS_BIN, "wb") as f: f.write(buf)
    with open(KAMUS_B64, "w", encoding="utf-8") as f:
        f.write(base64.b64encode(buf).decode())
    print(f"  kamus {len(buf):,} byte -> {KAMUS_BIN}")
    return buf

def komp(teks, kamus):
    co = zlib.compressobj(9, zlib.DEFLATED, 15, 9, zlib.Z_DEFAULT_STRATEGY, kamus)
    return co.compress(teks.encode("utf-8")) + co.flush()

def mode_ukur(path):
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True); cur = con.cursor()
    n = cur.execute("SELECT COUNT(*) FROM halaman").fetchone()[0]
    kamus = bangun_kamus(cur, n)

    print(f"\nMengukur penghematan di {CONTOH_UNTUK_UKUR} halaman contoh…")
    langkah = max(1, n // CONTOH_UNTUK_UKUR)
    lama = baru = cek = 0
    c2 = con.cursor()
    for row in c2.execute(
            f"SELECT teks FROM halaman WHERE teks IS NOT NULL "
            f"AND (id % {langkah})=0"):
        t = buka_teks(row[0])
        if t is None: continue
        lama += len(row[0]) if isinstance(row[0], str) else len(row[0])
        baru += len(base64.b64encode(komp(t, kamus)))    # tetap base64
        cek += 1
        if cek >= CONTOH_UNTUK_UKUR: break
    con.close()

    if not cek or not lama:
        print("Gagal mengukur (teks tak terbaca?)."); return
    rasio = baru / lama
    tot_teks_lama = cur_total_teks(path)
    print("-" * 56)
    print(f"  contoh: {cek} halaman")
    print(f"  base64 lama : {mb(lama)}")
    print(f"  base64 baru : {mb(baru)}   ({(1-rasio)*100:.0f}% lebih kecil)")
    print("-" * 56)
    proy_teks = tot_teks_lama * rasio
    print(f"  PROYEKSI halaman.teks : {mb(tot_teks_lama)} -> {mb(proy_teks)}")
    print(f"  (hemat ~{mb(tot_teks_lama - proy_teks)} dari teks saja)")
    print("=" * 56)
    print("Kalau angkanya oke, lanjut:  python kecilin-db.py --tulis")

def cur_total_teks(path):
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        b = con.execute(
            "SELECT SUM(LENGTH(CAST(teks AS BLOB))) FROM halaman").fetchone()[0] or 0
    finally:
        con.close()
    return b

def mode_tulis(path):
    if not os.path.exists(KAMUS_BIN):
        print("kamus.bin belum ada. Jalankan dulu:  python kecilin-db.py --ukur")
        return
    kamus = open(KAMUS_BIN, "rb").read()
    keluar = os.path.join(os.path.dirname(path), "tleserisme-kecil.db")
    if os.path.exists(keluar):
        os.remove(keluar)

    print(f"Menulis {keluar} …")
    src = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    dst = sqlite3.connect(keluar)
    dst.execute("PRAGMA journal_mode=OFF")
    dst.execute("PRAGMA synchronous=OFF")

    # 1) salin SEMUA skema (tabel + index) persis
    for (sql,) in src.execute(
            "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL "
            "AND name NOT LIKE 'sqlite_%'"):
        dst.execute(sql)
    dst.commit()

    # 2) salin semua tabel selain halaman apa adanya
    tabel = [r[0] for r in src.execute(
        "SELECT name FROM sqlite_master WHERE type='table' "
        "AND name NOT LIKE 'sqlite_%'")]
    for t in tabel:
        if t == "halaman": continue
        cols = [r[1] for r in src.execute(f"PRAGMA table_info('{t}')")]
        ph = ",".join("?" * len(cols))
        rows = src.execute(f"SELECT {','.join(chr(34)+c+chr(34) for c in cols)} FROM '{t}'")
        buf = []
        for r in rows:
            buf.append(r)
            if len(buf) >= 5000:
                dst.executemany(f"INSERT INTO '{t}' VALUES ({ph})", buf); buf = []
        if buf: dst.executemany(f"INSERT INTO '{t}' VALUES ({ph})", buf)
        dst.commit()
        print(f"  salin {t}: selesai")

    # 3) halaman — kompres ulang teks pakai kamus
    cols = [r[1] for r in src.execute("PRAGMA table_info('halaman')")]
    idx_teks = cols.index("teks")
    ph = ",".join("?" * len(cols))
    n = src.execute("SELECT COUNT(*) FROM halaman").fetchone()[0]
    print(f"  halaman: kompres ulang {n:,} baris…")
    t0 = time.time(); buf = []; done = 0; gagal = 0
    for r in src.execute(f"SELECT {','.join(chr(34)+c+chr(34) for c in cols)} FROM halaman"):
        r = list(r)
        t = buka_teks(r[idx_teks])
        if t is not None:
            r[idx_teks] = base64.b64encode(komp(t, kamus)).decode()
        else:
            gagal += 1   # biarkan apa adanya kalau tak terbaca
        buf.append(r)
        done += 1
        if len(buf) >= 3000:
            dst.executemany(f"INSERT INTO halaman VALUES ({ph})", buf); buf = []
            if done % 60000 == 0:
                dst.commit()
                laju = done / max(1, time.time() - t0)
                print(f"    {done:,}/{n:,}  (~{laju:.0f} baris/dtk)")
    if buf: dst.executemany(f"INSERT INTO halaman VALUES ({ph})", buf)
    dst.commit()
    # tandai versi kamus (informasi saja)
    try: dst.execute("UPDATE info SET nilai='v1' WHERE kunci='kamus'")
    except Exception: pass
    print(f"  halaman selesai ({done:,} baris, {gagal} tak terkompres)")

    print("  merapikan (VACUUM)…")
    dst.commit()
    dst.isolation_level = None       # VACUUM tak boleh di dalam transaksi
    dst.execute("VACUUM")
    src.close(); dst.close()

    lama = os.path.getsize(path); barub = os.path.getsize(keluar)
    print("=" * 56)
    print(f"  LAMA : {mb(lama)}")
    print(f"  BARU : {mb(barub)}   ({(1-barub/lama)*100:.0f}% lebih kecil)")
    print(f"  -> {keluar}")
    print("=" * 56)
    print("Langkah berikut: kirim 'udah tulis' ke chat — nanti kuurus")
    print("penyisipan kamus ke aplikasi + unggah DB baru.")

def main():
    args = [a for a in sys.argv[1:]]
    mode = "--ukur"
    path = None
    for a in args:
        if a in ("--ukur", "--tulis"): mode = a
        else: path = a
    if not path: path = cari_db()
    if not path or not os.path.exists(path):
        print("TIDAK KETEMU tleserisme.db — beri path-nya sebagai argumen."); return
    print("DB:", path, "\n")
    if mode == "--ukur": mode_ukur(path)
    else: mode_tulis(path)

if __name__ == "__main__":
    main()
    if sys.stdin and sys.stdin.isatty():
        try: input("\nTekan Enter untuk menutup…")
        except Exception: pass
