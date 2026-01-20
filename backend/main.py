import sqlite3
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import pickle
import requests
import numpy as np
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from pydantic import BaseModel

TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8"
app = FastAPI(title="WeChoose API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "https://wechoose.dury.dev",
        "https://api.wechoose.dury.dev"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 1. INITIALISATION BDD ---
def init_db():
    conn = sqlite3.connect('wechoose.db')
    cursor = conn.cursor()
    cursor.execute('''CREATE TABLE IF NOT EXISTS user_ratings (movie_id INTEGER PRIMARY KEY, rating INTEGER, title TEXT, poster_url TEXT, added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS playlists (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS playlist_items (playlist_id INTEGER, movie_id INTEGER, title TEXT, poster_url TEXT, rating REAL, UNIQUE(playlist_id, movie_id))''')
    cursor.execute("INSERT OR IGNORE INTO playlists (id, name) VALUES (1, 'À regarder plus tard')")
    conn.commit()
    conn.close()

init_db()

# --- 2. IA ---
print("⏳ Chargement IA...")
try:
    movies_df = pickle.load(open("movies.pkl", "rb"))

    #print(movies_df.columns, movies_df['id'])
    
    # Prétraitement pour éviter les bugs si des notes manquent
    movies_df['vote_average'] = movies_df['vote_average'].fillna(5.0) 
    
    cv = CountVectorizer(max_features=5000, stop_words='english')
    vectors = cv.fit_transform(movies_df['soup']).toarray()
    print("✅ IA Prête !")
except Exception as ex:
    print(ex)

    movies_df = pd.DataFrame()
    vectors = None

# --- 3. OUTILS ---
def fetch_poster_from_tmdb(movie_id):
    try:
        url = f"https://api.themoviedb.org/3/movie/{movie_id}?api_key={TMDB_API_KEY}&language=fr-FR"
        data = requests.get(url, timeout=1).json()
        return "https://image.tmdb.org/t/p/w500" + data.get('poster_path') if data.get('poster_path') else "https://via.placeholder.com/500"
    except: return "https://via.placeholder.com/500"

def get_tmdb_details(movie_id):
    try:
        url = f"https://api.themoviedb.org/3/movie/{movie_id}?api_key={TMDB_API_KEY}&language=fr-FR&append_to_response=videos,credits"
        data = requests.get(url).json()
        trailer = next((f"https://www.youtube.com/embed/{v['key']}" for v in data.get('videos', {}).get('results', []) if v['site']=='YouTube' and v['type']=='Trailer'), None)
        cast = [{"name": a['name'], "character": a['character'], "photo": f"https://image.tmdb.org/t/p/w200{a['profile_path']}" if a.get('profile_path') else None} for a in data.get('credits', {}).get('cast', [])[:5]]
        return {"id": data['id'], "title": data['title'], "overview": data['overview'], "rating": data['vote_average'], "poster_url": "https://image.tmdb.org/t/p/w500"+data.get('poster_path','') if data.get('poster_path') else "", "trailer_url": trailer, "cast": cast, "release_date": data.get('release_date', '').split('-')[0]}
    except: return None

# --- 4. PLAYLISTS & RATINGS ---
class PlaylistCreate(BaseModel):
    name: str

@app.get("/playlists")
def get_all_playlists():
    conn = sqlite3.connect('wechoose.db')
    cursor = conn.cursor()
    cursor.execute("SELECT id, name FROM playlists")
    custom = [{"id": row[0], "name": row[1], "type": "custom"} for row in cursor.fetchall()]
    conn.close()
    return [{"id": -1, "name": "⭐ Mes Tops (4-5★)", "type": "system"}, {"id": -2, "name": "👁️ Historique", "type": "system"}] + custom

@app.post("/playlists/create")
def create_playlist(p: PlaylistCreate):
    conn = sqlite3.connect('wechoose.db')
    cursor = conn.cursor()
    cursor.execute("INSERT INTO playlists (name) VALUES (?)", (p.name,))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return {"id": new_id, "name": p.name}

@app.get("/playlists/{playlist_id}")
def get_playlist_content(playlist_id: int):
    conn = sqlite3.connect('wechoose.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    if playlist_id == -1: cursor.execute("SELECT movie_id as id, title, poster_url, rating FROM user_ratings WHERE rating >= 4 ORDER BY added_at DESC")
    elif playlist_id == -2: cursor.execute("SELECT movie_id as id, title, poster_url, rating FROM user_ratings ORDER BY added_at DESC")
    else: cursor.execute("SELECT movie_id as id, title, poster_url, rating FROM playlist_items WHERE playlist_id = ? ORDER BY rowid DESC", (playlist_id,))
    movies = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return movies

@app.post("/playlists/{playlist_id}/add/{movie_id}")
def add_to_specific_playlist(playlist_id: int, movie_id: int):
    if playlist_id < 0: return {"error": "Système"}
    info = get_tmdb_details(movie_id)
    if info:
        conn = sqlite3.connect('wechoose.db')
        cursor = conn.cursor()
        try: cursor.execute("INSERT INTO playlist_items (playlist_id, movie_id, title, poster_url, rating) VALUES (?, ?, ?, ?, ?)", (playlist_id, info['id'], info['title'], info['poster_url'], info['rating'])); conn.commit()
        except: pass
        conn.close()
    return {"status": "added"}

@app.post("/movies/rate/{movie_id}/{rating}")
def rate_movie(movie_id: int, rating: int):
    conn = sqlite3.connect('wechoose.db')
    cursor = conn.cursor()
    movie_row = movies_df[movies_df['id'] == movie_id]
    title = str(movie_row.iloc[0]['title']) if not movie_row.empty else "Inconnu"
    poster = fetch_poster_from_tmdb(movie_id)
    cursor.execute("INSERT OR REPLACE INTO user_ratings (movie_id, rating, title, poster_url) VALUES (?, ?, ?, ?)", (movie_id, rating, title, poster))
    conn.commit()
    conn.close()
    return {"status": "rated"}

# --- 5. NOUVELLE IA : SIMILARITÉ + QUALITÉ ---
@app.get("/movies/feed")
def get_movie_feed(limit: int = 10):
    conn = sqlite3.connect('wechoose.db')
    cursor = conn.cursor()
    
    # Filtres (On ne veut pas revoir les films déjà traités)
    cursor.execute("SELECT movie_id FROM user_ratings")
    seen_ids = set([row[0] for row in cursor.fetchall()])
    cursor.execute("SELECT movie_id FROM playlist_items")
    in_playlist_ids = set([row[0] for row in cursor.fetchall()])
    exclude_ids = seen_ids.union(in_playlist_ids)
    
    # On récupère les films qu'on a bien notés (4 ou 5 étoiles)
    cursor.execute("SELECT movie_id FROM user_ratings WHERE rating >= 4")
    liked_ids = [row[0] for row in cursor.fetchall()]
    conn.close()
    
    recommendations = []
    
    if liked_ids and vectors is not None:
        try:
            liked_indices = movies_df[movies_df['id'].isin(liked_ids)].index
            
            if len(liked_indices) > 0:
                liked_vectors = vectors[liked_indices]
                
                # 1. Calcul de SIMILARITÉ (0 à 1)
                # Max-Pooling : On cherche la ressemblance max avec UN des films likés
                sim_matrix = cosine_similarity(vectors, liked_vectors)
                best_similarity_scores = np.max(sim_matrix, axis=1)
                
                # 2. Récupération des NOTES (0 à 10)
                # On normalise les notes pour qu'elles soient entre 0 et 1 (comme la similarité)
                raw_ratings = movies_df['vote_average'].values
                normalized_ratings = raw_ratings / 10.0
                
                # 3. SCORE HYBRIDE
                # Formule : 70% Similarité + 30% Qualité
                # Cela booste les bons films tout en restant dans le thème
                hybrid_scores = (best_similarity_scores * 0.7) + (normalized_ratings * 0.3)
                
                # 4. Tri par ce score hybride
                indices = np.argsort(hybrid_scores)[::-1]
                
                count = 0
                for idx in indices:
                    row = movies_df.iloc[idx]
                    if int(row['id']) not in exclude_ids:
                        recommendations.append(row)
                        count += 1
                        if count >= limit: break
                        
        except Exception as e: 
            print(f"Erreur IA: {e}")
        
    # Fallback Aléatoire (Mais on privilégie quand même les bons films > 6/10)
    if len(recommendations) < limit:
        # On filtre d'abord ceux qu'on n'a pas vus
        #avail = movies_df[~movies_df['id'].isin(exclude_ids)]
        
        mask = movies_df['id'].isin(exclude_ids)
        print(mask)
        avail = movies_df[~mask]
        # On essaie de prendre ceux qui ont une note correcte (> 6)
        avail_good = avail[avail['vote_average'] > 6.0]
        
        # Si on a assez de bons films, on pioche dedans, sinon on prend tout
        pool = avail_good if not avail_good.empty else avail
        
        if not pool.empty:
            needed = limit - len(recommendations)
            recommendations.extend([row for _, row in pool.sample(n=min(needed, len(pool))).iterrows()])

    return [{"id": int(r['id']), "title": str(r['title']), "poster_url": fetch_poster_from_tmdb(int(r['id'])), "rating": float(r['vote_average'])} for r in recommendations]

# Endpoints standard
@app.get("/search")
def search(query: str):
    url = f"https://api.themoviedb.org/3/search/movie?api_key={TMDB_API_KEY}&language=fr-FR&query={query}"
    res = requests.get(url).json().get('results', [])[:10]
    return [{"id": m['id'], "title": m['title'], "poster_url": "https://image.tmdb.org/t/p/w500"+m['poster_path'] if m.get('poster_path') else "", "rating": m['vote_average']} for m in res]

@app.get("/movie/{id}")
def movie_detail(id: int):
    return get_tmdb_details(id)

@app.get("/movies/news")
def news():
    url = f"https://api.themoviedb.org/3/movie/now_playing?api_key={TMDB_API_KEY}&language=fr-FR&page=1"
    res = requests.get(url).json().get('results', [])[:10]
    return [{"id": m['id'], "title": m['title'], "poster_url": "https://image.tmdb.org/t/p/w500"+m.get('poster_path', ""), "rating": m['vote_average'], "overview": m['overview']} for m in res]

@app.post("/movies/dislike/{movie_id}")
def dislike_movie(movie_id: int):
    return rate_movie(movie_id, 1)