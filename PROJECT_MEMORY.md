# Qulte - Project Memory

Last updated: 2026-05-20
Current branch: main
Current stable commit: 6dcc7ed

## Maintenance Rule

These memory files must be kept up to date as the project evolves.

At a minimum, after each meaningful product, technical, UX, release, or workflow change:
- update `PROJECT_MEMORY.md` if the overall project state, rules, or sensitive areas changed;
- update `ROADMAP.md` if priorities changed;
- update `DECISIONS.md` if an important decision was made or reversed;
- update `RELEASES.md` after each important stable point or release-oriented change.

This rule exists so every future conversation can recover the same shared context from the repository, even after context compaction.

## Vision

Qulte is a social cinema product. The goal is to help users discover movies through personalized recommendations, a Tinder-like swipe experience, profiles, playlists, reviews, private messages, and movie sharing.

The project must keep two usable products in parallel:
- the existing web site;
- the mobile app built with React Native / Expo.

## Current Product State

The mobile app currently includes:
- authentication and first-run onboarding with a dedicated concept screen explaining Qulte before the favorite-film selection;
- a compact onboarding favorite-film selection screen focused on search, progress, and validation, without duplicated explanatory blocks;
- movie Tinder / swipe recommendations;
- Tinder is explicitly responsive on iPad: the recommendation card keeps a compact phone-like width, stays centered, and keeps the rating controls aligned with the card.
- pull-to-refresh on dynamic mobile screens such as search, social, messages, playlists, and profiles;
- profile page with profile picture, description, favorite identity content, playlists, and user reviews;
- movie detail sheet used consistently when opening a movie;
- actor/person detail pages linked from movie casts and profile key people;
- mobile trailers should load through the backend-hosted `/mobile-trailer-player.html` player, not the frontend website domain, to avoid web frontend outages breaking video playback.
- support and privacy pages used by the mobile app and App Store submission should be served from the API domain when the frontend website is unstable.
- full-screen stack screens such as movie details, playlists, profiles, settings, review creation, and conversations should feel native on iPhone, with return by left-edge swipe;
- ratings with half-star precision;
- ratings are meant to represent one personal movie rating across Tinder, movie details, and reviews;
- playlists, custom playlist creation, adding movies to playlists, and removing movies;
- playlist manual order now uses a long-press selection flow with animated layout changes instead of up/down arrows; it avoids Reanimated/NativeWorklets so Expo Go stays stable, without a persistent instructional hint taking space.
- social feed with expandable reviews and comments;
- social notifications are opened from the profile header bell into a dedicated notifications page; direct-message unread state remains separate in Messages.
- tapping a social notification now marks it as read at click time before opening the destination screen.
- private messages with movie sharing;
- user profile navigation from social areas;
- app settings, including theme mode, notification controls, tutorial replay, and recommendation cache tools;
- push notifications are now requested from Settings instead of automatically at login, to keep the post-login flow stable on iPad;
- in-app account deletion from Settings;
- basic social safety tools: block user, report profile, report review, report conversation, and light text filtering for UGC;
- public support and privacy pages on the web side for App Store / TestFlight references;
- iPhone-only release path for the mobile app (`supportsTablet: false`);
- the mobile iOS config also requires full screen on iPad to avoid compatibility-mode issues during review;
- App Store Connect copy and privacy guidance are maintained in `APP_STORE_CONNECT.md`;
- push notification groundwork;
- TestFlight / EAS build flow.
- backend hardening is now part of the current API work: safer SQLite runtime settings, explicit indexes on hot social/messaging tables, async push delivery, route-level rate limiting, `/healthz` and `/metrics`, Redis-ready realtime fanout, env-driven secrets/API keys, and the live backend now runs on PostgreSQL.
- PostgreSQL migration assets exist in `backend/postgres_schema.sql`, `backend/migrate_sqlite_to_postgres.py`, and `backend/POSTGRES_MIGRATION.md`; the API boots via `DATABASE_URL` / `POSTGRES_URL`, and the first real server cutover has been executed successfully.
- latest audit checkpoint validated the main mobile/API flows with temporary users, cleaned remaining visible French copy issues, and optimized first Tinder poster loading by parallelizing TMDB poster fetches.

