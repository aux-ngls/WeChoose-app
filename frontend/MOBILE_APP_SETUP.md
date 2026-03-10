# Qulte Mobile Setup

Qulte now ships with:

- a mobile-first PWA
- a Capacitor wrapper in `frontend/android` and `frontend/ios`
- native push token registration to the backend
- generated app icons and splash screens

## Native projects

- Android project: `frontend/android`
- iOS project: `frontend/ios/App`

## Required files for real push delivery

Android:

1. Create a Firebase project for package `dev.dury.qulte`
2. Download `google-services.json`
3. Place it at `frontend/android/app/google-services.json`

iOS:

1. Create the iOS app in the same Firebase project
2. Download `GoogleService-Info.plist`
3. Place it at `frontend/ios/App/App/GoogleService-Info.plist`
4. In Xcode, enable the `Push Notifications` capability
5. In Xcode, enable `Background Modes > Remote notifications`
6. Configure APNs for the Firebase project

Backend:

1. Set `FCM_SERVER_KEY` on the API environment
2. Restart `wec_back.service`

Without these credentials, Qulte still registers native devices and the app shell works, but remote push delivery will stay disabled server-side.

## Useful commands

```bash
cd /home/wechoose/frontend
npm run build
npm run cap:sync
npm run cap:open:android
npm run cap:open:ios
```

## Current behavior

- new direct messages trigger a native push route to `/messages?conversationId=...`
- follow / review / like / comment events trigger a native push route to `/social`
