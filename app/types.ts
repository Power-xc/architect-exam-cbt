export interface Question {
  record_id: string;
  exam_year: number;
  exam_round: string;
  subject: string;
  question_no: number;
  question_text: string;
  choices: string[];
  answer_key: number;
  has_image: boolean;
  image_path?: string;
  explanation?: string;
}

export interface SubjectScore {
  correct: number;
  total: number;
}

export interface ExamResult {
  id: string;
  date: string;
  mode: string;
  roundLabel: string;
  totalQuestions: number;
  correctCount: number;
  wrongIds: string[];
  subjectScores: Record<string, SubjectScore>;
}

export interface StorageData {
  results: ExamResult[];
  wrongPool: string[];
  bookmarks: string[];
}

export type ExamMode = 'round' | 'random' | 'important' | 'review';

export const SUBJECTS = ['건축계획', '건축시공', '건축구조', '건축설비', '건축법규'] as const;
export type Subject = (typeof SUBJECTS)[number];
