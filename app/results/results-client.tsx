'use client';

import { useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { ExamResult, SUBJECTS } from '../types';
import { SUBJECT_COLORS } from '../lib/questions';
import { PASS_THRESHOLD } from '../lib/constants';

const RESULT_KEY = 'cbt_last_result';

let cachedRaw: string | null = null;
let cachedResult: ExamResult | null = null;

// The most recent result is handed over via sessionStorage on navigation. It is
// a client-only value, so it is read through useSyncExternalStore (with a null
// server snapshot) rather than an effect, avoiding hydration mismatches. The
// parsed object is cached so the snapshot keeps a stable reference.
function subscribe(): () => void {
  return () => {};
}

function getResultSnapshot(): ExamResult | null {
  const raw = sessionStorage.getItem(RESULT_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedResult = raw ? (JSON.parse(raw) as ExamResult) : null;
  }
  return cachedResult;
}

function useLastResult(): ExamResult | null {
  return useSyncExternalStore(subscribe, getResultSnapshot, () => null);
}

export default function ResultsClient() {
  const router = useRouter();
  const result = useLastResult();

  if (!result) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-400 dark:text-gray-500">결과 데이터가 없습니다.</p>
        <button onClick={() => router.push('/')} className="px-4 py-2 bg-blue-700 text-white rounded-lg text-sm">
          홈으로
        </button>
      </div>
    );
  }

  const pct = Math.round((result.correctCount / result.totalQuestions) * 100);
  const passed = pct >= PASS_THRESHOLD;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">결과 확인</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {result.roundLabel} · {result.date}
          </p>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5 space-y-4">
        <div className={`rounded-2xl p-6 text-center shadow-sm ${passed ? 'bg-blue-700' : 'bg-gray-700'} text-white`}>
          <p className="text-sm opacity-80 mb-1">{result.totalQuestions}문항 중</p>
          <div className="text-5xl font-black mb-1">
            {result.correctCount}
            <span className="text-2xl font-normal opacity-70">/{result.totalQuestions}</span>
          </div>
          <div className="text-3xl font-bold mb-3">{pct}점</div>
          <div
            className={`inline-block px-4 py-1.5 rounded-full text-sm font-bold ${passed ? 'bg-white text-blue-700' : 'bg-white/20 text-white'}`}
          >
            {passed ? '🎉 합격 기준 통과' : '😤 더 연습이 필요해요'}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
            <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300">과목별 점수</h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {SUBJECTS.map((subject) => {
              const score = result.subjectScores[subject];
              if (!score) return null;
              const subPct = Math.round((score.correct / score.total) * 100);
              const subPass = subPct >= PASS_THRESHOLD;
              return (
                <div key={subject} className="px-5 py-3 flex items-center gap-3">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${SUBJECT_COLORS[subject] ?? 'bg-gray-100 text-gray-700'}`}
                  >
                    {subject}
                  </span>
                  <div className="flex-1">
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                      <span>
                        {score.correct}/{score.total}
                      </span>
                      <span
                        className={
                          subPass
                            ? 'text-green-600 dark:text-green-400 font-bold'
                            : 'text-red-500 dark:text-red-400 font-bold'
                        }
                      >
                        {subPct}점
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${subPass ? 'bg-green-500' : 'bg-red-400'}`}
                        style={{ width: `${subPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {result.wrongIds.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300">
                틀린 문항 ({result.wrongIds.length}개)
              </h2>
              <span className="text-xs text-gray-400 dark:text-gray-500">오답 풀에 저장됨</span>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-48 overflow-y-auto">
              {result.wrongIds.map((id) => {
                const [year, round, subject, no] = id.split('_');
                return (
                  <div key={id} className="px-5 py-2.5 flex items-center gap-2 text-sm">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${SUBJECT_COLORS[subject] ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      {subject}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">{Number(no)}번</span>
                    <span className="text-gray-300 dark:text-gray-600 text-xs ml-auto">
                      {year}년 {round}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex gap-3 pb-4">
          <button
            onClick={() => router.push('/')}
            className="flex-1 py-3.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            홈으로
          </button>
          {result.wrongIds.length > 0 && (
            <button
              onClick={() => router.push('/exam?mode=review&type=study')}
              className="flex-1 py-3.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors"
            >
              🔁 오답 다시 풀기
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
