// Pure helpers, no DOM or Firebase: unit-testable.

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Display order: week starts Saturday. Stored indexes unchanged.
export const WEEK_ORDER = [5, 6, 0, 1, 2, 3, 4];

export const TASK_COLORS = [
  { name: 'Sky blue', hex: '#A7C7E7' },
  { name: 'Sage green', hex: '#A8D5BA' },
  { name: 'Butter', hex: '#F6D98B' },
  { name: 'Peach', hex: '#F7B7A3' },
  { name: 'Lavender', hex: '#C9B6E4' },
  { name: 'Soft teal', hex: '#9FD8D3' },
];

export const STEP_MINUTES = 15;

const pad = (n) => String(n).padStart(2, '0');

// Minutes from midnight -> "9:30 AM" or "09:30".
export function formatTime(minutes, use24 = false) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (use24) return `${pad(h)}:${pad(m)}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const suffix = h % 24 < 12 ? 'AM' : 'PM';
  return `${h12}:${pad(m)} ${suffix}`;
}

// Column header label: "8 AM" or "08:00".
export function formatHour(hour, use24 = false) {
  if (use24) return `${pad(hour)}:00`;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${hour % 24 < 12 ? 'AM' : 'PM'}`;
}

// "9:30 – 11:00 AM" or "11:30 AM – 1:00 PM".
export function formatRange(start, end, use24 = false) {
  if (use24) return `${formatTime(start, true)} – ${formatTime(end, true)}`;
  const a = formatTime(start);
  const b = formatTime(end);
  const sameHalf = a.slice(-2) === b.slice(-2);
  return sameHalf ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`;
}

export function timeSteps(fromMin, toMin, step = STEP_MINUTES) {
  const out = [];
  for (let t = fromMin; t <= toMin; t += step) out.push(t);
  return out;
}

export function validateScheduleFields({ name, startHour, endHour }) {
  if (!name || !name.trim()) return 'Give the schedule a name.';
  if (name.trim().length > 60) return 'Keep the name under 60 characters.';
  if (!Number.isInteger(startHour) || startHour < 0 || startHour > 23) return 'Pick a start hour.';
  if (!Number.isInteger(endHour) || endHour < 1 || endHour > 24) return 'Pick an end hour.';
  if (endHour <= startHour) return 'The end hour must be after the start hour.';
  return null;
}

export const overlaps = (a, b) => a.start < b.end && b.start < a.end;

// Returns an error message, or null when valid.
export function validateTask({ name, days, start, end }, schedule, existing, ignoreId = null) {
  if (!name || !name.trim()) return 'Give the task a name.';
  if (name.trim().length > 80) return 'Keep the task name under 80 characters.';
  if (!days || days.length === 0) return 'Pick at least one day.';
  if (start % STEP_MINUTES || end % STEP_MINUTES) return 'Times must be on 15-minute steps.';
  if (end <= start) return 'The end time must be after the start time.';
  if (start < schedule.startHour * 60 || end > schedule.endHour * 60) {
    return `The task must fit inside this schedule's hours (${formatHour(schedule.startHour)} – ${formatHour(schedule.endHour)}).`;
  }
  for (const day of days) {
    const clash = existing.find(
      (t) => t.id !== ignoreId && t.day === day && overlaps(t, { start, end }),
    );
    if (clash) {
      return `This overlaps "${clash.name}" on ${DAYS[day]} (${formatRange(clash.start, clash.end)}).`;
    }
  }
  return null;
}

export function tasksOutsideHours(tasks, startHour, endHour) {
  return tasks.filter((t) => t.start < startHour * 60 || t.end > endHour * 60);
}

// Oldest schedule id other than excludeId, or null.
export function pickNextMain(schedules, excludeId = null) {
  const rest = schedules.filter((s) => s.id !== excludeId);
  if (rest.length === 0) return null;
  return rest.reduce((a, b) => ((a.createdAt ?? 0) <= (b.createdAt ?? 0) ? a : b)).id;
}

// Stored main if it still exists, else oldest.
export function resolveMain(schedules, mainScheduleId) {
  if (schedules.some((s) => s.id === mainScheduleId)) return mainScheduleId;
  return pickNextMain(schedules);
}

// Block left/width inside a day row, in percent.
export function blockPosition(start, end, startHour, endHour) {
  const total = (endHour - startHour) * 60;
  const from = startHour * 60;
  return {
    left: ((start - from) / total) * 100,
    width: ((end - start) / total) * 100,
  };
}

export const mondayIndex = (date) => (date.getDay() + 6) % 7;
