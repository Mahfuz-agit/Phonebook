# Phonebook v2

Minimal, Apple-style phonebook. React Native + Expo. Android native (APK via GitHub Actions).

## v2 features
- All v1: add / search / delete / favorites, light theme
- Tap a contact to call directly
- **CSV backup**: pick a folder once (like Obsidian vault) — auto-backs up on every add/delete, plus manual "Backup now" button
- **CSV restore**: pick any CSV file, merge or replace contacts
- **Call log tab**: shows recent calls, tap unknown numbers to quick-add to phonebook
- Manual contact add only (no phone contacts import)

## Permissions used
- READ_CALL_LOG — show call history tab
- Storage access (SAF) — pick backup folder, read/write CSV

These are requested at runtime, not silently.

## Setup
```
npm install
npx expo prebuild --platform android --non-interactive
```

## Build APK on GitHub
Same as v1 — push to repo, run the "Build Android APK" workflow in Actions tab (`.github/workflows/build-apk.yml` must be at repo ROOT, not inside phonebook-app/).

## Notes
- Call log + backup folder picker only work on real Android devices/builds, not on iOS.
- `react-native-call-log` needs the native prebuild step (already in the workflow) — it won't work in Expo Go.
