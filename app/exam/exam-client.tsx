'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  loadQuestions,
  getByRound,
  getByIds,
  getRandomBySubjects,
  getImportantBySubjects,
  getRoundLabel,
  SUBJECT_COLORS,
} from '../lib/questions';
import { shuffle } from '../lib/shuffle';
import { loadStorage, saveResult } from '../lib/storage';
import { AnswerRecord, buildResult, getChoiceText } from '../lib/exam';
import { CHOICE_LABELS, LOW_TIME_SECONDS, SECONDS_PER_QUESTION } from '../lib/constants';
import { QuestionImage } from '../components/question-image';
import { Question } from '../types';

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function ExamClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [roundLabel, setRoundLabel] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);

  const isExamMode = (searchParams.get('type') ?? 'study') === 'exam';
  const submittedRef = useRef(false);

  // Build the question set for the requested mode.
  useEffect(() => {
    const mode = searchParams.get('mode');
    const round = searchParams.get('round') ?? '';
    const subjects = searchParams.get('subjects')?.split(',').filter(Boolean) ?? [];
    const count = Number(searchParams.get('count') ?? '20');
    const timed = (searchParams.get('type') ?? 'study') === 'exam';

    let active = true;
    loadQuestions().then((all) => {
      if (!active) return;

      let picked: Question[] = [];
      let label = '';
      if (mode === 'round') {
        picked = getByRound(all, round);
        label = getRoundLabel(round);
      } else if (mode === 'random') {
        picked = getRandomBySubjects(all, subjects, count);
        label = '랜덤 모드';
      } else if (mode === 'important') {
        picked = getImportantBySubjects(all, subjects, count);
        label = '빈출·중요 모드';
      } else if (mode === 'review') {
        picked = shuffle(getByIds(all, loadStorage().wrongPool));
        label = '오답 복습';
      }

      setQuestions(picked);
      setRoundLabel(label);
      if (timed && picked.length > 0) setTimeLeft(picked.length * SECONDS_PER_QUESTION);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [searchParams]);

  // Count down while a timed exam is in progress.
  useEffect(() => {
    if (!isExamMode || loading || timeLeft <= 0) return;
    const id = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, [isExamMode, loading, timeLeft]);

  const total = questions.length;
  const currentQuestion = questions[idx];

  function finishExam() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const result = buildResult(answers, roundLabel, searchParams.get('mode') ?? 'round');
    const passedIds = answers.filter((a) => a.correct).map((a) => a.id);
    saveResult(result, passedIds);
    sessionStorage.setItem('cbt_last_result', JSON.stringify(result));
    router.push('/results');
  }

  // Keep a stable reference to the latest finishExam so the auto-submit effect
  // can call it without listing every closed-over value as a dependency.
  const finishExamRef = useRef(finishExam);
  useEffect(() => {
    finishExamRef.current = finishExam;
  });

  // Auto-submit the moment a timed exam runs out.
  useEffect(() => {
    if (isExamMode && !loading && timeLeft === 0 && total > 0) {
      finishExamRef.current();
    }
  }, [isExamMode, loading, timeLeft, total]);

  function handleSelect(n: number) {
    if (revealed) return;
    setSelected(n);
    setRevealed(true);
    setAnswers((prev) => [
      ...prev,
      {
        id: currentQuestion.record_id,
        selected: n,
        correct: n === currentQuestion.answer_key,
        subject: currentQuestion.subject,
      },
    ]);
  }

  function handleNext() {
    if (idx < total - 1) {
      setIdx((i) => i + 1);
      setSelected(null);
      setRevealed(false);
      setShowExplanation(false);
    } else {
      finishExam();
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-400 animate-pulse">문제 불러오는 중...</p>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-500 dark:text-gray-400">문제를 찾을 수 없습니다.</p>
        <button onClick={() => router.push('/')} className="px-4 py-2 bg-blue-700 text-white rounded-lg text-sm">
          홈으로
        </button>
      </div>
    );
  }

  const q = currentQuestion;
  const progress = ((idx + (revealed ? 1 : 0)) / total) * 100;
  const showAnswer = revealed && !isExamMode;
  const isCorrect = selected === q.answer_key;
  const isLowTime = isExamMode && timeLeft < LOW_TIME_SECONDS;

  function choiceStyle(n: number): string {
    const base = 'w-full text-left px-4 py-3.5 rounded-xl border-2 text-sm leading-relaxed transition-all ';
    if (!revealed) {
      return (
        base +
        (selected === n
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 font-medium dark:border-blue-500'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-300 hover:bg-blue-50/40 dark:hover:bg-blue-900/20 cursor-pointer text-gray-800 dark:text-gray-200')
      );
    }
    if (isExamMode) {
      return (
        base +
        (n === selected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 font-medium text-gray-800 dark:text-gray-200'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 opacity-60 text-gray-800 dark:text-gray-200')
      );
    }
    if (n === q.answer_key)
      return base + 'border-green-500 bg-green-50 dark:bg-green-900/30 font-medium text-gray-800 dark:text-gray-200';
    if (n === selected) return base + 'border-red-400 bg-red-50 dark:bg-red-900/30 text-gray-800 dark:text-gray-200';
    return (
      base +
      'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 opacity-60 text-gray-800 dark:text-gray-200'
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button
            onClick={() => router.push('/')}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm"
          >
            ✕ 나가기
          </button>
          <div className="text-sm font-medium text-gray-600 dark:text-gray-300">
            {isExamMode ? (
              <span className={`font-mono font-bold ${isLowTime ? 'text-red-500 animate-pulse' : 'text-orange-500'}`}>
                ⏱ {formatTime(timeLeft)}
              </span>
            ) : (
              roundLabel
            )}
          </div>
          <div className="text-sm font-bold text-blue-700 dark:text-blue-400">
            {idx + 1} / {total}
          </div>
        </div>
        <div className="max-w-2xl mx-auto mt-2">
          <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${isExamMode ? 'bg-orange-500' : 'bg-blue-600'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5 space-y-4">
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${SUBJECT_COLORS[q.subject] ?? 'bg-gray-100 text-gray-700'}`}
          >
            {q.subject}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">문제 {q.question_no}번</span>
          {q.has_image && (
            <span className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
              ⚠ 이미지 포함
            </span>
          )}
          {isExamMode && (
            <span className="text-xs text-orange-500 bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 rounded-full ml-auto">
              시험모드
            </span>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          {q.question_text && (
            <p className="text-[15px] leading-7 text-gray-800 dark:text-gray-200 font-medium whitespace-pre-wrap">
              {q.question_text}
            </p>
          )}
          {q.image_path && (
            <div className={q.question_text ? 'mt-4' : ''}>
              <QuestionImage src={q.image_path} questionNo={q.question_no} />
            </div>
          )}
          {!q.question_text && !q.image_path && (
            <p className="text-[15px] leading-7 text-gray-800 dark:text-gray-200 font-medium">
              (이미지 문제 — 이미지를 불러오는 중)
            </p>
          )}
        </div>

        <div className="space-y-2.5">
          {q.choices.map((choice, i) => {
            const n = i + 1;
            return (
              <button key={n} onClick={() => handleSelect(n)} className={choiceStyle(n)} disabled={revealed}>
                <span className="font-bold text-gray-500 dark:text-gray-400 mr-2">{CHOICE_LABELS[i]}</span>
                {choice.trim() ? (
                  choice
                ) : (
                  <span className="italic text-gray-400">{getChoiceText(choice, Boolean(q.image_path))}</span>
                )}
              </button>
            );
          })}
        </div>

        {showAnswer && (
          <div
            className={`rounded-xl p-4 border ${
              isCorrect
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
            }`}
          >
            <p
              className={`font-bold text-sm mb-2 ${isCorrect ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}
            >
              {isCorrect
                ? '✓ 정답입니다!'
                : `✗ 오답 (정답: ${CHOICE_LABELS[q.answer_key - 1]} ${getChoiceText(q.choices[q.answer_key - 1] ?? '', Boolean(q.image_path))})`}
            </p>
            {showExplanation ? (
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                {q.explanation?.trim() || '해설이 준비되지 않았습니다.'}
              </p>
            ) : (
              <button
                onClick={() => setShowExplanation(true)}
                className="mt-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors"
              >
                💡 해설 보기
              </button>
            )}
          </div>
        )}

        {isExamMode && revealed && (
          <p className="text-xs text-center text-gray-400 dark:text-gray-500">답안 선택됨 · 결과는 시험 종료 후 확인</p>
        )}

        {revealed && !isExamMode && answers.length > 1 && (
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
            현재까지 {answers.filter((a) => a.correct).length}/{answers.length} 정답 (
            {Math.round((answers.filter((a) => a.correct).length / answers.length) * 100)}%)
          </div>
        )}
      </main>

      {revealed && (
        <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={handleNext}
              className={`w-full py-3.5 font-bold rounded-xl active:scale-[.99] transition-all text-white ${
                isExamMode ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-700 hover:bg-blue-800'
              }`}
            >
              {idx < total - 1 ? '다음 문제 →' : '결과 보기'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
