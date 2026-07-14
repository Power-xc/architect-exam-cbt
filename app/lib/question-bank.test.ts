import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getByRound, getImportantBySubjects, getRandomBySubjects, getRounds } from './questions';
import { AnswerRecord, tallyAnswers } from './exam';
import { Question, SUBJECTS } from '../types';

// Integration checks against the real bundled question bank. These guard the
// data the app ships against silent corruption as much as they exercise the
// selection and scoring pipeline end to end.
const bank: Question[] = JSON.parse(readFileSync(join(process.cwd(), 'public/questions.json'), 'utf8'));

describe('question bank', () => {
  it('spans every exam year from 2016 to 2024', () => {
    const years = bank.map((q) => q.exam_year);
    expect(Math.min(...years)).toBe(2016);
    expect(Math.max(...years)).toBe(2024);
  });

  it('holds a well-formed record for every question', () => {
    for (const q of bank) {
      expect([1, 2, 3, 4]).toContain(q.answer_key);
      expect(q.choices).toHaveLength(4);
      expect(SUBJECTS).toContain(q.subject);
      expect(q.explanation?.trim()).toBeTruthy();
    }
  });

  it('ships every referenced figure', () => {
    const missing = bank
      .filter((q) => q.image_path)
      .map((q) => q.image_path as string)
      .filter((path) => !existsSync(join(process.cwd(), 'public', path)));
    expect(missing).toEqual([]);
  });

  it('serves each round as a full 100-question exam sorted by number', () => {
    for (const round of getRounds(bank)) {
      const questions = getByRound(bank, round);
      expect(questions).toHaveLength(100);
      const numbers = questions.map((q) => q.question_no);
      expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    }
  });

  it('draws bounded, duplicate-free random and important selections', () => {
    expect(getRandomBySubjects(bank, ['건축구조'], 20)).toHaveLength(20);

    const important = getImportantBySubjects(bank, [], 40);
    expect(important).toHaveLength(40);
    expect(new Set(important.map((q) => q.record_id)).size).toBe(40);
  });

  it('scores a completed session drawn from real questions', () => {
    const answers: AnswerRecord[] = getByRound(bank, getRounds(bank)[0])
      .slice(0, 10)
      .map((q, i) => ({ id: q.record_id, selected: q.answer_key, correct: i % 2 === 0, subject: q.subject }));

    const { correctCount, wrongIds } = tallyAnswers(answers);
    expect(correctCount).toBe(5);
    expect(wrongIds).toHaveLength(5);
  });
});
