# Qulte - Releases And Stable Points

Last updated: 2026-05-20

## Maintenance Rule

This file must be updated after each important stable checkpoint, release-oriented change, rollback point, or notable deployment/testing milestone.

It is part of the shared project memory and should stay aligned with `PROJECT_MEMORY.md`, `ROADMAP.md`, and `DECISIONS.md` so every future conversation can quickly recover the latest stable state.

## Current Stable State

Commit: `6dcc7ed`

Summary:
- audited the main app/API user flows with temporary accounts;
- cleaned visible French copy in mobile errors, backend notifications, and API-hosted support/privacy pages;
- optimized recommendation feed poster loading by fetching TMDB posters concurrently;
- removed one web lint warning from the playlist page;
- validated with mobile typecheck, backend compile, frontend lint/build, support/privacy/trailer endpoint smoke checks, and a full API smoke scenario.
- adjusted the mobile actor detail "Films marquants" grid so the cards fill the line more naturally instead of leaving spare horizontal space.
- replaced playlist reorder arrows with a long-press selection flow and animated layout changes in mobile playlists.
- stabilized the post-login iPad flow by requiring full screen on iPad and moving push notification registration out of automatic login-time initialization.
- removed the Reanimated/NativeWorklets playlist reorder dependency after Expo Go runtime crashes on iOS simulators.
- improved iPad responsiveness for the mobile shell and especially the Tinder screen by constraining content width, centering the tab bar, and keeping the Tinder card plus rating controls in a compact phone-like layout.
- removed the persistent playlist reorder hint text so playlists waste less vertical space.
- made social notifications mark themselves as read when tapped, before navigating to the underlying profile or review.
- reworked the review detail card so the poster and meta stay in the top row while the review text now spans the full width below.
- aligned the rating badge and like pill on the same row in review details.

## Latest Workspace Changes

These changes should be recorded as part of the next stable checkpoint:
- improved iPad responsiveness for the mobile shell and Tinder recommendation screen;
- removed the playlist reorder helper text.
- social notifications now mark as read on tap;
- review detail pages now show the critique text on the full card width below the top media/meta row.
- review detail pages now align the note and j'aime controls on one row.
- replaced the playlist reordering arrows with a long-press selection interaction and animated feedback, without Reanimated/NativeWorklets;
- stabilized the post-login iPad flow by requiring full screen on iPad and moving push notification registration out of automatic login-time initialization;
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
- removed already rated movies from the mobile Tinder stack/cache and added a final backend recommendation guard against rated cards.
- added mobile actor/person detail pages with biography, profile photo, key metadata, known movies, and links from movie casts plus profile key people.
- moved the mobile trailer player to the backend API domain so trailers keep working even if the web frontend is unavailable.
- moved social notifications out of the Social feed into a profile-header bell with unread badges, keeping direct-message notifications separate.
- changed the profile notification bell to open a dedicated full notifications page instead of an inline profile panel.
- added stable API-hosted support/privacy pages for App Store metadata and switched the mobile settings links to those API URLs.
- locked iOS production EAS builds to the Xcode 26 image to match Apple's 2026 submission requirements.
- audited the main mobile/API user journey with temporary accounts and optimized backend poster fetching for faster first Tinder feed responses.
- polished remaining French copy in mobile/backend visible surfaces, including social notifications, support/privacy pages, and movie detail labels.
- hardened the backend foundation for higher traffic: safer SQLite settings, missing indexes on hot tables, async push dispatch off the request path, write-route throttling, `/healthz` and `/metrics`, Redis-ready realtime fanout, and env-based secrets/API key loading.
- kept the database engine swap as a separate controlled step instead of forcing an immediate SQLite-to-Postgres cutover inside the same stabilization patch.
- added the PostgreSQL migration kit: reference schema, SQLite-to-PostgreSQL migration script, and migration runbook.
- added a PostgreSQL-compatible runtime path in the backend so the API can boot from `DATABASE_URL` / `POSTGRES_URL` once a migrated database is ready for smoke tests.
- completed the first real backend migration from SQLite to PostgreSQL on the server, updated the service environment, and validated the cutover with health and user-flow smoke tests.
- improved Tinder stability after the PostgreSQL cutover: recently shown Tinder cards now get a short cooldown to avoid immediate resurfacing, and the mobile app no longer shows a blocking recommendation error banner during silent stack refills when cards are already available.

## Important Recent Commits

- `6dcc7ed` - Mark notifications read on tap
- `7cb4313` - Improve iPad Tinder responsiveness
- `4c9ea6a` - Audit core app flows and polish copy
- `1a54352` - Record app audit checkpoint
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
- Backend now runs on PostgreSQL in production, with the busiest former SQLite-only upsert/conflict paths already converted to native PostgreSQL SQL.
- The compatibility translator has been further reduced: no remaining `INSERT OR IGNORE`, `INSERT OR REPLACE`, or `rowid DESC` remain in `backend/main.py`.
- Backend SQL placeholders are now fully migrated at the application-query level: no remaining raw SQL `?` placeholders are used in `backend/main.py`.
- Backend PostgreSQL runtime now executes native SQL directly: the temporary SQL translation layer has been removed from the Postgres cursor path.
- Preference/profile reads now defensively decode PostgreSQL text values before JSON parsing/normalization, fixing profile description and soundtrack round-trips.
- A full production smoke test passed after the PostgreSQL migration across auth, recommendations, playlists, ratings, social flows, notifications, and direct messages.
- Direct messaging realtime delivery is now active: WebSocket support is installed server-side, outgoing events use per-socket queues, mobile reconnects with heartbeat, and local latency validation received a message event in 58 ms.
- Inbox refresh is now more reliable on mobile: conversation threads emit a shared update event so the messages list updates immediately when a message is received or sent from an open thread.
- Mobile settings now include owned streaming platforms, and the watch-later playlist can filter to movies available on those subscription services.
