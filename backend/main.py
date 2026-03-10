import ast
import os
import sqlite3
import datetime
from functools import lru_cache
from typing import Optional
from fastapi import FastAPI, HTTPException, Depends, status, WebSocket, WebSocketDisconnect, Query
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
FCM_SERVER_KEY = os.getenv("FCM_SERVER_KEY", "").strip()
app = FastAPI(title="Qulte API")

WATCH_LATER_SYSTEM_ID = -1
FAVORITES_SYSTEM_ID = -2
HISTORY_SYSTEM_ID = -3
WATCH_LATER_NAME = "À regarder plus tard"


class RealtimeConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, list[WebSocket]] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.setdefault(user_id, []).append(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket):
        user_connections = self.active_connections.get(user_id, [])
        if websocket in user_connections:
            user_connections.remove(websocket)
        if not user_connections and user_id in self.active_connections:
            del self.active_connections[user_id]

    async def send_to_user(self, user_id: int, payload: dict):
        user_connections = list(self.active_connections.get(user_id, []))
        for connection in user_connections:
            try:
                await connection.send_json(payload)
            except Exception:
                self.disconnect(user_id, connection)

    async def broadcast_to_users(self, user_ids: list[int], payload: dict):
        unique_user_ids = list(dict.fromkeys(user_ids))
        for user_id in unique_user_ids:
            await self.send_to_user(user_id, payload)


realtime_manager = RealtimeConnectionManager()

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


def extract_json_ids(value) -> list[int]:
    if not isinstance(value, str) or not value:
        return []

    try:
        items = ast.literal_eval(value)
    except (ValueError, SyntaxError):
        return []

    parsed_ids: list[int] = []
    for item in items:
        item_id = item.get("id") if isinstance(item, dict) else None
        if isinstance(item_id, int):
            parsed_ids.append(item_id)
    return parsed_ids


