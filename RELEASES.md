# Qulte - Releases And Stable Points

Last updated: 2026-05-17

## Maintenance Rule

This file must be updated after each important stable checkpoint, release-oriented change, rollback point, or notable deployment/testing milestone.

It is part of the shared project memory and should stay aligned with `PROJECT_MEMORY.md`, `ROADMAP.md`, and `DECISIONS.md` so every future conversation can quickly recover the latest stable state.

## Current Stable State

Commit: `be9c7a9`

Summary:
- removed the bottom safe-area strip globally in the mobile app;
- validated with `npm run typecheck`;
- pushed to `origin/main`.

## Latest Workspace Changes

These changes should be recorded as part of the next stable checkpoint:
- added pull-to-refresh support across the main dynamic mobile screens;
- improved drag behavior so list screens dismiss the keyboard more naturally;
- changed full-screen stack screens to use native-style left-edge back swipe;
- removed the custom drag gesture from the trailer modal.
- moved profile showcase saving into the top profile action button;
- expanded Settings with notification controls, tutorial replay, and recommendation cache actions.
- corrected French spelling, accents, and apostrophes across the main mobile user-facing screens.
- switched the Expo iOS config to iPhone only (`supportsTablet: false`);
- added in-app account deletion support through mobile settings and backend deletion logic;
- added social safety basics: block user list, unblock flow, report profile, report review, report conversation, and hidden-user filtering in key backend queries;
- added public `/privacy` and `/support` pages on the web app for App Store / TestFlight references.
- expanded the public `/privacy` and `/support` pages with clearer user-facing content for data usage, account deletion, safety reports, beta support, and contact.
- changed the public support contact address to `qulte.developpeur@gmail.com`.
- rewrote the public privacy and support pages with fuller French prose for App Store review readiness, including user-generated content, recommendation data, deletion, signalement, and support scope.
- added `APP_STORE_CONNECT.md` with ready-to-paste App Store metadata, review notes, privacy questionnaire guidance, and final submission checklist.
- created the production App Review test account `apple.review`, with onboarding and tutorial completed; password is intentionally kept outside Git.
- improved the mobile first-run experience by explaining the onboarding taste signals and rewriting the welcome tutorial around Qulte's actual recommendation, playlist, social and messaging loop.
- added a first onboarding concept screen explaining the Tinder-like movie flow, swipes, ratings, AI learning, watch-later behavior and social discovery before asking for favorite films.
- removed the duplicate explanatory card from the onboarding favorite-film selection screen so the step stays focused on choosing films.
- replaced the default Expo mobile icon assets with the Qulte logo used by the web app, including the iOS app icon used by TestFlight/App Store builds.
- fixed the mobile conversation composer so it stays above the iOS keyboard after the global bottom safe-area strip removal.
- relaxed mobile review creation/editing to allow 0.5-star reviews and short non-empty text, aligned with the backend.
- changed mobile review creation from a vertical sheet to a full-screen horizontal stack screen to avoid accidental down-swipe dismissal and the black top seam.
- extended backend access-token lifetime from 24 hours to 180 days to reduce repeated mobile logins.
- removed the visible Social stats cards/header badge above the review feed.
- unified rating writes so Tinder/movie-detail ratings update the user's existing review rating for that movie, while review creation/editing continues to update the user's movie rating.
- allowed users to clear a movie rating from the movie detail screen by tapping the currently selected star value again.
- synced the Tinder star control with the current movie's saved rating, including rating changes or clears made from the movie detail screen.
- blocked deletion of a movie rating when it is tied to an existing review, with a clear mobile error message asking the user to edit or delete the review first.
- fixed Tinder pass/swipe-left so it records a pass recommendation signal instead of creating a fake 1-star movie rating; undoing a pass now undoes that pass signal.
- changed Tinder pass filtering from a permanent block to a 14-day cooldown plus mild score penalty, allowing strong older passed films to reappear later.
- prevented Tinder left-swipe on already rated movies from adding a negative recommendation signal; it now only advances to the next card.

## Important Recent Commits

- `be9c7a9` - Remove bottom safe area strip globally
- `38a1d07` - Fix movie details bottom safe area
- `d32feb0` - Remove artificial bottom seam
- `591a66e` - Restore native navbar and cover screen seam
- `f23adec` - Replace mobile tab bar to remove black strip
- `13b0b3d` - Stabilize mobile tab transitions
- `cd8a029` - Remove top bar above mobile navbar
- `0345568` - Enable new AI for all accounts
- `cffac6a` - Add test AI dashboard
- `f88e62e` - Add test AI feedback loop
- `c06fef5` - Use seed-cluster recommendations for test AI
- `bef2267` - Add test-only AI recommendation experiment
- `837eb04` - Exclude onboarding movies from mobile tinder
- `c57e332` - Improve mobile onboarding signals
- `76cdca7` - Preload mobile tinder stack
- `c98f2e5` - Smooth mobile screen refreshes
- `b9eee21` - Make mobile tab navigation snappier
- `7c1ee8d` - Improve mobile navigation animations
- `84aa965` - Expand reviews from profile and social cards
- `ac39896` - Use inverted mobile conversation list
- `b643c1a` - Add Qulte mobile app

## Tags

- `backup-before-global-ai-rollout-2026-05-04`: backup before applying the new AI to all accounts.

## Release Checklist

Before a TestFlight build:

```bash
cd ~/Qulte
git pull
cd mobile
npm install
npm run typecheck
npx eas build --platform ios
```

After build completion:

```bash
npx eas submit --platform ios
```

## Notes

- If EAS config files differ locally on the Mac, `git pull` can be blocked. Check `git status` before pulling.
- If tunnel mode fails, it can be an ngrok issue rather than a Qulte code issue.
- The server repository source of truth is `origin/main` at `git@github.com:aux-ngls/WeChoose-app.git`.
- For the simplest first App Store release, the mobile app now targets iPhone only and expects support/privacy URLs from the web app.
