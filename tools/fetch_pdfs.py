"""Download the public teacher-edition PDFs for the 2016-2022 exam rounds.

Source: comcbt.com. Files are written to ``data/pdfs`` (git-ignored).
"""

import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

REPO_ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = REPO_ROOT / "data" / "pdfs"

# (year, round, YYYYMMDD, comcbt page id)
EXAMS = [
    (2022, "2회", "20220424", "5842432"),
    (2022, "1회", "20220305", "5719907"),
    (2021, "4회", "20210912", "5442437"),
    (2021, "2회", "20210515", "5138674"),
    (2021, "1회", "20210307", "4971403"),
    (2020, "4회", "20200926", "4566460"),
    (2020, "3회", "20200822", "4491566"),
    (2020, "1·2회", "20200606", "4376675"),
    (2019, "4회", "20190921", "3786726"),
    (2019, "2회", "20190427", "3582099"),
    (2019, "1회", "20190303", "3494022"),
    (2018, "4회", "20180915", "3265563"),
    (2018, "2회", "20180428", "2926253"),
    (2018, "1회", "20180304", "2904491"),
    (2017, "4회", "20170923", "2755475"),
    (2017, "2회", "20170509", "2755458"),
    (2017, "1회", "20170305", "2755437"),
    (2016, "4회", "20161001", "2643748"),
    (2016, "2회", "20160508", "2643730"),
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Referer": "https://www.comcbt.com/xe/nf",
}


def absolute(href: str) -> str:
    return href if href.startswith("http") else "https://www.comcbt.com" + href


def find_teacher_pdf(page_id: str) -> str | None:
    resp = requests.get(f"https://www.comcbt.com/xe/nf/{page_id}", headers=HEADERS, timeout=15)
    resp.raise_for_status()

    links = BeautifulSoup(resp.text, "html.parser").find_all("a", href=True)
    for link in links:
        href, text = link["href"], link.get_text(strip=True)
        if "procFileDownload" in href and "교사" in text and ".pdf" in text.lower():
            return absolute(href)

    # Fallback: page lists HWP-teacher, PDF-teacher, HWP-student, PDF-student.
    downloads = [a["href"] for a in links if "procFileDownload" in a.get("href", "") and "file_srl" in a.get("href", "")]
    return absolute(downloads[1]) if len(downloads) >= 2 else None


def download(url: str, dest: Path) -> bool:
    resp = requests.get(url, headers=HEADERS, timeout=30, stream=True)
    resp.raise_for_status()
    content_type = resp.headers.get("Content-Type", "").lower()
    if "pdf" not in content_type and "octet" not in content_type:
        print(f"  unexpected content type: {content_type}")
        return False
    with dest.open("wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)
    return True


def main() -> None:
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    print(f"downloading {len(EXAMS)} rounds into {PDF_DIR}")
    ok = 0

    for year, round_name, date, page_id in EXAMS:
        dest = PDF_DIR / f"건축기사{date}(교사용).pdf"
        if dest.exists():
            print(f"[skip] {year} {round_name} (already present)")
            ok += 1
            continue

        try:
            url = find_teacher_pdf(page_id)
            if not url:
                print(f"[fail] {year} {round_name}: no download link")
                continue
            if download(url, dest):
                print(f"[ok]   {year} {round_name} ({dest.stat().st_size // 1024} KB)")
                ok += 1
            else:
                print(f"[fail] {year} {round_name}: download rejected")
        except requests.RequestException as e:
            print(f"[fail] {year} {round_name}: {e}")

        time.sleep(1.5)  # be gentle with the source server

    print(f"done: {ok}/{len(EXAMS)} available")


if __name__ == "__main__":
    main()
