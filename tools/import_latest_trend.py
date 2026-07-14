"""Import the 2023-2024 "latest trend" exams from image-only PDFs.

These editions have no extractable text layer, so each page is rendered and run
through on-device OCR (macOS Vision via ``ocrmac``). Questions and choices are
reconstructed, the filled answer mark is detected and masked, and each question
is saved as a WEBP under ``public/images/latest``. The five affected rounds are
replaced in ``public/questions.json``.

Input PDFs are read from ``data/latest`` (git-ignored).
"""

import json
import re
import shutil
from dataclasses import dataclass, field
from pathlib import Path

import fitz
from ocrmac.ocrmac import OCR
from PIL import Image, ImageDraw, ImageFont


REPO_ROOT = Path(__file__).resolve().parents[1]
LATEST_PDF_DIR = REPO_ROOT / "data" / "latest"
QUESTIONS_PATH = REPO_ROOT / "public" / "questions.json"
IMAGE_DIR = REPO_ROOT / "public" / "images" / "latest"

SCALE = 2.5
ANSWER_DARK_RATIO = 0.15

PDF_SPECS = [
    ("건축기사 2023년 2회 최신경향문제.pdf", 2023, "2회"),
    ("건축기사 2023년 3회 최신경향문제.pdf", 2023, "3회"),
    ("건축기사 2024년 1회 최신경향문제.pdf", 2024, "1회"),
    ("건축기사 2024년 2회 최신경향문제.pdf", 2024, "2회"),
    ("건축기사 2024년 3회 최신경향문제.pdf", 2024, "3회"),
]

SUBJECTS = ["건축계획", "건축시공", "건축구조", "건축설비", "건축법규"]
SUBJECT_INDEX = {subject: i for i, subject in enumerate(SUBJECTS)}

SKIP_TEXT = (
    "최신경향문제",
    "건축기사",
    "필기 경향문제",
    "본 콘텐츠",
    "한솔아카데미",
    "inup",
)

FONT_PATHS = [
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]

MANUAL_ANSWER_KEYS = {
    "2023_2회_건축설비_077": 4,
    "2023_3회_건축법규_093": 2,
    "2024_1회_건축시공_033": 3,
    "2024_1회_건축구조_049": 3,
    "2024_1회_건축설비_061": 4,
    "2024_2회_건축구조_058": 4,
    "2024_2회_건축구조_060": 3,
    "2024_3회_건축시공_026": 2,
    "2024_3회_건축구조_043": 3,
    "2024_3회_건축구조_048": 2,
}


@dataclass
class OcrLine:
    text: str
    page: int
    subject: str
    col: int
    x0: float
    y0: float
    x1: float
    y1: float
    dark_ratio: float


@dataclass
class ChoiceLine:
    no: int
    text: str
    line: OcrLine


@dataclass
class VisualMarker:
    no: int
    x0: int
    y0: int
    x1: int
    y1: int
    filled: bool


@dataclass
class DraftQuestion:
    local_no: int
    global_no: int
    subject: str
    page: int
    col: int
    start_y: float
    text_parts: list[str] = field(default_factory=list)
    choices: dict[int, str] = field(default_factory=dict)
    choice_lines: list[ChoiceLine] = field(default_factory=list)
    visual_markers: list[VisualMarker] = field(default_factory=list)
    answer_key: int | None = None
    lines: list[OcrLine] = field(default_factory=list)


@dataclass
class PageBundle:
    image: Image.Image
    width: int
    height: int


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\u00a0", " ")).strip()


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in FONT_PATHS:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def marker_dark_ratio(image: Image.Image, x0: float, y0: float, x1: float, y1: float) -> float:
    crop = image.crop((
        max(0, int(x0 - 5)),
        max(0, int(y0 - 3)),
        min(image.width, int(x0 + 35)),
        min(image.height, int(y1 + 3)),
    ))
    pixels = crop.convert("L").getdata()
    total = 0
    dark = 0
    for pixel in pixels:
        total += 1
        if pixel < 80:
            dark += 1
    return dark / total if total else 0


