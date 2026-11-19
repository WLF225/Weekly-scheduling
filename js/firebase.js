// Paste your Firebase web app config below.
// Until then, demo mode stores data locally.
const firebaseConfig = {
  apiKey: 'AIzaSyCCfoKIkforFZZiSo3P-cPlC9o6WqMpkW4',
  authDomain: 'weekly-schedule-26ed9.firebaseapp.com',
  projectId: 'weekly-schedule-26ed9',
  storageBucket: 'weekly-schedule-26ed9.firebasestorage.app',
  messagingSenderId: '634732137644',
  appId: '1:634732137644:web:4790f2bbcc8175c9062309',
};

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

export const isConfigured = !firebaseConfig.apiKey.startsWith('PASTE_');

async function init() {
  const { initializeApp } = await import(`${SDK}/firebase-app.js`);
  const authMod = await import(`${SDK}/firebase-auth.js`);
  const fs = await import(`${SDK}/firebase-firestore.js`);
  const app = initializeApp(firebaseConfig);
  // Offline cache shared across tabs; syncs on reconnect.
  const db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
  });
  return { app, auth: authMod.getAuth(app), db, authMod, fs };
}

export const firebase = isConfigured ? await init() : null;
