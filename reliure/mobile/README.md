# Qulte Mobile

Base React Native/Expo du projet Qulte, developpee en parallele du site web existant.

## Lancer l'app

```bash
cd /home/wechoose/mobile
npm install
npm run start
```

Puis :

- `a` pour Android
- `i` pour iPhone (macOS requis pour le simulateur iOS natif)
- ou scanner le QR code avec `Expo Go`

## Configuration API

Par defaut, l'app pointe vers :

- `https://api.wechoose.dury.dev`

Tu peux surcharger l'URL avec :

```bash
EXPO_PUBLIC_API_URL=https://api.wechoose.dury.dev npm run start
```

## Ce qui est deja porte

- auth mobile (login / signup)
- onboarding de base
- shell de navigation mobile
- accueil branche au feed de recommandations
- recherche film
- feed social simple
- inbox simple
- profil perso simple

## Ce qu'il reste a porter

- fiche film complete
- vraie messagerie avec fil detaille
- playlists detaillees
- interaction sociale complete
- notifications natives
- design system mobile avance
