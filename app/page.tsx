'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadQuestions, getRounds, getRoundLabel } from './lib/questions';
import { loadStorage } from './lib/storage';
import { useTheme } from './lib/theme';
import { ExamMode, Question, SUBJECTS } from './types';

export default function HomePage() {
  const router = useRouter();
  const { isDark, toggle } = useTheme();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [rounds, setRounds] = useState<string[]>([]);
  const [selectedRound, setSelectedRound] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [randomCount, setRandomCount] = useState(20);
  const [mode, setMode] = useState<ExamMode>('round');
  const [examType, setExamType] = useState<'study' | 'exam'>('study');
  const [wrongCount, setWrongCount] = useState(0);
  const [recentScore, setRecentScore] = useState<{ correct: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    loadQuestions().then((qs) => {
      if (!active) return;
      setQuestions(qs);
      const r = getRounds(qs);
      setRounds(r);
      setSelectedRound(r[0] ?? '');

      const storage = loadStorage();
      setWrongCount(storage.wrongPool.length);
      const last = storage.results[0];
      if (last) setRecentScore({ correct: last.correctCount, total: last.totalQuestions });

      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  function toggleSubject(s: string) {
    setSelectedSubjects((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  function startExam() {
    const tp = `&type=${examType}`;
    if (mode === 'round') {
      router.push(`/exam?mode=round&round=${encodeURIComponent(selectedRound)}${tp}`);
    } else if (mode === 'random' || mode === 'important') {
      const subjs = selectedSubjects.length > 0 ? selectedSubjects.join(',') : SUBJECTS.join(',');
      router.push(`/exam?mode=${mode}&subjects=${encodeURIComponent(subjs)}&count=${randomCount}${tp}`);
    } else {
      router.push(`/exam?mode=review${tp}`);
    }
  }

  const canStart = !loading && !(mode === 'review' && wrongCount === 0);
  const years = questions.map((q) => q.exam_year);
  const minYear = years.length > 0 ? Math.min(...years) : 2016;
  const maxYear = years.length > 0 ? Math.max(...years) : 2024;
  const questionSummary = `${minYear}~${maxYear}, ${questions.length.toLocaleString()}문항`;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-blue-700 text-white py-5 px-6 shadow">
        <div className="max-w-2xl mx-auto flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">건축기사 CBT</h1>
            <p className="text-blue-200 text-sm mt-0.5">필기 기출문제 모의고사 ({questionSummary})</p>
          </div>
          <button
            onClick={toggle}
            className="mt-1 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-sm font-medium transition-colors"
          >
            {isDark ? '☀️ 라이트' : '🌙 다크'}
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-4">
        {/* 통계 배너 */}
        {(recentScore || wrongCount > 0) && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex gap-8 text-sm">
            {recentScore && (
              <div>
                <p className="text-gray-400 dark:text-gray-500 text-xs">최근 점수</p>
                <p className="font-bold text-lg text-blue-700 dark:text-blue-400">
                  {recentScore.correct}/{recentScore.total}
                  <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-1">
                    ({Math.round((recentScore.correct / recentScore.total) * 100)}점)
                  </span>
                </p>
              </div>
            )}
            {wrongCount > 0 && (
              <div>
                <p className="text-gray-400 dark:text-gray-500 text-xs">오답 풀</p>
                <p className="font-bold text-lg text-red-600 dark:text-red-400">{wrongCount}문항</p>
              </div>
            )}
          </div>
        )}

        {/* 오답노트 바로가기 */}
        {wrongCount > 0 && (
          <button
            onClick={() => router.push('/notebook')}
            className="w-full py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          >
            📒 오답노트 보기 ({wrongCount}문항)
          </button>
        )}

        {/* 풀이 방식 */}
        <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setExamType('study')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              examType === 'study'
                ? 'bg-blue-700 text-white'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 bg-white dark:bg-gray-800'
            }`}
          >
            📖 학습모드
          </button>
          <button
            onClick={() => setExamType('exam')}
            className={`flex-1 py-2.5 text-sm font-medium border-l border-gray-200 dark:border-gray-700 transition-colors ${
              examType === 'exam'
                ? 'bg-orange-500 text-white'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 bg-white dark:bg-gray-800'
            }`}
          >
            ⏱ 시험모드
          </button>
        </div>
        {examType === 'study' && (
          <p className="text-xs text-gray-400 dark:text-gray-500 -mt-2 text-center">선택 즉시 정답·해설 공개</p>
        )}
        {examType === 'exam' && (
          <p className="text-xs text-orange-500 dark:text-orange-400 -mt-2 text-center">
            타이머 작동 · 끝날 때 일괄 채점
          </p>
        )}

        {/* 모드 탭 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            {(
              [
                ['round', '📋 회차별'],
                ['random', '🎲 랜덤'],
                ['important', '⭐ 빈출/중요'],
                ['review', '🔁 오답복습'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  mode === m
                    ? 'bg-blue-700 text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-5">
            {mode === 'round' && (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">회차 선택</label>
                {loading ? (
                  <p className="text-gray-400 text-sm">문제 로딩 중...</p>
                ) : (
                  <select
                    value={selectedRound}
                    onChange={(e) => setSelectedRound(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {rounds.map((r) => (
                      <option key={r} value={r}>
                        {getRoundLabel(r)}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-xs text-gray-400 dark:text-gray-500">100문항 (5과목 × 20문항)</p>
              </div>
            )}

            {(mode === 'random' || mode === 'important') && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    과목 선택 (미선택 시 전체)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {SUBJECTS.map((s) => (
                      <button
                        key={s}
                        onClick={() => toggleSubject(s)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          selectedSubjects.includes(s)
                            ? 'bg-blue-700 text-white border-blue-700'
                            : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">문항 수</label>
                  <div className="flex gap-2">
                    {[20, 40, 60, 100].map((n) => (
                      <button
                        key={n}
                        onClick={() => setRandomCount(n)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                          randomCount === n
                            ? 'bg-blue-700 text-white border-blue-700'
                            : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                {mode === 'important' && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    과목별 빈출 키워드와 최신 회차 가중치를 반영해 중요 문항 위주로 섞어 출제합니다.
                  </p>
                )}
              </div>
            )}

            {mode === 'review' && (
              <div className="text-center py-3">
                {wrongCount > 0 ? (
                  <p className="text-gray-600 dark:text-gray-300 text-sm">
                    저장된 오답 <strong className="text-red-600 dark:text-red-400">{wrongCount}문항</strong>을 다시
                    풀어봅니다.
                  </p>
                ) : (
                  <p className="text-gray-400 dark:text-gray-500 text-sm">
                    오답 기록이 없습니다. 다른 모드를 먼저 풀어보세요.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={startExam}
          disabled={!canStart}
          className={`w-full py-4 font-bold text-lg rounded-xl shadow active:scale-[.99] disabled:opacity-40 disabled:cursor-not-allowed transition-all text-white ${
            examType === 'exam' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-700 hover:bg-blue-800'
          }`}
        >
          {examType === 'exam' ? '⏱ 시험 시작' : '📖 학습 시작'}
        </button>

        <details className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <summary className="px-5 py-3.5 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none">
            📊 과목별 빈출 키워드
          </summary>
          <div className="px-5 pb-4 pt-2 text-xs text-gray-600 dark:text-gray-400 space-y-1.5 leading-relaxed">
            <p>
              <strong className="text-blue-700 dark:text-blue-400">건축계획</strong>: 사무소, 극장, 코어, 미술관,
              도서관, 아파트, 배치, 레이아웃
            </p>
            <p>
              <strong className="text-green-700 dark:text-green-400">건축시공</strong>: 콘크리트, 시멘트, 공사, 시공
              (재료 중심)
            </p>
            <p>
              <strong className="text-orange-600 dark:text-orange-400">건축구조</strong>: 부재, 보, 철근콘크리트,
              강도설계법, 기둥, 단면 <span className="text-red-500">(이미지 38%)</span>
            </p>
            <p>
              <strong className="text-purple-700 dark:text-purple-400">건축설비</strong>: 공기조화방식, 엘리베이터,
              실내환경, 펌프, 건구온도
            </p>
            <p>
              <strong className="text-red-700 dark:text-red-400">건축법규</strong>: 건축물, 최소기준, 합계, 국토의계획,
              설치기준
            </p>
          </div>
        </details>

        <p className="text-center text-xs text-gray-400 dark:text-gray-600 pb-2">
          문제 출처: 한국산업인력공단 (비상업적 개인 학습 목적)
        </p>
      </main>
    </div>
  );
}
