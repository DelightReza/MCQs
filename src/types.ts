export interface Option {
  text: string;
  media?: string[];
  originalIndex?: number;
}

export interface Question {
  id: string;
  text: string;
  media?: string[];
  options: Option[];
  correctAnswerIndex: number;
}

export interface QBank {
  id: string;
  name: string;
  questions: Question[];
}

export type AppScreen = 'MENU' | 'QUIZ' | 'RESULTS';

export type QuizMode = 'NEW' | 'REVIEW_INCORRECT' | 'REVIEW_BOOKMARKS';
export type QuizSessionType = 'PRACTICE' | 'EXAM';

export interface QuizSettings {
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  timedMode: boolean;
}

export interface QuizSession {
  bankId: string;
  bankName: string;
  questions: Question[];
  mode: QuizMode;
  sessionType: QuizSessionType;
  settings: QuizSettings;
  answers: Record<string, number>;
  currentIndex: number;
  elapsedTime: number;
}
