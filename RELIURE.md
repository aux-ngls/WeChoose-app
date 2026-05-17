# Reliure

Reliure est l'application livres, independante de Qulte mais versionnee dans ce depot pour profiter du meme workflow de mise a jour.

La version actuelle repart de la structure Qulte:

- `reliure/mobile`
- `reliure/backend`

## Lancement quotidien

Terminal 1:

```bash
cd ~/Qulte/reliure/mobile
npm run dev:auto
```

`dev:auto` essaie Expo en tunnel. Si ngrok echoue, il relance automatiquement en LAN.

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
npm run dev:auto
```
