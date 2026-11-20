import { onUserChanged, signIn, signOut } from './auth.js';
import { db, isConfigured, setErrorHandler } from './db.js';
import { renderGrid, h } from './grid.js';
import {
  DAYS, WEEK_ORDER, TASK_COLORS, formatHour, formatTime, formatRange, timeSteps, validateScheduleFields,
  validateTask, tasksOutsideHours, pickNextMain, resolveMain, mondayIndex,
} from './logic.js';

const $ = (sel) => document.querySelector(sel);
const field = (form, name) => form.elements.namedItem(name);

const state = {
  user: null,
  userDoc: {},
  schedules: null,
  tasks: [],
  tasksFor: null,
  tasksLoaded: false,
  subs: [],
  taskSub: null,
};

// ---------- Preferences ----------

const PREF_24H = 'weekly-24h';
let use24 = (() => { try { return localStorage.getItem(PREF_24H) === '1'; } catch { return false; } })();

function setUse24(on) {
  use24 = on;
  try { localStorage.setItem(PREF_24H, on ? '1' : '0'); } catch { /* storage blocked */ }
  $('#toggle-24h').setAttribute('aria-pressed', String(on));
  render();
}

// ---------- Feedback ----------

function toast(message, kind = 'info') {
  const el = $('#toast');
  el.textContent = message;
  el.dataset.kind = kind;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, kind === 'error' ? 7000 : 3500);
}

function describeError(err) {
  const code = err?.code || '';
  if (code.includes('permission-denied')) return "You don't have access to that data. Sign out, then sign in again.";
  if (code.includes('unavailable')) return "You're offline. Changes will sync when you reconnect.";
  if (code === 'auth/unauthorized-domain') return "Sign-in isn't allowed on this domain yet. Add it under Authentication → Settings → Authorized domains in Firebase.";
  if (code === 'auth/network-request-failed') return 'Sign-in needs an internet connection. Check your connection and try again.';
  return err?.message || 'Something went wrong. Try again.';
}

setErrorHandler((err) => toast(describeError(err), 'error'));

function setBusy(form, busy, label) {
  const btn = form.querySelector('[type="submit"]');
  btn.disabled = busy;
  if (busy) { btn.dataset.label = btn.textContent; btn.textContent = label; }
  else if (btn.dataset.label) btn.textContent = btn.dataset.label;
}

function showFormError(form, message) {
  const el = form.querySelector('.form-error');
  el.textContent = message || '';
  el.hidden = !message;
}

// ---------- Confirm dialog ----------

function confirmDialog({ title, message, items = [], confirmLabel, danger = false }) {
  const dlg = $('#confirm-dialog');
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  const list = $('#confirm-items');
  list.replaceChildren(...items.map((t) => h('li', {}, t)));
  list.hidden = items.length === 0;
  const ok = $('#confirm-ok');
  ok.textContent = confirmLabel;
  ok.className = `btn ${danger ? 'btn-danger' : 'btn-coral'}`;
  return new Promise((resolve) => {
    const done = (value) => () => { dlg.close(); resolve(value); };
    ok.onclick = done(true);
    $('#confirm-cancel').onclick = done(false);
    dlg.oncancel = () => resolve(false);
    dlg.showModal();
    $('#confirm-cancel').focus();
  });
}

// ---------- Auth & data subscriptions ----------

function showView(name) {
  for (const v of ['loading', 'login', 'app']) $(`#view-${v}`).hidden = v !== name;
}

function stopSubs() {
  state.subs.forEach((unsub) => unsub());
  state.taskSub?.();
  Object.assign(state, {
    subs: [], taskSub: null, tasksFor: null, tasks: [], tasksLoaded: false, userDoc: {}, schedules: null,
  });
}

onUserChanged((user) => {
  stopSubs();
  state.user = user;
  if (!user) { showView('login'); return; }
  showView('app');
  render();
  state.subs.push(db.onUserDoc(user.uid, (d) => { state.userDoc = d; render(); }));
  state.subs.push(db.onSchedules(user.uid, (s) => { state.schedules = s; render(); }));
});

function watchTasks(sid) {
  if (state.tasksFor === sid) return;
  state.taskSub?.();
  Object.assign(state, { taskSub: null, tasks: [], tasksLoaded: false, tasksFor: sid });
  if (!sid) return;
  state.taskSub = db.onTasks(state.user.uid, sid, (tasks) => {
    if (state.tasksFor !== sid) return;
    state.tasks = tasks;
    state.tasksLoaded = true;
    render();
  });
}

