# FitTrack

A lightweight **client-management CRM for personal trainers**. Add clients, open a
profile, and log which muscle groups they trained on each date. Vanilla JS + ES
modules, no frameworks, Firebase Firestore for storage.

> This is **not** a sets/reps tracker — it records *which muscle groups* a client
> worked on a given day, which is what a trainer actually needs at a glance.

## Run it locally

ES modules and Firebase must be served over HTTP (opening `index.html` directly
via `file://` will not work). Use any static server:

```bash
# from the FitTrack/ folder
npx serve .
# or
python3 -m http.server 8000
# or VS Code "Live Server" extension
```

Then open the printed URL. **With no Firebase config it runs immediately on
localStorage** — you can add clients and log sessions right away.

## Connect Firebase (optional, for real data)

1. Firebase Console → your project `fittrack-543f0` → Project settings → *Your apps*.
2. Copy the web config and paste it into `js/firebase.js` (replace the
   `YOUR_...` placeholders). The web config is **not** secret and is safe to commit.
3. Reload. The console logs `Firestore connected` and the app now reads/writes the
   `clients` collection. Nothing else changes — the UI is backend-agnostic.

### Auth + Firestore rules
Once Firebase is configured, the app requires sign-in (`js/auth.js`, `js/login.js`)
before rendering anything — there is deliberately **no public sign-up screen**,
since this is a single-trainer tool. Create the one trainer account yourself in
Firebase Console → Authentication → Users → *Add user* (any email-shaped string
works as a "username," e.g. `you@fittrack.local`), and enable the **Email/Password**
sign-in method.

Firestore rules should require that login:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

With **no** Firebase config (the localStorage fallback), there's no login gate at
all — there's no shared backend to protect when data never leaves the browser.

## PWA: install it, use it offline

FitTrack is installable on both Android and iOS:
- **Android (Chrome)**: an install prompt appears automatically, or use the menu → "Install FitTrack."
- **iOS (Safari)**: Share → Add to Home Screen (no auto-prompt on iOS).

Once installed it opens full-screen with its own icon. `sw.js` caches the app
shell so it still opens with no signal, and Firestore's persistent local cache
(`persistentLocalCache` + `persistentMultipleTabManager` in `js/firebase.js`)
means clients and sessions are readable — and writable, auto-syncing once back
online — even offline, correctly even with FitTrack open in more than one tab.

## Structure

```
FitTrack/
├── index.html          # app shell
├── css/style.css       # all styling
├── js/
│   ├── app.js          # entry point + hash router + auth gate
│   ├── firebase.js     # Firebase init + config (localStorage fallback flag)
│   ├── auth.js         # Firebase Auth wrapper (sign in / out, watch state)
│   ├── login.js        # sign-in screen (shown when auth is required)
│   ├── clients.js      # client repository (the only file that knows the backend)
│   ├── workouts.js     # workout operations (embedded in the client doc)
│   ├── dashboard.js    # view layer: dashboard + profile rendering & events
│   └── toast.js        # toast/snackbar utility (used for undo-delete + confirmations)
├── sw.js               # service worker: caches the app shell for offline use
├── manifest.webmanifest
├── assets/              # favicon.svg, icon-192.png, icon-512.png, apple-touch-icon.png
└── README.md
```

**Architecture note.** `clients.js` and `workouts.js` are a thin *repository*
layer — the only code aware of where data lives. Everything above them works with
plain objects, so switching between localStorage and Firestore (or adding a cache)
touches one file. `dashboard.js` owns both screens for now; split it per-view once
either grows past a screenful.

### Data shape

```jsonc
// clients/{id}
{
  "name": "Rahul",
  "goal": "Muscle Gain",          // Muscle Gain | Fat Loss | Strength | General Fitness
  "photo": null,                  // optional: JPEG data URL (resized client-side to ≤240px), or null
  "workouts": [
    {
      "id": "…",
      "date": "2026-06-15",       // YYYY-MM-DD
      "groups": ["Chest", "Triceps", "Abs"],
      "notes": "Good session"
    }
  ]
}
```

## Roadmap

- **v2** — ~~client photos~~, ~~edit client~~ (photo is stored as a resized JPEG
  data URL on the client doc, no Firebase Storage needed), ~~Firebase Auth~~ (done —
  sign-in-only gate, no public sign-up), attendance %, calendar view
- **v3** — progress photos, weight & measurements, nutrition notes, PDF export
- **v4** — ~~PWA: installable, offline support~~ (done — see above), push notifications