The web site remains active and should not be removed while the mobile app is being improved.

## Important Rules

- Commit and push automatically after validated code changes, unless explicitly asked not to.
- Keep `PROJECT_MEMORY.md`, `ROADMAP.md`, `DECISIONS.md`, and `RELEASES.md` up to date as the project evolves.
- Do not remove or break the existing web site while working on mobile.
- Avoid touching the mobile bottom navbar unless the task is specifically about it.
- Keep the mobile interface light on explanatory text.
- Prefer mobile-first UX for the app, but do not degrade the desktop web interface.
- Keep movie detail behavior unified across the app.
- For sensitive AI changes, keep a rollback path in Git.
- If local user changes are present, do not overwrite them without confirmation.
- For App Store work, prefer the simplest first release path: iPhone only, with essential moderation and account deletion in place.

## UX Preferences

- Qulte should feel cinematic, polished, fluid, and social.
- The identity should not feel too generic, too dark by default, or too feminine.
- Prefer icons and compact controls over long labels on mobile.
- Gestures should follow native mobile expectations: pull to refresh, left-edge swipe to go back on full screens, and drag to hide the keyboard when appropriate.
- Avoid duplicated navigation paths where possible.
- Profile should feel like a real social profile, not a stats dashboard.
- App-level controls should live in Settings rather than taking space in the profile identity area.
- Tinder should feel instant, with movies preloaded and no visible waiting.
- Tinder should avoid resurfacing recently shown cards too quickly: recently passed films still use a longer cooldown, and even recently shown Tinder cards now get a short cooldown before being eligible again.
- Conversations should feel like a normal messaging app: fluid send, latest messages visible, clean day separators.
- User-facing French copy in the mobile app should be fully accented, clean, and natural rather than ASCII-only.
- Mobile sessions should feel persistent; backend access tokens are long-lived for app usage rather than daily login.
- First Tinder load should stay as hidden as possible: the app caches/preloads locally, and the backend now fetches recommendation poster URLs in parallel to reduce cold-start waiting.
- Actor detail grids should stretch to the available width instead of leaving visible empty gutters on the "Films marquants" section.
- Playlist manual ordering should feel tactile without adding Expo Go-fragile native dependencies: long-press to select, tap the target position, animated layout movement, no arrow buttons.
- On iPad, the mobile UI should remain centered and constrained instead of stretching key phone-first flows across the full tablet width; Tinder is the most sensitive screen.
- Review detail pages should let the header block stay compact while the review text itself flows below it across the full card width.
- Review detail pages should align the rating badge and like control on the same visual row for a cleaner meta block.

## Known Sensitive Areas

- Mobile bottom navbar and safe-area behavior.
- Movie details screen and its bottom safe-area.
- Tinder recommendation pipeline and preloading.
- Message list scroll behavior.
- Keyboard handling in messages and review creation.
- Account deletion, block/report flows, and support/privacy URLs for App Review.
- Backend scalability hardening: PostgreSQL is now the active database engine for the backend, and Redis-backed realtime still activates only when `REDIS_URL` is configured.
- PostgreSQL cutover sensitivity: keep the SQLite backup available while the new runtime settles, and treat future schema changes with proper migration discipline.
- Rating display consistency between Tinder, movie details, reviews, playlists, and top lists.
- Rating write consistency: rating from Tinder/movie details updates the user's review rating for the same movie, and review creation/update updates the user's movie rating.
- Rating deletion rule: a movie rating cannot be removed if it is linked to an existing review; the user must edit or delete the review first so reviews never become note-less.
- Tinder pass/swipe-left is not a movie rating. It records a mild negative recommendation signal and uses a short cooldown; older passed films may reappear if the algorithm scores them well.
- If a Tinder movie is already rated, swiping left should only skip to the next card and must not record a negative recommendation signal.
- Tinder should not keep showing already rated movies; rated cards must be removed from the local mobile stack/cache and filtered server-side.
- Onboarding signals: movies chosen during onboarding should guide recommendations but should not be proposed back to the user.
- First-run copy should clearly explain the product loop: choose taste signals, swipe/rate films, Qulte adapts, then users can organize, review, follow and message.
- The first onboarding screen should explain the core concept before asking for favorite films: Tinder-like movie cards, swipe/pass/watch-later behavior, star ratings as strong signals, AI adaptation, and social discovery.
- The onboarding film selection step should stay direct and space-efficient because the explanation already lives on the first concept screen.

