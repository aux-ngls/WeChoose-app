# Reliure

Reliure est le fork livres de Qulte. Contrairement au premier prototype, cette version reprend la structure de Qulte autant que possible:

- `mobile/`: app Expo/React Native derivee de `mobile/`.
- `backend/`: API FastAPI derivee de `backend/`.

## Lancement mobile

Terminal 1:

```bash
cd ~/Qulte/reliure/mobile
npm run dev:auto
```

`dev:auto` tente le tunnel Expo puis bascule automatiquement en LAN si ngrok echoue.

Terminal 2, pour recuperer les mises a jour:

```bash
cd ~/Qulte/reliure/mobile
npm run update
```

## Backend local

```bash
cd ~/Qulte/reliure
npm run backend
```

Puis lance le mobile avec:

```bash
cd ~/Qulte/reliure/mobile
EXPO_PUBLIC_API_URL=http://ADRESSE_IP_DU_MAC:8092 npm run dev:auto
```

## Etat de migration

Cette base est volontairement un fork structurel de Qulte. La prochaine etape consiste a remplacer les donnees et endpoints cinema par le domaine livre en gardant les memes contrats autant que possible.
