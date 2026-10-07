// Study content produced by the AI layer and the SRS scheduler. Type-only: no runtime code here.

export type StudyLanguage = 'vi' | 'en';

export interface Summary {
  title: string;
  markdown: string;
}

export interface Flashcard {
  question: string;
  answer: string;
  tag?: string;
}

export interface FlashcardDeck {
  title: string;
  cards: Flashcard[];
}

export interface QuizQuestion {
  question: string;
  options: string[]; // always 4
  correctIndex: number;
  explanation: string;
}

export interface Quiz {
  title: string;
  questions: QuizQuestion[];
}

// React Flow shape minus positions: the client owns layout. Root has depth 0.
export interface MindmapNode {
  id: string;
  label: string;
  depth: number;
}

export interface MindmapEdge {
  id: string;
  source: string;
  target: string;
}

export interface Mindmap {
  title: string;
  nodes: MindmapNode[];
  edges: MindmapEdge[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type SrsGrade = 'again' | 'hard' | 'good' | 'easy';

export interface SrsState {
  ease: number; // interval multiplier, >= 1.3
  intervalDays: number; // 0 while the card is being (re)learned
  reps: number; // successful reviews in a row
  dueAt: string; // ISO timestamp
}
