# Weekly

A weekly schedule website: plain HTML, CSS and JavaScript, hosted on GitHub Pages, with Google sign-in and Cloud Firestore (free Spark plan).

## Try it locally (demo mode)

Until you paste a Firebase config into `js/firebase.js`, the site runs in **demo mode**: "Sign in with Google" signs you into a local demo account and data is saved in your browser's localStorage, seeded with a sample "University" schedule.

ES modules need a web server (opening `index.html` from disk won't work):

```sh
npx serve .          # or: python -m http.server
```

## Connect Firebase

1. In the [Firebase console](https://console.firebase.google.com/), create a project and keep it on the free Spark plan.
2. **Authentication → Sign-in method** → enable **Google**.
3. **Authentication → Settings → Authorized domains** → add `yourusername.github.io` (otherwise login fails on the live site). `localhost` is allowed by default.
4. **Firestore Database** → create a database, then paste the contents of `firestore.rules` into the **Rules** tab and publish.
5. **Project settings → Your apps** → register a web app and copy its config object into `firebaseConfig` in `js/firebase.js`.

The config being visible in the site's code is normal. The security rules are what protect each user's data.

## Deploy to GitHub Pages

1. Create a repository and push these files to the `main` branch.
2. **Settings → Pages** → Source: *Deploy from a branch* → `main` / root.
3. The site goes live at `https://yourusername.github.io/repository-name/`.
4. Sign in on a second device to confirm changes sync live.

## Tests

```sh
npm test             # unit tests for time, validation and layout logic (Node 18+)
```

## Files

```
index.html          page skeleton, all views and dialogs
css/style.css       grid design, colors, dark mode, mobile layout
js/firebase.js      Firebase config and setup (offline cache on)
js/auth.js          sign in / sign out (Google, or demo)
js/db.js            schedules and tasks: Firestore or demo store
js/grid.js          draws the schedule grid and task blocks
js/logic.js         pure helpers: time formats, validation, layout math
js/app.js           routing between views, forms, event handling
firestore.rules     security rules: each user reads/writes only their data
tests/              unit tests
```

## Data model

```
users/{uid}                              mainScheduleId
users/{uid}/schedules/{id}               name, startHour, endHour, createdAt
users/{uid}/schedules/{id}/tasks/{id}    name, day (0 = Mon … 6 = Sun), start, end (minutes from midnight), color
```

## Behaviour notes

- The first schedule becomes main automatically; deleting the main one promotes the oldest remaining.
- Overlapping tasks on the same day are blocked. Times use 15-minute steps.
- Shrinking a schedule's hours lists the tasks that would be cut off and asks before deleting them.
- Adding a task to several days creates one task per day; each can then be edited on its own.
- Today's day label is filled in, and a coral line marks the current time.
- 12/24-hour time is a per-device toggle in the top bar. Dark mode follows the system setting.
- Firestore offline cache is on: the schedule shows without internet and syncs on reconnect.
