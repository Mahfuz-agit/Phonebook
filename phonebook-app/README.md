# Phonebook (Minimal)

Minimal, elite-style phonebook app. React Native + Expo.

## Features
- Add / search / delete contacts
- Favorites (star, sorted to top)
- Saved on device (AsyncStorage) — survives app restarts
- Light theme only, Apple HIG-inspired spacing and type

## Run locally
```
npm install
npx expo start
```

## Build APK on GitHub
1. Push this folder to a new GitHub repo.
2. Go to repo tab: Actions.
3. Run workflow "Build Android APK" (or push to main — it runs automatically).
4. When done, download the `phonebook-apk` artifact.
5. Install the `.apk` on your Android phone (enable "install unknown apps" once).

No Mac, no Android Studio, no local build needed.
