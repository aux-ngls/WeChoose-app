# Guide de Configuration de l'API URL

## Pourquoi 127.0.0.1 ne fonctionne pas toujours ?

### Qu'est-ce que 127.0.0.1 ?

`127.0.0.1` (aussi appelé `localhost`) est une adresse IP spéciale qui signifie "cette machine-ci". Quand votre navigateur essaie d'accéder à `http://127.0.0.1:8000`, il cherche un serveur sur **votre propre ordinateur**.

### Le problème en production

Quand vous déployez votre application (sur Render, Vercel, etc.) :

```
Votre PC                          Serveur Render (Frontend)
+-----------+                     +---------------------+
| Navigateur| ----requête---->    | Next.js             |
+-----------+                     | cherche 127.0.0.1   |
                                  | = lui-même          |
                                  | = ERREUR !          |
                                  +---------------------+
```

Le frontend déployé sur Render essaie de contacter `127.0.0.1`, mais ce n'est plus votre PC - c'est le serveur Render lui-même, où le backend n'existe pas !

### La solution : utiliser des variables d'environnement

On définit l'URL de l'API différemment selon l'environnement :

| Environnement | API URL |
|---------------|---------|
| Développement (votre PC) | `http://127.0.0.1:8000` |
| Production (Render) | `https://votre-backend.onrender.com` |

---

## Comment configurer les variables d'environnement

### Structure des fichiers

```
frontend/
├── .env.local          # Vos valeurs locales (NON commité)
├── .env.example        # Template de référence (commité)
└── config.ts           # Lecture des variables
```

### Étape 1 : Créer .env.local (développement)

Créez le fichier `frontend/.env.local` :

```bash
# URL de l'API en développement (votre backend local)
NEXT_PUBLIC_DEV_API_URL=http://127.0.0.1:8000

# URL de l'API en production (laisser vide ou mettre l'URL de prod pour tester)
NEXT_PUBLIC_API_URL=https://votre-backend.onrender.com
```

### Étape 2 : Comprendre config.ts

```typescript
const isDev = process.env.NODE_ENV === "development";

export const API_URL = (isDev
  ? process.env.NEXT_PUBLIC_DEV_API_URL    // En dev : localhost
  : process.env.NEXT_PUBLIC_API_URL);       // En prod : URL Render
```

**Comment ça marche :**
- `npm run dev` → `NODE_ENV = "development"` → utilise `NEXT_PUBLIC_DEV_API_URL`
- `npm run build` → `NODE_ENV = "production"` → utilise `NEXT_PUBLIC_API_URL`

### Étape 3 : Configurer la production (Render)

Sur Render, ajoutez la variable d'environnement dans les paramètres :

1. Allez dans votre service frontend sur Render
2. Cliquez sur "Environment"
3. Ajoutez :
   - **Key:** `NEXT_PUBLIC_API_URL`
   - **Value:** `https://votre-backend.onrender.com`

---

## Pourquoi NEXT_PUBLIC_ ?

Next.js a une règle de sécurité : seules les variables préfixées par `NEXT_PUBLIC_` sont accessibles dans le navigateur.

```typescript
// Accessible dans le navigateur
process.env.NEXT_PUBLIC_API_URL  // ✓ Fonctionne

// NON accessible dans le navigateur (undefined)
process.env.API_URL              // ✗ Sera undefined
process.env.SECRET_KEY           // ✗ Sera undefined (et c'est voulu pour les secrets !)
```

---

## Résumé

1. **Ne jamais coder en dur** `127.0.0.1` dans le code
2. **Utiliser des variables d'environnement** pour chaque environnement
3. **Préfixer avec `NEXT_PUBLIC_`** pour les variables côté client
4. **Créer `.env.local`** pour le développement local
5. **Configurer les variables** sur votre hébergeur pour la production

---

## Dépannage

### "API_URL is undefined"
- Vérifiez que la variable est préfixée par `NEXT_PUBLIC_`
- Redémarrez le serveur Next.js (`npm run dev`)

### "Failed to fetch" ou "Connection refused"
- Vérifiez que votre backend est lancé
- Vérifiez que l'URL dans `.env.local` est correcte
- Vérifiez que le port correspond (8000 par défaut)

### Les changements de .env.local ne sont pas pris en compte
- Redémarrez toujours le serveur après avoir modifié `.env.local`
