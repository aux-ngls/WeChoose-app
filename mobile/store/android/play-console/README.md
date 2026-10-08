# Éléments Google Play

Fichiers prêts à importer dans la fiche Play Store de Qulte.

## Icône de l'application

- `app-icon-512.png`
- PNG, 512 x 512 px
- À importer dans **Icône de l'application**

## Image de présentation

- `feature-graphic-1024x500.png`
- PNG, 1 024 x 500 px
- À importer dans **Image de présentation**

## Captures d'écran pour téléphone

Importer, dans cet ordre, tous les fichiers du dossier `phone-screenshots/` :

1. `01-recommandations.png`
2. `02-playlists.png`
3. `03-social.png`
4. `04-groupe.png`

Chaque capture est un PNG portrait de 1 080 x 1 920 px.

## Vidéo

La vidéo est facultative. Laisser ce champ vide tant qu'aucune vidéo YouTube officielle de Qulte n'est disponible.

## Régénération

Depuis la racine du dépôt :

```bash
node mobile/store/android/generate-play-assets.js
```
