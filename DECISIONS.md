# Qulte - Decisions

Last updated: 2026-05-05

## Maintenance Rule

This file must be updated whenever we make, confirm, or reverse an important product, UX, architecture, deployment, or workflow decision.

It is part of the shared project memory and should remain consistent with `PROJECT_MEMORY.md`, `ROADMAP.md`, and `RELEASES.md` so future conversations inherit the same reasoning.

## Keep Web And Mobile

Decision: keep the current web site and the React Native mobile app in parallel.

Reason:
- the web site is already functional;
- the mobile app is the target for iPhone/TestFlight;
- keeping both avoids losing a working product while the app matures.

## React Native / Expo For Mobile

Decision: build the mobile app with React Native / Expo rather than only wrapping the web site with Capacitor.

Reason:
- better long-term native mobile UX;
- smoother gestures, navigation, messaging, and media behavior;
- TestFlight and EAS are already configured.

## Git As Source Of Truth

Decision: use Git commits and tags as rollback points.

Reason:
- the project moves quickly;
- experiments, especially AI changes, need safe rollback;
- code can be restored fully from commits, not only from individual patches.

## Written Project Memory

Decision: keep project memory in Markdown files at the repository root.

Reason:
- context compaction can lose details;
- new conversations need fast project recovery;
- Git stores both the code and the project intent.
- these files must be actively maintained as the project evolves.

## AI Rollout

Decision: test sensitive AI changes on the `test` account first, then roll out globally after validation.

Reason:
- recommendation changes can affect the whole product feel;
- user-specific adaptation must remain account-by-account;
- rollback must stay easy.

Current backup before global rollout:
- `backup-before-global-ai-rollout-2026-05-04`

## Bottom Safe-Area Strip

Decision: remove the bottom safe-area edge from the shared mobile `AppScreen` by default.

Reason:
- the bottom safe-area created a visible strip at the bottom of screens;
- the same behavior was first validated on the movie detail screen;
- the navbar itself should not be modified for this issue.

## UX Text Density

Decision: keep explanatory text minimal in the app.

Reason:
- the user prefers compact, intuitive mobile screens;
- long descriptions make the app feel heavy;
- icons, spacing, and clear actions should carry the interface.

## Natural Mobile Gestures

Decision: prefer native-feeling gestures over button-heavy interactions when the action is obvious and standard on mobile.

Reason:
- the app should feel like a phone app, not a compressed web flow;
- pull-to-refresh is more natural than adding explicit refresh buttons on live screens;
- left-edge swipe is preferred for leaving full-screen stack flows such as movie details, playlists, profiles, settings, and conversations;
- custom gestures should be added only when they clearly improve the native feel;
- keyboard dismissal on drag reduces friction in search and messaging flows.

## Profile Vs Settings

Decision: keep profile editing actions lightweight in the profile header, and move broader app preferences into Settings.

Reason:
- the profile should stay focused on identity, films, playlists, and reviews;
- save/edit actions feel better in the same top action slot than in a detached bottom button;
- app-wide controls such as theme, notifications, tutorial replay, and cache tools belong in Settings.

## French Mobile Copy Quality

Decision: keep the mobile app's French copy fully accented and corrected across user-facing strings.

Reason:
- missing accents and ASCII-only copy make the app feel unfinished;
- Qulte needs polished, natural French on visible labels, messages, and onboarding flows;
- copy cleanup should be maintained over time, not only as a one-off pass.

## iPhone-Only First Release

Decision: simplify the first App Store release path by targeting iPhone only.

Reason:
- it avoids extra iPad layout and screenshot work before the product is fully stabilized;
- it keeps the first public mobile scope smaller and easier to validate;
- Expo configuration now uses `ios.supportsTablet: false`.

## App Review Safety Baseline

Decision: add the minimum viable trust-and-safety layer before wider iOS publication.

Reason:
- Qulte contains user-generated content: reviews, comments, profiles, and private messages;
- Apple review expects account deletion and basic moderation/reporting capabilities;
- the current baseline is: in-app account deletion, block user, report profile, report review, report conversation, and light objectionable-text filtering on UGC creation.
