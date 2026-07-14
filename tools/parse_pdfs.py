"""Parse the two-column teacher-edition PDFs into structured questions.

Reads every PDF in ``data/pdfs`` and writes the question bank to
``public/questions.json`` plus a keyword-frequency report to
``data/analysis.json``.
"""

import json
import re
from collections import defaultdict
from pathlib import Path

import pdfplumber

REPO_ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = REPO_ROOT / "data" / "pdfs"
QUESTIONS_PATH = REPO_ROOT / "public" / "questions.json"
ANALYSIS_PATH = REPO_ROOT / "data" / "analysis.json"

SUBJECTS = {"1": "건축계획", "2": "건축시공", "3": "건축구조", "4": "건축설비", "5": "건축법규"}

FILLED = {"❶": 1, "❷": 2, "❸": 3, "❹": 4}
HOLLOW = {"①": 1, "②": 2, "③": 3, "④": 4}
ALL_CIRCLES = {**FILLED, **HOLLOW}

SKIP_PATTERNS = [
    r"comcbt\.com",
    r"최강 자격증",
    r"전자문제집",
    r"기출문제 및 해설",
    r"^건축기사\s+◐",
    r"^\d{1,3}\s+\d{1,3}\s+\d{1,3}\s+\d{1,3}",  # answer table
]

# Rounds are keyed by exam date. A month-based heuristic mis-assigns the
# 2020 "1·2회"/"3회" pair, so the mapping is explicit.
DATE_TO_ROUND = {
    "20220424": "2회", "20220305": "1회",
    "20210912": "4회", "20210515": "2회", "20210307": "1회",
    "20200926": "4회", "20200822": "3회", "20200606": "1·2회",
    "20190921": "4회", "20190427": "2회", "20190303": "1회",
    "20180915": "4회", "20180428": "2회", "20180304": "1회",
    "20170923": "4회", "20170509": "2회", "20170305": "1회",
    "20161001": "4회", "20160508": "2회",
}


def parse_filename(name: str) -> tuple[int, str] | tuple[None, None]:
    match = re.search(r"건축기사(\d{8})", name)
    if not match:
        return None, None
    date = match.group(1)
    round_name = DATE_TO_ROUND.get(date)
    return (int(date[:4]), round_name) if round_name else (None, None)


def extract_lines(pdf_path: Path) -> list[str]:
    """Read a two-column page left-to-right, dropping boilerplate lines."""
    lines: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            width = page.width
            columns = [
                page.crop((0, 0, width * 0.505, page.height)),
                page.crop((width * 0.495, 0, width, page.height)),
            ]
            for column in columns:
                text = column.extract_text() or ""
                for line in text.split("\n"):
                    line = line.strip()
                    if line and not any(re.search(p, line) for p in SKIP_PATTERNS):
                        lines.append(line)
    return lines


def parse_questions(lines: list[str], year: int, round_name: str) -> list[dict]:
    questions: list[dict] = []
    subject_key: str | None = None
    q_no: int | None = None
    text_parts: list[str] = []
    choices: dict[int, str] = {}
    answer: int | None = None

    def flush() -> None:
        nonlocal q_no, text_parts, choices, answer
        if q_no is not None and answer is not None:
            text = re.sub(r"\s+", " ", " ".join(text_parts)).strip()
            has_image = len(choices) < 3 or len(text) < 8 or any(
                marker in text for marker in ("그림과 같은", "그림에서", "다음 그림")
            )
            subject = SUBJECTS.get(subject_key, "unknown")
            questions.append({
                "record_id": f"{year}_{round_name}_{subject}_{q_no:03d}",
                "exam_year": year,
                "exam_round": round_name,
                "subject": subject,
                "question_no": q_no,
                "question_text": text,
                "choices": [choices.get(i, "") for i in range(1, 5)],
                "answer_key": answer,
                "has_image": has_image,
            })
        q_no, text_parts, choices, answer = None, [], {}, None

    for line in lines:
        subject_match = re.search(r"(\d)과목\s*[：:]\s*(건축[가-힣]+)", line)
        if subject_match:
            flush()
            subject_key = subject_match.group(1)
            continue

        question_match = re.match(r"^(\d{1,3})\.\s+(.+)", line)
        if question_match:
            flush()
            q_no = int(question_match.group(1))
            text_parts = [question_match.group(2)]
            continue

        if q_no is None:
            continue

        if any(circle in line for circle in ALL_CIRCLES):
            for part in re.split(r"(?=[①②③④❶❷❸❹])", line):
                for circle, number in ALL_CIRCLES.items():
                    if part.startswith(circle):
                        choices[number] = re.sub(r"\s+", " ", part[len(circle):].strip())
                        if circle in FILLED:
                            answer = number
        else:
            text_parts.append(line)

    flush()
    return questions


def analyze(questions: list[dict]) -> dict:
    stopwords = {
        "관한", "관하여", "설명으로", "옳지", "않은", "것은", "다음", "중", "가장", "경우", "대한",
        "하는", "하여", "하지", "이에", "있는", "없는", "위한", "따른", "의한", "사항", "내용",
        "기준", "방법", "방식", "특징", "설치", "사용", "적합한", "적용", "이상", "이하", "해당",
        "건축물", "한다", "있다", "없다", "이다", "된다", "않는", "것이", "으로", "에서", "에는",
        "같은", "그림과", "구하면", "얼마인가", "아닌", "속하지", "거리가", "옳은", "알맞은",
        "않는다", "하여야", "또는", "버전", "최강", "자격", "전자", "문제집", "기출",
    }
    keyword_freq: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for q in questions:
        for word in re.findall(r"[가-힣]{2,6}", q["question_text"]):
            if word not in stopwords:
                keyword_freq[q["subject"]][word] += 1

    image_total = sum(1 for q in questions if q["has_image"])
    return {
        "total_questions": len(questions),
        "image_questions": image_total,
        "image_ratio_pct": round(image_total / len(questions) * 100, 1) if questions else 0,
        "by_subject": _count(questions, "subject"),
        "top_keywords_by_subject": {
            subject: [
                {"word": word, "count": count}
                for word, count in sorted(freq.items(), key=lambda kv: -kv[1])[:40]
            ]
            for subject, freq in keyword_freq.items()
        },
    }


def _count(questions: list[dict], key: str) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for q in questions:
        counts[q[key]] += 1
    return dict(counts)


def main() -> None:
    questions: list[dict] = []
    pdf_files = sorted(p for p in PDF_DIR.glob("*.pdf"))
    print(f"parsing {len(pdf_files)} PDFs from {PDF_DIR}")

    for pdf_path in pdf_files:
        year, round_name = parse_filename(pdf_path.name)
        if not year:
            continue
        parsed = parse_questions(extract_lines(pdf_path), year, round_name)
        questions.extend(parsed)
        print(f"  {year} {round_name}: {len(parsed)} questions")

    QUESTIONS_PATH.write_text(json.dumps(questions, ensure_ascii=False, indent=2), encoding="utf-8")
    ANALYSIS_PATH.parent.mkdir(parents=True, exist_ok=True)
    ANALYSIS_PATH.write_text(json.dumps(analyze(questions), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"done: {len(questions)} questions -> {QUESTIONS_PATH}")


if __name__ == "__main__":
    main()
