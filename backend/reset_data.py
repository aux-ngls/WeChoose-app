import pandas as pd
import pickle

print("♻️ RECONSTRUCTION TOTALE DE LA BASE DE DONNÉES...")

try:
    # 1. Chargement des fichiers CSV (Les nouveaux que tu as téléchargés)
    print("📂 Lecture des fichiers CSV...")
    movies = pd.read_csv('tmdb_5000_movies.csv')
    credits = pd.read_csv('tmdb_5000_credits.csv')

    # 2. Vérification immédiate de la colonne IMAGE
    if 'poster_path' in movies.columns:
        print("✅ SUCCÈS : La colonne 'poster_path' (Images) est bien présente !")
    else:
        print("❌ ERREUR : Le fichier CSV est toujours incomplet. As-tu bien fait 'Remplacer' ?")
        exit()

    # 3. Fusion et Nettoyage
    movies = movies.rename(columns={'id': 'movie_id'})
    movies = movies.merge(credits, on='title')

    # On garde les colonnes vitales
    movies = movies[['movie_id', 'title', 'overview', 'genres', 'keywords', 'cast', 'crew', 'vote_average', 'release_date', 'poster_path']]
    
    movies.dropna(inplace=True)

    # 4. Création de la 'Soup' pour l'IA
    movies['soup'] = movies['overview'] + ' ' + movies['genres'] + ' ' + movies['keywords']

    # 5. Sauvegarde
    pickle.dump(movies, open('movies.pkl', 'wb'))
    print(f"💾 Fichier 'movies.pkl' généré avec {len(movies)} films complets.")
    print("🎉 TOUT EST RÉPARÉ. Tu peux relancer le serveur !")

except FileNotFoundError:
    print("❌ ERREUR : Je ne trouve pas les fichiers CSV dans le dossier backend.")
except Exception as e:
    print(f"❌ ERREUR : {e}")