function loadTasksOnce(sid) {
  if (state.tasksFor === sid && state.tasksLoaded) return Promise.resolve(state.tasks);
  return new Promise((resolve) => {
    let unsub = null;
    let done = false;
    unsub = db.onTasks(state.user.uid, sid, (tasks) => {
      if (done) return;
      done = true;
      resolve(tasks);
      queueMicrotask(() => unsub?.());
    });
  });
}

const mainId = () => resolveMain(state.schedules || [], state.userDoc.mainScheduleId);
const uid = () => state.user.uid;

// ---------- Routing ----------

function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  if (hash === 'schedules') return { name: 'list' };
  const m = hash.match(/^schedule\/(.+)$/);
  if (m) return { name: 'schedule', id: decodeURIComponent(m[1]) };
  return { name: 'home' };
}

const scheduleHref = (id) => `#/schedule/${encodeURIComponent(id)}`;

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

function render() {
  if (!state.user) return;
  const r = route();
  const main = $('#main');
  const prevScroll = main.querySelector('.grid-scroll')?.scrollLeft ?? 0;
  $('#nav-schedules').toggleAttribute('aria-current', r.name === 'list');
  if (r.name === 'list') $('#nav-schedules').setAttribute('aria-current', 'page');

  let view;
  if (state.schedules === null) {
    view = h('p', { class: 'loading', role: 'status' }, 'Loading your schedules…');
  } else if (r.name === 'list') {
    watchTasks(null);
    view = listView();
  } else {
    const sid = r.name === 'home' ? mainId() : r.id;
    const sched = state.schedules.find((s) => s.id === sid);
    if (sched) {
      watchTasks(sid);
      view = scheduleView(sched);
    } else {
      watchTasks(null);
      view = r.name === 'home' ? emptyView() : missingView();
    }
  }
  main.replaceChildren(view);
  const scroller = main.querySelector('.grid-scroll');
  if (scroller) scroller.scrollLeft = prevScroll;
}

// ---------- Views ----------

const hoursLabel = (s) => `${formatHour(s.startHour, use24)} – ${formatHour(s.endHour, use24)}`;

function scheduleView(sched) {
  const isMain = sched.id === mainId();
  return h('section', { class: 'board' },
    h('header', { class: 'board-head' },
      h('div', { class: 'board-title' },
        h('h1', {}, sched.name),
        h('p', { class: 'board-meta' },
          h('span', {}, hoursLabel(sched)),
          isMain ? h('span', { class: 'badge' }, 'Main schedule') : null)),
      h('div', { class: 'board-actions' },
        h('button', { type: 'button', class: 'btn btn-coral', onClick: () => openTaskDialog(sched) }, 'Add task'),
        h('button', { type: 'button', class: 'btn btn-on-navy', onClick: () => openScheduleDialog(sched) }, 'Edit schedule'))),
    renderGrid({
      schedule: sched,
      tasks: state.tasksFor === sched.id ? state.tasks : [],
      use24,
      onTaskClick: (task) => openTaskDialog(sched, task),
    }),
    state.tasksLoaded && state.tasks.length === 0
      ? h('p', { class: 'hint' }, 'No tasks yet. Choose Add task to put your first one on the grid.')
      : null);
}

function listView() {
  const main = mainId();
  const items = state.schedules.map((s) => {
    const isMain = s.id === main;
    return h('li', { class: `sched-item${isMain ? ' is-main' : ''}` },
      h('div', { class: 'sched-info' },
        h('a', { class: 'sched-name', href: scheduleHref(s.id) }, s.name),
        h('span', { class: 'sched-hours' }, hoursLabel(s)),
        isMain ? h('span', { class: 'badge' }, 'Main') : null),
      h('div', { class: 'sched-actions' },
        h('a', { class: 'btn btn-ghost', href: scheduleHref(s.id) }, 'Open'),
        h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => openScheduleDialog(s) }, 'Edit'),
        isMain ? null : h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => makeMain(s) }, 'Set as main'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-ghost-danger', onClick: () => removeSchedule(s) }, 'Delete')));
  });

  return h('section', { class: 'page' },
    h('div', { class: 'page-head' },
      h('h1', { class: 'page-title' }, 'My schedules'),
      h('button', { type: 'button', class: 'btn btn-coral', onClick: () => openScheduleDialog() }, 'New schedule')),
    items.length
      ? h('ul', { class: 'sched-list' }, items)
      : h('p', { class: 'hint' }, "You don't have any schedules yet. Create one to start planning your week."));
}