## Current AI Direction

The recommendation system has moved away from a simple average-user-profile approach.

Current direction:
- recommend movies close to movies the user liked;
- use seed clusters around liked movies;
- use public movie rating as a stronger quality signal;
- preserve some exploration so recommendations do not become repetitive;
- adapt account by account based on each user's behavior;
- onboarding choices should bootstrap recommendations but should not become profile totems automatically.

Important backup:
- `backup-before-global-ai-rollout-2026-05-04` exists before the global AI rollout.

## Current Testing Commands

Mobile typecheck:

```bash
cd /home/wechoose/mobile
npm run typecheck
```

Mobile dev server from a local Mac clone:

```bash
cd ~/Qulte
git pull
cd mobile
npx expo start --tunnel
```

Production web/backend redeploy commands used before:

```bash
systemctl restart wec_back.service
bash /home/wec-front.sh prod
```

Current backend runtime env vars:

```bash
SECRET_KEY=...
TMDB_API_KEY=...
FCM_SERVER_KEY=...
REDIS_URL=redis://...
SQLITE_PATH=/home/wechoose/backend/wechoose.db
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/qulte
```

PostgreSQL cleanup status:
- production runs on PostgreSQL;
- the most sensitive SQLite-specific statements have already been replaced with native PostgreSQL-friendly SQL in the recommendation, ratings, playlists, follows/blocks, and direct-conversation paths.
- `INSERT OR IGNORE`, `INSERT OR REPLACE`, and `rowid DESC` are now fully removed from `backend/main.py`;
- the hottest recommendation and direct-message query paths are now also using backend-aware native placeholders instead of relying on the translator;
- auth/profile helpers, recommendation helpers, push/webpush helpers, notifications, and a large part of the social flows are now also converted off raw SQL `?` placeholders.
- there are no remaining SQL queries in `backend/main.py` that still rely on raw `?` placeholders;
- the only remaining `?` characters in the file are non-SQL ones: URLs, HTML text, route strings, and the `SQL_PARAM` definition;
- the PostgreSQL cursor wrapper now executes native SQL directly without any translation layer;
- the remaining database compatibility surface is only the explicit SQLite legacy path plus backend-aware helpers like `SQL_PARAM`.
- some PostgreSQL `TEXT` values in the current runtime can surface as `bytes`; JSON/text preference loaders now decode DB text defensively before parsing or normalizing.
- a full backend smoke test after the migration passed end-to-end with temporary users: auth, onboarding, profile prefs, Tinder feed, movie details, playlists, ratings, social profile/feed/reviews/comments/likes/notifications, and private messages.
- private messaging realtime is now validated through WebSocket: backend includes `websockets`, the manager uses per-connection send queues, mobile reconnects automatically with heartbeat, and a local end-to-end latency check received `messages.updated` in about 58 ms.
- the mobile inbox now also listens to a shared conversation-update event from the conversation screen, so the conversation list refreshes immediately even when a message is received or sent while a thread is already open.
- users can now save the streaming platforms they own in mobile settings, and the watch-later playlist can filter to movies available on those owned subscription services.
- mobile profile loading now uses `/playlists/previews` instead of fetching every playlist in full; this keeps profiles responsive for accounts with very large watch-later playlists, such as `@random`.
- playlist details now load progressively through `/playlists/{playlist_id}/paged`, so very large playlists no longer need to fetch every movie before the screen becomes usable.

## How To Resume Work

When starting a new conversation or after context compaction:
- read this file first;
- treat these memory files as shared source-of-truth documents and update them when the project changes;
- check `git status --short`;
- inspect recent commits with `git log --oneline -10`;
- update this memory when project-level decisions change.
