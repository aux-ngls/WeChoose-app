import pandas as pd

print("🕵️‍♂️ ANALYSE DES FICHIERS CSV...\n")

try:
    # 1. Analyse de MOVIES
    print("📂 Lecture de 'tmdb_5000_movies.csv'...")
    movies = pd.read_csv('tmdb_5000_movies.csv')
    print(f"   -> Nombre de lignes : {len(movies)}")
    print(f"   -> Colonnes trouvées : {movies.columns.tolist()}")
    
    if 'poster_path' in movies.columns:
        print("   ✅ La colonne 'poster_path' est bien là !")
    else:
        print("   ❌ ALERTE : La colonne 'poster_path' est MANQUANTE ici !")

    print("-" * 30)

    # 2. Analyse de CREDITS
    print("📂 Lecture de 'tmdb_5000_credits.csv'...")
    credits = pd.read_csv('tmdb_5000_credits.csv')
    print(f"   -> Colonnes trouvées : {credits.columns.tolist()}")

except FileNotFoundError:
    print("❌ ERREUR : Un des fichiers CSV est introuvable dans le dossier backend.")
except Exception as e:
    print(f"❌ ERREUR : {e}")