def detect_subject(lines: list[tuple[str, tuple[float, float, float, float]]]) -> str | None:
    for text, _bbox in lines:
        match = re.search(r"최신경향문제\s*\((건축[가-힣]+)\)", text)
        if match and match.group(1) in SUBJECT_INDEX:
            return match.group(1)
    return None


def render_and_ocr(pdf_path: Path) -> tuple[list[PageBundle], list[OcrLine]]:
    doc = fitz.open(str(pdf_path))
    pages: list[PageBundle] = []
    raw_pages: list[list[tuple[str, tuple[float, float, float, float]]]] = []

    for page in doc:
        pix = page.get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), alpha=False)
        image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        raw = OCR(
            image,
            recognition_level="accurate",
            language_preference=["ko-KR", "en-US"],
            confidence_threshold=0.0,
        ).recognize(px=True)
        raw_pages.append([(normalize_text(text), bbox) for text, _conf, bbox in raw if normalize_text(text)])
        pages.append(PageBundle(image=image, width=image.width, height=image.height))

    current_subject = SUBJECTS[0]
    lines: list[OcrLine] = []
    for page_index, raw_lines in enumerate(raw_pages):
        detected = detect_subject(raw_lines)
        if detected:
            current_subject = detected

        page = pages[page_index]
        for text, (x0, y0, x1, y1) in raw_lines:
            col = 0 if (x0 + x1) / 2 < page.width / 2 else 1
            lines.append(OcrLine(
                text=text,
                page=page_index,
                subject=current_subject,
                col=col,
                x0=x0,
                y0=y0,
                x1=x1,
                y1=y1,
                dark_ratio=marker_dark_ratio(page.image, x0, y0, x1, y1),
            ))

    return pages, lines


