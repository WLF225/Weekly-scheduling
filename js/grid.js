import { DAYS, WEEK_ORDER, formatHour, formatRange, blockPosition, mondayIndex } from './logic.js';

// Tiny element builder; text always via textContent.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function renderGrid({ schedule, tasks, use24, onTaskClick, now = new Date() }) {
  const { startHour, endHour } = schedule;
  const hours = endHour - startHour;
  const today = mondayIndex(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = nowMin >= startHour * 60 && nowMin < endHour * 60;

  const head = h('div', { class: 'grid-hours', role: 'row' },
    h('div', { class: 'grid-corner', role: 'columnheader' }, h('span', { class: 'sr-only' }, 'Day')),
    h('div', { class: 'hour-labels' },
      Array.from({ length: hours }, (_, i) => {
        const [, num, suffix] = formatHour(startHour + i, use24).match(/^(\d+)(.*)$/);
        return h('div', { class: 'hour', role: 'columnheader' },
          num, h('span', { class: 'hour-suffix' }, suffix));
      })),
  );

  const rows = WEEK_ORDER.map((d) => {
    const day = DAYS[d];
    const dayTasks = tasks.filter((t) => t.day === d);
    const track = h('div', { class: 'day-track' },
      dayTasks.map((t) => {
        const { left, width } = blockPosition(t.start, t.end, startHour, endHour);
        const range = formatRange(t.start, t.end, use24);
        const short = t.end - t.start <= 30;
        return h('button', {
          type: 'button',
          class: `task${short ? ' is-short' : ''}`,
          style: { left: `${left}%`, width: `${width}%`, background: t.color },
          title: `${t.name}, ${range}`,
          'aria-label': `${t.name}, ${DAYS[d]} ${range}. Edit task`,
          onClick: () => onTaskClick(t),
        },
        h('span', { class: 'task-name' }, t.name),
        h('span', { class: 'task-time' }, range));
      }),
      d === today && showNow
        ? h('div', {
          class: 'now-line',
          style: { left: `${blockPosition(nowMin, nowMin, startHour, endHour).left}%` },
          'aria-hidden': 'true',
        })
        : null,
    );
    return h('div', { class: `day-row${d === today ? ' is-today' : ''}`, role: 'row' },
      h('div', { class: 'day-cell', role: 'rowheader' },
        h('span', { class: 'day-box' }, day.slice(0, 3), h('span', { class: 'day-rest' }, day.slice(3)))),
      track);
  });

  return h('div', { class: 'grid-scroll', tabindex: '0', 'aria-label': `${schedule.name} week grid` },
    h('div', { class: 'grid', role: 'table', style: { '--hours': hours } }, head, rows));
}
