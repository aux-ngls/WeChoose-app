import ast
import sqlite3
import datetime
from functools import lru_cache
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

WATCH_LATER_SYSTEM_ID = -1
FAVORITES_SYSTEM_ID = -2
HISTORY_SYSTEM_ID = -3
WATCH_LATER_NAME = "À regarder plus tard"

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://127.0.0.1",
        "http://localhost:80",
        "http://127.0.0.1:80",
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
def get_db_connection(*, row_factory: bool = False):
    conn = sqlite3.connect("wechoose.db")
    if row_factory:
        conn.row_factory = sqlite3.Row
    return conn


def extract_json_names(value) -> list[str]:
    if not isinstance(value, str) or not value:
        return []

    try:
        items = ast.literal_eval(value)
    except (ValueError, SyntaxError):
        return []

    names: list[str] = []
    for item in items:
        name = item.get("name") if isinstance(item, dict) else None
        if not name:
            continue
        names.append(str(name).replace(" ", "").lower())
    return names


def init_db():
    conn = get_db_connection()
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
    movies_df["vote_average"] = pd.to_numeric(movies_df["vote_average"], errors="coerce").fillna(5.0)
    movies_df["popularity"] = pd.to_numeric(movies_df.get("popularity", 0), errors="coerce").fillna(0.0)
    movies_df["vote_count"] = pd.to_numeric(movies_df.get("vote_count", 0), errors="coerce").fillna(0.0)
    movies_df["genre_tokens"] = (
        movies_df["genres"].apply(extract_json_names)
        if "genres" in movies_df.columns
        else [[] for _ in range(len(movies_df))]
    )
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


def normalize_username(username: str) -> str:
    return username.strip()

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
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username FROM users WHERE username = ?", (username,))
    user = cursor.fetchone()
    conn.close()
    if user is None: raise credentials_exception
    return {"id": user[0], "username": user[1]}

