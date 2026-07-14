'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadQuestions, SUBJECT_COLORS } from '../lib/questions';
import { loadStorage, removeFromWrongPool } from '../lib/storage';
import { getChoiceText } from '../lib/exam';
import { CHOICE_LABELS } from '../lib/constants';
import { QuestionImage } from '../components/question-image';
import { Question, SUBJECTS } from '../types';

export default function NotebookClient() {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSubject, setFilterSubject] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const pool = new Set(loadStorage().wrongPool);
    let active = true;
    loadQuestions().then((all) => {
      if (!active) return;
      setQuestions(all.filter((q) => pool.has(q.record_id)));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  function markUnderstood(id: string) {
    removeFromWrongPool([id]);
    setQuestions((prev) => prev.filter((q) => q.record_id !== id));
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const filtered = filterSubject ? questions.filter((q) => q.subject === filterSubject) : questions;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-400 animate-pulse">불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button
            onClick={() => router.push('/')}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm"
          >
            ← 홈
          </button>
          <h1 className="text-base font-bold text-gray-800 dark:text-gray-100">📒 오답노트</h1>
          <span className="text-sm font-bold text-red-600 dark:text-red-400">{questions.length}문항</span>
        </div>

        <div className="max-w-2xl mx-auto mt-3 flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setFilterSubject(null)}
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              !filterSubject
                ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 border-transparent'
                : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'
            }`}
          >
            전체 ({questions.length})
          </button>
          {SUBJECTS.map((subject) => {
            const count = questions.filter((q) => q.subject === subject).length;
            if (count === 0) return null;
            return (
              <button
                key={subject}
                onClick={() => setFilterSubject(filterSubject === subject ? null : subject)}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  filterSubject === subject
                    ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 border-transparent'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'
                }`}
              >
                {subject} ({count})
              </button>
            );
          })}
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-4 space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              {filterSubject ? `${filterSubject} 오답이 없습니다.` : '오답 기록이 없습니다. 잘 하셨어요!'}
            </p>
            {!filterSubject && (
              <button
                onClick={() => router.push('/')}
                className="mt-4 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm"
              >
                홈으로
              </button>
            )}
          </div>
        )}

        {filtered.map((q) => {
          const isOpen = expanded.has(q.record_id);
          return (
            <div
              key={q.record_id}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              <button
                onClick={() => toggleExpand(q.record_id)}
                className="w-full text-left px-4 py-3.5 flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${SUBJECT_COLORS[q.subject] ?? 'bg-gray-100 text-gray-700'}`}
                    >
                      {q.subject}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{q.question_no}번</span>
                    {q.has_image && <span className="text-xs text-amber-500">⚠ 이미지</span>}
                  </div>
                  <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug line-clamp-2">
                    {q.question_text || '(이미지 문제)'}
                  </p>
                </div>
                <span className="text-gray-400 dark:text-gray-500 text-lg shrink-0 mt-0.5">{isOpen ? '▲' : '▼'}</span>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                  {q.image_path && <QuestionImage src={q.image_path} questionNo={q.question_no} />}

                  <div className="space-y-1.5">
                    {q.choices.map((choice, i) => {
                      const n = i + 1;
                      const isAnswer = n === q.answer_key;
                      return (
                        <div
                          key={n}
                          className={`px-3 py-2 rounded-lg text-sm ${
                            isAnswer
                              ? 'bg-green-50 dark:bg-green-900/30 border border-green-400 dark:border-green-700 font-medium text-gray-800 dark:text-gray-200'
                              : 'bg-gray-50 dark:bg-gray-700/50 border border-transparent text-gray-600 dark:text-gray-400'
                          }`}
                        >
                          <span
                            className={`font-bold mr-1.5 ${isAnswer ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}
                          >
                            {CHOICE_LABELS[i]}
                          </span>
                          {choice.trim() ? (
                            choice
                          ) : (
                            <span className="italic text-gray-400">{getChoiceText(choice, Boolean(q.image_path))}</span>
                          )}
                          {isAnswer && <span className="ml-2 text-xs text-green-600 dark:text-green-400">✓ 정답</span>}
                        </div>
                      );
                    })}
                  </div>

                  {q.explanation?.trim() && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-100 dark:border-blue-800">
                      <p className="text-xs font-bold text-blue-700 dark:text-blue-400 mb-1">💡 해설</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                        {q.explanation.trim()}
                      </p>
                    </div>
                  )}

                  <button
                    onClick={() => markUnderstood(q.record_id)}
                    className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg transition-colors"
                  >
                    ✓ 이해했어요 (오답노트에서 제거)
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <div className="pb-6" />
      </main>
    </div>
  );
}
