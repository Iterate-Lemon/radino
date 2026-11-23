#!/usr/bin/env python3
"""
Baut data/songs.json aus den CSV-Dateien des Community-Repositorys
andygruber/songseeker-hitster-playlists (MIT-Lizenz).

Aufruf (aus dem Projektordner):
    python3 tools/prepare_songs.py                 # CSVs von GitHub laden
    python3 tools/prepare_songs.py --src ordner/   # CSVs aus lokalem Ordner

Bereits ermittelte Spotify-Daten (sp, img, m) in einer vorhandenen
data/songs.json bleiben erhalten (Zuordnung über die Song-ID).
"""
import argparse
import csv
import io
import json
import os
import re
import sys
import unicodedata
import urllib.request
from datetime import date

REPO_RAW = "https://raw.githubusercontent.com/andygruber/songseeker-hitster-playlists/main/"

# Dateiname -> (Editions-ID, Anzeigename). Bewusst ohne den Markennamen.
EDITIONS = [
    ("hitster-de.csv", "de", "Deutschland (Grundspiel)"),
    ("hitster-de-aaaa0007.csv", "de-0007", "Schlagerparty"),
    ("hitster-de-aaaa0012.csv", "de-0012", "Summer Party"),
    ("hitster-de-aaaa0015.csv", "de-0015", "Guilty Pleasures"),
    ("hitster-de-aaaa0019.csv", "de-0019", "Bingo"),
    ("hitster-de-aaaa0025.csv", "de-0025", "Bayern 1 (Erweiterung)"),
    ("hitster-de-aaaa0026.csv", "de-0026", "Film & TV (Erweiterung)"),
    ("hitster-de-aaaa0039.csv", "de-0039", "Rock"),
    ("hitster-de-aaaa0040.csv", "de-0040", "Celebration"),
    ("hitster-de-aaaa0042.csv", "de-0042", "Weihnachten (Erweiterung)"),
    ("hitster-de-aaaa0054.csv", "de-0054", "Platinum"),
]

YT_RE = re.compile(r"(?:v=|youtu\.be/|/embed/)([A-Za-z0-9_-]{11})")
ISRC_RE = re.compile(r"^[A-Z]{2}[A-Z0-9]{3}\d{7}$")


def norm(s):
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"\(.*?\)|\[.*?\]", " ", s)
    s = re.sub(r"\b(feat|ft|featuring)\b.*", " ", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return " ".join(s.split())


def load_csv(name, src):
    if src:
        with open(os.path.join(src, name), encoding="utf-8-sig") as f:
            return f.read()
    with urllib.request.urlopen(REPO_RAW + name, timeout=30) as r:
        return r.read().decode("utf-8-sig")


def clean(s):
    return " ".join((s or "").replace(" ", " ").split())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", help="lokaler Ordner mit den CSV-Dateien")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "data", "songs.json"))
    args = ap.parse_args()

    previous = {}
    if os.path.exists(args.out):
        with open(args.out, encoding="utf-8") as f:
            for s in json.load(f).get("songs", []):
                previous[s["id"]] = s

    songs = []
    by_key = {}
    editions = []
    warnings = []

    for fname, eid, ename in EDITIONS:
        rows = list(csv.DictReader(io.StringIO(load_csv(fname, args.src))))
        count = 0
        for row in rows:
            title = clean(row.get("Title"))
            artist = clean(row.get("Artist"))
            year_raw = clean(row.get("Year"))
            card = clean(row.get("Card#"))
            if not title or not artist or not year_raw.isdigit():
                warnings.append(f"{fname} Karte {card}: unvollständig, übersprungen")
                continue
            year = int(year_raw)
            if year < 1900 or year > date.today().year:
                warnings.append(f"{fname} Karte {card}: Jahr {year} unplausibel, übersprungen")
                continue
            isrc = clean(row.get("ISRC")).upper().replace("-", "")
            if not ISRC_RE.match(isrc):
                isrc = ""
            m = YT_RE.search(row.get("URL") or "")
            yt = m.group(1) if m else ""

            key = "isrc:" + isrc if isrc else "ta:" + norm(artist) + "|" + norm(title)
            alt_key = "ta:" + norm(artist) + "|" + norm(title)
            existing = by_key.get(key) or by_key.get(alt_key)
            count += 1
            if existing:
                if eid not in existing["e"]:
                    existing["e"].append(eid)
                if existing["y"] != year:
                    warnings.append(
                        f"Doppelt mit anderem Jahr: {artist} – {title}: {existing['y']} ({existing['id']}) vs. {year} ({eid}) – behalte {existing['y']}"
                    )
                if isrc and not existing.get("isrc"):
                    existing["isrc"] = isrc
                    by_key["isrc:" + isrc] = existing
                continue

            sid = f"{eid}.{card}"
            song = {"id": sid, "t": title, "a": artist, "y": year, "e": [eid]}
            if isrc:
                song["isrc"] = isrc
            if yt:
                song["yt"] = yt
            prev = previous.get(sid)
            for k in ("sp", "img", "m"):
                if prev and prev.get(k):
                    song[k] = prev[k]
            songs.append(song)
            by_key[key] = song
            by_key[alt_key] = song
        editions.append({"id": eid, "name": ename, "count": count})

    out = {
        "format": 1,
        "generated": date.today().isoformat(),
        "source": "https://github.com/andygruber/songseeker-hitster-playlists (MIT License, Copyright (c) 2024 Andreas Gruber)",
        "editions": editions,
        "songs": songs,
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")

    with_isrc = sum(1 for s in songs if s.get("isrc"))
    with_sp = sum(1 for s in songs if s.get("sp"))
    print(f"{len(songs)} Songs (eindeutig), davon {with_isrc} mit ISRC, {with_sp} mit Spotify-ID")
    for e in editions:
        print(f"  {e['id']:8} {e['count']:4}  {e['name']}")
    if warnings:
        print(f"{len(warnings)} Hinweise:", file=sys.stderr)
        for w in warnings:
            print("  " + w, file=sys.stderr)


if __name__ == "__main__":
    main()