function emptyView() {
  return h('section', { class: 'empty' },
    h('h1', {}, 'Start your first schedule'),
    h('p', {}, 'Give it a name and the hours your days run, like 8 AM to 6 PM. You can add tasks right after.'),
    h('button', { type: 'button', class: 'btn btn-coral btn-lg', onClick: () => openScheduleDialog() }, 'New schedule'));
}

function missingView() {
  return h('section', { class: 'empty' },
    h('h1', {}, 'This schedule no longer exists'),
    h('p', {}, 'It may have been deleted on another device.'),
    h('a', { class: 'btn btn-coral', href: '#/schedules' }, 'Go to My schedules'));
}

// ---------- Schedule actions ----------

async function makeMain(s) {
  try {
    await db.setMainSchedule(uid(), s.id);
    toast(`"${s.name}" is now your main schedule.`);
  } catch (err) { toast(describeError(err), 'error'); }
}

async function removeSchedule(s) {
  const ok = await confirmDialog({
    title: `Delete "${s.name}"?`,
    message: "This deletes the schedule and all of its tasks. You can't undo this.",
    confirmLabel: 'Delete schedule',
    danger: true,
  });
  if (!ok) return;
  const nextMain = s.id === mainId() ? pickNextMain(state.schedules, s.id) : undefined;
  try {
    await db.deleteSchedule(uid(), s.id, nextMain);
    toast(`Deleted "${s.name}".`);
    if (route().id === s.id) location.hash = '#/schedules';
  } catch (err) { toast(describeError(err), 'error'); }
}

function fillSelect(select, values, label, selected) {
  select.replaceChildren(...values.map((v) => h('option', { value: String(v), selected: v === selected }, label(v))));
}

function openScheduleDialog(existing = null) {
  const dlg = $('#schedule-dialog');
  const form = dlg.querySelector('form');
  form.reset();
  showFormError(form, null);
  $('#schedule-dialog-title').textContent = existing ? 'Edit schedule' : 'New schedule';
  form.querySelector('[type="submit"]').textContent = existing ? 'Save changes' : 'Create schedule';
  field(form, 'schedName').value = existing?.name ?? '';
  const hourLabel = (v) => formatHour(v, use24);
  fillSelect(field(form, 'startHour'), timeSteps(0, 23, 1), hourLabel, existing?.startHour ?? 8);
  fillSelect(field(form, 'endHour'), timeSteps(1, 24, 1), hourLabel, existing?.endHour ?? 18);

  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = {
      name: field(form, 'schedName').value.trim(),
      startHour: Number(field(form, 'startHour').value),
      endHour: Number(field(form, 'endHour').value),
    };
    const error = validateScheduleFields(data);
    if (error) return showFormError(form, error);
    showFormError(form, null);
    setBusy(form, true, 'Saving…');
    try {
      if (existing) {
        const outside = tasksOutsideHours(await loadTasksOnce(existing.id), data.startHour, data.endHour);
        if (outside.length) {
          const ok = await confirmDialog({
            title: `${outside.length} ${outside.length === 1 ? 'task falls' : 'tasks fall'} outside the new hours`,
            message: `Saving ${hoursLabel(data)} deletes these tasks:`,
            items: outside.map((t) => `${t.name}, ${DAYS[t.day]} ${formatRange(t.start, t.end, use24)}`),
            confirmLabel: 'Delete tasks and save',
            danger: true,
          });
          if (!ok) return;
          await Promise.all(outside.map((t) => db.deleteTask(uid(), existing.id, t.id)));
        }
        await db.updateSchedule(uid(), existing.id, data);
        dlg.close();
        toast('Schedule saved.');
      } else {
        const id = await db.createSchedule(uid(), data, mainId() === null);
        dlg.close();
        toast(`Created "${data.name}".`);
        location.hash = scheduleHref(id);
      }
    } catch (err) {
      showFormError(form, describeError(err));
    } finally {
      setBusy(form, false);
    }
  };
  dlg.showModal();
}

// ---------- Task dialog ----------

function buildTaskPickers() {
  $('#day-picker').replaceChildren(...WEEK_ORDER.map((i) =>
    h('label', { class: 'day-chip' },
      h('input', { type: 'checkbox', name: 'day', value: String(i) }),
      h('span', { 'aria-hidden': 'true' }, DAYS[i].slice(0, 3)),
      h('span', { class: 'sr-only' }, DAYS[i]))));
  $('#color-picker').replaceChildren(...TASK_COLORS.map((c) =>
    h('label', { class: 'swatch', title: c.name },
      h('input', { type: 'radio', name: 'color', value: c.hex }),
      h('span', { style: { background: c.hex }, 'aria-hidden': 'true' }),
      h('span', { class: 'sr-only' }, c.name))));
}

