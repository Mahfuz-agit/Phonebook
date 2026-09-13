# Phonebook v3

Apple-style phonebook. React Native + Expo. Android native (APK via GitHub Actions).

## v3 changes
- Smooth iOS-style animations: list add/delete (LayoutAnimation), tab fade switch, spring slide-in panels
- Tap a contact to **edit**; long-press to delete; call icon to dial
- Settings moved OFF the tab bar — top-right gear icon, like iOS, opens a sliding panel
- Tab bar now only: **Contacts** and **Calls**
- **Activity log**: every Add / Edit / Delete is timestamped and viewable from Settings → Activity log
- **Deleted contacts**: automatically written to a `deleted/deleted_contacts.csv` subfolder inside your backup folder (with timestamp) — never silently lost
- Auto CSV backup still runs after every add/edit/delete once a folder is picked

## File structure
```
phonebook-app/
├── App.js
├── app.json
├── package.json
├── babel.config.js
├── README.md
└── utils/
    ├── csv.js
    ├── backup.js       (new)
    └── activityLog.js  (new)
```

## Setup
```
npm install
npx expo prebuild --platform android --non-interactive
```

## Build APK on GitHub
Same as before — `.github/workflows/build-apk.yml` stays at repo ROOT (unchanged). Push → Actions tab → run → download `phonebook-apk` artifact.

## Notes
- First time you pick a backup folder, a `deleted` subfolder is created inside it automatically.
- Activity log is stored on-device (AsyncStorage), not inside the CSV folder.
- Call log + SAF folder picker are Android-only.
