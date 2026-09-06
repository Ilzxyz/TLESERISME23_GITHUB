#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ukur-db.py — mengukur di mana beratnya tleserisme.db + memastikan
format penyimpanan teks (base64? gzip? blob?). CUMA MEMBACA.

Pakai:
    python ukur-db.py
    python ukur-db.py "D:\\Tleserisme For All\\pembongkar-baru\\pembongkar-baru\\tleserisme.db"

Hasil disimpan ke ukur-db-hasil.txt di folder yang sama — tidak perlu copy-paste.
"""
import os, sys, sqlite3, base64, binascii, builtins

_HASIL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ukur-db-hasil.txt")
try:
    _F = open(_HASIL, "w", encoding="utf-8")
except Exception:
    _F = None

def print(*a, **k):  # noqa: A001
    builtins.print(*a, **k)
    if _F:
        k.pop("file", None)
        builtins.print(*a, **k, file=_F); _F.flush()

def cari_db():
    kandidat = [
        r"D:\Tleserisme For All\pembongkar-baru\pembongkar-baru\tleserisme.db",
        r"D:\Tleserisme For All\File jadi\tleserisme.db",
        r"D:\Tleserisme For All\Tleserime Versi Pc\tleserisme.db",
        r"D:\Tleserisme For All\TLESERISME23_GITHUB\tleserisme.db",
    ]
    for p in kandidat:
        if os.path.exists(p): return p
    akar = r"D:\Tleserisme For All"
    if os.path.isdir(akar):
        for root, _d, files in os.walk(akar):
            for f in files:
                if f.lower() == "tleserisme.db":
                    return os.path.join(root, f)
    return None

def mb(b): return f"{b/1048576:.1f} MB" if b is not None else "?"

def tebak_format(v):
    """kembalikan (label, byte_asli_kira2) untuk satu nilai kolom."""
    if v is None:
        return "NULL", 0
    if isinstance(v, (bytes, bytearray)):
        head = bytes(v[:2])
        if head == b"\x1f\x8b": return "BLOB gzip", len(v)
        if len(v) and v[0] == 0x78: return "BLOB zlib", len(v)
        return "BLOB biner", len(v)
    # str
    s = v
    contoh = s[:24]
    # apakah base64?
    try:
        raw = base64.b64decode(s[:2000] + "=" * ((4 - len(s[:2000]) % 4) % 4), validate=False)
        h = raw[:2]
        if h == b"\x1f\x8b":
            # base64 dari gzip -> byte asli = ~3/4 panjang base64
            return "TEKS base64(gzip)", int(len(s) * 0.75)
        if len(raw) and raw[0] == 0x78:
            return "TEKS base64(zlib)", int(len(s) * 0.75)
    except Exception:
        pass
    return "TEKS biasa (utf-8)", len(s.encode("utf-8"))

def sample(cur, sql):
    try:
        r = cur.execute(sql).fetchone()
        return r[0] if r else None
    except sqlite3.Error:
        return None

def main():
    path = sys.argv[1] if len(sys.argv) > 1 else cari_db()
    if not path or not os.path.exists(path):
        print("TIDAK KETEMU tleserisme.db. Beri path-nya sebagai argumen.")
        return
    print("=" * 60)
    print("BERKAS :", path)
    print("UKURAN :", mb(os.path.getsize(path)))
    print("=" * 60)

    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    cur = con.cursor()

    tabel = [r[0] for r in cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]

    # ukuran byte AKURAT per kolom besar (CAST AS BLOB -> hitung byte sebenarnya)
    print("UKURAN BYTE ASLI (akurat, isi kolom):")
    total = 0
    for t in tabel:
        try:
            cols = [r[1] for r in cur.execute(f"PRAGMA table_info('{t}')")]
            ekspr = "+".join([f"COALESCE(LENGTH(CAST(\"{c}\" AS BLOB)),0)" for c in cols])
            n = cur.execute(f"SELECT COUNT(*) FROM '{t}'").fetchone()[0]
            b = cur.execute(f"SELECT SUM({ekspr}) FROM '{t}'").fetchone()[0] or 0
            total += b
            print(f"  {mb(b):>10}   {t:<12} ({n:,} baris)")
        except sqlite3.Error as e:
            print(f"   (gagal ukur {t}: {e})")
    print(f"  {'-'*40}")
    print(f"  {mb(total):>10}   TOTAL isi kolom (di luar overhead B-tree)")
    print("-" * 60)

    # format penyimpanan halaman.teks
    print("FORMAT PENYIMPANAN:")
    tv = sample(cur, "SELECT teks FROM halaman WHERE teks IS NOT NULL LIMIT 1")
    lab, asli = tebak_format(tv)
    print(f"  halaman.teks : {lab}")
    if isinstance(tv, str):
        print(f"                 contoh 40 huruf: {tv[:40]!r}")
        try:
            raw = base64.b64decode(tv[:400] + "==", validate=False)
            print(f"                 4 byte awal setelah decode: "
                  f"{binascii.hexlify(raw[:4]).decode()}")
        except Exception:
            pass
    # total byte teks & proyeksi kalau base64 -> BLOB
    try:
        tb = cur.execute("SELECT SUM(LENGTH(CAST(teks AS BLOB))) FROM halaman").fetchone()[0] or 0
        print(f"  total byte halaman.teks : {mb(tb)}")
        if "base64" in lab:
            hemat = tb * 0.25
            print(f"  -> kalau disimpan BLOB (bukan base64): hemat ~{mb(hemat)} "
                  f"(sisa ~{mb(tb - hemat)})")
    except sqlite3.Error:
        pass

    # kata.p format + ukuran
    if "kata" in tabel:
        pv = sample(cur, "SELECT p FROM kata WHERE p IS NOT NULL LIMIT 1")
        lab2, _ = tebak_format(pv)
        try:
            kb = cur.execute("SELECT SUM(LENGTH(CAST(p AS BLOB))+LENGTH(CAST(w AS BLOB))+8) FROM kata").fetchone()[0] or 0
        except sqlite3.Error:
            kb = 0
        print(f"  kata.p       : {lab2}   (total tabel kata ~{mb(kb)})")
        print(f"  -> index 'kata' bisa DIBUANG dari unduhan, dibangun ulang di HP")

    print("-" * 60)
    for t in ("kitab", "halaman", "fan", "kata", "bab"):
        if t in tabel:
            n = cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            print(f"  baris {t:<8}: {n:,}")
    print("=" * 60)
    print("Selesai. Hasil tersimpan di ukur-db-hasil.txt")
    con.close()

if __name__ == "__main__":
    try:
        main()
    finally:
        if _F: _F.close()
    if sys.stdin and sys.stdin.isatty():
        try: input("\nTekan Enter untuk menutup…")
        except Exception: pass