# --- 4. ROUTES AUTH ---
@app.post("/auth/signup", response_model=Token)
def signup(user: UserCreate):
    username = normalize_username(user.username)
    password = user.password.strip()

    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Le nom d'utilisateur doit contenir au moins 3 caractères")
    if len(password) < 4:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 4 caractères")

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        hashed_pw = get_password_hash(password)
        cursor.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", (username, hashed_pw))
        user_id = cursor.lastrowid
        get_or_create_watch_later_id(cursor, user_id)
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Ce nom d'utilisateur existe déjà")
    
    conn.close()
    access_token = create_access_token(data={"sub": username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/auth/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    username = normalize_username(form_data.username)
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, password_hash FROM users WHERE username = ?", (username,))
    row = cursor.fetchone()
    
    if not row or not verify_password(form_data.password, row[1]):
        conn.close()
        raise HTTPException(status_code=400, detail="Identifiants incorrects")

    get_or_create_watch_later_id(cursor, row[0])
    conn.commit()
    conn.close()
    
    access_token = create_access_token(data={"sub": username})
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

# --- Helpers Playlists ---
def get_or_create_watch_later_id(cursor, user_id):
    cursor.execute("SELECT id FROM playlists WHERE user_id = ? AND name = ?", (user_id, WATCH_LATER_NAME))
    row = cursor.fetchone()
    if row:
        return row[0]

    cursor.execute("INSERT INTO playlists (name, user_id) VALUES (?, ?)", (WATCH_LATER_NAME, user_id))
    return cursor.lastrowid


def get_custom_playlist_id(cursor, playlist_id: int, user_id: int) -> int:
    cursor.execute("SELECT id FROM playlists WHERE id = ? AND user_id = ?", (playlist_id, user_id))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=403, detail="Playlist introuvable ou accès refusé")
    return int(row[0])


def get_playlist_target_id(cursor, playlist_id: int, user_id: int) -> int:
    if playlist_id == WATCH_LATER_SYSTEM_ID:
        return get_or_create_watch_later_id(cursor, user_id)
    if playlist_id in (FAVORITES_SYSTEM_ID, HISTORY_SYSTEM_ID):
        raise HTTPException(status_code=400, detail="Cette playlist est en lecture seule")
    return get_custom_playlist_id(cursor, playlist_id, user_id)


def parse_exclude_ids(raw_exclude_ids: Optional[str]) -> set[int]:
    if not raw_exclude_ids:
        return set()

    parsed_ids: set[int] = set()
    for raw_value in raw_exclude_ids.split(","):
        raw_value = raw_value.strip()
        if not raw_value:
            continue
        try:
            parsed_ids.add(int(raw_value))
        except ValueError:
            continue
    return parsed_ids


@lru_cache(maxsize=256)
def get_tmdb_related_movie_ids(movie_id: int) -> tuple[int, ...]:
    related_ids: list[int] = []
    endpoints = (
        f"https://api.themoviedb.org/3/movie/{movie_id}/recommendations?api_key={TMDB_API_KEY}&language=fr-FR&page=1",
        f"https://api.themoviedb.org/3/movie/{movie_id}/similar?api_key={TMDB_API_KEY}&language=fr-FR&page=1",
    )

    for url in endpoints:
        try:
            results = requests.get(url, timeout=2).json().get("results", [])[:10]
        except Exception:
            results = []

        for movie in results:
            movie_id_value = movie.get("id")
            if isinstance(movie_id_value, int):
                related_ids.append(movie_id_value)

    return tuple(related_ids)

# --- 6. ROUTES PLAYLISTS & RATINGS ---
class PlaylistCreate(BaseModel):
    name: str

@app.get("/playlists")
def get_all_playlists(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    get_or_create_watch_later_id(cursor, current_user["id"])
    conn.commit()
    cursor.execute(
        "SELECT id, name FROM playlists WHERE user_id = ? AND name != ? ORDER BY id DESC",
        (current_user["id"], WATCH_LATER_NAME),
    )
    custom = [
        {"id": row[0], "name": row[1], "type": "custom", "system_key": None, "readonly": False}
        for row in cursor.fetchall()
    ]
    conn.close()
    
    return [
        {
            "id": WATCH_LATER_SYSTEM_ID,
            "name": "⏰ À regarder plus tard",
            "type": "system",
            "system_key": "watch-later",
            "readonly": False,
        },
        {
            "id": FAVORITES_SYSTEM_ID,
            "name": "⭐ Mes Tops (4-5★)",
            "type": "system",
            "system_key": "favorites",
            "readonly": True,
        },
        {
            "id": HISTORY_SYSTEM_ID,
            "name": "👁️ Historique",
            "type": "system",
            "system_key": "history",
            "readonly": True,
        },
    ] + custom

@app.post("/playlists/create")
def create_playlist(p: PlaylistCreate, current_user: dict = Depends(get_current_user)):
    playlist_name = p.name.strip()
    if len(playlist_name) < 2:
        raise HTTPException(status_code=400, detail="Le nom de la playlist est trop court")
    if playlist_name == WATCH_LATER_NAME:
        raise HTTPException(status_code=400, detail="Ce nom est réservé à la playlist système")

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT 1 FROM playlists WHERE user_id = ? AND lower(name) = lower(?)",
        (current_user["id"], playlist_name),
    )
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Cette playlist existe déjà")

    cursor.execute("INSERT INTO playlists (name, user_id) VALUES (?, ?)", (playlist_name, current_user["id"]))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return {"id": new_id, "name": playlist_name, "type": "custom", "system_key": None, "readonly": False}

@app.get("/playlists/{playlist_id}")
def get_playlist_content(playlist_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    
    if playlist_id == WATCH_LATER_SYSTEM_ID:
        real_id = get_or_create_watch_later_id(cursor, current_user["id"])
        conn.commit()
        cursor.execute(
            "SELECT movie_id as id, title, poster_url, rating FROM playlist_items WHERE playlist_id = ? ORDER BY rowid DESC",
            (real_id,),
        )
    elif playlist_id == FAVORITES_SYSTEM_ID:
        cursor.execute(
            "SELECT movie_id as id, title, poster_url, rating FROM user_ratings WHERE user_id = ? AND rating >= 4 ORDER BY added_at DESC",
            (current_user["id"],),
        )
    elif playlist_id == HISTORY_SYSTEM_ID:
        cursor.execute(
            "SELECT movie_id as id, title, poster_url, rating FROM user_ratings WHERE user_id = ? ORDER BY added_at DESC",
            (current_user["id"],),
        )
    else:
        target_id = get_custom_playlist_id(cursor, playlist_id, current_user["id"])
        cursor.execute(
            "SELECT movie_id as id, title, poster_url, rating FROM playlist_items WHERE playlist_id = ? ORDER BY rowid DESC",
            (target_id,),
        )
    
    movies = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return movies

@app.post("/playlists/{playlist_id}/add/{movie_id}")
def add_to_specific_playlist(playlist_id: int, movie_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    target_id = get_playlist_target_id(cursor, playlist_id, current_user["id"])
    
    info = get_tmdb_details(movie_id)
    if info:
        try:
            cursor.execute(
                "INSERT INTO playlist_items (playlist_id, movie_id, title, poster_url, rating) VALUES (?, ?, ?, ?, ?)",
                (target_id, info["id"], info["title"], info["poster_url"], info["rating"]),
            )
            conn.commit()
        except sqlite3.IntegrityError:
            pass
        
    conn.close()
    return {"status": "added"}

@app.post("/movies/rate/{movie_id}/{rating}")
def rate_movie(movie_id: int, rating: int, current_user: dict = Depends(get_current_user)):
    if rating < 1 or rating > 5:
        raise HTTPException(status_code=400, detail="La note doit être comprise entre 1 et 5")

    conn = get_db_connection()
    cursor = conn.cursor()
    movie_row = movies_df[movies_df['id'] == movie_id] if not movies_df.empty else pd.DataFrame()
    title = str(movie_row.iloc[0]["title"]) if not movie_row.empty else "Inconnu"
    poster = fetch_poster_from_tmdb(movie_id)

    if title == "Inconnu":
        details = get_tmdb_details(movie_id)
        if details:
            title = details["title"]
            poster = details["poster_url"] or poster
    
    cursor.execute(
        "INSERT OR REPLACE INTO user_ratings (user_id, movie_id, rating, title, poster_url) VALUES (?, ?, ?, ?, ?)",
        (current_user["id"], movie_id, rating, title, poster),
    )
    conn.commit()
    conn.close()
    return {"status": "rated"}

# --- 7. RECOMMANDATIONS ---
@app.get("/movies/feed")
def get_movie_feed(
    limit: int = 10,
    exclude_ids: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    conn = get_db_connection()
    cursor = conn.cursor()

    watch_later_id = get_or_create_watch_later_id(cursor, current_user["id"])
    conn.commit()

    cursor.execute(
        "SELECT movie_id FROM user_ratings WHERE user_id = ?",
        (current_user["id"],),
    )
    rated_ids = {row[0] for row in cursor.fetchall()}

    cursor.execute(
        "SELECT movie_id FROM user_ratings WHERE user_id = ? AND rating >= 4 ORDER BY added_at DESC LIMIT 8",
        (current_user["id"],),
    )
    liked_ids = [row[0] for row in cursor.fetchall()]

    cursor.execute(
        "SELECT movie_id FROM playlist_items WHERE playlist_id = ?",
        (watch_later_id,),
    )
    watch_later_ids = {row[0] for row in cursor.fetchall()}

    cursor.execute(
        "SELECT movie_id FROM playlist_items WHERE playlist_id = ? ORDER BY rowid DESC LIMIT 8",
        (watch_later_id,),
    )
    recent_watch_later_ids = [row[0] for row in cursor.fetchall()]
    conn.close()

    request_exclude_ids = parse_exclude_ids(exclude_ids)
    seen_ids = rated_ids | watch_later_ids
    blocked_ids = seen_ids | request_exclude_ids
    positive_signal_ids = list(dict.fromkeys([*liked_ids, *recent_watch_later_ids]))[:8]

    if movies_df.empty:
        return []

    available_movie_ids = set(int(movie_id) for movie_id in movies_df["id"].tolist())
    candidate_scores: dict[int, float] = {}
    genre_profile: set[str] = set()
    if positive_signal_ids:
        preferred_rows = movies_df[movies_df["id"].isin(positive_signal_ids)]
        for tokens in preferred_rows["genre_tokens"]:
            genre_profile.update(tokens)

    if positive_signal_ids and vectors is not None and not movies_df.empty:
        try:
            liked_indices = movies_df[movies_df["id"].isin(positive_signal_ids)].index
            if len(liked_indices) > 0:
                liked_vectors = vectors[liked_indices]
                sim_matrix = cosine_similarity(vectors, liked_vectors)
                best_similarity_scores = np.max(sim_matrix, axis=1)
                mean_similarity_scores = np.mean(sim_matrix, axis=1)
                raw_ratings = movies_df["vote_average"].values
                normalized_ratings = raw_ratings / 10.0
                max_popularity = max(float(movies_df["popularity"].max()), 1.0)
                normalized_popularity = movies_df["popularity"].values / max_popularity
                genre_overlap_scores = np.array(
                    [
                        (len(set(tokens) & genre_profile) / max(len(genre_profile), 1))
                        if genre_profile
                        else 0.0
                        for tokens in movies_df["genre_tokens"]
                    ]
                )
                hybrid_scores = (
                    (best_similarity_scores * 0.45)
                    + (mean_similarity_scores * 0.15)
                    + (genre_overlap_scores * 0.15)
                    + (normalized_ratings * 0.15)
                    + (normalized_popularity * 0.10)
                )
                indices = np.argsort(hybrid_scores)[::-1]
                for idx in indices:
                    row = movies_df.iloc[idx]
                    movie_id = int(row["id"])
                    if movie_id in blocked_ids:
                        continue
                    candidate_scores[movie_id] = candidate_scores.get(movie_id, 0.0) + float(hybrid_scores[idx]) * 2.0
        except Exception as e:
            print(f"Erreur IA: {e}")

    for seed_rank, seed_id in enumerate(positive_signal_ids[:4]):
        related_ids = get_tmdb_related_movie_ids(seed_id)
        for rank, related_id in enumerate(related_ids):
            if related_id in blocked_ids or related_id not in available_movie_ids:
                continue
            score = 2.8 - (rank * 0.08) - (seed_rank * 0.15)
            candidate_scores[related_id] = candidate_scores.get(related_id, 0.0) + max(score, 0.2)

    ranked_candidate_ids = [
        movie_id
        for movie_id, _ in sorted(candidate_scores.items(), key=lambda item: item[1], reverse=True)
        if movie_id not in blocked_ids
    ]

    exploration_slots = max(1, limit // 5) if positive_signal_ids else 0
    main_slots = max(limit - exploration_slots, 0)
    selected_ids = ranked_candidate_ids[:main_slots]
    used_ids = blocked_ids | set(selected_ids)

    if len(selected_ids) < main_slots:
        filler_pool = movies_df[~movies_df["id"].isin(used_ids)]
        filler_pool = filler_pool.sort_values(["vote_average", "popularity"], ascending=False)
        selected_ids.extend([int(row["id"]) for _, row in filler_pool.head(main_slots - len(selected_ids)).iterrows()])
        used_ids = blocked_ids | set(selected_ids)

    if exploration_slots > 0:
        exploration_pool = movies_df[~movies_df["id"].isin(used_ids)].copy()
        if not exploration_pool.empty:
            max_popularity = max(float(exploration_pool["popularity"].max()), 1.0)
            genre_distance_scores = np.array(
                [
                    1.0 - (len(set(tokens) & genre_profile) / max(len(genre_profile), 1))
                    if genre_profile
                    else 1.0
                    for tokens in exploration_pool["genre_tokens"]
                ]
            )
            exploration_pool["exploration_score"] = (
                (exploration_pool["vote_average"] / 10.0) * 0.55
                + (exploration_pool["popularity"] / max_popularity) * 0.15
                + (genre_distance_scores * 0.30)
            )
            exploration_shortlist = exploration_pool.sort_values("exploration_score", ascending=False).head(max(exploration_slots * 20, 40))
            selected_ids.extend(
                [
                    int(row["id"])
                    for _, row in exploration_shortlist.sample(
                        n=min(exploration_slots, len(exploration_shortlist))
                    ).iterrows()
                ]
            )
            used_ids = blocked_ids | set(selected_ids)

    if len(selected_ids) < limit:
        fallback_pool = movies_df[~movies_df["id"].isin(used_ids)]
        fallback_pool = fallback_pool.sort_values(["vote_average", "popularity"], ascending=False)
        selected_ids.extend([int(row["id"]) for _, row in fallback_pool.head(limit - len(selected_ids)).iterrows()])

    selected_rows = movies_df[movies_df["id"].isin(selected_ids)].copy()
    selected_rows["selection_rank"] = selected_rows["id"].apply(
        lambda movie_id: selected_ids.index(int(movie_id))
    )
    selected_rows = selected_rows.sort_values("selection_rank")

    return [
        {
            "id": int(row["id"]),
            "title": str(row["title"]),
            "poster_url": fetch_poster_from_tmdb(int(row["id"])),
            "rating": float(row["vote_average"]),
        }
        for _, row in selected_rows.head(limit).iterrows()
    ]

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
