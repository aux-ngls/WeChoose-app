# Qulte - Project Memory

Last updated: 2026-05-04
Current branch: main
Current stable commit: be9c7a9

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
- authentication and first-run onboarding;
- movie Tinder / swipe recommendations;
- profile page with profile picture, description, favorite identity content, playlists, and user reviews;
- movie detail sheet used consistently when opening a movie;
- ratings with half-star precision;
- playlists, custom playlist creation, adding movies to playlists, and removing movies;
- social feed with expandable reviews and comments;
- private messages with movie sharing;
- user profile navigation from social areas;
- app settings, including theme mode;
- push notification groundwork;
- TestFlight / EAS build flow.

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

## UX Preferences

- Qulte should feel cinematic, polished, fluid, and social.
- The identity should not feel too generic, too dark by default, or too feminine.
- Prefer icons and compact controls over long labels on mobile.
- Avoid duplicated navigation paths where possible.
- Profile should feel like a real social profile, not a stats dashboard.
- Tinder should feel instant, with movies preloaded and no visible waiting.
- Conversations should feel like a normal messaging app: fluid send, latest messages visible, clean day separators.

## Known Sensitive Areas

- Mobile bottom navbar and safe-area behavior.
- Movie details screen and its bottom safe-area.
- Tinder recommendation pipeline and preloading.
- Message list scroll behavior.
- Keyboard handling in messages and review creation.
- Rating display consistency between Tinder, movie details, reviews, playlists, and top lists.
- Onboarding signals: movies chosen during onboarding should guide recommendations but should not be proposed back to the user.

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

## How To Resume Work

When starting a new conversation or after context compaction:
- read this file first;
- treat these memory files as shared source-of-truth documents and update them when the project changes;
- check `git status --short`;
- inspect recent commits with `git log --oneline -10`;
- update this memory when project-level decisions change.
