"""Crop figures for image-based questions out of the teacher-edition PDFs.

For every question whose answer choices live inside a diagram, the question
region is rendered to a PNG under ``public/images`` and its ``image_path`` is
recorded back into ``public/questions.json``. Filled answer marks in the source
are masked so the correct answer is not given away.
"""

import json
import re
from pathlib import Path

import pdfplumber
from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = REPO_ROOT / "data" / "pdfs"
QUESTIONS_PATH = REPO_ROOT / "public" / "questions.json"
IMAGE_DIR = REPO_ROOT / "public" / "images"

RESOLUTION = 150
FILLED = {"❶": 1, "❷": 2, "❸": 3, "❹": 4}
FONT_PATHS = [
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]

DATE_TO_ROUND = {
    "20220424": "2회", "20220305": "1회",
    "20210912": "4회", "20210515": "2회", "20210307": "1회",
    "20200926": "4회", "20200822": "3회", "20200606": "1·2회",
    "20190921": "4회", "20190427": "2회", "20190303": "1회",
    "20180915": "4회", "20180428": "2회", "20180304": "1회",
    "20170923": "4회", "20170509": "2회", "20170305": "1회",
    "20161001": "4회", "20160508": "2회",
}
SUBJECT_BY_BLOCK = {1: "건축계획", 2: "건축시공", 3: "건축구조", 4: "건축설비", 5: "건축법규"}


def parse_filename(name: str) -> tuple[int, str] | tuple[None, None]:
    match = re.search(r"건축기사(\d{8})", name)
    if not match:
        return None, None
    date = match.group(1)
    round_name = DATE_TO_ROUND.get(date)
    return (int(date[:4]), round_name) if round_name else (None, None)


