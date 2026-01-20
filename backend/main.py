import sqlite3
import datetime
from typing import Optional
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
import pandas as pd
import pickle
import requests
import numpy as np
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from pydantic import BaseModel
from passlib.context import CryptContext
from jose import JWTError, jwt

# --- CONFIGURATION SÉCURITÉ ---
SECRET_KEY = "votre_super_cle_secrete_a_changer_en_prod"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 # 24 heures

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

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
    
    # Table USERS
    cursor.execute('''CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT, 
                        username TEXT UNIQUE, 
                        password_hash TEXT)''')
    
    # Table USER_RATINGS (PK composite)
    cursor.execute('''CREATE TABLE IF NOT EXISTS user_ratings (
                        user_id INTEGER,
                        movie_id INTEGER, 
                        rating INTEGER, 
                        title TEXT, 
                        poster_url TEXT, 
                        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (user_id, movie_id))''')

    # Table PLAYLISTS
    cursor.execute('''CREATE TABLE IF NOT EXISTS playlists (
                        id INTEGER PRIMARY KEY AUTOINCREMENT, 
                        user_id INTEGER,
                        name TEXT)''')

    # Table PLAYLIST_ITEMS
    cursor.execute('''CREATE TABLE IF NOT EXISTS playlist_items (
                        playlist_id INTEGER, 
                        movie_id INTEGER, 
                        title TEXT, 
                        poster_url TEXT, 
                        rating REAL, 
                        UNIQUE(playlist_id, movie_id))''')
    
    conn.commit()
    conn.close()

init_db()

# --- 2. IA ---
print("⏳ Chargement IA...")
try:
    movies_df = pickle.load(open("movies.pkl", "rb"))
    movies_df['vote_average'] = movies_df['vote_average'].fillna(5.0) 
    cv = CountVectorizer(max_features=5000, stop_words='english')
    vectors = cv.fit_transform(movies_df['soup']).toarray()
    print("✅ IA Prête !")
except Exception as ex:
    print(f"Erreur IA (ou démarrage sans modèle): {ex}")
    movies_df = pd.DataFrame()
    vectors = None

