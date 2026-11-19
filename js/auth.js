import { firebase, isConfigured } from './firebase.js';

const DEMO_KEY = 'weekly-demo-signed-in';
const DEMO_USER = { uid: 'demo', displayName: 'Demo user' };
const demoListeners = new Set();

function readDemoFlag() {
  try { return localStorage.getItem(DEMO_KEY) === '1'; } catch { return false; }
}

function writeDemoFlag(on) {
  try { on ? localStorage.setItem(DEMO_KEY, '1') : localStorage.removeItem(DEMO_KEY); } catch { /* storage blocked */ }
  demoListeners.forEach((cb) => cb(on ? DEMO_USER : null));
}

export function onUserChanged(cb) {
  if (!isConfigured) {
    demoListeners.add(cb);
    cb(readDemoFlag() ? DEMO_USER : null);
    return () => demoListeners.delete(cb);
  }
  return firebase.authMod.onAuthStateChanged(firebase.auth, cb);
}

export async function signIn() {
  if (!isConfigured) return writeDemoFlag(true);
  const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = firebase.authMod;
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(firebase.auth, provider);
  } catch (err) {
    if (err.code === 'auth/popup-blocked') return signInWithRedirect(firebase.auth, provider);
    if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
    throw err;
  }
}

export async function signOut() {
  if (!isConfigured) return writeDemoFlag(false);
  await firebase.authMod.signOut(firebase.auth);
}
