import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SrsGrade, SrsState } from '../../../shared/study.ts';
import { newCard, review } from './srs.ts';

const now = new Date('2026-10-07T08:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const dueInDays = (s: SrsState) => (Date.parse(s.dueAt) - now.getTime()) / DAY;

function run(grades: SrsGrade[]): SrsState {
  return grades.reduce((card, grade) => review(card, grade, now), newCard(now));
}

test('a new card: every grade schedules it, easier grades further out', () => {
  const card = newCard(now);
  assert.equal(card.dueAt, now.toISOString());
  const again = review(card, 'again', now);
  assert.equal(Date.parse(again.dueAt) - now.getTime(), 10 * 60 * 1000); // back this session
  assert.deepEqual([review(card, 'hard', now), review(card, 'good', now), review(card, 'easy', now)].map(dueInDays), [1, 1, 4]);
});

test('good grows the interval 1, 6, then by ease', () => {
  assert.deepEqual([run(['good']), run(['good', 'good']), run(['good', 'good', 'good']), run(['good', 'good', 'good', 'good'])]
    .map((s) => s.intervalDays), [1, 6, 15, 38]);
  assert.equal(run(['good', 'good', 'good']).ease, 2.5);
  assert.equal(dueInDays(run(['good', 'good', 'good'])), 15);
});

test('hard < good < easy for a mature card, and ease moves with the grade', () => {
  const mature = run(['good', 'good', 'good']); // 15 days, ease 2.5
  const [hard, good, easy] = (['hard', 'good', 'easy'] as const).map((g) => review(mature, g, now));
  assert.deepEqual([hard.intervalDays, good.intervalDays, easy.intervalDays], [18, 38, 49]);
  assert.deepEqual([hard.ease, good.ease, easy.ease], [2.35, 2.5, 2.65]);
});

test('a lapse resets reps and interval, costs ease, and relearning starts over at 1 day', () => {
  const lapsed = review(run(['good', 'good', 'good']), 'again', now);
  assert.deepEqual([lapsed.reps, lapsed.intervalDays], [0, 0]);
  assert.equal(lapsed.ease, 2.3);
  const relearned = review(lapsed, 'good', now);
  assert.deepEqual([relearned.reps, relearned.intervalDays], [1, 1]);
});

test('ease never drops below 1.3 and intervals still grow', () => {
  const card = run(['again', 'again', 'again', 'again', 'again', 'again', 'again', 'again']);
  assert.equal(card.ease, 1.3);
  const hards = (n: number) => run(Array<SrsGrade>(n).fill('hard'));
  assert.equal(hards(10).ease, 1.3);
  assert.ok(hards(10).intervalDays > hards(9).intervalDays);
});