# --- 3. OUTILS AUTHENTIFICATION ---
class UserCreate(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(status_code=401, detail="Non autorisé", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None: raise credentials_exception
    except JWTError: raise credentials_exception
    
    conn = sqlite3.connect('wechoose.db')
    cursor = conn.cursor()
    cursor.execute("SELECT id, username FROM users WHERE username = ?", (username,))
    user = cursor.fetchone()
    conn.close()
    if user is None: raise credentials_exception
    return {"id": user[0], "username": user[1]}

# --- 4. ROUTES AUTH ---
@app.post("/auth/signup", response_model=Token)
def signup(user: UserCreate):
    conn = sqlite3.connect('wechoose.db')
    cursor = conn.cursor()
    try:
        hashed_pw = get_password_hash(user.password)
        cursor.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", (user.username, hashed_pw))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Ce nom d'utilisateur existe déjà")
    
    conn.close()
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/auth/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    conn = sqlite3.connect('wechoose.db')
    cursor = conn.cursor()
    cursor.execute("SELECT password_hash FROM users WHERE username = ?", (form_data.username,))
    row = cursor.fetchone()
    conn.close()
    
    if not row or not verify_password(form_data.password, row[0]):
        raise HTTPException(status_code=400, detail="Identifiants incorrects")
    
    access_token = create_access_token(data={"sub": form_data.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me")
def read_users_me(current_user: dict = Depends(get_current_user)):
    return current_user

# --- 5. OUTILS TMDB (Inchangé) ---
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

# --- Helper pour Playlist Magique ID 1 ---
def get_or_create_watch_later_id(cursor, user_id):
    # Cherche la playlist "À regarder plus tard" de l'utilisateur
    cursor.execute("SELECT id FROM playlists WHERE user_id = ? AND name = ?", (user_id, "À regarder plus tard"))
    row = cursor.fetchone()
    if row:
        return row[0]
    else:
        # Crée la playlist si elle n'existe pas
        cursor.execute("INSERT INTO playlists (name, user_id) VALUES (?, ?)", ("À regarder plus tard", user_id))
        return cursor.lastrowid

# --- 6. ROUTES PLAYLISTS & RATINGS ---
class PlaylistCreate(BaseModel):
    name: str

@app.get("/playlists")
def get_all_playlists(current_user: dict = Depends(get_current_user)):
    conn = sqlite3.connect('wechoose.db')
    cursor = conn.cursor()
    # On récupère les playlists perso
    cursor.execute("SELECT id, name FROM playlists WHERE user_id = ?", (current_user['id'],))
    custom = [{"id": row[0], "name": row[1], "type": "custom"} for row in cursor.fetchall()]
    conn.close()
    
    # On injecte manuellement l'ID 1 pour "À regarder plus tard"
    return [
        {"id": 1, "name": "⏰ À regarder plus tard", "type": "system"},
        {"id": -1, "name": "⭐ Mes Tops (4-5★)", "type": "system"}, 
        {"id": -2, "name": "👁️ Historique", "type": "system"}
    ] + custom

@app.post("/playlists/create")
def create_playlist(p: PlaylistCreate, current_user: dict = Depends(get_current_user)):
    conn = sqlite3.connect('wechoose.db')
    cursor = conn.cursor()
    cursor.execute("INSERT INTO playlists (name, user_id) VALUES (?, ?)", (p.name, current_user['id']))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return {"id": new_id, "name": p.name}

@app.get("/playlists/{playlist_id}")
def get_playlist_content(playlist_id: int, current_user: dict = Depends(get_current_user)):
    conn = sqlite3.connect('wechoose.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    if playlist_id == -1: 
        cursor.execute("SELECT movie_id as id, title, poster_url, rating FROM user_ratings WHERE user_id = ? AND rating >= 4 ORDER BY added_at DESC", (current_user['id'],))
    elif playlist_id == -2: 
        cursor.execute("SELECT movie_id as id, title, poster_url, rating FROM user_ratings WHERE user_id = ? ORDER BY added_at DESC", (current_user['id'],))
    elif playlist_id == 1:
        # Logique magique pour ID 1 : On cherche la vraie playlist correspondante
        real_id = get_or_create_watch_later_id(cursor, current_user['id'])
        conn.commit() # Si création
        cursor.execute("SELECT movie_id as id, title, poster_url, rating FROM playlist_items WHERE playlist_id = ? ORDER BY rowid DESC", (real_id,))
    else: 
        cursor.execute("SELECT movie_id as id, title, poster_url, rating FROM playlist_items WHERE playlist_id = ? ORDER BY rowid DESC", (playlist_id,))
    
    movies = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return movies

@app.post("/playlists/{playlist_id}/add/{movie_id}")
def add_to_specific_playlist(playlist_id: int, movie_id: int, current_user: dict = Depends(get_current_user)):
    conn = sqlite3.connect('wechoose.db')
    cursor = conn.cursor()
    
    target_id = playlist_id

    # INTERCEPTION DE L'ID 1 (Swipe Right)
    if playlist_id == 1:
        target_id = get_or_create_watch_later_id(cursor, current_user['id'])
    
    # Vérification sécurité (sauf si on vient de le créer via ID 1)
    if playlist_id != 1:
        cursor.execute("SELECT id FROM playlists WHERE id = ? AND user_id = ?", (target_id, current_user['id']))
        if not cursor.fetchone():
            conn.close()
            raise HTTPException(status_code=403, detail="Playlist introuvable ou accès refusé")
    
    info = get_tmdb_details(movie_id)
    if info:
        try: 
            cursor.execute("INSERT INTO playlist_items (playlist_id, movie_id, title, poster_url, rating) VALUES (?, ?, ?, ?, ?)", 
                          (target_id, info['id'], info['title'], info['poster_url'], info['rating']))
            conn.commit()
        except: pass
        
    conn.close()
    return {"status": "added"}

@app.post("/movies/rate/{movie_id}/{rating}")
def rate_movie(movie_id: int, rating: int, current_user: dict = Depends(get_current_user)):
    conn = sqlite3.connect('wechoose.db')
    cursor = conn.cursor()
    movie_row = movies_df[movies_df['id'] == movie_id] if not movies_df.empty else pd.DataFrame()
    title = str(movie_row.iloc[0]['title']) if not movie_row.empty else "Inconnu"
    poster = fetch_poster_from_tmdb(movie_id)
    
    cursor.execute("INSERT OR REPLACE INTO user_ratings (user_id, movie_id, rating, title, poster_url) VALUES (?, ?, ?, ?, ?)", 
                   (current_user['id'], movie_id, rating, title, poster))
    conn.commit()
    conn.close()
    return {"status": "rated"}

# --- 7. RECOMMANDATIONS ---
@app.get("/movies/feed")
def get_movie_feed(limit: int = 10, current_user: dict = Depends(get_current_user)):
    conn = sqlite3.connect('wechoose.db')
    cursor = conn.cursor()
    
    cursor.execute("SELECT movie_id FROM user_ratings WHERE user_id = ?", (current_user['id'],))
    seen_ids = set([row[0] for row in cursor.fetchall()])
    exclude_ids = seen_ids 

    cursor.execute("SELECT movie_id FROM user_ratings WHERE user_id = ? AND rating >= 4", (current_user['id'],))
    liked_ids = [row[0] for row in cursor.fetchall()]
    conn.close()
    
    recommendations = []
    
    if liked_ids and vectors is not None:
        try:
            liked_indices = movies_df[movies_df['id'].isin(liked_ids)].index
            if len(liked_indices) > 0:
                liked_vectors = vectors[liked_indices]
                sim_matrix = cosine_similarity(vectors, liked_vectors)
                best_similarity_scores = np.max(sim_matrix, axis=1)
                raw_ratings = movies_df['vote_average'].values
                normalized_ratings = raw_ratings / 10.0
                hybrid_scores = (best_similarity_scores * 0.7) + (normalized_ratings * 0.3)
                indices = np.argsort(hybrid_scores)[::-1]
                count = 0
                for idx in indices:
                    row = movies_df.iloc[idx]
                    if int(row['id']) not in exclude_ids:
                        recommendations.append(row)
                        count += 1
                        if count >= limit: break
        except Exception as e: print(f"Erreur IA: {e}")
        
    if len(recommendations) < limit:
        mask = movies_df['id'].isin(exclude_ids) if not movies_df.empty else []
        avail = movies_df[~mask] if not movies_df.empty else pd.DataFrame()
        avail_good = avail[avail['vote_average'] > 6.0] if not avail.empty else pd.DataFrame()
        pool = avail_good if not avail_good.empty else avail
        if not pool.empty:
            needed = limit - len(recommendations)
            recommendations.extend([row for _, row in pool.sample(n=min(needed, len(pool))).iterrows()])

    return [{"id": int(r['id']), "title": str(r['title']), "poster_url": fetch_poster_from_tmdb(int(r['id'])), "rating": float(r['vote_average'])} for r in recommendations]

# --- 8. ENDPOINTS STANDARDS (Inchangé) ---
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
def dislike_movie(movie_id: int, current_user: dict = Depends(get_current_user)):
    return rate_movie(movie_id, 1, current_user)