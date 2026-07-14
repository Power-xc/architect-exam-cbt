"""Generate a short Korean explanation for each question.

Explanations are produced by a locally hosted model through Ollama, which keeps
the pipeline free and reproducible. ``generate_once`` is the single call to
swap if a different backend is preferred.

    ollama serve
    ollama pull qwen2.5:7b
    python3 tools/generate_explanations.py [--limit N] [--include-images] [--no-sleep]

The run is resumable: questions that already have a valid explanation are
skipped, so re-running continues where it left off. Output is written in place
to ``public/questions.json``.
"""

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
QUESTIONS_PATH = REPO_ROOT / "public" / "questions.json"

OLLAMA_URL = "http://127.0.0.1:11434"
MODEL = "qwen2.5:7b"
SAVE_EVERY = 10
REQUEST_TIMEOUT = 180
MAX_RETRIES = 3
MIN_LENGTH = 20


def build_prompt(q: dict) -> str:
    choices = "\n".join(
        f"{i + 1}. {choice}" if choice else f"{i + 1}. (이미지에서 선택지 확인)"
        for i, choice in enumerate(q["choices"])
    )
    return f"""건축기사 필기 문제 해설을 반드시 자연스러운 한국어로만 작성하세요.

조건:
- 2~3문장
- 한 문장은 짧게 작성
- 정답인 이유를 먼저 설명
- 핵심 개념과 오답과의 차이를 간단히 설명
- 마크다운, 표, 제목 없이 본문만 작성
- 확실하지 않은 법령 수치나 연도는 단정하지 말 것
- 중국어, 일본어, 영어 문장을 섞지 말 것
- 한자 표현을 쓰지 말고 한글 중심으로 작성할 것

과목: {q["subject"]}
문제: {q["question_text"] or "(이미지 문제)"}
보기:
{choices}
정답: {q["answer_key"]}번
"""


def generate_once(q: dict) -> str:
    payload = {
        "model": MODEL,
        "prompt": build_prompt(q),
        "stream": False,
        "options": {"temperature": 0.1, "top_p": 0.8, "num_predict": 150},
    }
    request = urllib.request.Request(
        f"{OLLAMA_URL}/api/generate",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT) as response:
        return str(json.loads(response.read().decode("utf-8")).get("response", "")).strip()


def ensure_model_ready() -> None:
    request = urllib.request.Request(
        f"{OLLAMA_URL}/api/show",
        data=json.dumps({"model": MODEL}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(request, timeout=10).read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise RuntimeError(f"model not found; run `ollama pull {MODEL}`") from e
        raise
    except urllib.error.URLError as e:
        raise RuntimeError("cannot reach Ollama; run `ollama serve` first") from e


def has_language_mix(text: str) -> bool:
    if re.search(r"[぀-ヿ]", text):  # hiragana/katakana
        return True
    korean = len(re.findall(r"[가-힣]", text))
    cjk = len(re.findall(r"[一-鿿]", text))
    latin = len(re.findall(r"[A-Za-z]", text))
    return korean < 20 or cjk > max(4, korean * 0.08) or latin > max(12, korean * 0.2)


def clean(text: str) -> str:
    normalized = re.sub(r"\s+", " ", text).strip()
    kept = []
    for chunk in re.split(r"(?<=[.!?。！？])\s+", normalized):
        korean = len(re.findall(r"[가-힣]", chunk))
        cjk = len(re.findall(r"[一-鿿]", chunk))
        if korean >= 8 and cjk <= max(4, korean * 0.12):
            kept.append(chunk.strip())
    return " ".join(kept).strip() or normalized


def validate(text: str) -> None:
    if len(text) < MIN_LENGTH:
        raise RuntimeError("explanation too short")
    if has_language_mix(text):
        raise RuntimeError("non-Korean text mixed in")


def generate(q: dict) -> str:
    last_error: Exception = RuntimeError("generation failed")
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            explanation = clean(generate_once(q))
            validate(explanation)
            return explanation
        except RuntimeError as e:
            last_error = e
            if attempt < MAX_RETRIES:
                print(f"  retry {attempt}/{MAX_RETRIES - 1}: {e}")
    raise last_error


def fallback(q: dict) -> str:
    choice = str(q["choices"][q["answer_key"] - 1]).strip()
    answer = f"'{choice}'" if choice else f"{q['answer_key']}번 선택지"
    return (
        f"정답은 {q['answer_key']}번입니다. {answer}가 문제에서 묻는 {q['subject']}의 핵심 조건에 "
        "가장 부합합니다. 다른 선택지는 적용 기준이나 개념이 달라 정답으로 보기 어렵습니다."
    )


def needs_generation(q: dict, include_images: bool) -> bool:
    if q.get("has_image") and not include_images:
        return False
    explanation = str(q.get("explanation", "")).strip()
    if not explanation:
        return True
    try:
        validate(explanation)
    except RuntimeError:
        return True
    return False


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=0, help="max questions to generate this run")
    parser.add_argument("--include-images", action="store_true", help="also generate for image questions")
    parser.add_argument("--no-sleep", action="store_true", help="do not pause between questions")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        ensure_model_ready()
    except RuntimeError as e:
        print(f"error: {e}")
        return 1

    questions = json.loads(QUESTIONS_PATH.read_text(encoding="utf-8"))
    pending = [i for i, q in enumerate(questions) if needs_generation(q, args.include_images)]
    if args.limit > 0:
        pending = pending[: args.limit]

    print(f"model: {MODEL}")
    print(f"pending: {len(pending)} questions (re-run to resume)")

    done = failed = 0
    for position, idx in enumerate(pending, start=1):
        q = questions[idx]
        try:
            q["explanation"] = generate(q)
            print(f"[{position}/{len(pending)}] {q['record_id']}")
        except KeyboardInterrupt:
            print("\ninterrupted; saving progress")
            break
        except Exception as e:  # noqa: BLE001 - degrade to a fallback and continue
            q["explanation"] = fallback(q)
            failed += 1
            print(f"  [fallback] {q['record_id']}: {e}")
        done += 1

        if done % SAVE_EVERY == 0:
            QUESTIONS_PATH.write_text(json.dumps(questions, ensure_ascii=False, indent=2), encoding="utf-8")
        if not args.no_sleep:
            time.sleep(0.2)

    QUESTIONS_PATH.write_text(json.dumps(questions, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"done: {done} generated ({failed} via fallback)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
