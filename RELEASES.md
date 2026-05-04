# Qulte - Releases And Stable Points

Last updated: 2026-05-04

## Current Stable State

Commit: `be9c7a9`

Summary:
- removed the bottom safe-area strip globally in the mobile app;
- validated with `npm run typecheck`;
- pushed to `origin/main`.

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

