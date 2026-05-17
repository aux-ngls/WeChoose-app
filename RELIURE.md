# Reliure

Reliure est l'application livres, independante de Qulte mais versionnee dans ce depot pour profiter du meme workflow de mise a jour.

La version actuelle repart de la structure Qulte:

- `reliure/mobile`
- `reliure/backend`

## Lancement quotidien

Terminal 1:

```bash
cd ~/Qulte/reliure/mobile
npm start
```

`npm start` lance Expo comme Qulte. L'app pointe par defaut vers l'API en ligne:

```bash
https://api.wechoose.dury.dev/reliure
```

Terminal 2, quand il y a des mises a jour:

```bash
cd ~/Qulte/reliure/mobile
npm run update
```

Cette commande fait:

- `git pull --ff-only` depuis le depot Qulte
- `npm install`
- `npm run typecheck`

## Premiere installation apres `git pull`

```bash
cd ~/Qulte/reliure/mobile
npm install
npm start
```

## Backend local optionnel

Le backend local reste disponible si on veut tester une modification API avant de la publier:

```bash
cd ~/Qulte/reliure/mobile
npm run dev:local
```
