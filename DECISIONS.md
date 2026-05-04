# Qulte - Decisions

Last updated: 2026-05-04

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

