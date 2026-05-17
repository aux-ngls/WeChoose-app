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

`npm start` lance automatiquement le backend Reliure local, configure l'URL API pour le telephone, puis demarre Expo en LAN sur le port 8082.

Terminal 2, pour recuperer les mises a jour:

```bash
cd ~/Qulte/reliure/mobile
npm run update
```

## Backend local

Si tu veux lancer le backend a part, tu peux encore utiliser:

```bash
cd ~/Qulte/reliure
npm run backend
```

## Etat de migration

Cette base est volontairement un fork structurel de Qulte. La prochaine etape consiste a remplacer les donnees et endpoints cinema par le domaine livre en gardant les memes contrats autant que possible.
