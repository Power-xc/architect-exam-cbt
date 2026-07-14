import { Question } from '../types';
import { shuffle } from './shuffle';

let cache: Question[] | null = null;

/** Load the question bank once and memoize it for the session. */
export async function loadQuestions(): Promise<Question[]> {
  if (cache) return cache;
  const res = await fetch('/questions.json');
  if (!res.ok) {
    throw new Error(`Failed to load questions: ${res.status}`);
  }
  cache = (await res.json()) as Question[];
  return cache;
}

/** Distinct exam rounds present in the bank, newest first. */
export function getRounds(questions: Question[]): string[] {
  const rounds: string[] = [];
  const seen = new Set<string>();
  for (const q of questions) {
    const key = roundKey(q);
    if (!seen.has(key)) {
      seen.add(key);
      rounds.push(key);
    }
  }
  return rounds.sort((a, b) => b.localeCompare(a));
}

export function getRoundLabel(key: string): string {
  const [year, round] = key.split('_');
  return `${year}년 ${round}`;
}

export function getByRound(questions: Question[], key: string): Question[] {
  const [year, round] = key.split('_');
  return questions
    .filter((q) => q.exam_year === Number(year) && q.exam_round === round)
    .sort((a, b) => a.question_no - b.question_no);
}

export function getByIds(questions: Question[], ids: string[]): Question[] {
  const idSet = new Set(ids);
  return questions.filter((q) => idSet.has(q.record_id));
}

export function getRandomBySubjects(questions: Question[], subjects: string[], count: number): Question[] {
  return shuffle(filterBySubjects(questions, subjects)).slice(0, count);
}

/**
 * Weight questions by how "important" they are — how often high-frequency
 * keywords appear, how recent the exam is, and whether the stem uses phrasing
 * typical of repeated questions — then sample from the strongest candidates.
 */
export function getImportantBySubjects(questions: Question[], subjects: string[], count: number): Question[] {
  const ranked = filterBySubjects(questions, subjects)
    .map((q) => ({ q, score: importantScore(q) }))
    .sort((a, b) => b.score - a.score || b.q.exam_year - a.q.exam_year);

  const topPoolSize = Math.min(ranked.length, Math.max(count * 3, count));
  return shuffle(ranked.slice(0, topPoolSize))
    .slice(0, count)
    .map((item) => item.q);
}

function filterBySubjects(questions: Question[], subjects: string[]): Question[] {
  if (subjects.length === 0) return questions;
  const set = new Set(subjects);
  return questions.filter((q) => set.has(q.subject));
}

function roundKey(q: Question): string {
  return `${q.exam_year}_${q.exam_round}`;
}

const IMPORTANT_KEYWORDS: Record<string, string[]> = {
  건축계획: ['사무소', '극장', '코어', '미술관', '도서관', '아파트', '배치', '동선', '레이아웃', '래드번'],
  건축시공: ['콘크리트', '시멘트', '공사', '시공', '철골', '방수', '거푸집', '말뚝', '타일', '공정'],
  건축구조: ['부재', '보', '철근콘크리트', '강도설계법', '기둥', '단면', '모멘트', '전단', '처짐', '하중'],
  건축설비: ['공기조화', '엘리베이터', '실내환경', '펌프', '건구온도', '냉동기', '급수', '배수', '환기', '소화전'],
  건축법규: ['건축물', '최소기준', '국토의계획', '설치기준', '주차장', '용도변경', '건폐율', '용적률', '피난', '도로'],
};

function importantScore(q: Question): number {
  const haystack = `${q.question_text} ${q.choices.join(' ')}`;
  const keywords = IMPORTANT_KEYWORDS[q.subject] ?? [];
  const keywordHits = keywords.reduce((sum, keyword) => sum + haystack.split(keyword).length - 1, 0);
  const recency = q.exam_year >= 2023 ? 2 : q.exam_year >= 2020 ? 1 : 0;
  const phrasing = /옳지 않은|가장|기준|설명|다음 중/.test(q.question_text) ? 1 : 0;
  return keywordHits * 3 + recency + phrasing;
}

export const SUBJECT_COLORS: Record<string, string> = {
  건축계획: 'bg-blue-100 text-blue-800',
  건축시공: 'bg-green-100 text-green-800',
  건축구조: 'bg-orange-100 text-orange-800',
  건축설비: 'bg-purple-100 text-purple-800',
  건축법규: 'bg-red-100 text-red-800',
};