def normalize_tmdb_movie(movie: dict) -> Optional[dict]:
    movie_id = movie.get("id")
    title = movie.get("title")
    if not isinstance(movie_id, int) or not title:
        return None

    poster_path = movie.get("poster_path")
    return {
        "id": movie_id,
        "title": str(title),
        "poster_url": f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else "https://via.placeholder.com/500",
        "rating": float(movie.get("vote_average") or 0.0),
    }


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

    # Table FOLLOWS
    cursor.execute('''CREATE TABLE IF NOT EXISTS follows (
                        follower_id INTEGER,
                        followed_id INTEGER,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (follower_id, followed_id))''')

    # Table REVIEWS
    cursor.execute('''CREATE TABLE IF NOT EXISTS reviews (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER,
                        movie_id INTEGER,
                        title TEXT,
                        poster_url TEXT,
                        rating INTEGER,
                        content TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')

    # Table REVIEW_LIKES
    cursor.execute('''CREATE TABLE IF NOT EXISTS review_likes (
                        review_id INTEGER,
                        user_id INTEGER,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (review_id, user_id))''')

    # Table COMMENTS
    cursor.execute('''CREATE TABLE IF NOT EXISTS comments (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        review_id INTEGER,
                        user_id INTEGER,
                        parent_id INTEGER,
                        content TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')

    # Table NOTIFICATIONS
    cursor.execute('''CREATE TABLE IF NOT EXISTS notifications (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER,
                        actor_user_id INTEGER,
                        type TEXT,
                        review_id INTEGER,
                        comment_id INTEGER,
                        is_read INTEGER DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')

    # Table DIRECT_CONVERSATIONS
    cursor.execute('''CREATE TABLE IF NOT EXISTS direct_conversations (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_one_id INTEGER,
                        user_two_id INTEGER,
                        user_one_last_read_message_id INTEGER DEFAULT 0,
                        user_two_last_read_message_id INTEGER DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(user_one_id, user_two_id))''')

    # Table DIRECT_MESSAGES
    cursor.execute('''CREATE TABLE IF NOT EXISTS direct_messages (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        conversation_id INTEGER,
                        sender_id INTEGER,
                        content TEXT,
                        movie_id INTEGER,
                        movie_title TEXT,
                        movie_poster_url TEXT,
                        movie_rating REAL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')

    # Table MOBILE_DEVICES
    cursor.execute('''CREATE TABLE IF NOT EXISTS mobile_devices (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER,
                        platform TEXT,
                        token TEXT UNIQUE,
                        app_version TEXT,
                        is_active INTEGER DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_mobile_devices_user_id ON mobile_devices(user_id)"
    )
    
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
    movies_df["genre_ids"] = (
        movies_df["genres"].apply(extract_json_ids)
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

def get_user_from_token(token: str) -> dict:
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


async def get_current_user(token: str = Depends(oauth2_scheme)):
    return get_user_from_token(token)

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


@lru_cache(maxsize=256)
def get_tmdb_related_movies(movie_id: int) -> tuple[dict, ...]:
    related_movies: list[dict] = []
    endpoints = (
        f"https://api.themoviedb.org/3/movie/{movie_id}/recommendations?api_key={TMDB_API_KEY}&language=fr-FR&page=1",
        f"https://api.themoviedb.org/3/movie/{movie_id}/similar?api_key={TMDB_API_KEY}&language=fr-FR&page=1",
    )

    seen_ids: set[int] = set()
    for url in endpoints:
        try:
            results = requests.get(url, timeout=2).json().get("results", [])[:12]
        except Exception:
            results = []

        for movie in results:
            normalized_movie = normalize_tmdb_movie(movie)
            if not normalized_movie:
                continue
            if normalized_movie["id"] in seen_ids:
                continue
            seen_ids.add(normalized_movie["id"])
            related_movies.append(normalized_movie)

    return tuple(related_movies)


@lru_cache(maxsize=64)
def get_tmdb_discover_movies(page: int, genre_ids_key: str) -> tuple[dict, ...]:
    params = [
        f"api_key={TMDB_API_KEY}",
        "language=fr-FR",
        "sort_by=popularity.desc",
        "include_adult=false",
        "include_video=false",
        f"page={page}",
        "vote_count.gte=200",
    ]
    if genre_ids_key:
        params.append(f"with_genres={genre_ids_key}")

    url = f"https://api.themoviedb.org/3/discover/movie?{'&'.join(params)}"
    try:
        results = requests.get(url, timeout=2).json().get("results", [])[:20]
    except Exception:
        results = []

    normalized_movies: list[dict] = []
    seen_ids: set[int] = set()
    for movie in results:
        normalized_movie = normalize_tmdb_movie(movie)
        if not normalized_movie:
            continue
        if normalized_movie["id"] in seen_ids:
            continue
        seen_ids.add(normalized_movie["id"])
        normalized_movies.append(normalized_movie)

    return tuple(normalized_movies)


def serialize_review_row(row: sqlite3.Row) -> dict:
    row_keys = set(row.keys())
    return {
        "id": row["id"],
        "movie_id": row["movie_id"],
        "title": row["title"],
        "poster_url": row["poster_url"],
        "rating": row["rating"],
        "content": row["content"],
        "created_at": row["created_at"],
        "author": {
            "id": row["user_id"],
            "username": row["username"],
        },
        "likes_count": row["likes_count"],
        "liked_by_me": bool(row["liked_by_me"]),
        "comments_count": row["comments_count"] if "comments_count" in row_keys else 0,
    }


def serialize_user_row(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "username": row["username"],
        "followers_count": row["followers_count"],
        "following_count": row["following_count"],
        "reviews_count": row["reviews_count"],
        "is_following": bool(row["is_following"]),
    }


def serialize_comment_row(row: sqlite3.Row) -> dict:
    row_keys = set(row.keys())
    return {
        "id": row["id"],
        "review_id": row["review_id"],
        "parent_id": row["parent_id"],
        "content": row["content"],
        "created_at": row["created_at"],
        "author": {
            "id": row["user_id"],
            "username": row["username"],
        },
        "reply_to_username": row["reply_to_username"] if "reply_to_username" in row_keys else None,
    }


def build_notification_message(row: sqlite3.Row) -> str:
    actor_username = row["actor_username"]
    review_title = row["review_title"] or "ce film"
    notification_type = row["type"]

    if notification_type == "follow":
        return f"@{actor_username} s'est abonne a toi"
    if notification_type == "like":
        return f"@{actor_username} a aime ta critique sur {review_title}"
    if notification_type == "review":
        return f"@{actor_username} a publie une critique sur {review_title}"
    if notification_type == "comment":
        return f"@{actor_username} a commente ta critique sur {review_title}"
    if notification_type == "reply":
        return f"@{actor_username} a repondu a ton commentaire sur {review_title}"
    return f"Nouvelle activite de @{actor_username}"


def serialize_notification_row(row: sqlite3.Row) -> dict:
    comment_preview = row["comment_preview"] or ""
    return {
        "id": row["id"],
        "type": row["type"],
        "created_at": row["created_at"],
        "is_read": bool(row["is_read"]),
        "message": build_notification_message(row),
        "actor": {
            "id": row["actor_user_id"],
            "username": row["actor_username"],
        },
        "review": (
            {
                "id": row["review_id"],
                "title": row["review_title"],
                "poster_url": row["review_poster_url"],
            }
            if row["review_id"] is not None
            else None
        ),
        "comment_preview": comment_preview[:120],
    }


def create_notification(
    cursor,
    user_id: int,
    actor_user_id: int,
    notification_type: str,
    review_id: Optional[int] = None,
    comment_id: Optional[int] = None,
):
    if user_id == actor_user_id:
        return

    cursor.execute(
        """
        INSERT INTO notifications (user_id, actor_user_id, type, review_id, comment_id)
        VALUES (?, ?, ?, ?, ?)
        """,
        (user_id, actor_user_id, notification_type, review_id, comment_id),
    )


def build_direct_message_push_body(sender_username: str, content: str, movie_title: str) -> str:
    cleaned_content = content.strip()
    cleaned_movie_title = movie_title.strip()
    if cleaned_content and cleaned_movie_title:
        return f"@{sender_username}: {cleaned_content[:90]}"
    if cleaned_content:
        return f"@{sender_username}: {cleaned_content[:120]}"
    if cleaned_movie_title:
        return f"@{sender_username} t'a partage {cleaned_movie_title}"
    return f"Nouveau message de @{sender_username}"


def fetch_active_mobile_tokens(cursor, user_ids: list[int]) -> list[str]:
    unique_user_ids = list(dict.fromkeys(user_ids))
    if not unique_user_ids:
        return []

    placeholders = ",".join("?" for _ in unique_user_ids)
    cursor.execute(
        f"""
        SELECT token
        FROM mobile_devices
        WHERE is_active = 1
        AND user_id IN ({placeholders})
        """,
        tuple(unique_user_ids),
    )

    tokens: list[str] = []
    for row in cursor.fetchall():
        token = row["token"] if isinstance(row, sqlite3.Row) else row[0]
        if token:
            tokens.append(str(token))
    return tokens


def send_native_push_notifications(
    cursor,
    user_ids: list[int],
    *,
    title: str,
    body: str,
    route: str,
    extra_data: Optional[dict] = None,
):
    if not FCM_SERVER_KEY:
        return

    device_tokens = fetch_active_mobile_tokens(cursor, user_ids)
    if not device_tokens:
        return

    serialized_data = {"route": route}
    if extra_data:
        serialized_data.update(
            {key: str(value) for key, value in extra_data.items() if value is not None}
        )

    headers = {
        "Authorization": f"key={FCM_SERVER_KEY}",
        "Content-Type": "application/json",
    }

    for device_token in device_tokens:
        try:
            response = requests.post(
                "https://fcm.googleapis.com/fcm/send",
                headers=headers,
                json={
                    "to": device_token,
                    "priority": "high",
                    "notification": {
                        "title": title,
                        "body": body,
                    },
                    "data": serialized_data,
                    "content_available": True,
                    "mutable_content": True,
                },
                timeout=8,
            )
        except requests.RequestException:
            continue

        try:
            response_payload = response.json()
        except ValueError:
            response_payload = {}

        if response.status_code != 200:
            continue

        results = response_payload.get("results") or []
        if not results:
            continue

        error_code = results[0].get("error")
        if error_code in {"InvalidRegistration", "NotRegistered", "MismatchSenderId"}:
            cursor.execute(
                """
                UPDATE mobile_devices
                SET is_active = 0, updated_at = CURRENT_TIMESTAMP
                WHERE token = ?
                """,
                (device_token,),
            )


def fetch_serialized_reviews(cursor, current_user_id: int, where_clause: str, params=(), limit: Optional[int] = None) -> list[dict]:
    query = f"""
        SELECT
            r.id,
            r.user_id,
            u.username,
            r.movie_id,
            r.title,
            r.poster_url,
            r.rating,
            r.content,
            r.created_at,
            (SELECT COUNT(*) FROM review_likes rl WHERE rl.review_id = r.id) AS likes_count,
            EXISTS(
                SELECT 1
                FROM review_likes rl
                WHERE rl.review_id = r.id AND rl.user_id = ?
            ) AS liked_by_me,
            (SELECT COUNT(*) FROM comments c WHERE c.review_id = r.id) AS comments_count
        FROM reviews r
        JOIN users u ON u.id = r.user_id
        WHERE {where_clause}
        ORDER BY r.created_at DESC, r.id DESC
    """

    query_params = (current_user_id, *params)
    if limit is not None:
        query += " LIMIT ?"
        query_params = (*query_params, limit)

    cursor.execute(query, query_params)
    return [serialize_review_row(row) for row in cursor.fetchall()]


def fetch_review_comments(cursor, review_id: int) -> list[dict]:
    cursor.execute(
        """
        SELECT
            c.id,
            c.review_id,
            c.parent_id,
            c.content,
            c.created_at,
            u.id AS user_id,
            u.username,
            parent_user.username AS reply_to_username
        FROM comments c
        JOIN users u ON u.id = c.user_id
        LEFT JOIN comments parent_comment ON parent_comment.id = c.parent_id
        LEFT JOIN users parent_user ON parent_user.id = parent_comment.user_id
        WHERE c.review_id = ?
        ORDER BY COALESCE(c.parent_id, c.id), c.parent_id IS NOT NULL, c.created_at ASC, c.id ASC
        """,
        (review_id,),
    )
    return [serialize_comment_row(row) for row in cursor.fetchall()]


def fetch_notifications_payload(cursor, user_id: int, limit: int) -> dict:
    cursor.execute(
        "SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0",
        (user_id,),
    )
    unread_count = int(cursor.fetchone()[0])

    cursor.execute(
        """
        SELECT
            n.id,
            n.type,
            n.created_at,
            n.is_read,
            n.actor_user_id,
            actor.username AS actor_username,
            n.review_id,
            r.title AS review_title,
            r.poster_url AS review_poster_url,
            n.comment_id,
            c.content AS comment_preview
        FROM notifications n
        JOIN users actor ON actor.id = n.actor_user_id
        LEFT JOIN reviews r ON r.id = n.review_id
        LEFT JOIN comments c ON c.id = n.comment_id
        WHERE n.user_id = ?
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT ?
        """,
        (user_id, limit),
    )
    return {
        "items": [serialize_notification_row(row) for row in cursor.fetchall()],
        "unread_count": unread_count,
    }


def normalize_direct_pair(user_one_id: int, user_two_id: int) -> tuple[int, int]:
    return (user_one_id, user_two_id) if user_one_id < user_two_id else (user_two_id, user_one_id)


def serialize_direct_message_row(row: sqlite3.Row, current_user_id: int) -> dict:
    return {
        "id": row["id"],
        "content": row["content"] or "",
        "created_at": row["created_at"],
        "is_mine": row["sender_id"] == current_user_id,
        "sender": {
            "id": row["sender_id"],
            "username": row["sender_username"],
        },
        "movie": (
            {
                "id": row["movie_id"],
                "title": row["movie_title"],
                "poster_url": row["movie_poster_url"],
                "rating": row["movie_rating"],
            }
            if row["movie_id"] is not None
            else None
        ),
    }


def build_message_preview(content: Optional[str], movie_title: Optional[str]) -> str:
    trimmed_content = (content or "").strip()
    trimmed_movie_title = (movie_title or "").strip()

    if trimmed_content:
        return trimmed_content[:120]
    if trimmed_movie_title:
        return f"A partage {trimmed_movie_title}"
    return "Nouvelle conversation"


def serialize_direct_conversation_row(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "participant": {
            "id": row["participant_id"],
            "username": row["participant_username"],
        },
        "last_message": (
            {
                "id": row["last_message_id"],
                "content": row["last_message_content"] or "",
                "created_at": row["updated_at"],
                "sender_id": row["last_sender_id"],
                "preview": build_message_preview(row["last_message_content"], row["last_movie_title"]),
                "movie": (
                    {
                        "id": row["last_movie_id"],
                        "title": row["last_movie_title"],
                        "poster_url": row["last_movie_poster_url"],
                    }
                    if row["last_movie_id"] is not None
                    else None
                ),
            }
            if row["last_message_id"] is not None
            else None
        ),
        "unread_count": int(row["unread_count"]),
    }


def get_or_create_direct_conversation(cursor, current_user_id: int, target_user_id: int) -> int:
    user_one_id, user_two_id = normalize_direct_pair(current_user_id, target_user_id)
    cursor.execute(
        """
        INSERT OR IGNORE INTO direct_conversations (user_one_id, user_two_id)
        VALUES (?, ?)
        """,
        (user_one_id, user_two_id),
    )
    cursor.execute(
        """
        SELECT id
        FROM direct_conversations
        WHERE user_one_id = ? AND user_two_id = ?
        """,
        (user_one_id, user_two_id),
    )
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=500, detail="Impossible de creer la conversation")
    return int(row["id"] if isinstance(row, sqlite3.Row) else row[0])


def get_direct_conversation_for_user(cursor, conversation_id: int, current_user_id: int) -> sqlite3.Row:
    cursor.execute(
        """
        SELECT
            c.id,
            c.user_one_id,
            c.user_two_id,
            c.user_one_last_read_message_id,
            c.user_two_last_read_message_id,
            c.created_at,
            CASE
                WHEN c.user_one_id = ? THEN c.user_two_id
                ELSE c.user_one_id
            END AS participant_id,
            participant.username AS participant_username
        FROM direct_conversations c
        JOIN users participant
            ON participant.id = CASE
                WHEN c.user_one_id = ? THEN c.user_two_id
                ELSE c.user_one_id
            END
        WHERE c.id = ?
          AND (c.user_one_id = ? OR c.user_two_id = ?)
        """,
        (current_user_id, current_user_id, conversation_id, current_user_id, current_user_id),
    )
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Conversation introuvable")
    return row


def mark_direct_conversation_read(cursor, conversation_row: sqlite3.Row, current_user_id: int):
    cursor.execute(
        "SELECT MAX(id) FROM direct_messages WHERE conversation_id = ?",
        (conversation_row["id"],),
    )
    last_message_id = int(cursor.fetchone()[0] or 0)

    if conversation_row["user_one_id"] == current_user_id:
        cursor.execute(
            "UPDATE direct_conversations SET user_one_last_read_message_id = ? WHERE id = ?",
            (last_message_id, conversation_row["id"]),
        )
    else:
        cursor.execute(
            "UPDATE direct_conversations SET user_two_last_read_message_id = ? WHERE id = ?",
            (last_message_id, conversation_row["id"]),
        )


def fetch_direct_conversations(cursor, current_user_id: int) -> list[dict]:
    cursor.execute(
        """
        SELECT
            c.id,
            c.created_at,
            COALESCE(last_message.created_at, c.created_at) AS updated_at,
            CASE
                WHEN c.user_one_id = ? THEN c.user_two_id
                ELSE c.user_one_id
            END AS participant_id,
            participant.username AS participant_username,
            last_message.id AS last_message_id,
            last_message.content AS last_message_content,
            last_message.sender_id AS last_sender_id,
            last_message.movie_id AS last_movie_id,
            last_message.movie_title AS last_movie_title,
            last_message.movie_poster_url AS last_movie_poster_url,
            (
                SELECT COUNT(*)
                FROM direct_messages unread_message
                WHERE unread_message.conversation_id = c.id
                  AND unread_message.sender_id != ?
                  AND unread_message.id > CASE
                      WHEN c.user_one_id = ? THEN COALESCE(c.user_one_last_read_message_id, 0)
                      ELSE COALESCE(c.user_two_last_read_message_id, 0)
                  END
            ) AS unread_count
        FROM direct_conversations c
        JOIN users participant
            ON participant.id = CASE
                WHEN c.user_one_id = ? THEN c.user_two_id
                ELSE c.user_one_id
            END
        LEFT JOIN direct_messages last_message
            ON last_message.id = (
                SELECT dm.id
                FROM direct_messages dm
                WHERE dm.conversation_id = c.id
                ORDER BY dm.id DESC
                LIMIT 1
            )
        WHERE c.user_one_id = ? OR c.user_two_id = ?
        ORDER BY updated_at DESC, c.id DESC
        """,
        (
            current_user_id,
            current_user_id,
            current_user_id,
            current_user_id,
            current_user_id,
            current_user_id,
        ),
    )
    return [serialize_direct_conversation_row(row) for row in cursor.fetchall()]


def get_total_unread_direct_messages(cursor, current_user_id: int) -> int:
    cursor.execute(
        """
        SELECT COALESCE(SUM(unread_count), 0)
        FROM (
            SELECT (
                SELECT COUNT(*)
                FROM direct_messages unread_message
                WHERE unread_message.conversation_id = c.id
                  AND unread_message.sender_id != ?
                  AND unread_message.id > CASE
                      WHEN c.user_one_id = ? THEN COALESCE(c.user_one_last_read_message_id, 0)
                      ELSE COALESCE(c.user_two_last_read_message_id, 0)
                  END
            ) AS unread_count
            FROM direct_conversations c
            WHERE c.user_one_id = ? OR c.user_two_id = ?
        ) AS unread_counts
        """,
        (current_user_id, current_user_id, current_user_id, current_user_id),
    )
    return int(cursor.fetchone()[0] or 0)

# --- 6. ROUTES PLAYLISTS & RATINGS ---
class PlaylistCreate(BaseModel):
    name: str


class ReviewCreate(BaseModel):
    movie_id: int
    title: str
    poster_url: str
    rating: int
    content: str


class CommentCreate(BaseModel):
    content: str
    parent_id: Optional[int] = None


class MessageCreate(BaseModel):
    content: Optional[str] = None
    movie_id: Optional[int] = None
    movie_title: Optional[str] = None
    movie_poster_url: Optional[str] = None
    movie_rating: Optional[float] = None


class MobileDeviceRegister(BaseModel):
    token: str
    platform: str
    app_version: Optional[str] = None


class MobileDeviceUnregister(BaseModel):
    token: str

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

# --- 8. ROUTES SOCIALES ---
@app.get("/social/users")
def social_users(
    query: str = "",
    limit: int = 12,
    current_user: dict = Depends(get_current_user),
):
    search_value = query.strip()
    safe_limit = max(1, min(limit, 30))

    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
            u.id,
            u.username,
            (SELECT COUNT(*) FROM follows f WHERE f.followed_id = u.id) AS followers_count,
            (SELECT COUNT(*) FROM follows f WHERE f.follower_id = u.id) AS following_count,
            (SELECT COUNT(*) FROM reviews r WHERE r.user_id = u.id) AS reviews_count,
            EXISTS(
                SELECT 1
                FROM follows f
                WHERE f.follower_id = ? AND f.followed_id = u.id
            ) AS is_following
        FROM users u
        WHERE u.id != ?
          AND (? = '' OR lower(u.username) LIKE lower(?))
        ORDER BY reviews_count DESC, followers_count DESC, u.username ASC
        LIMIT ?
        """,
        (
            current_user["id"],
            current_user["id"],
            search_value,
            f"%{search_value}%",
            safe_limit,
        ),
    )
    users = [serialize_user_row(row) for row in cursor.fetchall()]
    conn.close()
    return users


@app.get("/social/profile/{username}")
def social_profile(
    username: str,
    limit: int = 24,
    current_user: dict = Depends(get_current_user),
):
    safe_limit = max(1, min(limit, 50))
    profile_username = username.strip()

    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
            u.id,
            u.username,
            (SELECT COUNT(*) FROM follows f WHERE f.followed_id = u.id) AS followers_count,
            (SELECT COUNT(*) FROM follows f WHERE f.follower_id = u.id) AS following_count,
            (SELECT COUNT(*) FROM reviews r WHERE r.user_id = u.id) AS reviews_count,
            (SELECT COUNT(*) FROM user_ratings ur WHERE ur.user_id = u.id AND ur.rating >= 4) AS favorites_count,
            EXISTS(
                SELECT 1
                FROM follows f
                WHERE f.follower_id = ? AND f.followed_id = u.id
            ) AS is_following
        FROM users u
        WHERE lower(u.username) = lower(?)
        """,
        (current_user["id"], profile_username),
    )
    profile_row = cursor.fetchone()
    if not profile_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Profil introuvable")

    reviews = fetch_serialized_reviews(
        cursor,
        current_user["id"],
        "r.user_id = ?",
        (profile_row["id"],),
        safe_limit,
    )
    conn.close()

    return {
        "id": profile_row["id"],
        "username": profile_row["username"],
        "followers_count": profile_row["followers_count"],
        "following_count": profile_row["following_count"],
        "reviews_count": profile_row["reviews_count"],
        "favorites_count": profile_row["favorites_count"],
        "is_following": bool(profile_row["is_following"]),
        "is_self": profile_row["id"] == current_user["id"],
        "reviews": reviews,
    }


@app.post("/social/follow/{target_user_id}")
def follow_user(target_user_id: int, current_user: dict = Depends(get_current_user)):
    if target_user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas vous suivre vous-même")

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE id = ?", (target_user_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    cursor.execute(
        "INSERT OR IGNORE INTO follows (follower_id, followed_id) VALUES (?, ?)",
        (current_user["id"], target_user_id),
    )
    if cursor.rowcount > 0:
        create_notification(cursor, target_user_id, current_user["id"], "follow")
        send_native_push_notifications(
            cursor,
            [target_user_id],
            title="Nouveau follower",
            body=f"@{current_user['username']} s'est abonne a toi",
            route="/social",
            extra_data={"type": "follow"},
        )
    conn.commit()
    conn.close()
    return {"status": "followed"}


@app.delete("/social/follow/{target_user_id}")
def unfollow_user(target_user_id: int, current_user: dict = Depends(get_current_user)):
    if target_user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Action invalide")

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM follows WHERE follower_id = ? AND followed_id = ?",
        (current_user["id"], target_user_id),
    )
    conn.commit()
    conn.close()
    return {"status": "unfollowed"}


@app.post("/mobile/devices/register")
def register_mobile_device(
    payload: MobileDeviceRegister,
    current_user: dict = Depends(get_current_user),
):
    device_token = payload.token.strip()
    platform = payload.platform.strip().lower()
    app_version = (payload.app_version or "").strip() or None

    if not device_token:
        raise HTTPException(status_code=400, detail="Le token device est requis")
    if platform not in {"ios", "android"}:
        raise HTTPException(status_code=400, detail="Plateforme mobile invalide")

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO mobile_devices (user_id, platform, token, app_version, is_active)
        VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(token) DO UPDATE SET
            user_id = excluded.user_id,
            platform = excluded.platform,
            app_version = excluded.app_version,
            is_active = 1,
            updated_at = CURRENT_TIMESTAMP
        """,
        (current_user["id"], platform, device_token, app_version),
    )
    conn.commit()
    conn.close()
    return {"status": "registered"}


@app.post("/mobile/devices/unregister")
def unregister_mobile_device(
    payload: MobileDeviceUnregister,
    current_user: dict = Depends(get_current_user),
):
    device_token = payload.token.strip()
    if not device_token:
        raise HTTPException(status_code=400, detail="Le token device est requis")

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE mobile_devices
        SET is_active = 0, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND token = ?
        """,
        (current_user["id"], device_token),
    )
    conn.commit()
    conn.close()
    return {"status": "unregistered"}


@app.get("/social/feed")
def social_feed(limit: int = 30, current_user: dict = Depends(get_current_user)):
    safe_limit = max(1, min(limit, 60))

    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    reviews = fetch_serialized_reviews(
        cursor,
        current_user["id"],
        """
        r.user_id = ?
        OR r.user_id IN (
            SELECT followed_id
            FROM follows
            WHERE follower_id = ?
        )
        """,
        (current_user["id"], current_user["id"]),
        safe_limit,
    )
    conn.close()
    return reviews


@app.post("/social/reviews")
def create_review(review: ReviewCreate, current_user: dict = Depends(get_current_user)):
    review_title = review.title.strip()
    review_content = review.content.strip()
    poster_url = review.poster_url.strip()

    if review.rating < 1 or review.rating > 5:
        raise HTTPException(status_code=400, detail="La note doit être comprise entre 1 et 5")
    if len(review_title) < 1:
        raise HTTPException(status_code=400, detail="Le titre du film est requis")
    if len(review_content) < 10:
        raise HTTPException(status_code=400, detail="La critique doit contenir au moins 10 caractères")

    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO reviews (user_id, movie_id, title, poster_url, rating, content)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            current_user["id"],
            review.movie_id,
            review_title,
            poster_url,
            review.rating,
            review_content,
        ),
    )
    review_id = cursor.lastrowid
    cursor.execute(
        """
        INSERT OR REPLACE INTO user_ratings (user_id, movie_id, rating, title, poster_url)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            current_user["id"],
            review.movie_id,
            review.rating,
            review_title,
            poster_url,
        ),
    )
    cursor.execute(
        "SELECT follower_id FROM follows WHERE followed_id = ?",
        (current_user["id"],),
    )
    for follower_row in cursor.fetchall():
        follower_id = int(follower_row["follower_id"])
        create_notification(
            cursor,
            follower_id,
            current_user["id"],
            "review",
            review_id=review_id,
        )
        send_native_push_notifications(
            cursor,
            [follower_id],
            title="Nouvelle critique",
            body=f"@{current_user['username']} a publie une critique sur {review_title}",
            route="/social",
            extra_data={"type": "review", "reviewId": review_id},
        )
    conn.commit()

    created_reviews = fetch_serialized_reviews(
        cursor,
        current_user["id"],
        "r.id = ?",
        (review_id,),
        1,
    )
    conn.close()

    if not created_reviews:
        raise HTTPException(status_code=500, detail="Impossible de relire la critique créée")

    return created_reviews[0]


@app.get("/social/reviews/{review_id}/comments")
def social_review_comments(review_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM reviews WHERE id = ?", (review_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Critique introuvable")

    comments = fetch_review_comments(cursor, review_id)
    conn.close()
    return comments


@app.post("/social/reviews/{review_id}/comments")
def create_review_comment(
    review_id: int,
    payload: CommentCreate,
    current_user: dict = Depends(get_current_user),
):
    content = payload.content.strip()
    if len(content) < 2:
        raise HTTPException(status_code=400, detail="Le commentaire est trop court")

    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, user_id FROM reviews WHERE id = ?",
        (review_id,),
    )
    review_row = cursor.fetchone()
    if not review_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Critique introuvable")

    parent_user_id = None
    if payload.parent_id is not None:
        cursor.execute(
            "SELECT id, user_id FROM comments WHERE id = ? AND review_id = ?",
            (payload.parent_id, review_id),
        )
        parent_row = cursor.fetchone()
        if not parent_row:
            conn.close()
            raise HTTPException(status_code=400, detail="Réponse invalide")
        parent_user_id = int(parent_row["user_id"])

    cursor.execute(
        """
        INSERT INTO comments (review_id, user_id, parent_id, content)
        VALUES (?, ?, ?, ?)
        """,
        (review_id, current_user["id"], payload.parent_id, content),
    )
    comment_id = cursor.lastrowid

    review_owner_id = int(review_row["user_id"])
    if review_owner_id != current_user["id"]:
        create_notification(
            cursor,
            review_owner_id,
            current_user["id"],
            "comment",
            review_id=review_id,
            comment_id=comment_id,
        )
        send_native_push_notifications(
            cursor,
            [review_owner_id],
            title="Nouveau commentaire",
            body=f"@{current_user['username']} a commente ta critique",
            route="/social",
            extra_data={"type": "comment", "reviewId": review_id},
        )

    if parent_user_id is not None and parent_user_id not in (current_user["id"], review_owner_id):
        create_notification(
            cursor,
            parent_user_id,
            current_user["id"],
            "reply",
            review_id=review_id,
            comment_id=comment_id,
        )
        send_native_push_notifications(
            cursor,
            [parent_user_id],
            title="Nouvelle reponse",
            body=f"@{current_user['username']} a repondu a ton commentaire",
            route="/social",
            extra_data={"type": "reply", "reviewId": review_id},
        )

    conn.commit()
    cursor.execute(
        """
        SELECT
            c.id,
            c.review_id,
            c.parent_id,
            c.content,
            c.created_at,
            u.id AS user_id,
            u.username,
            parent_user.username AS reply_to_username
        FROM comments c
        JOIN users u ON u.id = c.user_id
        LEFT JOIN comments parent_comment ON parent_comment.id = c.parent_id
        LEFT JOIN users parent_user ON parent_user.id = parent_comment.user_id
        WHERE c.id = ?
        """,
        (comment_id,),
    )
    created_comment = cursor.fetchone()
    conn.close()

    if not created_comment:
        raise HTTPException(status_code=500, detail="Impossible de relire le commentaire créé")

    return serialize_comment_row(created_comment)


@app.post("/social/reviews/{review_id}/like")
def toggle_review_like(review_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    cursor.execute("SELECT user_id, title FROM reviews WHERE id = ?", (review_id,))
    review_row = cursor.fetchone()
    if not review_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Critique introuvable")
    review_owner_id = int(review_row["user_id"])
    review_title = str(review_row["title"] or "ce film")

    cursor.execute(
        "SELECT 1 FROM review_likes WHERE review_id = ? AND user_id = ?",
        (review_id, current_user["id"]),
    )
    already_liked = cursor.fetchone() is not None

    if already_liked:
        cursor.execute(
            "DELETE FROM review_likes WHERE review_id = ? AND user_id = ?",
            (review_id, current_user["id"]),
        )
    else:
        cursor.execute(
            "INSERT INTO review_likes (review_id, user_id) VALUES (?, ?)",
            (review_id, current_user["id"]),
        )
        create_notification(cursor, review_owner_id, current_user["id"], "like", review_id=review_id)
        send_native_push_notifications(
            cursor,
            [review_owner_id],
            title="Critique aimee",
            body=f"@{current_user['username']} a aime ta critique sur {review_title}",
            route="/social",
            extra_data={"type": "like", "reviewId": review_id},
        )

    conn.commit()
    cursor.execute(
        "SELECT COUNT(*) FROM review_likes WHERE review_id = ?",
        (review_id,),
    )
    likes_count = cursor.fetchone()[0]
    conn.close()
    return {"liked": not already_liked, "likes_count": likes_count}


@app.get("/social/notifications")
def social_notifications(limit: int = 20, current_user: dict = Depends(get_current_user)):
    safe_limit = max(1, min(limit, 50))
    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    payload = fetch_notifications_payload(cursor, current_user["id"], safe_limit)
    conn.close()
    return payload


@app.post("/social/notifications/read-all")
def social_notifications_read_all(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0",
        (current_user["id"],),
    )
    updated_count = cursor.rowcount
    conn.commit()
    conn.close()
    return {"status": "ok", "updated": updated_count}


# --- 9. ROUTES MESSAGERIE ---
@app.get("/messages/conversations")
def message_conversations(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    conversations = fetch_direct_conversations(cursor, current_user["id"])
    conn.close()
    return conversations


@app.post("/messages/conversations/start/{target_user_id}")
def start_direct_conversation(target_user_id: int, current_user: dict = Depends(get_current_user)):
    if target_user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas ouvrir une conversation avec vous-même")

    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE id = ?", (target_user_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    conversation_id = get_or_create_direct_conversation(cursor, current_user["id"], target_user_id)
    conn.commit()
    conversation_row = get_direct_conversation_for_user(cursor, conversation_id, current_user["id"])
    conn.close()

    return {
        "id": conversation_row["id"],
        "participant": {
            "id": conversation_row["participant_id"],
            "username": conversation_row["participant_username"],
        },
    }


@app.get("/messages/conversations/{conversation_id}")
def get_direct_conversation_messages(conversation_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    conversation_row = get_direct_conversation_for_user(cursor, conversation_id, current_user["id"])

    cursor.execute(
        """
        SELECT
            dm.id,
            dm.content,
            dm.created_at,
            dm.sender_id,
            sender.username AS sender_username,
            dm.movie_id,
            dm.movie_title,
            dm.movie_poster_url,
            dm.movie_rating
        FROM direct_messages dm
        JOIN users sender ON sender.id = dm.sender_id
        WHERE dm.conversation_id = ?
        ORDER BY dm.id ASC
        """,
        (conversation_id,),
    )
    messages = [
        serialize_direct_message_row(row, current_user["id"])
        for row in cursor.fetchall()
    ]

    mark_direct_conversation_read(cursor, conversation_row, current_user["id"])
    conn.commit()
    conn.close()

    return {
        "conversation": {
            "id": conversation_row["id"],
            "participant": {
                "id": conversation_row["participant_id"],
                "username": conversation_row["participant_username"],
            },
        },
        "messages": messages,
    }


@app.post("/messages/conversations/{conversation_id}/messages")
async def create_direct_message(
    conversation_id: int,
    payload: MessageCreate,
    current_user: dict = Depends(get_current_user),
):
    content = (payload.content or "").strip()

    movie_id = payload.movie_id
    movie_title = (payload.movie_title or "").strip()
    movie_poster_url = (payload.movie_poster_url or "").strip()
    movie_rating = payload.movie_rating

    if movie_id is not None and (not movie_title or not movie_poster_url):
        details = get_tmdb_details(movie_id)
        if details:
            movie_title = details["title"]
            movie_poster_url = details["poster_url"]
            movie_rating = details["rating"]

    if not content and movie_id is None:
        raise HTTPException(status_code=400, detail="Le message ne peut pas être vide")

    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    conversation_row = get_direct_conversation_for_user(cursor, conversation_id, current_user["id"])

    cursor.execute(
        """
        INSERT INTO direct_messages (
            conversation_id,
            sender_id,
            content,
            movie_id,
            movie_title,
            movie_poster_url,
            movie_rating
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            conversation_id,
            current_user["id"],
            content,
            movie_id,
            movie_title or None,
            movie_poster_url or None,
            movie_rating,
        ),
    )
    message_id = cursor.lastrowid

    if conversation_row["user_one_id"] == current_user["id"]:
        cursor.execute(
            "UPDATE direct_conversations SET user_one_last_read_message_id = ? WHERE id = ?",
            (message_id, conversation_id),
        )
    else:
        cursor.execute(
            "UPDATE direct_conversations SET user_two_last_read_message_id = ? WHERE id = ?",
            (message_id, conversation_id),
        )

    conn.commit()
    cursor.execute(
        """
        SELECT
            dm.id,
            dm.content,
            dm.created_at,
            dm.sender_id,
            sender.username AS sender_username,
            dm.movie_id,
            dm.movie_title,
            dm.movie_poster_url,
            dm.movie_rating
        FROM direct_messages dm
        JOIN users sender ON sender.id = dm.sender_id
        WHERE dm.id = ?
        """,
        (message_id,),
    )
    message_row = cursor.fetchone()

    if not message_row:
        conn.close()
        raise HTTPException(status_code=500, detail="Impossible de relire le message créé")

    serialized_message = serialize_direct_message_row(message_row, current_user["id"])
    recipient_user_id = int(conversation_row["participant_id"])
    send_native_push_notifications(
        cursor,
        [recipient_user_id],
        title=f"Message de @{current_user['username']}",
        body=build_direct_message_push_body(current_user["username"], content, movie_title),
        route=f"/messages?conversationId={conversation_id}",
        extra_data={
            "type": "dm",
            "conversationId": conversation_id,
        },
    )
    conn.commit()
    conn.close()
    await realtime_manager.broadcast_to_users(
        [current_user["id"], recipient_user_id],
        {
            "type": "messages.updated",
            "conversation_id": conversation_id,
            "message_id": message_id,
        },
    )
    return serialized_message


@app.get("/messages/unread-count")
def unread_direct_message_count(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    unread_count = get_total_unread_direct_messages(cursor, current_user["id"])
    conn.close()
    return {"unread_count": unread_count}


@app.websocket("/ws/realtime")
async def realtime_websocket(websocket: WebSocket, token: str = Query(...)):
    try:
        user = get_user_from_token(token)
    except HTTPException:
        await websocket.close(code=1008)
        return

    await realtime_manager.connect(user["id"], websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        realtime_manager.disconnect(user["id"], websocket)
    except Exception:
        realtime_manager.disconnect(user["id"], websocket)


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
