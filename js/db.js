import { firebase, isConfigured } from './firebase.js';

let reportError = (err) => console.error(err);
export const setErrorHandler = (fn) => { reportError = fn; };

// Offline writes never resolve; don't block the UI.
function settle(promise) {
  promise.catch((err) => reportError(err));
  return Promise.race([promise, new Promise((r) => setTimeout(r, 1200))]);
}

const byCreated = (a, b) => a.createdAt - b.createdAt;
const byTime = (a, b) => a.day - b.day || a.start - b.start;

// ---------- Firestore ----------

function firestoreApi() {
  const { fs, db } = firebase;
  const userRef = (uid) => fs.doc(db, 'users', uid);
  const schedCol = (uid) => fs.collection(db, 'users', uid, 'schedules');
  const schedRef = (uid, sid) => fs.doc(db, 'users', uid, 'schedules', sid);
  const taskCol = (uid, sid) => fs.collection(db, 'users', uid, 'schedules', sid, 'tasks');
  const taskRef = (uid, sid, tid) => fs.doc(db, 'users', uid, 'schedules', sid, 'tasks', tid);

  const toSchedule = (d) => {
    const x = d.data({ serverTimestamps: 'estimate' });
    return {
      id: d.id, name: x.name, startHour: x.startHour, endHour: x.endHour,
      createdAt: x.createdAt?.toMillis?.() ?? Date.now(),
    };
  };
  const toTask = (d) => ({ id: d.id, ...d.data() });

  return {
    onUserDoc: (uid, cb) =>
      fs.onSnapshot(userRef(uid), (s) => cb(s.exists() ? s.data() : {}), reportError),

    onSchedules: (uid, cb) =>
      fs.onSnapshot(schedCol(uid), (snap) => cb(snap.docs.map(toSchedule).sort(byCreated)), reportError),

    onTasks: (uid, sid, cb) =>
      fs.onSnapshot(taskCol(uid, sid), (snap) => cb(snap.docs.map(toTask).sort(byTime)), reportError),

    async createSchedule(uid, data, makeMain) {
      const ref = fs.doc(schedCol(uid));
      const batch = fs.writeBatch(db);
      batch.set(ref, { ...data, createdAt: fs.serverTimestamp() });
      if (makeMain) batch.set(userRef(uid), { mainScheduleId: ref.id }, { merge: true });
      await settle(batch.commit());
      return ref.id;
    },

    updateSchedule: (uid, sid, data) => settle(fs.updateDoc(schedRef(uid, sid), data)),

    setMainSchedule: (uid, sid) =>
      settle(fs.setDoc(userRef(uid), { mainScheduleId: sid }, { merge: true })),

    // Subcollections aren't auto-deleted: remove tasks first.
    async deleteSchedule(uid, sid, nextMain) {
      const tasks = await fs.getDocs(taskCol(uid, sid));
      const refs = tasks.docs.map((d) => d.ref);
      const commits = [];
      for (let i = 0; i < refs.length; i += 450) {
        const batch = fs.writeBatch(db);
        refs.slice(i, i + 450).forEach((r) => batch.delete(r));
        commits.push(batch.commit());
      }
      const last = fs.writeBatch(db);
      last.delete(schedRef(uid, sid));
      if (nextMain !== undefined) last.set(userRef(uid), { mainScheduleId: nextMain }, { merge: true });
      commits.push(last.commit());
      await settle(Promise.all(commits));
    },

    // Edits keep the id on the first day.
    async saveTask(uid, sid, { id, ...fields }, days) {
      const batch = fs.writeBatch(db);
      days.forEach((day, i) => {
        const data = { ...fields, day };
        if (id && i === 0) batch.set(taskRef(uid, sid, id), data);
        else batch.set(fs.doc(taskCol(uid, sid)), data);
      });
      await settle(batch.commit());
    },

    deleteTask: (uid, sid, tid) => settle(fs.deleteDoc(taskRef(uid, sid, tid))),
  };
}

// ---------- Demo (localStorage) ----------

const DEMO_KEY = 'weekly-demo-data-v1';

function demoSeed() {
  const now = Date.now();
  const tasks = {
    t1: { name: 'Math lecture', day: 0, start: 570, end: 660, color: '#A7C7E7' },
    t2: { name: 'Math lecture', day: 2, start: 570, end: 660, color: '#A7C7E7' },
    t3: { name: 'Chemistry lab', day: 1, start: 780, end: 960, color: '#A8D5BA' },
    t4: { name: 'Study group', day: 3, start: 840, end: 930, color: '#F6D98B' },
    t5: { name: 'Gym', day: 4, start: 480, end: 555, color: '#F7B7A3' },
    t6: { name: 'History seminar', day: 1, start: 600, end: 690, color: '#C9B6E4' },
    t7: { name: 'Library', day: 5, start: 660, end: 780, color: '#9FD8D3' },
  };
  return {
    user: { mainScheduleId: 'uni' },
    schedules: { uni: { name: 'University', startHour: 8, endHour: 18, createdAt: now } },
    tasks: { uni: tasks },
  };
}

function demoApi() {
  let state;
  try { state = JSON.parse(localStorage.getItem(DEMO_KEY)); } catch { state = null; }
  state ||= demoSeed();
  const listeners = new Set();
  const newId = () => Math.random().toString(36).slice(2, 12);

  const commit = () => {
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(state)); } catch { /* storage blocked */ }
    listeners.forEach((fn) => fn());
    return Promise.resolve();
  };
  const watch = (fn) => {
    listeners.add(fn);
    queueMicrotask(fn);
    return () => listeners.delete(fn);
  };

  return {
    onUserDoc: (uid, cb) => watch(() => cb({ ...state.user })),
    onSchedules: (uid, cb) =>
      watch(() => cb(Object.entries(state.schedules).map(([id, s]) => ({ id, ...s })).sort(byCreated))),
    onTasks: (uid, sid, cb) =>
      watch(() => cb(Object.entries(state.tasks[sid] || {}).map(([id, t]) => ({ id, ...t })).sort(byTime))),

    async createSchedule(uid, data, makeMain) {
      const id = newId();
      state.schedules[id] = { ...data, createdAt: Date.now() };
      state.tasks[id] = {};
      if (makeMain) state.user.mainScheduleId = id;
      await commit();
      return id;
    },
    updateSchedule(uid, sid, data) {
      Object.assign(state.schedules[sid], data);
      return commit();
    },
    setMainSchedule(uid, sid) {
      state.user.mainScheduleId = sid;
      return commit();
    },
    deleteSchedule(uid, sid, nextMain) {
      delete state.schedules[sid];
      delete state.tasks[sid];
      if (nextMain !== undefined) state.user.mainScheduleId = nextMain;
      return commit();
    },
    saveTask(uid, sid, { id, ...fields }, days) {
      const col = (state.tasks[sid] ||= {});
      days.forEach((day, i) => { col[id && i === 0 ? id : newId()] = { ...fields, day }; });
      return commit();
    },
    deleteTask(uid, sid, tid) {
      delete state.tasks[sid]?.[tid];
      return commit();
    },
  };
}

export const db = isConfigured ? firestoreApi() : demoApi();
export { isConfigured };