def subject_for(question_no: int) -> str:
    return SUBJECT_BY_BLOCK[((question_no - 1) // 20) + 1]


def needs_image(q: dict) -> bool:
    return q.get("has_image") or any(not str(c).strip() for c in q.get("choices", []))


def clean_question_text(text: str) -> str:
    for pattern in ("최강 자격", "종이 문제집이 아닌 인터넷으로"):
        if pattern in text:
            text = text.split(pattern, 1)[0].strip()
    return text


def find_footer_top(words: list[dict], y_top: float, default_bottom: float) -> float:
    footer_tokens = ("전자문제집", "www.comcbt.com", "CBT란", "오답", "다운로드")
    candidates = [
        word["top"]
        for word in words
        if word["top"] > y_top + 60 and any(token in word["text"] for token in footer_tokens)
    ]
    return min(candidates) - 8 if candidates else default_bottom


def load_number_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in FONT_PATHS:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def mask_answer_marks(image, words, crop_x0, crop_x1, crop_y0, crop_y1) -> None:
    scale = RESOLUTION / 72
    draw = ImageDraw.Draw(image)
    for word in words:
        if word["text"] not in FILLED:
            continue
        if not (crop_x0 <= word["x0"] <= crop_x1 and crop_y0 <= word["top"] <= crop_y1):
            continue

        x0 = int((word["x0"] - crop_x0) * scale) - 3
        y0 = int((word["top"] - crop_y0) * scale) - 3
        x1 = int((word["x1"] - crop_x0) * scale) + 3
        y1 = int((word["bottom"] - crop_y0) * scale) + 3
        draw.rectangle((x0, y0, x1, y1), fill="white")

        size = max(x1 - x0, y1 - y0)
        pad = max(1, size // 10)
        draw.ellipse((x0 + pad, y0 + pad, x1 - pad, y1 - pad), outline="black", width=max(1, size // 14))

        number = str(FILLED[word["text"]])
        font = load_number_font(max(9, int(size * 0.58)))
        bbox = draw.textbbox((0, 0), number, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text(((x0 + x1 - tw) / 2, (y0 + y1 - th) / 2 - size * 0.05), number, fill="black", font=font)


def columns_of(page) -> list[tuple[float, float]]:
    width = page.width
    return [(0, width * 0.505), (width * 0.495, width)]


def question_positions(words: list[dict]) -> list[tuple[int, float]]:
    positions = []
    for word in words:
        match = re.match(r"^(\d{1,3})\.$", word["text"])
        if match and 1 <= int(match.group(1)) <= 100:
            positions.append((int(match.group(1)), word["top"]))
    return positions


def render_crop(page, words, crop_x0, crop_x1, crop_y0, crop_y1) -> Image.Image:
    area = page.crop((crop_x0, crop_y0, crop_x1, crop_y1))
    image = area.to_image(resolution=RESOLUTION).original.convert("RGB")
    mask_answer_marks(image, words, crop_x0, crop_x1, crop_y0, crop_y1)
    return image


def next_column(pdf, page_idx, col_idx):
    if col_idx == 0:
        next_page_idx, next_col_idx = page_idx, 1
    else:
        next_page_idx, next_col_idx = page_idx + 1, 0
    if next_page_idx >= len(pdf.pages):
        return None

    page = pdf.pages[next_page_idx]
    col_x0, col_x1 = columns_of(page)[next_col_idx]
    col_page = page.crop((col_x0, 0, col_x1, page.height))
    words = col_page.extract_words()
    return page, col_x0, col_x1, col_page.height, words, question_positions(words)


def render_continuation(pdf, page_idx, col_idx, q_no):
    """Render the tail of a question that spills into the next column."""
    following = next_column(pdf, page_idx, col_idx)
    if not following:
        return None

    page, col_x0, col_x1, col_height, words, positions = following
    if not positions or positions[0][0] != q_no + 1:
        return None

    next_y_top = positions[0][1]
    content = [word for word in words if 8 < word["top"] and word["bottom"] < next_y_top - 2]
    if not content:
        return None

    choice_tops = [word["top"] for word in content if word["text"] in {"①", "②", "③", "④", *FILLED}]
    crop_y0 = max(0, min(choice_tops or [word["top"] for word in content]) - 8)
    crop_y1 = min(col_height, next_y_top - 4)
    if crop_y1 - crop_y0 < 10:
        return None
    return render_crop(page, words, col_x0, col_x1, crop_y0, crop_y1)


def stitch(images: list[Image.Image]) -> Image.Image:
    if len(images) == 1:
        return images[0]
    width = max(image.width for image in images)
    out = Image.new("RGB", (width, sum(image.height for image in images)), "white")
    y = 0
    for image in images:
        out.paste(image, (0, y))
        y += image.height
    return out


def extract_round(pdf_path, year, round_name, target_ids, index, questions) -> int:
    saved = 0
    with pdfplumber.open(pdf_path) as pdf:
        for page_idx, page in enumerate(pdf.pages):
            for col_idx, (col_x0, col_x1) in enumerate(columns_of(page)):
                col_page = page.crop((col_x0, 0, col_x1, page.height))
                words = col_page.extract_words()
                positions = question_positions(words)

                for k, (q_no, y_top) in enumerate(positions):
                    record_id = f"{year}_{round_name}_{subject_for(q_no)}_{q_no:03d}"
                    if record_id not in target_ids:
                        continue

                    y_bottom = positions[k + 1][1] if k + 1 < len(positions) else col_page.height
                    y_bottom = find_footer_top(words, y_top, y_bottom)
                    crop_y0 = max(0, y_top - 8)
                    crop_y1 = min(col_page.height, y_bottom - 4)

                    try:
                        images = [render_crop(page, words, col_x0, col_x1, crop_y0, crop_y1)]
                        if k + 1 >= len(positions):
                            continuation = render_continuation(pdf, page_idx, col_idx, q_no)
                            if continuation:
                                images.append(continuation)
                        stitch(images).save(IMAGE_DIR / f"{record_id}.png")

                        question = questions[index[record_id]]
                        question["image_path"] = f"/images/{record_id}.png"
                        question["has_image"] = True
                        saved += 1
                        print(f"  [ok] {record_id}")
                    except Exception as e:  # noqa: BLE001 - report and keep going
                        print(f"  [fail] {record_id}: {e}")
    return saved


def main() -> None:
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    questions = json.loads(QUESTIONS_PATH.read_text(encoding="utf-8"))
    for question in questions:
        question["question_text"] = clean_question_text(question.get("question_text", ""))

    index = {q["record_id"]: i for i, q in enumerate(questions)}
    image_ids = {q["record_id"] for q in questions if needs_image(q)}
    print(f"extracting {len(image_ids)} image questions")

    total = 0
    for pdf_path in sorted(PDF_DIR.glob("*.pdf")):
        year, round_name = parse_filename(pdf_path.name)
        if not year:
            continue
        targets = {rid for rid in image_ids if rid.startswith(f"{year}_{round_name}_")}
        if not targets:
            continue
        print(f"[{year} {round_name}] {len(targets)} questions")
        total += extract_round(pdf_path, year, round_name, targets, index, questions)

    QUESTIONS_PATH.write_text(json.dumps(questions, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"done: {total} images saved to {IMAGE_DIR}")


if __name__ == "__main__":
    main()