def line_order(line: OcrLine) -> tuple[int, int, int, float, float]:
    return (line.page, line.col, int((line.y0 + 9) // 18), line.x0, line.y0)


def should_skip(text: str) -> bool:
    return any(token in text for token in SKIP_TEXT)


def is_question_start(text: str) -> re.Match[str] | None:
    return re.match(r"^(\d{1,2})[.,]\s+(.+)$", text)


def is_near_question_margin(line: OcrLine) -> bool:
    if line.col == 0:
        return line.x0 < 150
    return 660 < line.x0 < 780


def looks_like_choice(line: OcrLine, choice_count: int) -> bool:
    text = line.text
    if re.match(r"^[①②③④❶❷❸❹⑴⑵⑶⑷➀➁➂➃]", text):
        return True
    if re.match(r"^[1-4lIO0][\s.)]", text):
        return True
    if re.match(r"^[@O0][\s.)|]", text) and line.dark_ratio > 0.10:
        return True
    return choice_count < 4 and line.dark_ratio > ANSWER_DARK_RATIO


def strip_choice_marker(text: str) -> str:
    text = re.sub(r"^[①②③④❶❷❸❹⑴⑵⑶⑷➀➁➂➃⑧]\s*", "", text)
    text = re.sub(r"^[1-4lIO0@][\s.)|]+", "", text)
    return normalize_text(text)


def question_text(parts: list[str]) -> str:
    return normalize_text(" ".join(part for part in parts if not should_skip(part)))


def parse_questions(lines: list[OcrLine], year: int, round_name: str) -> list[DraftQuestion]:
    drafts: list[DraftQuestion] = []
    current: DraftQuestion | None = None
    last_local_by_subject = {subject: 0 for subject in SUBJECTS}

    def flush() -> None:
        nonlocal current
        if current is not None:
            drafts.append(current)
        current = None

    for line in sorted(lines, key=line_order):
        text = normalize_text(line.text)
        if not text or should_skip(text):
            continue

        q_match = is_question_start(text)
        if q_match:
            local_no = int(q_match.group(1))
            if local_no > last_local_by_subject[line.subject] and is_near_question_margin(line):
                flush()
                last_local_by_subject[line.subject] = local_no
                subject_no = SUBJECT_INDEX[line.subject]
                global_no = subject_no * 20 + local_no
                current = DraftQuestion(
                    local_no=local_no,
                    global_no=global_no,
                    subject=line.subject,
                    page=line.page,
                    col=line.col,
                    start_y=line.y0,
                )
                rest = normalize_text(q_match.group(2))
                if rest:
                    current.text_parts.append(rest)
                current.lines.append(line)
                continue

        if current is None:
            continue

        current.lines.append(line)
        if looks_like_choice(line, len(current.choice_lines)):
            no = len(current.choice_lines) + 1
            if no <= 4:
                text_without_marker = strip_choice_marker(text)
                current.choices[no] = text_without_marker
                current.choice_lines.append(ChoiceLine(no=no, text=text_without_marker, line=line))
                if line.dark_ratio > ANSWER_DARK_RATIO:
                    current.answer_key = no
            continue

        if current.choice_lines:
            last = current.choice_lines[-1]
            if last.no <= 4:
                appended = normalize_text(f"{current.choices.get(last.no, '')} {text}")
                current.choices[last.no] = appended
        else:
            current.text_parts.append(text)

    flush()
    return sorted(drafts, key=lambda q: q.global_no)


def column_bounds(page: PageBundle, col: int) -> tuple[int, int]:
    if col == 0:
        return 45, int(page.width * 0.5) - 8
    return int(page.width * 0.5) + 8, page.width - 45


def group_end_y(pages: list[PageBundle], drafts: list[DraftQuestion]) -> dict[int, float]:
    grouped: dict[tuple[int, int], list[DraftQuestion]] = {}
    for draft in drafts:
        grouped.setdefault((draft.page, draft.col), []).append(draft)

    end_y: dict[int, float] = {}
    for group in grouped.values():
        group.sort(key=lambda q: q.start_y)
        for index, draft in enumerate(group):
            page = pages[draft.page]
            content_bottom = max(line.y1 for line in draft.lines)
            if index + 1 < len(group):
                bottom = group[index + 1].start_y - 10
            else:
                bottom = min(page.height - 135, content_bottom + 35)
            end_y[id(draft)] = max(content_bottom + 16, bottom)
    return end_y


def window_dark_ratio(gray: Image.Image, cx: int, cy: int, radius: int = 17) -> float:
    crop = gray.crop((max(0, cx - radius), max(0, cy - radius), min(gray.width, cx + radius), min(gray.height, cy + radius)))
    pixels = crop.getdata()
    total = 0
    dark = 0
    for pixel in pixels:
        total += 1
        if pixel < 100:
            dark += 1
    return dark / total if total else 0


def cluster_numbers(values: list[int], tolerance: int) -> list[int]:
    if not values:
        return []
    clusters: list[list[int]] = []
    for value in sorted(values):
        if clusters and abs(value - clusters[-1][-1]) <= tolerance:
            clusters[-1].append(value)
        else:
            clusters.append([value])
    return [round(sum(cluster) / len(cluster)) for cluster in clusters]


def detect_markers_in_crop(crop: Image.Image, seed_x: list[int]) -> list[VisualMarker]:
    gray = crop.convert("L")
    x_centers = cluster_numbers([x for x in seed_x if 8 <= x <= crop.width - 8], 42)
    if not x_centers:
        x_centers = [32]

    raw: list[tuple[int, int, float]] = []
    for cx in x_centers:
        peaks: list[tuple[int, float]] = []
        for cy in range(36, crop.height - 12, 3):
            ratio = window_dark_ratio(gray, cx, cy)
            if ratio > 0.016:
                peaks.append((cy, ratio))
        for cy in cluster_numbers([y for y, _ratio in peaks], 24):
            ratio = window_dark_ratio(gray, cx, cy)
            if ratio > 0.016:
                raw.append((cx, cy, ratio))

    raw.sort(key=lambda item: (int((item[1] + 10) // 24), item[0]))
    filtered: list[tuple[int, int, float]] = []
    for cx, cy, ratio in raw:
        if any(abs(cx - px) < 30 and abs(cy - py) < 22 for px, py, _ in filtered):
            continue
        filtered.append((cx, cy, ratio))

    markers = filtered[:4]
    return [
        VisualMarker(
            no=index + 1,
            x0=max(0, cx - 20),
            y0=max(0, cy - 20),
            x1=min(crop.width, cx + 20),
            y1=min(crop.height, cy + 20),
            filled=ratio > ANSWER_DARK_RATIO,
        )
        for index, (cx, cy, ratio) in enumerate(markers)
    ]


def enhance_with_visual_markers(pages: list[PageBundle], drafts: list[DraftQuestion]) -> dict[int, float]:
    end_y = group_end_y(pages, drafts)
    for draft in drafts:
        page = pages[draft.page]
        crop_x0, crop_x1 = column_bounds(page, draft.col)
        crop_y0 = max(0, int(draft.start_y - 12))
        crop_y1 = min(page.height - 110, int(end_y[id(draft)]))
        crop = page.image.crop((crop_x0, crop_y0, crop_x1, crop_y1)).convert("RGB")
        seed_x = [32]
        seed_x.extend(int(choice.line.x0 - crop_x0) for choice in draft.choice_lines)
        markers = detect_markers_in_crop(crop, seed_x)
        filled = [marker for marker in markers if marker.filled]
        if len(markers) >= 4:
            draft.visual_markers = markers
        if len(filled) == 1:
            draft.answer_key = filled[0].no
    return end_y


def merge_markers(markers: list[VisualMarker]) -> list[VisualMarker]:
    merged: list[VisualMarker] = []
    for marker in sorted(markers, key=lambda item: (item.y0, item.x0)):
        if any(abs(marker.x0 - item.x0) < 28 and abs(marker.y0 - item.y0) < 28 for item in merged):
            continue
        merged.append(marker)
    return merged


def line_markers(crop_x0: int, crop_y0: int, choices: list[ChoiceLine]) -> list[VisualMarker]:
    markers: list[VisualMarker] = []
    for choice in choices:
        line = choice.line
        x0 = max(0, int(line.x0 - crop_x0 - 30))
        y0 = max(0, int(line.y0 - crop_y0 - 2))
        markers.append(VisualMarker(
            no=choice.no,
            x0=x0,
            y0=y0,
            x1=x0 + 62,
            y1=y0 + 36,
            filled=True,
        ))
    return markers


def mask_choice_markers(image: Image.Image, markers: list[VisualMarker]) -> None:
    draw = ImageDraw.Draw(image)
    for marker in merge_markers(markers):
        x0 = marker.x0
        y0 = marker.y0
        x1 = marker.x1
        y1 = marker.y1
        if x1 <= x0 or y1 <= y0:
            continue

        draw.rectangle((x0, y0, x1, y1), fill="white")
        size = min(x1 - x0 - 4, y1 - y0 - 4)
        if size < 12:
            continue
        cx = x0 + ((x1 - x0 - size) // 2)
        cy = y0 + ((y1 - y0 - size) // 2)
        draw.ellipse((cx, cy, cx + size, cy + size), outline="black", width=max(1, size // 14))
        font = load_font(max(9, int(size * 0.58)))
        digit = str(marker.no)
        bbox = draw.textbbox((0, 0), digit, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        draw.text((cx + (size - tw) / 2, cy + (size - th) / 2 - size * 0.04), digit, fill="black", font=font)


def mask_choice_rows(image: Image.Image, crop_y0: int, choices: list[ChoiceLine]) -> None:
    draw = ImageDraw.Draw(image)
    for choice in choices:
        y0 = max(0, int(choice.line.y0 - crop_y0 - 8))
        y1 = min(image.height, int(choice.line.y1 - crop_y0 + 8))
        if y1 <= y0:
            continue
        draw.rectangle((0, y0, 66, y1), fill="white")

        size = min(30, max(18, y1 - y0 - 4))
        cx = 20
        cy = y0 + ((y1 - y0 - size) // 2)
        draw.ellipse((cx, cy, cx + size, cy + size), outline="black", width=max(1, size // 14))
        font = load_font(max(9, int(size * 0.58)))
        digit = str(choice.no)
        bbox = draw.textbbox((0, 0), digit, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        draw.text((cx + (size - tw) / 2, cy + (size - th) / 2 - size * 0.04), digit, fill="black", font=font)


def hide_remaining_filled_markers(image: Image.Image) -> None:
    gray = image.convert("L")
    draw = ImageDraw.Draw(image)
    hits: list[int] = []
    for cy in range(52, image.height - 12, 3):
        crop = gray.crop((8, max(0, cy - 17), min(66, image.width), min(image.height, cy + 17)))
        pixels = crop.getdata()
        total = 0
        dark = 0
        for pixel in pixels:
            total += 1
            if pixel < 80:
                dark += 1
        if total and dark / total > 0.09:
            hits.append(cy)

    for cy in cluster_numbers(hits, 24):
        draw.rectangle((0, max(0, cy - 24), min(68, image.width), min(image.height, cy + 24)), fill="white")


def crop_questions(pages: list[PageBundle], drafts: list[DraftQuestion], year: int, round_name: str, end_y: dict[int, float]) -> None:
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)

    for draft in drafts:
        page = pages[draft.page]
        crop_x0, crop_x1 = column_bounds(page, draft.col)
        crop_y0 = max(0, int(draft.start_y - 12))
        crop_y1 = min(page.height - 110, int(end_y[id(draft)]))
        if crop_y1 <= crop_y0:
            crop_y1 = min(page.height - 110, crop_y0 + 120)

        crop = page.image.crop((crop_x0, crop_y0, crop_x1, crop_y1)).convert("RGB")
        markers = line_markers(crop_x0, crop_y0, draft.choice_lines)
        mask_choice_markers(crop, markers)
        mask_choice_rows(crop, crop_y0, draft.choice_lines)
        hide_remaining_filled_markers(crop)

        record_id = f"{year}_{round_name}_{draft.subject}_{draft.global_no:03d}"
        out = IMAGE_DIR / f"{record_id}.webp"
        crop.save(out, "WEBP", quality=82, method=6)


def to_question(draft: DraftQuestion, year: int, round_name: str) -> dict[str, object]:
    record_id = f"{year}_{round_name}_{draft.subject}_{draft.global_no:03d}"
    answer_key = draft.answer_key or MANUAL_ANSWER_KEYS.get(record_id)
    return {
        "record_id": record_id,
        "exam_year": year,
        "exam_round": round_name,
        "subject": draft.subject,
        "question_no": draft.global_no,
        "question_text": question_text(draft.text_parts),
        "choices": [draft.choices.get(i, "") for i in range(1, 5)],
        "answer_key": answer_key,
        "has_image": True,
        "image_path": f"/images/latest/{record_id}.webp",
    }


def import_pdf(pdf_name: str, year: int, round_name: str) -> list[dict[str, object]]:
    pdf_path = LATEST_PDF_DIR / pdf_name
    print(f"[{year} {round_name}] OCR: {pdf_name}")
    pages, lines = render_and_ocr(pdf_path)
    drafts = parse_questions(lines, year, round_name)
    end_y = enhance_with_visual_markers(pages, drafts)
    crop_questions(pages, drafts, year, round_name, end_y)

    questions = [to_question(draft, year, round_name) for draft in drafts]
    missing_answers = [q["question_no"] for q in questions if not q["answer_key"]]
    subject_counts = {subject: sum(1 for q in questions if q["subject"] == subject) for subject in SUBJECTS}

    print(f"  parsed={len(questions)} counts={subject_counts}")
    if missing_answers:
        print(f"  missing answer: {missing_answers}")
    return questions


def main() -> None:
    if IMAGE_DIR.exists():
        shutil.rmtree(IMAGE_DIR)
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)

    existing = json.loads(QUESTIONS_PATH.read_text(encoding="utf-8"))
    replace_keys = {(year, round_name) for _name, year, round_name in PDF_SPECS}
    kept = [
        q for q in existing
        if (q.get("exam_year"), q.get("exam_round")) not in replace_keys
    ]

    imported: list[dict[str, object]] = []
    for pdf_name, year, round_name in PDF_SPECS:
        imported.extend(import_pdf(pdf_name, year, round_name))

    all_questions = kept + imported
    all_questions.sort(key=lambda q: (int(q["exam_year"]), str(q["exam_round"]), int(q["question_no"])))

    QUESTIONS_PATH.write_text(json.dumps(all_questions, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"done: {len(existing)} -> {len(all_questions)} questions")
    print(f"images saved to {IMAGE_DIR}")


if __name__ == "__main__":
    main()
