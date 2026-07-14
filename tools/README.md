# 데이터 파이프라인

`public/questions.json`과 `public/images/`(앱이 사용하는 문제 데이터)를 만들어 내는 오프라인 스크립트 모음이다. 앱 실행에는 필요 없고, 문제 은행을 다시 만들거나 회차를 추가할 때만 사용한다.

## 준비

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r tools/requirements.txt
```

원본 PDF는 저장소에 포함하지 않는다(저작권). 아래 위치에 두면 스크립트가 읽는다. `data/`는 git에서 제외된다.

- `data/pdfs/` — 2016~2022 교사용 PDF (`fetch_pdfs.py`로 내려받음)
- `data/latest/` — 2023~2024 최신경향 PDF (이미지형, OCR 대상)

## 실행 순서

| 단계 | 스크립트                   | 하는 일                                                                   |
| ---- | -------------------------- | ------------------------------------------------------------------------- |
| 1    | `fetch_pdfs.py`            | 2016~2022 공개 회차 교사용 PDF를 `data/pdfs/`로 다운로드                  |
| 2    | `parse_pdfs.py`            | 2단 컬럼 PDF를 파싱해 `public/questions.json`과 `data/analysis.json` 생성 |
| 3    | `extract_images.py`        | 이미지형 문항 영역을 잘라 `public/images/`에 저장하고 `image_path` 기록   |
| 4    | `import_latest_trend.py`   | 2023~2024 이미지 PDF를 OCR해 최신 5회차를 병합 (macOS 전용)               |
| 5    | `generate_explanations.py` | 로컬 LLM(Ollama)으로 문항별 해설 생성 (재실행 시 이어서 진행)             |

```bash
python3 tools/fetch_pdfs.py
python3 tools/parse_pdfs.py
python3 tools/extract_images.py
python3 tools/import_latest_trend.py
python3 tools/generate_explanations.py
```

## 참고

- 정답 표기가 원본 이미지에 남지 않도록, 이미지 크롭 시 채워진 정답 마크를 흰색으로 가리고 빈 번호 원을 다시 그린다.
- `import_latest_trend.py`는 `ocrmac`(macOS Vision)에 의존하므로 macOS에서만 동작한다.
- `generate_explanations.py`는 Ollama 로컬 서버를 사용한다. 다른 백엔드로 바꾸려면 `generate_once` 한 곳만 교체하면 된다.