function openTaskDialog(sched, task = null) {
  const dlg = $('#task-dialog');
  const form = dlg.querySelector('form');
  form.reset();
  showFormError(form, null);
  $('#task-dialog-title').textContent = task ? 'Edit task' : 'Add task';
  form.querySelector('[type="submit"]').textContent = task ? 'Save changes' : 'Add task';
  $('#days-hint').hidden = !task;

  const first = sched.startHour * 60;
  const last = sched.endHour * 60;
  const start = task?.start ?? first;
  const end = task?.end ?? Math.min(start + 60, last);
  const timeLabel = (v) => formatTime(v, use24);
  const startSel = field(form, 'start');
  const endSel = field(form, 'end');
  fillSelect(startSel, timeSteps(first, last - 15), timeLabel, start);
  fillSelect(endSel, timeSteps(first + 15, last), timeLabel, end);
  startSel.onchange = () => {
    if (Number(endSel.value) <= Number(startSel.value)) {
      endSel.value = String(Math.min(Number(startSel.value) + 60, last));
    }
  };

  field(form, 'taskName').value = task?.name ?? '';
  const pickDay = task ? task.day : mondayIndex(new Date());
  form.querySelectorAll('input[name="day"]').forEach((cb) => { cb.checked = Number(cb.value) === pickDay; });
  const color = task?.color ?? TASK_COLORS[state.tasks.length % TASK_COLORS.length].hex;
  form.querySelectorAll('input[name="color"]').forEach((r) => { r.checked = r.value === color; });

  const delBtn = $('#task-delete');
  delBtn.hidden = !task;
  delBtn.onclick = async () => {
    const ok = await confirmDialog({
      title: `Delete "${task.name}"?`,
      message: `${DAYS[task.day]}, ${formatRange(task.start, task.end, use24)}. You can't undo this.`,
      confirmLabel: 'Delete task',
      danger: true,
    });
    if (!ok) return;
    try {
      await db.deleteTask(uid(), sched.id, task.id);
      dlg.close();
      toast('Task deleted.');
    } catch (err) { showFormError(form, describeError(err)); }
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const days = [...form.querySelectorAll('input[name="day"]:checked')].map((cb) => Number(cb.value));
    const data = {
      name: field(form, 'taskName').value.trim(),
      days,
      start: Number(startSel.value),
      end: Number(endSel.value),
    };
    const error = validateTask(data, sched, state.tasks, task?.id ?? null);
    if (error) return showFormError(form, error);
    showFormError(form, null);
    setBusy(form, true, 'Saving…');
    try {
      const chosen = form.querySelector('input[name="color"]:checked')?.value ?? TASK_COLORS[0].hex;
      await db.saveTask(uid(), sched.id,
        { id: task?.id ?? null, name: data.name, start: data.start, end: data.end, color: chosen }, days);
      dlg.close();
      if (task) toast('Task saved.');
      else toast(days.length > 1 ? `Added "${data.name}" to ${days.length} days.` : `Added "${data.name}".`);
    } catch (err) {
      showFormError(form, describeError(err));
    } finally {
      setBusy(form, false);
    }
  };
  dlg.showModal();
  field(form, 'taskName').focus();
}

// ---------- Wiring ----------

buildTaskPickers();
document.querySelectorAll('[data-close]').forEach((btn) =>
  btn.addEventListener('click', () => btn.closest('dialog').close()));

$('#sign-in').addEventListener('click', async () => {
  const btn = $('#sign-in');
  btn.disabled = true;
  try { await signIn(); } catch (err) { toast(describeError(err), 'error'); } finally { btn.disabled = false; }
});
$('#sign-out').addEventListener('click', () => {
  location.hash = '';
  signOut().catch((err) => toast(describeError(err), 'error'));
});
$('#toggle-24h').addEventListener('click', () => setUse24(!use24));
$('#toggle-24h').setAttribute('aria-pressed', String(use24));
$('#demo-banner').hidden = isConfigured;
$('#login-demo-note').hidden = isConfigured;

// Keep the current-time line moving.
setInterval(() => { if (route().name !== 'list') render(); }, 60_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
