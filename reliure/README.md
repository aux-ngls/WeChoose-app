# Reliure

Reliure est le fork livres de Qulte. Contrairement au premier prototype, cette version reprend la structure de Qulte autant que possible:

- `mobile/`: app Expo/React Native derivee de `mobile/`.
- `backend/`: API FastAPI derivee de `backend/`.

## Lancement mobile

Terminal 1:

```bash
cd ~/Qulte/reliure/mobile
npm start
```

`npm start` lance Expo comme Qulte. L'app pointe par defaut vers l'API en ligne:

```bash
https://api.wechoose.dury.dev/reliure
```

Terminal 2, pour recuperer les mises a jour:

```bash
cd ~/Qulte/reliure/mobile
npm run update
```

## Backend local optionnel

Le backend local reste disponible si on veut tester une modification API avant de la publier:

```bash
cd ~/Qulte/reliure/mobile
npm run dev:local
```

## Etat de migration

Cette base est volontairement un fork structurel de Qulte. La prochaine etape consiste a remplacer les donnees et endpoints cinema par le domaine livre en gardant les memes contrats autant que possible.
