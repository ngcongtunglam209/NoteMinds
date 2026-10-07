import type { SrsGrade, SrsState } from '../../../shared/study.ts';

// Spaced repetition: SM-2 with Anki's 4-button adaptation. Chosen over FSRS because legacy already
// stores exactly SM-2's state (ease_factor, interval, repetitions, next_review_date) and needs no
// fitted weights. Changes from textbook SM-2: "again" costs 0.2 ease (not 0.8) and brings the card
// back in 10 minutes; "hard" grows the interval slowly instead of resetting it.

const START_EASE = 2.5;
const MIN_EASE = 1.3;
const RELEARN_MINUTES = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

// Rounded so stored values stay readable (2.35, not 2.3500000000000005).
const adjustEase = (ease: number, delta: number) => Math.max(MIN_EASE, Math.round((ease + delta) * 100) / 100);

export function newCard(now = new Date()): SrsState {
  return { ease: START_EASE, intervalDays: 0, reps: 0, dueAt: now.toISOString() };
}

/** Next state after grading `card` at `now`. Pure: same input, same output. */
export function review(card: SrsState, grade: SrsGrade, now = new Date()): SrsState {
  if (grade === 'again') {
    // Lapse: back to learning, shown again this session, rebuilt from 1 day once recalled.
    return {
      ease: adjustEase(card.ease, -0.2),
      intervalDays: 0,
      reps: 0,
      dueAt: new Date(now.getTime() + RELEARN_MINUTES * 60 * 1000).toISOString(),
    };
  }

  const prev = card.intervalDays;
  // Classic SM-2 steps for good (1 day, 6 days, then interval × ease); hard <= good < easy always.
  const good = card.reps === 0 ? 1 : card.reps === 1 ? 6 : Math.max(prev + 1, Math.round(prev * card.ease));
  const intervalDays = {
    hard: card.reps === 0 ? 1 : Math.max(prev + 1, Math.round(prev * 1.2)),
    good,
    easy: card.reps === 0 ? 4 : Math.max(good + 1, Math.round(good * 1.3)),
  }[grade];

  return {
    ease: adjustEase(card.ease, { hard: -0.15, good: 0, easy: 0.15 }[grade]),
    intervalDays,
    reps: card.reps + 1,
    dueAt: new Date(now.getTime() + intervalDays * DAY_MS).toISOString(),
  };
}
