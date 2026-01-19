import pandas as pd
import pickle
import os
import requests

print("🔧 DÉMARRAGE DE LA RÉPARATION AUTOMATIQUE...")

# URL de secours fiable pour le fichier movies (contenant les images)
BACKUP_URL = "https://raw.githubusercontent.com/codeherder/dataset/master/tmdb_5000_movies.csv"

def repair_dataset():
    # 1. Vérification du fichier movies.csv actuel
    need_download = False
    if not os.path.exists("tmdb_5000_movies.csv"):
        print("❌ Fichier movies.csv manquant.")
        need_download = True
    else:
        try:
            df_check = pd.read_csv("tmdb_5000_movies.csv", nrows=5)
            if 'poster_path' not in df_check.columns:
                print("⚠️ Le fichier actuel est corrompu (colonne image supprimée par un ancien script).")
                need_download = True
            else:
                print("✅ Le fichier CSV semble correct.")
        except:
            need_download = True

    # 2. Téléchargement automatique si nécessaire
    if need_download:
        print("⬇️ Téléchargement automatique de la version originale complète...")
        try:
            response = requests.get(BACKUP_URL)
            if response.status_code == 200:
                with open("tmdb_5000_movies.csv", 'wb') as f:
                    f.write(response.content)
                print("✅ Fichier restauré avec succès !")
            else:
                print("❌ Erreur de téléchargement. Vérifie ta connexion internet.")
                return
        except Exception as e:
            print(f"❌ Erreur critique : {e}")
            return

    # 3. Reconstruction du fichier movies.pkl (Le Cerveau)
    print("🧠 Reconstruction de la base de données (movies.pkl)...")
    try:
        movies = pd.read_csv('tmdb_5000_movies.csv')
        credits = pd.read_csv('tmdb_5000_credits.csv')

        # Fusion
        movies = movies.rename(columns={'id': 'movie_id'})
        movies = movies.merge(credits, on='title')

        # Sélection des colonnes VITALES (dont l'image)
        movies = movies[['movie_id', 'title', 'overview', 'genres', 'keywords', 'cast', 'crew', 'vote_average', 'release_date', 'poster_path']]
        
        # Création des mots-clés pour l'IA
        movies['soup'] = (movies['overview'].fillna('') + ' ' + movies['genres'].fillna('') + ' ' + movies['keywords'].fillna(''))
        
        # Sauvegarde
        pickle.dump(movies, open('movies.pkl', 'wb'))
        print("🎉 RÉPARATION TERMINÉE ! Les images sont de retour.")
        
    except Exception as e:
        print(f"❌ Erreur lors de la reconstruction : {e}")

if __name__ == "__main__":
    repair_dataset()