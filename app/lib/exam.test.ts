import { describe, expect, it } from 'vitest';
import { AnswerRecord, buildResult, getChoiceText, tallyAnswers } from './exam';

const answers: AnswerRecord[] = [
  { id: 'q1', selected: 1, correct: true, subject: '건축계획' },
  { id: 'q2', selected: 2, correct: false, subject: '건축계획' },
  { id: 'q3', selected: 3, correct: true, subject: '건축시공' },
];

describe('tallyAnswers', () => {
  it('counts correct answers and collects wrong ids', () => {
    const { correctCount, wrongIds } = tallyAnswers(answers);
    expect(correctCount).toBe(2);
    expect(wrongIds).toEqual(['q2']);
  });

  it('breaks the score down per subject', () => {
    const { subjectScores } = tallyAnswers(answers);
    expect(subjectScores).toEqual({
      건축계획: { correct: 1, total: 2 },
      건축시공: { correct: 1, total: 1 },
    });
  });

  it('returns an empty tally for no answers', () => {
    expect(tallyAnswers([])).toEqual({ correctCount: 0, wrongIds: [], subjectScores: {} });
  });
});

describe('buildResult', () => {
  it('carries the mode, label and totals of the session', () => {
    const result = buildResult(answers, '2023년 1회', 'round');
    expect(result.mode).toBe('round');
    expect(result.roundLabel).toBe('2023년 1회');
    expect(result.totalQuestions).toBe(3);
    expect(result.correctCount).toBe(2);
    expect(result.wrongIds).toEqual(['q2']);
    expect(typeof result.id).toBe('string');
    expect(result.date).not.toBe('');
  });
});

describe('getChoiceText', () => {
  it('returns the trimmed choice when present', () => {
    expect(getChoiceText('  콘크리트 ', false)).toBe('콘크리트');
  });

  it('points to the figure when a blank choice belongs to an image question', () => {
    expect(getChoiceText('   ', true)).toBe('이미지에서 선택지 확인');
  });

  it('falls back to a neutral label for a blank choice with no image', () => {
    expect(getChoiceText('', false)).toBe('선택지 없음');
  });
});
