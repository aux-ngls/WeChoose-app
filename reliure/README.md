# Reliure

Reliure est une application mobile Expo independante inspiree de Qulte, adaptee aux livres.

## Fonctionnalites

- Onboarding initial avec pseudo, genres favoris et premiers livres.
- Decouverte de livres avec une pile de cartes swipeable.
- Ajout aux etageres: a lire, en cours, lus, favoris.
- Notes locales avec profil de gouts.
- Recherche Open Library sans cle API.
- Stockage local avec AsyncStorage.
- Compatible Expo Go, Android export et web Expo.

## Lancer l'application

```bash
npm install
npm start -- --port 8082
```

Expo affiche ensuite un QR code a scanner avec Expo Go.

Pour lancer dans un navigateur via Expo:

```bash
npm run web
```

## Workflow de mise a jour

Le plus simple:

```bash
cd ~/reliure
npm run dev:auto
```

`dev:auto` essaie le tunnel Expo. Si ngrok plante, il relance automatiquement en LAN.

Tu peux aussi double-cliquer sur:

```bash
Lancer Reliure.command
```

Pour installer ou remettre les dependances:

```bash
cd ~/reliure
npm run install:update
```

ou double-cliquer sur:

```bash
Mettre a jour Reliure.command
```

Si tu veux garder le fonctionnement a deux terminaux:

Terminal 1, tu laisses Expo tourner:

```bash
cd ~/reliure
npm run dev:auto
```

Si le tunnel ngrok tombe ou affiche une erreur, utilise le mode LAN:

```bash
cd ~/reliure
npm run dev:lan
```

Si le tunnel garde un mauvais cache:

```bash
cd ~/reliure
npm run dev:tunnel:clear
```

Terminal 2, tu appliques les mises a jour:

```bash
cd ~/reliure
npm run update
```

`npm run update` fait automatiquement:

- `git pull --ff-only` si le dossier Reliure est un repo Git.
- `npm install`
- `npm run typecheck`

Si Reliure vient d'une archive `.tar.gz`, remplace d'abord le dossier par la nouvelle archive, puis lance `npm run update`.

## Generer une archive de mise a jour

```bash
npm run release
```

La commande cree une archive versionnee et une copie `reliure-mobile-latest.tar.gz` dans le dossier parent.
