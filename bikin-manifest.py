#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
bikin-manifest.py — bikin daftar sidik jari (SHA-256) per-potongan untuk
tleserisme.db, supaya unduhan di HP bisa MEMVERIFIKASI tiap potongan dan
mengulang HANYA potongan yang rusak (bukan 1,3 GB dari nol).

Pakai:
    python bikin-manifest.py
    python bikin-manifest.py "D:\\...\\tleserisme.db"

Hasil: <nama db>.manifest.json di folder yang sama.
Unggah DUA berkas ke rilis GitHub (tag db-v1): tleserisme.db + tleserisme.db.manifest.json
(DB-nya sudah ada di sana — cukup TAMBAH file .manifest.json. Tidak perlu unduh ulang.)
"""
import os, sys, json, hashlib

POTONG = 8 * 1024 * 1024   # 8 MB per potongan — HARUS sama dgn yang dibaca app

def cari_db():
    kand = [
        r"D:\Tleserisme For All\pembongkar-baru\pembongkar-baru\tleserisme.db",
        r"D:\Tleserisme For All\File jadi\tleserisme.db",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "tleserisme.db"),
    ]
    for p in kand:
        if os.path.exists(p): return p
    akar = r"D:\Tleserisme For All"
    if os.path.isdir(akar):
        for root, _d, files in os.walk(akar):
            if "tleserisme.db" in files:
                return os.path.join(root, "tleserisme.db")
    return None

def main():
    path = sys.argv[1] if len(sys.argv) > 1 else cari_db()
    if not path or not os.path.exists(path):
        print("TIDAK KETEMU tleserisme.db — beri path-nya sebagai argumen.")
        return
    ukuran = os.path.getsize(path)
    n = (ukuran + POTONG - 1) // POTONG
    print(f"Berkas : {path}")
    print(f"Ukuran : {ukuran:,} byte  ->  {n} potongan @ {POTONG//1048576} MB")

    sha = []
    with open(path, "rb") as f:
        i = 0
        while True:
            blok = f.read(POTONG)
            if not blok: break
            sha.append(hashlib.sha256(blok).hexdigest())
            i += 1
            if i % 20 == 0 or i == n:
                print(f"  {i}/{n} potongan…", end="\r")
    print()

    man = {
        "algoritma": "sha256",
        "potong": POTONG,
        "ukuran": ukuran,
        "sha": sha,
    }
    keluar = path + ".manifest.json"
    with open(keluar, "w", encoding="utf-8") as f:
        json.dump(man, f)
    print(f"OK -> {keluar}  ({os.path.getsize(keluar):,} byte, {len(sha)} sidik jari)")
    print()
    print("Langkah: unggah berkas .manifest.json ini ke rilis GitHub 'db-v1'")
    print("(di sebelah tleserisme.db). Tidak perlu unggah ulang DB-nya.")

if __name__ == "__main__":
    main()
    if sys.stdin and sys.stdin.isatty():
        try: input("\nTekan Enter untuk menutup…")
        except Exception: pass
