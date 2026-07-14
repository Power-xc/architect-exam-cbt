import { ExamResult, SubjectScore } from '../types';

/** A single answered question within an exam session. */
export interface AnswerRecord {
  id: string;
  selected: number;
  correct: boolean;
  subject: string;
}

interface Tally {
  correctCount: number;
  wrongIds: string[];
  subjectScores: Record<string, SubjectScore>;
}

/**
 * Aggregate a list of answers into an overall score, the ids of wrong
 * questions, and a per-subject breakdown. Pure and side-effect free.
 */
export function tallyAnswers(answers: AnswerRecord[]): Tally {
  const subjectScores: Record<string, SubjectScore> = {};

  for (const answer of answers) {
    const score = (subjectScores[answer.subject] ??= { correct: 0, total: 0 });
    score.total++;
    if (answer.correct) score.correct++;
  }

  return {
    correctCount: answers.filter((a) => a.correct).length,
    wrongIds: answers.filter((a) => !a.correct).map((a) => a.id),
    subjectScores,
  };
}

/** Assemble a persisted result from a completed session's answers. */
export function buildResult(answers: AnswerRecord[], roundLabel: string, mode: string): ExamResult {
  const { correctCount, wrongIds, subjectScores } = tallyAnswers(answers);
  return {
    id: `${Date.now()}`,
    date: new Date().toLocaleDateString('ko-KR'),
    mode,
    roundLabel,
    totalQuestions: answers.length,
    correctCount,
    wrongIds,
    subjectScores,
  };
}

/**
 * Display text for an answer choice. Some image-based questions carry their
 * choices inside the figure, so the OCR'd text is blank by design.
 */
export function getChoiceText(choice: string, hasImage: boolean): string {
  const text = choice.trim();
  if (text) return text;
  return hasImage ? '이미지에서 선택지 확인' : '선택지 없음';
}
