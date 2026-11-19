import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTime, formatHour, formatRange, timeSteps, validateScheduleFields,
  validateTask, tasksOutsideHours, pickNextMain, resolveMain, blockPosition, mondayIndex,
} from '../js/logic.js';

const sched = { startHour: 8, endHour: 18 };
const tasks = [
  { id: 'a', name: 'Math lecture', day: 0, start: 570, end: 660 },
  { id: 'b', name: 'Lab', day: 2, start: 780, end: 900 },
];

test('formatTime 12h and 24h', () => {
  assert.equal(formatTime(570), '9:30 AM');
  assert.equal(formatTime(0), '12:00 AM');
  assert.equal(formatTime(720), '12:00 PM');
  assert.equal(formatTime(1440), '12:00 AM');
  assert.equal(formatTime(570, true), '09:30');
  assert.equal(formatTime(1440, true), '24:00');
});

test('formatHour', () => {
  assert.equal(formatHour(8), '8 AM');
  assert.equal(formatHour(12), '12 PM');
  assert.equal(formatHour(18), '6 PM');
  assert.equal(formatHour(24), '12 AM');
  assert.equal(formatHour(8, true), '08:00');
});

test('formatRange collapses shared AM/PM', () => {
  assert.equal(formatRange(570, 660), '9:30 – 11:00 AM');
  assert.equal(formatRange(690, 780), '11:30 AM – 1:00 PM');
  assert.equal(formatRange(570, 660, true), '09:30 – 11:00');
});

test('timeSteps is inclusive on 15-minute steps', () => {
  assert.deepEqual(timeSteps(480, 540), [480, 495, 510, 525, 540]);
});

test('validateScheduleFields', () => {
  assert.equal(validateScheduleFields({ name: 'Uni', startHour: 8, endHour: 18 }), null);
  assert.match(validateScheduleFields({ name: ' ', startHour: 8, endHour: 18 }), /name/);
  assert.match(validateScheduleFields({ name: 'Uni', startHour: 18, endHour: 8 }), /after/);
  assert.match(validateScheduleFields({ name: 'Uni', startHour: 8, endHour: 8 }), /after/);
  assert.equal(validateScheduleFields({ name: 'Night', startHour: 0, endHour: 24 }), null);
});

test('validateTask accepts a valid task', () => {
  const t = { name: 'Gym', days: [0, 1], start: 660, end: 720 };
  assert.equal(validateTask(t, sched, tasks), null);
});

test('validateTask: end after start', () => {
  const t = { name: 'X', days: [1], start: 600, end: 600 };
  assert.match(validateTask(t, sched, tasks), /after the start/);
});

test('validateTask: must fit schedule hours', () => {
  assert.match(validateTask({ name: 'X', days: [1], start: 450, end: 540 }, sched, tasks), /fit inside/);
  assert.match(validateTask({ name: 'X', days: [1], start: 1020, end: 1095 }, sched, tasks), /fit inside/);
  assert.equal(validateTask({ name: 'X', days: [1], start: 480, end: 1080 }, sched, tasks), null);
});

test('validateTask: blocks overlap on the same day only', () => {
  assert.match(validateTask({ name: 'X', days: [0], start: 600, end: 690 }, sched, tasks), /Math lecture.*Monday/);
  assert.equal(validateTask({ name: 'X', days: [1], start: 600, end: 690 }, sched, tasks), null);
  // touching edges is not an overlap
  assert.equal(validateTask({ name: 'X', days: [0], start: 660, end: 720 }, sched, tasks), null);
  // checks every selected day
  assert.match(validateTask({ name: 'X', days: [1, 2], start: 795, end: 825 }, sched, tasks), /Lab.*Wednesday/);
});

test('validateTask: editing ignores itself', () => {
  assert.equal(validateTask({ name: 'Math', days: [0], start: 600, end: 690 }, sched, tasks, 'a'), null);
});

test('validateTask: rejects off-step times', () => {
  assert.match(validateTask({ name: 'X', days: [1], start: 601, end: 690 }, sched, tasks), /15-minute/);
});

test('tasksOutsideHours', () => {
  assert.deepEqual(tasksOutsideHours(tasks, 10, 18).map((t) => t.id), ['a']);
  assert.deepEqual(tasksOutsideHours(tasks, 8, 14).map((t) => t.id), ['b']);
  assert.deepEqual(tasksOutsideHours(tasks, 8, 18), []);
});

test('pickNextMain picks oldest remaining', () => {
  const s = [{ id: 'x', createdAt: 30 }, { id: 'y', createdAt: 10 }, { id: 'z', createdAt: 20 }];
  assert.equal(pickNextMain(s), 'y');
  assert.equal(pickNextMain(s, 'y'), 'z');
  assert.equal(pickNextMain([{ id: 'x', createdAt: 1 }], 'x'), null);
});

test('resolveMain falls back when main is gone', () => {
  const s = [{ id: 'x', createdAt: 30 }, { id: 'y', createdAt: 10 }];
  assert.equal(resolveMain(s, 'x'), 'x');
  assert.equal(resolveMain(s, 'gone'), 'y');
  assert.equal(resolveMain([], 'x'), null);
});

test('blockPosition: 9:30–11:00 in an 8–18 schedule', () => {
  const p = blockPosition(570, 660, 8, 18);
  assert.equal(p.left, 15);
  assert.equal(p.width, 15);
});

test('mondayIndex', () => {
  assert.equal(mondayIndex(new Date(2026, 10, 16)), 0);
  assert.equal(mondayIndex(new Date(2026, 10, 22)), 6);
});
