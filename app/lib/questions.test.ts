import { describe, expect, it } from 'vitest';
import {
  getByIds,
  getByRound,
  getImportantBySubjects,
  getRandomBySubjects,
  getRoundLabel,
  getRounds,
} from './questions';
import { Question } from '../types';

function makeQuestion(overrides: Partial<Question>): Question {
  return {
    record_id: 'id',
    exam_year: 2020,
    exam_round: '1회',
    subject: '건축계획',
    question_no: 1,
    question_text: '문제',
    choices: ['1', '2', '3', '4'],
    answer_key: 1,
    has_image: false,
    ...overrides,
  };
}

const bank: Question[] = [
  makeQuestion({ record_id: 'a', exam_year: 2023, exam_round: '1회', subject: '건축계획', question_no: 2 }),
  makeQuestion({ record_id: 'b', exam_year: 2023, exam_round: '1회', subject: '건축시공', question_no: 1 }),
  makeQuestion({ record_id: 'c', exam_year: 2022, exam_round: '2회', subject: '건축구조', question_no: 1 }),
  makeQuestion({ record_id: 'd', exam_year: 2024, exam_round: '1회', subject: '건축설비', question_no: 1 }),
];

describe('getRounds', () => {
  it('returns distinct rounds newest first', () => {
    expect(getRounds(bank)).toEqual(['2024_1회', '2023_1회', '2022_2회']);
  });
});

describe('getRoundLabel', () => {
  it('formats a round key for display', () => {
    expect(getRoundLabel('2023_2회')).toBe('2023년 2회');
  });
});

describe('getByRound', () => {
  it('filters to one round and sorts by question number', () => {
    const round = getByRound(bank, '2023_1회');
    expect(round.map((q) => q.record_id)).toEqual(['b', 'a']);
  });
});

describe('getByIds', () => {
  it('returns only the requested ids', () => {
    expect(
      getByIds(bank, ['c', 'a'])
        .map((q) => q.record_id)
        .sort(),
    ).toEqual(['a', 'c']);
  });
});

describe('getRandomBySubjects', () => {
  it('caps the result at the requested count', () => {
    expect(getRandomBySubjects(bank, [], 2)).toHaveLength(2);
  });

  it('only draws from the requested subjects', () => {
    const picked = getRandomBySubjects(bank, ['건축시공'], 10);
    expect(picked.map((q) => q.subject)).toEqual(['건축시공']);
  });
});

describe('getImportantBySubjects', () => {
  const weighted: Question[] = [
    makeQuestion({
      record_id: 'high',
      subject: '건축구조',
      exam_year: 2024,
      question_text: '다음 중 철근콘크리트 보 부재에 대한 설명으로 옳지 않은 것은?',
      choices: ['기둥', '단면', '모멘트', '전단'],
    }),
    makeQuestion({ record_id: 'mid1', subject: '건축구조', exam_year: 2021, question_text: '하중을 설명하시오' }),
    makeQuestion({ record_id: 'mid2', subject: '건축구조', exam_year: 2020, question_text: '처짐 기준' }),
    makeQuestion({ record_id: 'low1', subject: '건축구조', exam_year: 2016, question_text: '무관한 문항' }),
    makeQuestion({ record_id: 'low2', subject: '건축구조', exam_year: 2016, question_text: '무관한 문항' }),
  ];

  it('samples the requested count from the highest-weighted pool', () => {
    const picked = getImportantBySubjects(weighted, ['건축구조'], 1);
    expect(picked).toHaveLength(1);
    // The two keyword-free 2016 questions rank lowest and fall outside the
    // top pool, so they are never selected.
    expect(['low1', 'low2']).not.toContain(picked[0].record_id);
  });

  it('never returns more questions than exist', () => {
    expect(getImportantBySubjects(weighted, ['건축구조'], 99)).toHaveLength(weighted.length);
  });
});
