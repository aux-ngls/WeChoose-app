import ast
import base64
from collections import defaultdict
import json
import os
import sqlite3
import datetime
import time
import uuid
from functools import lru_cache
from typing import Optional
from fastapi import FastAPI, HTTPException, Depends, status, WebSocket, WebSocketDisconnect, Query, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
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

try:
    from cryptography.hazmat.primitives import serialization
    from py_vapid import Vapid02
    from pywebpush import WebPushException, webpush
except Exception:
    serialization = None
    Vapid02 = None
    WebPushException = Exception
    webpush = None

# --- CONFIGURATION SÉCURITÉ ---
SECRET_KEY = "votre_super_cle_secrete_a_changer_en_prod"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 # 24 heures

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8"
FCM_SERVER_KEY = os.getenv("FCM_SERVER_KEY", "").strip()
WEB_PUSH_SUBJECT = os.getenv("WEB_PUSH_SUBJECT", "").strip() or "mailto:notifications@qulte.app"
app = FastAPI(title="Qulte API")

WATCH_LATER_SYSTEM_ID = -1
FAVORITES_SYSTEM_ID = -2
HISTORY_SYSTEM_ID = -3
WATCH_LATER_NAME = "À regarder plus tard"
NOW_PLAYING_CACHE_TTL_SECONDS = 300
NEWS_HIGHLIGHTS_CACHE_TTL_SECONDS = 90
now_playing_cache: dict[str, object] = {"expires_at": 0.0, "items": []}
news_highlights_cache: dict[int, tuple[float, dict]] = {}
TEST_AI_ALGORITHM_VARIANT = "seed_cluster_feedback_v1"
MOBILE_ARCHIVE_PATH = "/home/wechoose/frontend/public/downloads/wechoose-mobile.tar.gz"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
AVATAR_UPLOAD_DIR = os.path.join(BASE_DIR, "uploads", "avatars")
AVATAR_PUBLIC_PREFIX = "/uploads/avatars"
MAX_AVATAR_BYTES = 5 * 1024 * 1024
AVATAR_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


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


def extract_primary_genre_name(value) -> str:
    if not isinstance(value, str) or not value:
        return "Autres"

    try:
        items = ast.literal_eval(value)
    except (ValueError, SyntaxError):
        return "Autres"

    for item in items:
        genre_name = item.get("name") if isinstance(item, dict) else None
        if genre_name:
            return str(genre_name)

    return "Autres"


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


@lru_cache(maxsize=2048)
def get_tmdb_movie_summary(movie_id: int) -> Optional[dict]:
    try:
        url = f"https://api.themoviedb.org/3/movie/{movie_id}?api_key={TMDB_API_KEY}&language=fr-FR"
        data = requests.get(url, timeout=2).json()
    except Exception:
        return None

    return normalize_tmdb_movie(data if isinstance(data, dict) else {})


def get_display_movie_title(movie_id: int) -> str:
    movie_index = movie_index_by_id.get(int(movie_id))
    if movie_index is not None and not movies_df.empty:
        title = str(movies_df.iloc[movie_index].get("title") or "").strip()
        if title:
            return title

    summary = get_tmdb_movie_summary(int(movie_id))
    if summary and summary.get("title"):
        return str(summary["title"])

    return f"Film #{movie_id}"


def init_db():
    os.makedirs(AVATAR_UPLOAD_DIR, exist_ok=True)
    conn = get_db_connection()
    cursor = conn.cursor()

    def ensure_column(table_name: str, column_name: str, column_definition: str):
        cursor.execute(f"PRAGMA table_info({table_name})")
        existing_columns = {row[1] for row in cursor.fetchall()}
        if column_name not in existing_columns:
            cursor.execute(
                f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_definition}"
            )
    
    # Table USERS
    cursor.execute('''CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT, 
                        username TEXT UNIQUE, 
                        password_hash TEXT)''')
    ensure_column("users", "avatar_url", "TEXT")

    # Table USER_PREFERENCES
    cursor.execute('''CREATE TABLE IF NOT EXISTS user_preferences (
                        user_id INTEGER PRIMARY KEY,
                        favorite_genres TEXT DEFAULT '[]',
                        favorite_people TEXT DEFAULT '[]',
                        favorite_movie_ids TEXT DEFAULT '[]',
                        people_seed_movie_ids TEXT DEFAULT '[]',
                        onboarding_completed_at TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
    ensure_column("user_preferences", "profile_genres", "TEXT DEFAULT '[]'")
    ensure_column("user_preferences", "profile_people", "TEXT DEFAULT '[]'")
    ensure_column("user_preferences", "profile_people_data", "TEXT DEFAULT '[]'")
    ensure_column("user_preferences", "profile_movie_ids", "TEXT DEFAULT '[]'")
    ensure_column("user_preferences", "profile_soundtrack", "TEXT DEFAULT '{}'")
    ensure_column("user_preferences", "profile_description", "TEXT DEFAULT ''")
    ensure_column("user_preferences", "tutorial_completed_at", "TIMESTAMP")
    
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
                        added_at TIMESTAMP,
                        UNIQUE(playlist_id, movie_id))''')

    cursor.execute("PRAGMA table_info(playlist_items)")
    playlist_item_columns = {row[1] for row in cursor.fetchall()}
    if "added_at" not in playlist_item_columns:
        cursor.execute("ALTER TABLE playlist_items ADD COLUMN added_at TIMESTAMP")
    if "sort_index" not in playlist_item_columns:
        cursor.execute("ALTER TABLE playlist_items ADD COLUMN sort_index INTEGER")

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

    # Table WEB_PUSH_SUBSCRIPTIONS
    cursor.execute('''CREATE TABLE IF NOT EXISTS web_push_subscriptions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER,
                        endpoint TEXT UNIQUE,
                        subscription_json TEXT,
                        user_agent TEXT,
                        is_active INTEGER DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_user_id ON web_push_subscriptions(user_id)"
    )

    # Table APP_SETTINGS
    cursor.execute('''CREATE TABLE IF NOT EXISTS app_settings (
                        key TEXT PRIMARY KEY,
                        value TEXT,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')

    # Table RECOMMENDATION_IMPRESSIONS
    cursor.execute('''CREATE TABLE IF NOT EXISTS recommendation_impressions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        request_id TEXT,
                        user_id INTEGER,
                        movie_id INTEGER,
                        mode TEXT,
                        algorithm_variant TEXT,
                        rank INTEGER,
                        reason TEXT,
                        seed_movie_id INTEGER,
                        seed_title TEXT,
                        seed_similarity REAL,
                        shown_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        responded_at TIMESTAMP,
                        reaction_type TEXT,
                        reaction_rating REAL)''')
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_recommendation_impressions_user_movie ON recommendation_impressions(user_id, movie_id, shown_at)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_recommendation_impressions_feedback ON recommendation_impressions(user_id, responded_at, algorithm_variant)"
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
    movies_df["keyword_tokens"] = (
        movies_df["keywords"].apply(extract_json_names)
        if "keywords" in movies_df.columns
        else [[] for _ in range(len(movies_df))]
    )
    movies_df["primary_genre"] = (
        movies_df["genres"].apply(extract_primary_genre_name)
        if "genres" in movies_df.columns
        else ["Autres" for _ in range(len(movies_df))]
    )
    max_popularity = max(float(movies_df["popularity"].max()), 1.0)
    max_vote_count = max(float(movies_df["vote_count"].max()), 1.0)
    global_vote_average = float(movies_df["vote_average"].mean() or 6.2)
    rating_confidence_threshold = max(
        60.0,
        float(movies_df["vote_count"].quantile(0.60) or 0.0),
    )
    movies_df["audience_rating_score"] = (
        (
            (movies_df["vote_count"] / (movies_df["vote_count"] + rating_confidence_threshold))
            * (movies_df["vote_average"] / 10.0)
        )
        + (
            (rating_confidence_threshold / (movies_df["vote_count"] + rating_confidence_threshold))
            * (global_vote_average / 10.0)
        )
    )
    movies_df["quality_score"] = (
        (movies_df["audience_rating_score"] * 0.68)
        + ((np.log1p(movies_df["popularity"]) / np.log1p(max_popularity)) * 0.12)
        + ((np.log1p(movies_df["vote_count"]) / np.log1p(max_vote_count)) * 0.20)
    )
    cv = CountVectorizer(max_features=5000, stop_words='english')
    vectors = cv.fit_transform(movies_df['soup']).toarray()
    movie_ids_array = movies_df["id"].astype(int).to_numpy()
    movie_index_by_id = {
        int(movie_id): index
        for index, movie_id in enumerate(movie_ids_array.tolist())
    }
    movie_primary_genre_by_id = {
        int(row["id"]): str(row["primary_genre"] or "Autres")
        for _, row in movies_df[["id", "primary_genre"]].iterrows()
    }
    print("✅ IA Prête !")
except Exception as ex:
    print(f"Erreur IA (ou démarrage sans modèle): {ex}")
    movies_df = pd.DataFrame()
    vectors = None
    movie_ids_array = np.array([])
    movie_index_by_id = {}
    movie_primary_genre_by_id = {}

# --- 3. OUTILS AUTHENTIFICATION ---
class UserCreate(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    has_completed_onboarding: bool = False
    has_completed_tutorial: bool = False


class OnboardingPreferencesPayload(BaseModel):
    favorite_genres: list[str] = []
    favorite_people: list[str] = []
    favorite_movie_ids: list[int] = []


class ProfilePreferencesPayload(BaseModel):
    profile_description: str = ""
    profile_genres: list[str] = []
    profile_people: list[dict] = []
    profile_movie_ids: list[int] = []
    profile_soundtrack: Optional[dict] = None


class RecommendationImpressionPayload(BaseModel):
    movie_id: int
    mode: str = "tinder"
    rank: int = 1
    reason: str = ""
    algorithm_variant: str = TEST_AI_ALGORITHM_VARIANT
    seed_movie_id: Optional[int] = None
    seed_title: Optional[str] = None
    seed_similarity: Optional[float] = None


def normalize_username(username: str) -> str:
    return username.strip()


def normalize_profile_description(value: Optional[str]) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.split())[:180]


def avatar_media_type(filename: str) -> str:
    extension = os.path.splitext(filename)[1].lower()
    if extension == ".png":
        return "image/png"
    if extension == ".webp":
        return "image/webp"
    return "image/jpeg"


def local_avatar_path_from_url(avatar_url: Optional[str]) -> Optional[str]:
    if not avatar_url or not avatar_url.startswith(f"{AVATAR_PUBLIC_PREFIX}/"):
        return None
    filename = os.path.basename(avatar_url)
    if not filename:
        return None
    return os.path.join(AVATAR_UPLOAD_DIR, filename)


def normalize_preference_label(value: str) -> str:
    return " ".join(value.strip().split())


def normalize_genre_token(value: str) -> str:
    return normalize_preference_label(value).replace(" ", "").lower()


def present_affinity_token(token: str) -> str:
    normalized_token = normalize_genre_token(token)
    special_labels = {
        "sciencefiction": "Science-fiction",
        "tvmovie": "Telefilm",
    }
    if normalized_token in special_labels:
        return special_labels[normalized_token]
    return normalize_preference_label(str(token).replace("_", " ").replace("-", " ")).title()


def dump_json_list(values: list) -> str:
    return json.dumps(values, ensure_ascii=False)


def dump_json_dict(value: dict) -> str:
    return json.dumps(value, ensure_ascii=False)


def load_json_list(raw_value: Optional[str]) -> list:
    if not raw_value:
        return []

    try:
        parsed_value = json.loads(raw_value)
    except (TypeError, json.JSONDecodeError):
        return []

    return parsed_value if isinstance(parsed_value, list) else []


def load_json_dict(raw_value: Optional[str]) -> dict:
    if not raw_value:
        return {}

    try:
        parsed_value = json.loads(raw_value)
    except (TypeError, json.JSONDecodeError):
        return {}

    return parsed_value if isinstance(parsed_value, dict) else {}


def dedupe_list(values: list) -> list:
    return list(dict.fromkeys(values))


def serialize_tmdb_person(person: dict) -> Optional[dict]:
    person_id = person.get("id")
    name = normalize_preference_label(str(person.get("name") or ""))
    if not name:
        return None

    return {
        "id": int(person_id) if isinstance(person_id, int) else None,
        "name": name,
        "photo_url": (
            f"https://image.tmdb.org/t/p/w300{person.get('profile_path')}"
            if person.get("profile_path")
            else None
        ),
        "known_for_department": normalize_preference_label(
            str(person.get("known_for_department") or "")
        )
        or None,
    }


@lru_cache(maxsize=256)
def search_tmdb_people(query: str) -> tuple[dict, ...]:
    normalized_query = normalize_preference_label(query)
    if len(normalized_query) < 2:
        return ()

    try:
        response = requests.get(
            "https://api.themoviedb.org/3/search/person",
            params={
                "api_key": TMDB_API_KEY,
                "language": "fr-FR",
                "query": normalized_query,
                "include_adult": "false",
                "page": 1,
            },
            timeout=3,
        )
        results = response.json().get("results", [])[:10]
    except Exception:
        results = []

    serialized_people = [
        serialized
        for serialized in (serialize_tmdb_person(person) for person in results)
        if serialized
    ]
    return tuple(serialized_people)


@lru_cache(maxsize=256)
def resolve_tmdb_person_from_name(name: str) -> Optional[dict]:
    results = search_tmdb_people(name)
    if results:
        return dict(results[0])

    normalized_name = normalize_preference_label(name)
    if not normalized_name:
        return None

    return {
        "id": None,
        "name": normalized_name,
        "photo_url": None,
        "known_for_department": None,
    }


def normalize_profile_person_entry(value) -> Optional[dict]:
    if isinstance(value, str):
        return resolve_tmdb_person_from_name(value)

    if not isinstance(value, dict):
        return None

    name = normalize_preference_label(str(value.get("name") or ""))
    if not name:
        return None

    person_id = value.get("id")
    photo_url = str(value.get("photo_url") or "").strip() or None
    known_for_department = normalize_preference_label(
        str(value.get("known_for_department") or "")
    ) or None

    return {
        "id": int(person_id) if isinstance(person_id, int) else None,
        "name": name,
        "photo_url": photo_url,
        "known_for_department": known_for_department,
    }


def dedupe_profile_people(values: list) -> list[dict]:
    deduped: list[dict] = []
    seen_keys: set[str] = set()
    for value in values:
        normalized = normalize_profile_person_entry(value)
        if not normalized:
            continue
        dedupe_key = (
            f"id:{normalized['id']}"
            if normalized.get("id") is not None
            else f"name:{normalized['name'].lower()}"
        )
        if dedupe_key in seen_keys:
            continue
        seen_keys.add(dedupe_key)
        deduped.append(normalized)
    return deduped


def normalize_profile_soundtrack_entry(value) -> Optional[dict]:
    if not isinstance(value, dict):
        return None

    track_name = normalize_preference_label(str(value.get("track_name") or ""))
    artist_name = normalize_preference_label(str(value.get("artist_name") or ""))
    preview_url = str(value.get("preview_url") or "").strip()
    if not track_name or not artist_name or not preview_url:
        return None

    return {
        "track_name": track_name,
        "artist_name": artist_name,
        "preview_url": preview_url,
        "artwork_url": str(value.get("artwork_url") or "").strip() or None,
        "source_url": str(value.get("source_url") or "").strip() or None,
        "collection_name": normalize_preference_label(
            str(value.get("collection_name") or "")
        )
        or None,
    }


@lru_cache(maxsize=256)
def search_soundtracks(query: str) -> tuple[dict, ...]:
    normalized_query = normalize_preference_label(query)
    if len(normalized_query) < 2:
        return ()

    try:
        response = requests.get(
            "https://itunes.apple.com/search",
            params={
                "term": normalized_query,
                "media": "music",
                "entity": "song",
                "limit": 12,
                "country": "FR",
            },
            timeout=3,
        )
        results = response.json().get("results", [])
    except Exception:
        results = []

    serialized_tracks: list[dict] = []
    seen_preview_urls: set[str] = set()
    for track in results:
        preview_url = str(track.get("previewUrl") or "").strip()
        track_name = normalize_preference_label(str(track.get("trackName") or ""))
        artist_name = normalize_preference_label(str(track.get("artistName") or ""))
        if not preview_url or not track_name or not artist_name:
            continue
        if preview_url in seen_preview_urls:
            continue
        seen_preview_urls.add(preview_url)
        artwork_url = str(track.get("artworkUrl100") or "").strip()
        if artwork_url:
            artwork_url = artwork_url.replace("100x100bb", "600x600bb")
        serialized_tracks.append(
            {
                "track_name": track_name,
                "artist_name": artist_name,
                "preview_url": preview_url,
                "artwork_url": artwork_url or None,
                "source_url": str(track.get("trackViewUrl") or "").strip() or None,
                "collection_name": normalize_preference_label(
                    str(track.get("collectionName") or "")
                )
                or None,
            }
        )
    return tuple(serialized_tracks)


def has_existing_taste_signals(cursor, user_id: int) -> bool:
    cursor.execute("SELECT COUNT(*) FROM user_ratings WHERE user_id = ?", (user_id,))
    ratings_count = int(cursor.fetchone()[0] or 0)
    cursor.execute(
        """
        SELECT COUNT(*)
        FROM playlist_items pi
        JOIN playlists p ON p.id = pi.playlist_id
        WHERE p.user_id = ? AND p.name = ?
        """,
        (user_id, WATCH_LATER_NAME),
    )
    watch_later_count = int(cursor.fetchone()[0] or 0)
    return ratings_count >= 4 or watch_later_count >= 3


def get_user_preferences(cursor, user_id: int) -> dict:
    cursor.execute(
        """
        SELECT
            favorite_genres,
            favorite_people,
            favorite_movie_ids,
            people_seed_movie_ids,
            onboarding_completed_at,
            profile_genres,
            profile_people,
            profile_people_data,
            profile_movie_ids,
            profile_soundtrack,
            profile_description,
            tutorial_completed_at
        FROM user_preferences
        WHERE user_id = ?
        """,
        (user_id,),
    )
    row = cursor.fetchone()
    if not row:
        return {
            "favorite_genres": [],
            "favorite_people": [],
            "favorite_movie_ids": [],
            "people_seed_movie_ids": [],
            "profile_genres": [],
            "profile_people": [],
            "profile_people_data": [],
            "profile_movie_ids": [],
            "profile_soundtrack": None,
            "profile_description": "",
            "has_completed_onboarding": has_existing_taste_signals(cursor, user_id),
            "has_completed_tutorial": False,
        }

    favorite_genres = [
        value for value in load_json_list(row[0]) if isinstance(value, str) and value.strip()
    ]
    favorite_people = [
        value for value in load_json_list(row[1]) if isinstance(value, str) and value.strip()
    ]
    favorite_movie_ids = [
        int(value) for value in load_json_list(row[2]) if isinstance(value, int)
    ]
    profile_genres = [
        value for value in load_json_list(row[5]) if isinstance(value, str) and value.strip()
    ]
    profile_people = [
        value for value in load_json_list(row[6]) if isinstance(value, str) and value.strip()
    ]
    profile_people_data = dedupe_profile_people(load_json_list(row[7]))[:6]
    profile_movie_ids = [
        int(value) for value in load_json_list(row[8]) if isinstance(value, int)
    ]
    profile_soundtrack = normalize_profile_soundtrack_entry(load_json_dict(row[9]))
    profile_description = normalize_profile_description(row[10])

    if not profile_people_data and profile_people:
        profile_people_data = dedupe_profile_people(profile_people)[:6]

    return {
        "favorite_genres": favorite_genres,
        "favorite_people": favorite_people,
        "favorite_movie_ids": favorite_movie_ids,
        "people_seed_movie_ids": [
            int(value) for value in load_json_list(row[3]) if isinstance(value, int)
        ],
        "profile_genres": profile_genres,
        "profile_people": profile_people,
        "profile_people_data": profile_people_data,
        "profile_movie_ids": profile_movie_ids,
        "profile_soundtrack": profile_soundtrack,
        "profile_description": profile_description,
        "has_completed_onboarding": bool(row[4]) or has_existing_taste_signals(cursor, user_id),
        "has_completed_tutorial": bool(row[11]),
    }


def serialize_profile_preferences(preferences: dict) -> dict:
    profile_movie_ids = [
        int(movie_id) for movie_id in preferences.get("profile_movie_ids", []) if isinstance(movie_id, int)
    ][:6]
    profile_movies = [
        movie
        for movie in (get_tmdb_movie_summary(movie_id) for movie_id in profile_movie_ids)
        if movie
    ]

    return {
        "profile_genres": [
            value
            for value in preferences.get("profile_genres", [])
            if isinstance(value, str) and value.strip()
        ][:5],
        "profile_people": dedupe_profile_people(preferences.get("profile_people_data", []))[:6],
        "profile_movie_ids": profile_movie_ids,
        "profile_movies": profile_movies,
        "profile_soundtrack": normalize_profile_soundtrack_entry(
            preferences.get("profile_soundtrack")
        ),
        "profile_description": normalize_profile_description(
            preferences.get("profile_description")
        ),
    }

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
    cursor.execute("SELECT id, username, avatar_url FROM users WHERE username = ?", (username,))
    user = cursor.fetchone()
    if user is None:
        conn.close()
        raise credentials_exception

    preferences = get_user_preferences(cursor, int(user[0]))
    conn.close()
    return {
        "id": int(user[0]),
        "username": user[1],
        "avatar_url": user[2],
        "has_completed_onboarding": preferences["has_completed_onboarding"],
        "has_completed_tutorial": preferences["has_completed_tutorial"],
    }


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
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "has_completed_onboarding": False,
        "has_completed_tutorial": False,
    }

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
    preferences = get_user_preferences(cursor, int(row[0]))
    conn.commit()
    conn.close()
    
    access_token = create_access_token(data={"sub": username})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "has_completed_onboarding": preferences["has_completed_onboarding"],
        "has_completed_tutorial": preferences["has_completed_tutorial"],
    }

@app.get("/users/me")
def read_users_me(current_user: dict = Depends(get_current_user)):
    return current_user


@app.get("/uploads/avatars/{filename}")
def get_uploaded_avatar(filename: str):
    safe_filename = os.path.basename(filename)
    if safe_filename != filename:
        raise HTTPException(status_code=400, detail="Nom de fichier invalide")

    path = os.path.join(AVATAR_UPLOAD_DIR, safe_filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Avatar introuvable")

    return FileResponse(path, media_type=avatar_media_type(safe_filename))


@app.post("/profile/avatar")
async def upload_profile_avatar(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    content_type = (file.content_type or "").split(";")[0].lower()
    extension = AVATAR_CONTENT_TYPES.get(content_type)
    if not extension:
        raise HTTPException(status_code=400, detail="Format image non supporte")

    content = await file.read(MAX_AVATAR_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="Image vide")
    if len(content) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=400, detail="Image trop volumineuse")

    os.makedirs(AVATAR_UPLOAD_DIR, exist_ok=True)
    filename = f"user-{current_user['id']}-{int(time.time())}-{uuid.uuid4().hex[:10]}{extension}"
    avatar_path = os.path.join(AVATAR_UPLOAD_DIR, filename)
    with open(avatar_path, "wb") as avatar_file:
        avatar_file.write(content)

    avatar_url = f"{AVATAR_PUBLIC_PREFIX}/{filename}"
    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    cursor.execute("SELECT avatar_url FROM users WHERE id = ?", (current_user["id"],))
    row = cursor.fetchone()
    previous_avatar_url = row["avatar_url"] if row else None
    cursor.execute("UPDATE users SET avatar_url = ? WHERE id = ?", (avatar_url, current_user["id"]))
    conn.commit()
    conn.close()

    previous_path = local_avatar_path_from_url(previous_avatar_url)
    if previous_path and previous_path != avatar_path and os.path.exists(previous_path):
        try:
            os.remove(previous_path)
        except OSError:
            pass

    return {"avatar_url": avatar_url}


@app.post("/tutorial/complete")
def complete_tutorial(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO user_preferences (user_id, tutorial_completed_at, updated_at)
        VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
            tutorial_completed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        """,
        (current_user["id"],),
    )
    conn.commit()
    conn.close()
    return {"status": "completed"}


def delete_many_by_ids(cursor, table_name: str, column_name: str, values: list[int]) -> int:
    ids = [int(value) for value in dict.fromkeys(values)]
    if not ids:
        return 0

    placeholders = ",".join("?" for _ in ids)
    cursor.execute(
        f"DELETE FROM {table_name} WHERE {column_name} IN ({placeholders})",
        ids,
    )
    return max(cursor.rowcount, 0)


@app.post("/users/me/reset-test-data")
def reset_test_user_data(current_user: dict = Depends(get_current_user)):
    if str(current_user["username"]).strip().lower() != "test":
        raise HTTPException(status_code=403, detail="Reset reserve au compte test.")

    user_id = int(current_user["id"])
    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    reset_counts: dict[str, int] = {}

    cursor.execute("SELECT id FROM reviews WHERE user_id = ?", (user_id,))
    review_ids = [int(row["id"]) for row in cursor.fetchall()]
    cursor.execute("SELECT id FROM comments WHERE user_id = ?", (user_id,))
    comment_ids = [int(row["id"]) for row in cursor.fetchall()]
    cursor.execute("SELECT id FROM playlists WHERE user_id = ?", (user_id,))
    playlist_ids = [int(row["id"]) for row in cursor.fetchall()]
    cursor.execute(
        "SELECT id FROM direct_conversations WHERE user_one_id = ? OR user_two_id = ?",
        (user_id, user_id),
    )
    conversation_ids = [int(row["id"]) for row in cursor.fetchall()]

    reset_counts["notifications"] = 0
    cursor.execute(
        "DELETE FROM notifications WHERE user_id = ? OR actor_user_id = ?",
        (user_id, user_id),
    )
    reset_counts["notifications"] += max(cursor.rowcount, 0)
    reset_counts["notifications"] += delete_many_by_ids(cursor, "notifications", "review_id", review_ids)
    reset_counts["notifications"] += delete_many_by_ids(cursor, "notifications", "comment_id", comment_ids)

    reset_counts["comments"] = 0
    reset_counts["comments"] += delete_many_by_ids(cursor, "comments", "review_id", review_ids)
    reset_counts["comments"] += delete_many_by_ids(cursor, "comments", "parent_id", comment_ids)
    cursor.execute("DELETE FROM comments WHERE user_id = ?", (user_id,))
    reset_counts["comments"] += max(cursor.rowcount, 0)

    reset_counts["review_likes"] = 0
    reset_counts["review_likes"] += delete_many_by_ids(cursor, "review_likes", "review_id", review_ids)
    cursor.execute("DELETE FROM review_likes WHERE user_id = ?", (user_id,))
    reset_counts["review_likes"] += max(cursor.rowcount, 0)

    cursor.execute("DELETE FROM reviews WHERE user_id = ?", (user_id,))
    reset_counts["reviews"] = max(cursor.rowcount, 0)

    cursor.execute("DELETE FROM follows WHERE follower_id = ? OR followed_id = ?", (user_id, user_id))
    reset_counts["follows"] = max(cursor.rowcount, 0)

    cursor.execute("DELETE FROM user_ratings WHERE user_id = ?", (user_id,))
    reset_counts["ratings"] = max(cursor.rowcount, 0)

    cursor.execute("DELETE FROM recommendation_impressions WHERE user_id = ?", (user_id,))
    reset_counts["recommendation_impressions"] = max(cursor.rowcount, 0)

    reset_counts["playlist_items"] = delete_many_by_ids(cursor, "playlist_items", "playlist_id", playlist_ids)
    cursor.execute("DELETE FROM playlists WHERE user_id = ?", (user_id,))
    reset_counts["playlists"] = max(cursor.rowcount, 0)

    reset_counts["direct_messages"] = delete_many_by_ids(cursor, "direct_messages", "conversation_id", conversation_ids)
    cursor.execute("DELETE FROM direct_conversations WHERE user_one_id = ? OR user_two_id = ?", (user_id, user_id))
    reset_counts["direct_conversations"] = max(cursor.rowcount, 0)

    cursor.execute("DELETE FROM user_preferences WHERE user_id = ?", (user_id,))
    reset_counts["preferences"] = max(cursor.rowcount, 0)

    cursor.execute("SELECT avatar_url FROM users WHERE id = ?", (user_id,))
    avatar_row = cursor.fetchone()
    previous_avatar_url = avatar_row["avatar_url"] if avatar_row else None
    cursor.execute("UPDATE users SET avatar_url = NULL WHERE id = ?", (user_id,))
    reset_counts["avatar"] = 1 if previous_avatar_url else 0

    get_or_create_watch_later_id(cursor, user_id)
    conn.commit()
    conn.close()

    previous_avatar_path = local_avatar_path_from_url(previous_avatar_url)
    if previous_avatar_path and os.path.exists(previous_avatar_path):
        try:
            os.remove(previous_avatar_path)
        except OSError:
            pass

    return {
        "status": "reset",
        "counts": reset_counts,
        "has_completed_onboarding": False,
        "has_completed_tutorial": False,
    }


@app.get("/onboarding/preferences")
def get_onboarding_preferences(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    preferences = get_user_preferences(cursor, current_user["id"])
    conn.close()
    return preferences


@app.post("/onboarding/preferences")
def save_onboarding_preferences(
    payload: OnboardingPreferencesPayload,
    current_user: dict = Depends(get_current_user),
):
    favorite_genres = dedupe_list(
        [
            normalize_preference_label(value)
            for value in payload.favorite_genres
            if isinstance(value, str) and normalize_preference_label(value)
        ]
    )[:8]
    favorite_people = dedupe_list(
        [
            normalize_preference_label(value)
            for value in payload.favorite_people
            if isinstance(value, str) and normalize_preference_label(value)
        ]
    )[:6]
    favorite_movie_ids = dedupe_list(
        [int(value) for value in payload.favorite_movie_ids if isinstance(value, int)]
    )[:6]

    if not favorite_genres and not favorite_people and not favorite_movie_ids:
        raise HTTPException(status_code=400, detail="Ajoute au moins quelques gouts pour lancer l'IA.")

    people_seed_movie_ids: list[int] = []
    for person_name in favorite_people:
        people_seed_movie_ids.extend(get_tmdb_person_seed_movie_ids(person_name))
    people_seed_movie_ids = dedupe_list(people_seed_movie_ids)[:18]

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO user_preferences (
            user_id,
            favorite_genres,
            favorite_people,
            favorite_movie_ids,
            people_seed_movie_ids,
            onboarding_completed_at,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
            favorite_genres = excluded.favorite_genres,
            favorite_people = excluded.favorite_people,
            favorite_movie_ids = excluded.favorite_movie_ids,
            people_seed_movie_ids = excluded.people_seed_movie_ids,
            onboarding_completed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        """,
        (
            current_user["id"],
            dump_json_list(favorite_genres),
            dump_json_list(favorite_people),
            dump_json_list(favorite_movie_ids),
            dump_json_list(people_seed_movie_ids),
        ),
    )
    conn.commit()
    preferences = get_user_preferences(cursor, current_user["id"])
    conn.close()
    return preferences


@app.get("/profile/preferences")
def get_profile_preferences(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    preferences = get_user_preferences(cursor, current_user["id"])
    conn.close()
    return serialize_profile_preferences(preferences)


@app.post("/profile/preferences")
def save_profile_preferences(
    payload: ProfilePreferencesPayload,
    current_user: dict = Depends(get_current_user),
):
    profile_genres = dedupe_list(
        [
            normalize_preference_label(value)
            for value in payload.profile_genres
            if isinstance(value, str) and normalize_preference_label(value)
        ]
    )[:5]
    profile_people_data = dedupe_profile_people(payload.profile_people)[:6]
    profile_people = [person["name"] for person in profile_people_data][:6]
    profile_movie_ids = dedupe_list(
        [int(value) for value in payload.profile_movie_ids if isinstance(value, int)]
    )[:6]
    profile_soundtrack = normalize_profile_soundtrack_entry(payload.profile_soundtrack)
    profile_description = normalize_profile_description(payload.profile_description)

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO user_preferences (
            user_id,
            profile_genres,
            profile_people,
            profile_people_data,
            profile_movie_ids,
            profile_soundtrack,
            profile_description,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
            profile_genres = excluded.profile_genres,
            profile_people = excluded.profile_people,
            profile_people_data = excluded.profile_people_data,
            profile_movie_ids = excluded.profile_movie_ids,
            profile_soundtrack = excluded.profile_soundtrack,
            profile_description = excluded.profile_description,
            updated_at = CURRENT_TIMESTAMP
        """,
        (
            current_user["id"],
            dump_json_list(profile_genres),
            dump_json_list(profile_people),
            dump_json_list(profile_people_data),
            dump_json_list(profile_movie_ids),
            dump_json_dict(profile_soundtrack or {}),
            profile_description,
        ),
    )
    conn.commit()
    preferences = get_user_preferences(cursor, current_user["id"])
    conn.close()
    return serialize_profile_preferences(preferences)

# --- 5. OUTILS TMDB (Inchangé) ---
@lru_cache(maxsize=2048)
def fetch_poster_from_tmdb(movie_id):
    try:
        url = f"https://api.themoviedb.org/3/movie/{movie_id}?api_key={TMDB_API_KEY}&language=fr-FR"
        data = requests.get(url, timeout=1).json()
        return "https://image.tmdb.org/t/p/w500" + data.get('poster_path') if data.get('poster_path') else "https://via.placeholder.com/500"
    except: return "https://via.placeholder.com/500"

@lru_cache(maxsize=512)
def get_tmdb_watch_providers(movie_id: int) -> dict:
    try:
        url = f"https://api.themoviedb.org/3/movie/{movie_id}/watch/providers?api_key={TMDB_API_KEY}"
        data = requests.get(url, timeout=2).json()
        results = data.get("results", {}) if isinstance(data, dict) else {}
        preferred_regions = ("FR", "US")
        region_code = next((region for region in preferred_regions if region in results), None)
        if not region_code and results:
            region_code = next(iter(results.keys()), None)
        region_data = results.get(region_code, {}) if region_code else {}

        def serialize_provider_list(items) -> list[dict]:
            serialized = []
            seen_provider_ids: set[int] = set()
            for item in items or []:
                provider_id = item.get("provider_id")
                if not isinstance(provider_id, int) or provider_id in seen_provider_ids:
                    continue
                seen_provider_ids.add(provider_id)
                serialized.append(
                    {
                        "id": provider_id,
                        "name": str(item.get("provider_name") or ""),
                        "logo_url": f"https://image.tmdb.org/t/p/w154{item.get('logo_path')}" if item.get("logo_path") else None,
                    }
                )
            return serialized

        return {
            "region": region_code or "",
            "link": str(region_data.get("link") or ""),
            "subscription": serialize_provider_list(region_data.get("flatrate")),
            "rent": serialize_provider_list(region_data.get("rent")),
            "buy": serialize_provider_list(region_data.get("buy")),
        }
    except Exception:
        return {
            "region": "",
            "link": "",
            "subscription": [],
            "rent": [],
            "buy": [],
        }

def get_tmdb_details(movie_id):
    try:
        url = f"https://api.themoviedb.org/3/movie/{movie_id}?api_key={TMDB_API_KEY}&language=fr-FR&append_to_response=videos,credits"
        data = requests.get(url, timeout=3).json()
        trailer = next((f"https://www.youtube.com/embed/{v['key']}" for v in data.get('videos', {}).get('results', []) if v['site']=='YouTube' and v['type']=='Trailer'), None)
        cast = [{"name": a['name'], "character": a['character'], "photo": f"https://image.tmdb.org/t/p/w200{a['profile_path']}" if a.get('profile_path') else None} for a in data.get('credits', {}).get('cast', [])[:5]]
        directors = [
            crew_member.get("name")
            for crew_member in data.get("credits", {}).get("crew", [])
            if crew_member.get("job") == "Director" and crew_member.get("name")
        ][:2]
        genres = [
            genre.get("name")
            for genre in data.get("genres", [])
            if isinstance(genre, dict) and genre.get("name")
        ]
        watch_providers = get_tmdb_watch_providers(movie_id)
        return {
            "id": data['id'],
            "title": data['title'],
            "overview": data['overview'],
            "rating": data['vote_average'],
            "poster_url": "https://image.tmdb.org/t/p/w500"+data.get('poster_path','') if data.get('poster_path') else "",
            "trailer_url": trailer,
            "cast": cast,
            "release_date": data.get('release_date', '').split('-')[0],
            "runtime": int(data.get("runtime") or 0),
            "tagline": str(data.get("tagline") or ""),
            "genres": genres[:4],
            "directors": [str(name) for name in directors],
            "watch_providers": watch_providers,
        }
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


def is_test_ai_experiment_user(cursor, user_id: int) -> bool:
    cursor.execute("SELECT username FROM users WHERE id = ?", (int(user_id),))
    row = cursor.fetchone()
    if not row:
        return False
    return normalize_username(str(row[0])).lower() == "test"


def get_test_ai_feedback_profile(cursor, user_id: int) -> dict[str, object]:
    cursor.execute(
        """
        SELECT movie_id, reaction_type, reaction_rating
        FROM recommendation_impressions
        WHERE user_id = ?
          AND responded_at IS NOT NULL
          AND COALESCE(reaction_type, '') NOT LIKE 'undo%'
        ORDER BY responded_at DESC
        LIMIT 160
        """,
        (int(user_id),),
    )
    feedback_rows = cursor.fetchall()
    genre_biases: dict[str, float] = defaultdict(float)
    keyword_biases: dict[str, float] = defaultdict(float)
    positive_count = 0
    negative_count = 0

    for index, row in enumerate(feedback_rows):
        movie_id = int(row[0])
        reaction_type = str(row[1] or "")
        reaction_rating = row[2]
        movie_index = movie_index_by_id.get(movie_id)
        if movie_index is None:
            continue

        if reaction_rating is not None:
            feedback_value = max(-1.0, min(1.0, (float(reaction_rating) - 3.0) / 2.0))
        elif reaction_type in {"watch_later", "playlist_add"}:
            feedback_value = 0.62
        else:
            feedback_value = 0.0

        if abs(feedback_value) < 0.18:
            continue

        if feedback_value > 0:
            positive_count += 1
        else:
            negative_count += 1

        decay = max(0.42, 1.0 - (index * 0.006))
        movie_row = movies_df.iloc[movie_index]
        for token in movie_row.get("genre_tokens") or []:
            genre_biases[token] += feedback_value * decay * 0.42
        for token in (movie_row.get("keyword_tokens") or [])[:14]:
            keyword_biases[token] += feedback_value * decay * 0.34

    return {
        "genre_biases": dict(genre_biases),
        "keyword_biases": dict(keyword_biases),
        "positive_count": positive_count,
        "negative_count": negative_count,
        "total_feedback_count": positive_count + negative_count,
    }


def mark_recommendation_reaction(
    cursor,
    user_id: int,
    movie_id: int,
    reaction_type: str,
    reaction_rating: Optional[float] = None,
):
    if not is_test_ai_experiment_user(cursor, user_id):
        return

    cursor.execute(
        """
        SELECT id
        FROM recommendation_impressions
        WHERE user_id = ? AND movie_id = ?
        ORDER BY shown_at DESC
        LIMIT 1
        """,
        (int(user_id), int(movie_id)),
    )
    row = cursor.fetchone()
    if not row:
        return

    cursor.execute(
        """
        UPDATE recommendation_impressions
        SET responded_at = CURRENT_TIMESTAMP,
            reaction_type = ?,
            reaction_rating = ?
        WHERE id = ?
        """,
        (reaction_type, reaction_rating, int(row[0])),
    )


def insert_recommendation_impression(
    cursor,
    *,
    request_id: str,
    user_id: int,
    movie_id: int,
    mode: str,
    algorithm_variant: str,
    rank: int,
    reason: str,
    seed_movie_id: Optional[int] = None,
    seed_title: Optional[str] = None,
    seed_similarity: Optional[float] = None,
):
    cursor.execute(
        """
        INSERT INTO recommendation_impressions (
            request_id,
            user_id,
            movie_id,
            mode,
            algorithm_variant,
            rank,
            reason,
            seed_movie_id,
            seed_title,
            seed_similarity
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            request_id,
            int(user_id),
            int(movie_id),
            mode,
            algorithm_variant,
            int(rank),
            reason,
            seed_movie_id,
            seed_title,
            seed_similarity,
        ),
    )


def record_recommendation_impression(
    user_id: int,
    movie_id: int,
    mode: str,
    rank: int = 1,
    reason: str = "",
    algorithm_variant: str = TEST_AI_ALGORITHM_VARIANT,
    seed_movie_id: Optional[int] = None,
    seed_title: Optional[str] = None,
    seed_similarity: Optional[float] = None,
) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if not is_test_ai_experiment_user(cursor, user_id):
            return False

        insert_recommendation_impression(
            cursor,
            request_id=str(uuid.uuid4()),
            user_id=user_id,
            movie_id=movie_id,
            mode=mode,
            algorithm_variant=algorithm_variant,
            rank=rank,
            reason=reason,
            seed_movie_id=seed_movie_id,
            seed_title=seed_title,
            seed_similarity=seed_similarity,
        )
        conn.commit()
        return True
    finally:
        conn.close()


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


@lru_cache(maxsize=128)
def get_tmdb_person_seed_movie_ids(person_name: str) -> tuple[int, ...]:
    normalized_name = normalize_preference_label(person_name)
    if not normalized_name:
        return ()

    try:
        response = requests.get(
            "https://api.themoviedb.org/3/search/person",
            params={
                "api_key": TMDB_API_KEY,
                "language": "fr-FR",
                "query": normalized_name,
                "include_adult": "false",
                "page": 1,
            },
            timeout=2,
        )
        results = response.json().get("results", [])[:3]
    except Exception:
        results = []

    seed_movie_ids: list[int] = []
    for person in results:
        for movie in person.get("known_for", [])[:6]:
            normalized_movie = normalize_tmdb_movie(movie)
            if not normalized_movie:
                continue
            seed_movie_ids.append(int(normalized_movie["id"]))

    return tuple(dedupe_list(seed_movie_ids))


def get_movie_primary_genre(movie_id: int) -> str:
    return movie_primary_genre_by_id.get(int(movie_id), "Autres")


def get_rating_signal_weight(rating: float) -> float:
    rounded_rating = round(float(rating) * 2) / 2
    return {
        5.0: 1.95,
        4.5: 1.62,
        4.0: 1.28,
        3.5: 0.54,
        3.0: 0.14,
        2.5: -0.24,
        2.0: -0.96,
        1.5: -1.24,
        1.0: -1.48,
        0.5: -1.72,
    }.get(rounded_rating, 0.0)


def squash_affinity(value: float) -> float:
    return float(0.5 + (0.5 * np.tanh(value)))


def build_collaborative_candidate_scores(cursor, current_user_id: int, blocked_ids: set[int]) -> dict[int, float]:
    cursor.execute(
        """
        WITH base AS (
            SELECT movie_id, rating
            FROM user_ratings
            WHERE user_id = ?
        )
        SELECT
            other.user_id,
            COUNT(*) AS overlap_count,
            SUM(
                CASE
                    WHEN base.rating >= 4 AND other.rating >= 4 THEN 1.45 + ((other.rating - 4) * 0.15)
                    WHEN base.rating <= 2 AND other.rating <= 2 THEN 0.90
                    WHEN ABS(base.rating - other.rating) <= 1 THEN 0.30
                    WHEN (base.rating >= 4 AND other.rating <= 2)
                      OR (base.rating <= 2 AND other.rating >= 4) THEN -1.70
                    ELSE -0.15
                END
            ) AS similarity_score
        FROM base
        JOIN user_ratings other
          ON other.movie_id = base.movie_id
         AND other.user_id != ?
        GROUP BY other.user_id
        HAVING overlap_count >= 2 AND similarity_score > 0
        ORDER BY similarity_score DESC, overlap_count DESC
        LIMIT 10
        """,
        (current_user_id, current_user_id),
    )
    neighbors = cursor.fetchall()
    collaborative_scores: dict[int, float] = {}

    for neighbor_id, overlap_count, similarity_score in neighbors:
        if not overlap_count or not similarity_score:
            continue

        affinity_weight = min(1.9, max(0.25, float(similarity_score) / max(int(overlap_count), 1)))
        cursor.execute(
            """
            SELECT movie_id, rating
            FROM user_ratings
            WHERE user_id = ? AND rating >= 4
            ORDER BY added_at DESC
            LIMIT 24
            """,
            (neighbor_id,),
        )
        for rank, (movie_id, rating) in enumerate(cursor.fetchall()):
            movie_id = int(movie_id)
            if movie_id in blocked_ids:
                continue
            freshness_weight = max(0.35, 1.0 - (rank * 0.05))
            rating_weight = 1.0 + ((int(rating) - 4) * 0.22)
            collaborative_scores[movie_id] = collaborative_scores.get(movie_id, 0.0) + (
                affinity_weight * freshness_weight * rating_weight
            )

    return collaborative_scores


def pick_diverse_movie_ids(ranked_ids: list[int], limit: int, per_genre_cap: int) -> list[int]:
    if limit <= 0:
        return []

    selected_ids: list[int] = []
    deferred_ids: list[int] = []
    genre_counts: dict[str, int] = {}

    for movie_id in ranked_ids:
        genre_name = get_movie_primary_genre(movie_id)
        current_count = genre_counts.get(genre_name, 0)
        if current_count < per_genre_cap or len(selected_ids) < max(2, limit // 2):
            selected_ids.append(movie_id)
            genre_counts[genre_name] = current_count + 1
        else:
            deferred_ids.append(movie_id)
        if len(selected_ids) >= limit:
            return selected_ids[:limit]

    for movie_id in deferred_ids:
        if len(selected_ids) >= limit:
            break
        selected_ids.append(movie_id)

    return selected_ids[:limit]


def build_recommendation_reason(
    *,
    movie_id: int,
    positive_indices: list[int],
    positive_signal_weights: dict[int, float],
    positive_similarity_scores: np.ndarray,
    onboarding_genre_tokens: set[str],
    genre_profile: set[str],
    mode: str,
    seed_context: Optional[dict[str, object]] = None,
    is_test_experiment: bool = False,
) -> str:
    movie_index = movie_index_by_id.get(int(movie_id))
    if movie_index is None:
        return "Choisi pour coller à tes goûts du moment"

    row = movies_df.iloc[movie_index]
    primary_genre = str(row.get("primary_genre") or "ce registre")
    primary_genre_token = normalize_genre_token(primary_genre)
    vote_average = float(row.get("vote_average") or 0.0)
    quality_fragment = f", bien noté ({vote_average:.1f}/10)" if vote_average >= 7.0 else ""

    if is_test_experiment and seed_context:
        seed_title = str(seed_context.get("seed_title") or "")
        seed_similarity = float(seed_context.get("seed_similarity") or 0.0)
        if seed_title and seed_similarity >= 0.18:
            return f"Proche de {seed_title}, dans une veine {primary_genre}{quality_fragment}"

    closest_reference_title = ""
    closest_similarity = 0.0
    if vectors is not None and positive_indices:
        best_reference_index = positive_indices[0]
        best_reference_score = -1.0
        for reference_index in positive_indices[:8]:
            similarity_score = float(cosine_similarity(
                vectors[movie_index].reshape(1, -1),
                vectors[reference_index].reshape(1, -1),
            )[0][0])
            weighted_score = similarity_score * positive_signal_weights.get(int(movie_ids_array[reference_index]), 1.0)
            if weighted_score > best_reference_score:
                best_reference_score = weighted_score
                best_reference_index = reference_index
                closest_similarity = similarity_score

        reference_row = movies_df.iloc[best_reference_index]
        closest_reference_title = str(reference_row.get("title") or "")

    if mode == "explore":
        if closest_reference_title and closest_similarity >= 0.32:
            return f"Découverte : un pas de côté à partir de {closest_reference_title}"
        return f"Découverte : une piste plus neuve dans le registre {primary_genre}"

    if closest_reference_title and primary_genre_token in genre_profile and closest_similarity >= 0.38:
        return f"Parce que tu as aimé {closest_reference_title} et le registre {primary_genre}"

    if closest_reference_title and closest_similarity >= 0.46:
        return f"Dans la lignée de {closest_reference_title}"

    if primary_genre_token in onboarding_genre_tokens:
        return f"Parce que tu as choisi le genre {primary_genre}"

    if primary_genre_token in genre_profile:
        return f"Parce que tu aimes souvent le genre {primary_genre}"

    return "Choisi pour coller à tes goûts du moment"


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
            "avatar_url": row["avatar_url"] if "avatar_url" in row_keys else None,
        },
        "likes_count": row["likes_count"],
        "liked_by_me": bool(row["liked_by_me"]),
        "comments_count": row["comments_count"] if "comments_count" in row_keys else 0,
    }


def serialize_user_row(row: sqlite3.Row) -> dict:
    row_keys = set(row.keys())
    return {
        "id": row["id"],
        "username": row["username"],
        "avatar_url": row["avatar_url"] if "avatar_url" in row_keys else None,
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
            "avatar_url": row["avatar_url"] if "avatar_url" in row_keys else None,
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


def get_app_setting(cursor, key: str) -> Optional[str]:
    cursor.execute("SELECT value FROM app_settings WHERE key = ?", (key,))
    row = cursor.fetchone()
    if not row:
        return None
    return str(row["value"] if isinstance(row, sqlite3.Row) else row[0])


def set_app_setting(cursor, key: str, value: str):
    cursor.execute(
        """
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = CURRENT_TIMESTAMP
        """,
        (key, value),
    )


def encode_base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def get_or_create_web_push_vapid_config(cursor) -> tuple[Optional[str], Optional[str]]:
    env_private_key = os.getenv("WEB_PUSH_VAPID_PRIVATE_KEY", "").strip()
    env_public_key = os.getenv("WEB_PUSH_VAPID_PUBLIC_KEY", "").strip()
    if env_private_key and env_public_key:
        return env_private_key.replace("\\n", "\n"), env_public_key

    stored_private_key = get_app_setting(cursor, "web_push_vapid_private_key")
    stored_public_key = get_app_setting(cursor, "web_push_vapid_public_key")
    if stored_private_key and stored_public_key:
        return stored_private_key, stored_public_key

    if Vapid02 is None or serialization is None:
        return None, None

    vapid = Vapid02()
    vapid.generate_keys()
    private_key = vapid.private_pem().decode("utf-8")
    public_key = encode_base64url(
        vapid.public_key.public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint,
        )
    )
    set_app_setting(cursor, "web_push_vapid_private_key", private_key)
    set_app_setting(cursor, "web_push_vapid_public_key", public_key)
    return private_key, public_key


def load_web_push_vapid_private_key(cursor):
    private_key, _ = get_or_create_web_push_vapid_config(cursor)
    if not private_key or Vapid02 is None:
        return None

    try:
        return Vapid02.from_pem(private_key.encode("utf-8"))
    except Exception:
        return None


def fetch_active_web_push_subscriptions(cursor, user_ids: list[int]) -> list[dict]:
    unique_user_ids = list(dict.fromkeys(user_ids))
    if not unique_user_ids:
        return []

    placeholders = ",".join("?" for _ in unique_user_ids)
    cursor.execute(
        f"""
        SELECT id, endpoint, subscription_json
        FROM web_push_subscriptions
        WHERE is_active = 1
        AND user_id IN ({placeholders})
        """,
        tuple(unique_user_ids),
    )

    subscriptions: list[dict] = []
    for row in cursor.fetchall():
        row_id = row["id"] if isinstance(row, sqlite3.Row) else row[0]
        endpoint = row["endpoint"] if isinstance(row, sqlite3.Row) else row[1]
        raw_subscription = row["subscription_json"] if isinstance(row, sqlite3.Row) else row[2]
        try:
            subscription_info = json.loads(raw_subscription or "{}")
        except (TypeError, json.JSONDecodeError):
            continue
        if not isinstance(subscription_info, dict) or not subscription_info.get("endpoint"):
            continue
        subscriptions.append(
            {
                "id": int(row_id),
                "endpoint": str(endpoint),
                "subscription_info": subscription_info,
            }
        )
    return subscriptions


def send_native_push_notifications(
    cursor,
    user_ids: list[int],
    *,
    title: str,
    body: str,
    route: str,
    extra_data: Optional[dict] = None,
):
    device_tokens = fetch_active_mobile_tokens(cursor, user_ids)
    if not device_tokens:
        return

    serialized_data = {"route": route}
    if extra_data:
        serialized_data.update(
            {key: str(value) for key, value in extra_data.items() if value is not None}
        )

    expo_tokens = [
        token
        for token in device_tokens
        if token.startswith("ExpoPushToken[") or token.startswith("ExponentPushToken[")
    ]
    fcm_tokens = [token for token in device_tokens if token not in expo_tokens]

    if expo_tokens:
        for index in range(0, len(expo_tokens), 100):
            chunk = expo_tokens[index : index + 100]
            try:
                response = requests.post(
                    "https://exp.host/--/api/v2/push/send",
                    headers={
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                    },
                    json=[
                        {
                            "to": token,
                            "sound": "default",
                            "title": title,
                            "body": body,
                            "data": serialized_data,
                        }
                        for token in chunk
                    ],
                    timeout=8,
                )
            except requests.RequestException:
                continue

            if response.status_code != 200:
                continue

            try:
                response_payload = response.json()
            except ValueError:
                continue

            tickets = response_payload.get("data") or []
            if isinstance(tickets, dict):
                tickets = [tickets]

            for token, ticket in zip(chunk, tickets):
                if not isinstance(ticket, dict):
                    continue
                details = ticket.get("details") or {}
                if ticket.get("status") == "error" and details.get("error") == "DeviceNotRegistered":
                    cursor.execute(
                        """
                        UPDATE mobile_devices
                        SET is_active = 0, updated_at = CURRENT_TIMESTAMP
                        WHERE token = ?
                        """,
                        (token,),
                    )

    if not FCM_SERVER_KEY or not fcm_tokens:
        return

    headers = {
        "Authorization": f"key={FCM_SERVER_KEY}",
        "Content-Type": "application/json",
    }

    for device_token in fcm_tokens:
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


def send_web_push_notifications(
    cursor,
    user_ids: list[int],
    *,
    title: str,
    body: str,
    route: str,
    extra_data: Optional[dict] = None,
):
    if webpush is None:
        return

    vapid_private_key = load_web_push_vapid_private_key(cursor)
    if not vapid_private_key:
        return

    subscriptions = fetch_active_web_push_subscriptions(cursor, user_ids)
    if not subscriptions:
        return

    payload = {
        "title": title,
        "body": body,
        "route": route,
        "tag": extra_data.get("tag") if extra_data else None,
        "icon": "/icon.svg",
        "badge": "/icon.svg",
    }
    if extra_data:
        payload.update({key: value for key, value in extra_data.items() if value is not None})
    serialized_payload = json.dumps(payload, ensure_ascii=False)

    for subscription in subscriptions:
        try:
            webpush(
                subscription_info=subscription["subscription_info"],
                data=serialized_payload,
                vapid_private_key=vapid_private_key,
                vapid_claims={"sub": WEB_PUSH_SUBJECT},
                ttl=120,
                headers={"Urgency": "high"},
            )
        except WebPushException as exc:
            response = getattr(exc, "response", None)
            status_code = getattr(response, "status_code", None)
            if status_code in {404, 410}:
                cursor.execute(
                    """
                    UPDATE web_push_subscriptions
                    SET is_active = 0, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (subscription["id"],),
                )
        except Exception:
            continue


def fetch_serialized_reviews(cursor, current_user_id: int, where_clause: str, params=(), limit: Optional[int] = None) -> list[dict]:
    query = f"""
        SELECT
            r.id,
            r.user_id,
            u.username,
            u.avatar_url,
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
            u.avatar_url,
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
        AND n.is_read = 0
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
    row_keys = set(row.keys())
    return {
        "id": row["id"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "participant": {
            "id": row["participant_id"],
            "username": row["participant_username"],
            "avatar_url": row["participant_avatar_url"] if "participant_avatar_url" in row_keys else None,
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
            participant.username AS participant_username,
            participant.avatar_url AS participant_avatar_url
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
            participant.avatar_url AS participant_avatar_url,
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
    rating: float
    content: str


class ReviewUpdate(BaseModel):
    rating: float
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


class WebPushSubscriptionKeysPayload(BaseModel):
    p256dh: str
    auth: str


class WebPushSubscribePayload(BaseModel):
    endpoint: str
    keys: WebPushSubscriptionKeysPayload
    expirationTime: Optional[str | int | float] = None


class WebPushUnsubscribePayload(BaseModel):
    endpoint: str

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
            "SELECT movie_id as id, title, poster_url, rating, COALESCE(added_at, '1970-01-01 00:00:00') as added_at FROM playlist_items WHERE playlist_id = ? ORDER BY COALESCE(added_at, '1970-01-01 00:00:00') DESC, rowid DESC",
            (real_id,),
        )
    elif playlist_id == FAVORITES_SYSTEM_ID:
        cursor.execute(
            "SELECT movie_id as id, title, poster_url, rating, added_at FROM user_ratings WHERE user_id = ? AND rating >= 4 ORDER BY added_at DESC",
            (current_user["id"],),
        )
    elif playlist_id == HISTORY_SYSTEM_ID:
        cursor.execute(
            "SELECT movie_id as id, title, poster_url, rating, added_at FROM user_ratings WHERE user_id = ? ORDER BY added_at DESC",
            (current_user["id"],),
        )
    else:
        target_id = get_custom_playlist_id(cursor, playlist_id, current_user["id"])
        cursor.execute(
            "SELECT movie_id as id, title, poster_url, rating, COALESCE(added_at, '1970-01-01 00:00:00') as added_at, COALESCE(sort_index, 0) as sort_index FROM playlist_items WHERE playlist_id = ? ORDER BY COALESCE(sort_index, 2147483647) ASC, COALESCE(added_at, '1970-01-01 00:00:00') DESC, rowid DESC",
            (target_id,),
        )
    
    movies = [dict(row) for row in cursor.fetchall()]
    conn.close()

    for movie in movies:
        movie["primary_genre"] = get_movie_primary_genre(int(movie["id"]))

    if playlist_id == WATCH_LATER_SYSTEM_ID:
        movies.sort(
            key=lambda movie: (
                str(movie.get("primary_genre") or "Autres").lower(),
                str(movie.get("title") or "").lower(),
            )
        )

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
                "SELECT COALESCE(MAX(sort_index), 0) + 1 FROM playlist_items WHERE playlist_id = ?",
                (target_id,),
            )
            next_sort_index = int(cursor.fetchone()[0] or 1)
            cursor.execute(
                "INSERT INTO playlist_items (playlist_id, movie_id, title, poster_url, rating, added_at, sort_index) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)",
                (target_id, info["id"], info["title"], info["poster_url"], info["rating"], next_sort_index),
            )
            reaction_type = "watch_later" if playlist_id == WATCH_LATER_SYSTEM_ID else "playlist_add"
            mark_recommendation_reaction(
                cursor,
                current_user["id"],
                movie_id,
                reaction_type,
            )
            conn.commit()
        except sqlite3.IntegrityError:
            pass
        
    conn.close()
    return {"status": "added"}

@app.delete("/playlists/{playlist_id}/remove/{movie_id}")
def remove_from_specific_playlist(playlist_id: int, movie_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    target_id = get_playlist_target_id(cursor, playlist_id, current_user["id"])

    cursor.execute(
        "DELETE FROM playlist_items WHERE playlist_id = ? AND movie_id = ?",
        (target_id, movie_id),
    )
    reaction_type = "undo_watch_later" if playlist_id == WATCH_LATER_SYSTEM_ID else "undo_playlist_add"
    mark_recommendation_reaction(
        cursor,
        current_user["id"],
        movie_id,
        reaction_type,
    )
    conn.commit()
    conn.close()
    return {"status": "removed"}

@app.post("/playlists/{playlist_id}/reorder")
def reorder_playlist(
    playlist_id: int,
    payload: dict,
    current_user: dict = Depends(get_current_user),
):
    ordered_movie_ids = payload.get("movie_ids")
    if not isinstance(ordered_movie_ids, list) or not all(isinstance(movie_id, int) for movie_id in ordered_movie_ids):
        raise HTTPException(status_code=400, detail="Liste de films invalide")

    conn = get_db_connection()
    cursor = conn.cursor()
    target_id = get_playlist_target_id(cursor, playlist_id, current_user["id"])

    cursor.execute(
        "SELECT movie_id FROM playlist_items WHERE playlist_id = ?",
        (target_id,),
    )
    existing_movie_ids = {int(row[0]) for row in cursor.fetchall()}
    if existing_movie_ids != set(ordered_movie_ids):
        conn.close()
        raise HTTPException(status_code=400, detail="La liste des films ne correspond pas à la playlist")

    for index, movie_id in enumerate(ordered_movie_ids, start=1):
        cursor.execute(
            "UPDATE playlist_items SET sort_index = ? WHERE playlist_id = ? AND movie_id = ?",
            (index, target_id, movie_id),
        )

    conn.commit()
    conn.close()
    return {"status": "reordered"}

@app.post("/movies/rate/{movie_id}/{rating}")
def rate_movie(movie_id: int, rating: float, current_user: dict = Depends(get_current_user)):
    rounded_rating = round(float(rating) * 2) / 2
    if rounded_rating < 0.5 or rounded_rating > 5:
        raise HTTPException(status_code=400, detail="La note doit être comprise entre 0.5 et 5")

    conn = get_db_connection()
    cursor = conn.cursor()
    watch_later_id = get_or_create_watch_later_id(cursor, current_user["id"])
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
        (current_user["id"], movie_id, rounded_rating, title, poster),
    )
    cursor.execute(
        "DELETE FROM playlist_items WHERE playlist_id = ? AND movie_id = ?",
        (watch_later_id, movie_id),
    )
    mark_recommendation_reaction(
        cursor,
        current_user["id"],
        movie_id,
        "rated",
        rounded_rating,
    )
    conn.commit()
    conn.close()
    return {"status": "rated"}


@app.delete("/movies/rate/{movie_id}")
def delete_movie_rating(movie_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM user_ratings WHERE user_id = ? AND movie_id = ?",
        (current_user["id"], movie_id),
    )
    mark_recommendation_reaction(
        cursor,
        current_user["id"],
        movie_id,
        "undo_rating",
    )
    conn.commit()
    conn.close()
    return {"status": "removed"}


@app.get("/movies/user-rating/{movie_id}")
def get_user_movie_rating(movie_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT rating FROM user_ratings WHERE user_id = ? AND movie_id = ?",
        (current_user["id"], movie_id),
    )
    row = cursor.fetchone()
    conn.close()
    return {"rating": float(row[0]) if row else None}

# --- 7. RECOMMANDATIONS ---
def compute_recommendation_feed(
    current_user_id: int,
    limit: int = 10,
    exclude_ids: Optional[str] = None,
    mode: str = "core",
):
    normalized_mode = mode.strip().lower() if isinstance(mode, str) else "core"
    if normalized_mode == "core":
        normalized_mode = "spotlight"
    is_tinder_mode = normalized_mode == "tinder"
    is_spotlight_mode = normalized_mode == "spotlight"
    is_explore_mode = normalized_mode == "explore"

    conn = get_db_connection()
    cursor = conn.cursor()

    watch_later_id = get_or_create_watch_later_id(cursor, current_user_id)
    conn.commit()

    preferences = get_user_preferences(cursor, current_user_id)

    cursor.execute(
        "SELECT movie_id, rating FROM user_ratings WHERE user_id = ? ORDER BY added_at DESC",
        (current_user_id,),
    )
    rating_rows = [(int(row[0]), float(row[1])) for row in cursor.fetchall()]
    rated_ids = {movie_id for movie_id, _ in rating_rows}
    disliked_ids = [movie_id for movie_id, rating in rating_rows if rating <= 2.5][:12]

    cursor.execute(
        "SELECT movie_id FROM playlist_items WHERE playlist_id = ?",
        (watch_later_id,),
    )
    watch_later_ids = {int(row[0]) for row in cursor.fetchall()}

    cursor.execute(
        "SELECT movie_id FROM playlist_items WHERE playlist_id = ? ORDER BY COALESCE(sort_index, 999999), added_at DESC LIMIT 12",
        (watch_later_id,),
    )
    recent_watch_later_ids = [int(row[0]) for row in cursor.fetchall()]
    is_test_ai_experiment = is_test_ai_experiment_user(cursor, current_user_id)
    test_feedback_profile = (
        get_test_ai_feedback_profile(cursor, current_user_id)
        if is_test_ai_experiment
        else {
            "genre_biases": {},
            "keyword_biases": {},
            "positive_count": 0,
            "negative_count": 0,
            "total_feedback_count": 0,
        }
    )

    collaborative_scores = build_collaborative_candidate_scores(
        cursor,
        current_user_id,
        rated_ids | watch_later_ids,
    ) if not is_tinder_mode else {}
    conn.close()

    onboarding_movie_ids = preferences["favorite_movie_ids"]
    people_seed_movie_ids = preferences["people_seed_movie_ids"]
    onboarding_movie_id_set = {int(movie_id) for movie_id in onboarding_movie_ids}
    request_exclude_ids = parse_exclude_ids(exclude_ids)
    seen_ids = rated_ids | watch_later_ids | onboarding_movie_id_set
    blocked_ids = seen_ids | request_exclude_ids
    interaction_count = len(seen_ids)
    real_interaction_count = len(rated_ids | watch_later_ids)
    cold_start_mode = real_interaction_count < 8 if is_test_ai_experiment else interaction_count < 6
    onboarding_genre_tokens = {
        normalize_genre_token(value)
        for value in preferences["favorite_genres"]
        if normalize_genre_token(value)
    }

    if movies_df.empty:
        return []

    positive_signal_weights: dict[int, float] = {}
    negative_signal_weights: dict[int, float] = {}

    for index, (movie_id, rating) in enumerate(rating_rows):
        recency_multiplier = max(0.42, 1.52 - (index * 0.10))
        signal_weight = get_rating_signal_weight(rating) * recency_multiplier
        if is_test_ai_experiment:
            if rating >= 4.5:
                signal_weight *= 1.22
            elif rating >= 4.0:
                signal_weight *= 1.12
            elif rating <= 2.0:
                signal_weight *= 1.22
            elif rating <= 2.5:
                signal_weight *= 1.12
        if index < 3:
            signal_weight *= 1.46 if is_tinder_mode else 1.34
        elif index < 6:
            signal_weight *= 1.24 if is_tinder_mode else 1.14
        elif index < 10:
            signal_weight *= 1.10 if is_tinder_mode else 1.04
        if signal_weight > 0:
            positive_signal_weights[movie_id] = max(
                positive_signal_weights.get(movie_id, 0.0),
                signal_weight,
            )
        elif signal_weight < 0:
            negative_signal_weights[movie_id] = min(
                negative_signal_weights.get(movie_id, 0.0),
                signal_weight,
            )

    for index, movie_id in enumerate(recent_watch_later_ids):
        base_watch_weight = 1.18 if cold_start_mode else (0.78 if is_tinder_mode else 0.96)
        watch_weight = max(0.28, base_watch_weight - (index * 0.09))
        if index < 3:
            watch_weight *= 1.10 if is_tinder_mode else 1.14
        positive_signal_weights[movie_id] = max(
            positive_signal_weights.get(movie_id, 0.0),
            watch_weight,
        )

    if is_test_ai_experiment:
        onboarding_movie_weight = 2.25 if cold_start_mode else (0.78 if is_tinder_mode else 0.88)
        people_seed_weight = 1.42 if cold_start_mode else (0.36 if is_tinder_mode else 0.62)
    else:
        onboarding_movie_weight = 1.65 if cold_start_mode else (0.42 if is_tinder_mode else 0.62)
        people_seed_weight = 1.05 if cold_start_mode else (0.18 if is_tinder_mode else 0.42)
    for movie_id in onboarding_movie_ids:
        positive_signal_weights[movie_id] = max(
            positive_signal_weights.get(movie_id, 0.0),
            onboarding_movie_weight,
        )
    for movie_id in people_seed_movie_ids:
        positive_signal_weights[movie_id] = max(
            positive_signal_weights.get(movie_id, 0.0),
            people_seed_weight,
        )

    positive_signal_ids = [
        movie_id
        for movie_id, _ in sorted(
            positive_signal_weights.items(),
            key=lambda item: item[1],
            reverse=True,
        )
    ][:18]
    candidate_scores: dict[int, float] = {}
    available_movie_ids = set(int(movie_id) for movie_id in movie_ids_array.tolist())
    genre_profile: set[str] = set(onboarding_genre_tokens)
    genre_affinity_map: dict[str, float] = defaultdict(float)
    keyword_affinity_map: dict[str, float] = defaultdict(float)

    positive_indices: list[int] = []
    positive_vector_weights: list[float] = []
    negative_indices: list[int] = []
    negative_vector_weights: list[float] = []

    for movie_id, weight in positive_signal_weights.items():
        movie_index = movie_index_by_id.get(int(movie_id))
        if movie_index is None:
            continue
        row = movies_df.iloc[movie_index]
        positive_indices.append(movie_index)
        positive_vector_weights.append(float(weight))
        for token in row["genre_tokens"]:
            genre_profile.add(token)
            genre_affinity_map[token] += float(weight) * 1.15
        keyword_limit = 16 if is_test_ai_experiment else 10
        keyword_weight = 1.10 if is_test_ai_experiment else 0.85
        for token in row["keyword_tokens"][:keyword_limit]:
            keyword_affinity_map[token] += float(weight) * keyword_weight

    for movie_id, weight in negative_signal_weights.items():
        movie_index = movie_index_by_id.get(int(movie_id))
        if movie_index is None:
            continue
        row = movies_df.iloc[movie_index]
        negative_indices.append(movie_index)
        negative_vector_weights.append(abs(float(weight)))
        for token in row["genre_tokens"]:
            genre_affinity_map[token] += float(weight) * 0.95
        keyword_limit = 14 if is_test_ai_experiment else 10
        keyword_weight = 0.92 if is_test_ai_experiment else 0.75
        for token in row["keyword_tokens"][:keyword_limit]:
            keyword_affinity_map[token] += float(weight) * keyword_weight

    if is_test_ai_experiment:
        onboarding_bias = 1.35 if cold_start_mode else 0.82
    else:
        onboarding_bias = 0.95 if cold_start_mode else 0.60
    for token in onboarding_genre_tokens:
        genre_affinity_map[token] += onboarding_bias

    if is_test_ai_experiment:
        for token, bias in dict(test_feedback_profile.get("genre_biases") or {}).items():
            genre_affinity_map[str(token)] += float(bias)
        for token, bias in dict(test_feedback_profile.get("keyword_biases") or {}).items():
            keyword_affinity_map[str(token)] += float(bias)

    positive_similarity_scores = np.zeros(len(movies_df))
    negative_similarity_scores = np.zeros(len(movies_df))

    if vectors is not None and positive_indices:
        try:
            positive_sim_matrix = cosine_similarity(vectors, vectors[positive_indices])
            positive_max_share = 0.35 if is_test_ai_experiment else 0.45
            positive_similarity_scores = (
                (np.max(positive_sim_matrix, axis=1) * positive_max_share)
                + (
                    np.average(
                        positive_sim_matrix,
                        axis=1,
                        weights=np.array(positive_vector_weights),
                    )
                    * (1.0 - positive_max_share)
                )
            )
        except Exception as e:
            print(f"Erreur IA (profil positif): {e}")

    if vectors is not None and negative_indices:
        try:
            negative_sim_matrix = cosine_similarity(vectors, vectors[negative_indices])
            negative_max_share = 0.58 if is_test_ai_experiment else 0.45
            negative_similarity_scores = (
                (np.max(negative_sim_matrix, axis=1) * negative_max_share)
                + (
                    np.average(
                        negative_sim_matrix,
                        axis=1,
                        weights=np.array(negative_vector_weights),
                    )
                    * (1.0 - negative_max_share)
                )
            )
        except Exception as e:
            print(f"Erreur IA (profil negatif): {e}")

    def compute_token_affinity_scores(column_name: str, affinity_map: dict[str, float]) -> np.ndarray:
        if not affinity_map:
            return np.zeros(len(movies_df))

        raw_scores = []
        for tokens in movies_df[column_name]:
            if not tokens:
                raw_scores.append(0.0)
                continue
            token_score = sum(affinity_map.get(token, 0.0) for token in tokens) / max(len(tokens), 1)
            raw_scores.append(squash_affinity(token_score))
        return np.array(raw_scores)

    genre_affinity_scores = compute_token_affinity_scores("genre_tokens", genre_affinity_map)
    keyword_affinity_scores = compute_token_affinity_scores("keyword_tokens", keyword_affinity_map)
    quality_scores = movies_df["quality_score"].to_numpy()
    audience_rating_scores = movies_df["audience_rating_score"].to_numpy()
    audience_rating_boost_scores = np.clip((audience_rating_scores - 0.62) / 0.11, 0.0, 1.0)
    audience_rating_penalty_scores = np.clip((0.60 - audience_rating_scores) / 0.08, 0.0, 1.0)

    social_scores = np.array(
        [
            min(
                1.0,
                np.tanh(
                    collaborative_scores.get(int(movie_id), 0.0) * 0.22
                ),
            )
            for movie_id in movie_ids_array
        ]
    )

    if is_test_ai_experiment:
        positive_similarity_weight = 0.56 if is_tinder_mode else 0.42
        negative_similarity_weight = 0.44 if is_tinder_mode else 0.30
        genre_affinity_weight = 0.14 if is_tinder_mode else 0.14
        keyword_affinity_weight = 0.26 if is_tinder_mode else 0.20
        audience_rating_weight = 0.35 if is_tinder_mode else 0.13
        audience_boost_weight = 0.48 if is_tinder_mode else 0.12
        audience_penalty_weight = 0.34 if is_tinder_mode else 0.10
        quality_weight = 0.08 if is_tinder_mode else 0.11
        social_weight = 0.0 if is_tinder_mode else 0.01
    else:
        positive_similarity_weight = 0.46 if is_tinder_mode else 0.34
        negative_similarity_weight = 0.35 if is_tinder_mode else 0.22
        genre_affinity_weight = 0.17 if is_tinder_mode else 0.15
        keyword_affinity_weight = 0.18 if is_tinder_mode else 0.16
        audience_rating_weight = 0.26 if is_tinder_mode else 0.08
        audience_boost_weight = 0.34 if is_tinder_mode else 0.06
        audience_penalty_weight = 0.20 if is_tinder_mode else 0.03
        quality_weight = 0.03 if is_tinder_mode else 0.09
        social_weight = 0.0 if is_tinder_mode else (0.02 if interaction_count >= 8 else 0.04)

    hybrid_scores = (
        (positive_similarity_scores * positive_similarity_weight)
        - (negative_similarity_scores * negative_similarity_weight)
        + (genre_affinity_scores * genre_affinity_weight)
        + (keyword_affinity_scores * keyword_affinity_weight)
        + (audience_rating_scores * audience_rating_weight)
        + (audience_rating_boost_scores * audience_boost_weight)
        - (audience_rating_penalty_scores * audience_penalty_weight)
        + (quality_scores * quality_weight)
        + (social_scores * social_weight)
    )

    if is_test_ai_experiment:
        vote_average_values = movies_df["vote_average"].to_numpy(dtype=float)
        vote_count_values = movies_df["vote_count"].to_numpy(dtype=float)
        vote_confidence_scores = np.clip(
            np.log1p(vote_count_values) / np.log1p(max(float(vote_count_values.max()), 1.0)),
            0.0,
            1.0,
        )
        public_excellence_scores = (
            np.clip((vote_average_values - 6.8) / 1.25, 0.0, 1.0)
            * vote_confidence_scores
        )
        public_weakness_scores = (
            np.clip((6.15 - vote_average_values) / 1.05, 0.0, 1.0)
            * (0.55 + (vote_confidence_scores * 0.45))
        )
        hybrid_scores = hybrid_scores + (
            public_excellence_scores * (0.24 if is_tinder_mode else 0.12)
        ) - (
            public_weakness_scores * (0.36 if is_tinder_mode else 0.16)
        )
        if positive_signal_ids:
            hybrid_scores = hybrid_scores + (
                positive_similarity_scores
                * audience_rating_scores
                * (0.12 if is_tinder_mode else 0.06)
            )

    if cold_start_mode and onboarding_genre_tokens:
        cold_start_overlap_scores = np.array(
            [
                len(set(tokens) & onboarding_genre_tokens) / max(len(onboarding_genre_tokens), 1)
                for tokens in movies_df["genre_tokens"]
            ]
        )
        overlap_weight = 0.34 if is_test_ai_experiment else 0.24
        quality_cold_weight = 0.12 if is_test_ai_experiment else 0.08
        hybrid_scores = hybrid_scores + (
            (cold_start_overlap_scores * overlap_weight)
            + (quality_scores * quality_cold_weight)
        )

    for idx, movie_id in enumerate(movie_ids_array):
        movie_id = int(movie_id)
        if movie_id in blocked_ids:
            continue
        candidate_scores[movie_id] = float(hybrid_scores[idx])

    seed_related_limit = 7 if is_test_ai_experiment else 5
    for seed_rank, seed_id in enumerate(positive_signal_ids[:seed_related_limit]):
        related_ids = get_tmdb_related_movie_ids(seed_id)
        seed_strength = positive_signal_weights.get(seed_id, 1.0)
        for rank, related_id in enumerate(related_ids):
            if related_id in blocked_ids or related_id not in available_movie_ids:
                continue
            related_index = movie_index_by_id.get(int(related_id))
            related_quality_bonus = 0.0
            if is_test_ai_experiment and related_index is not None:
                related_row = movies_df.iloc[related_index]
                related_audience_score = float(related_row.get("audience_rating_score") or 0.0)
                if related_audience_score < 0.54:
                    continue
                related_quality_bonus = min(max((related_audience_score - 0.62) * 2.2, 0.0), 0.35)
            if is_test_ai_experiment:
                base_seed_score = (2.30 if is_tinder_mode else 2.48) + min(seed_strength * (0.34 if is_tinder_mode else 0.46), 0.95 if is_tinder_mode else 1.20)
            else:
                base_seed_score = (2.90 if is_tinder_mode else 2.95) + min(seed_strength * (0.28 if is_tinder_mode else 0.42), 0.92 if is_tinder_mode else 1.25)
            score = base_seed_score - (rank * 0.08) - (seed_rank * 0.18)
            candidate_scores[related_id] = candidate_scores.get(related_id, 0.0) + max(score + related_quality_bonus, 0.2)

    for seed_rank, seed_id in enumerate(disliked_ids[:4]):
        related_ids = get_tmdb_related_movie_ids(seed_id)
        seed_penalty_strength = abs(negative_signal_weights.get(seed_id, -1.0))
        for rank, related_id in enumerate(related_ids):
            if related_id in blocked_ids or related_id not in available_movie_ids:
                continue
            penalty = (1.35 if is_tinder_mode else 1.15) + min(seed_penalty_strength * 0.20, 0.45)
            penalty = penalty - (rank * 0.05) - (seed_rank * 0.12)
            candidate_scores[related_id] = candidate_scores.get(related_id, 0.0) - max(penalty, 0.10)

    for movie_id, score in collaborative_scores.items():
        if movie_id in blocked_ids or movie_id not in available_movie_ids:
            continue
        candidate_scores[movie_id] = candidate_scores.get(movie_id, 0.0) + min(score, 0.85 if is_spotlight_mode else 0.35)

    ranked_candidate_ids = [
        movie_id
        for movie_id, _ in sorted(candidate_scores.items(), key=lambda item: item[1], reverse=True)
        if movie_id not in blocked_ids
    ]
    seed_context_by_movie_id: dict[int, dict[str, object]] = {}

    def build_seed_cluster_ranked_ids(seed_ids: list[int], max_seed_count: int = 8) -> list[int]:
        if not is_test_ai_experiment or vectors is None or not seed_ids:
            return []

        seed_rankings: list[list[int]] = []
        for seed_rank, seed_id in enumerate(seed_ids[:max_seed_count]):
            seed_index = movie_index_by_id.get(int(seed_id))
            if seed_index is None:
                continue

            seed_row = movies_df.iloc[seed_index]
            seed_title = str(seed_row.get("title") or "")
            seed_genres = set(seed_row.get("genre_tokens") or [])
            seed_keywords = set((seed_row.get("keyword_tokens") or [])[:18])
            try:
                seed_similarity_scores = cosine_similarity(
                    vectors,
                    vectors[seed_index].reshape(1, -1),
                ).ravel()
            except Exception:
                continue

            lane_scores: list[tuple[int, float]] = []
            seed_weight = float(positive_signal_weights.get(int(seed_id), 1.0))
            for movie_id, base_score in candidate_scores.items():
                movie_id = int(movie_id)
                if movie_id in blocked_ids:
                    continue
                movie_index = movie_index_by_id.get(movie_id)
                if movie_index is None:
                    continue

                row = movies_df.iloc[movie_index]
                audience_score = float(row.get("audience_rating_score") or 0.0)
                if audience_score < 0.53:
                    continue

                movie_genres = set(row.get("genre_tokens") or [])
                movie_keywords = set((row.get("keyword_tokens") or [])[:18])
                genre_overlap = len(movie_genres & seed_genres) / max(len(seed_genres), 1)
                keyword_overlap = len(movie_keywords & seed_keywords) / max(len(seed_keywords), 1)
                seed_similarity = float(seed_similarity_scores[movie_index])

                if seed_similarity < 0.11 and keyword_overlap < 0.08 and genre_overlap < 0.34:
                    continue

                cluster_score = (
                    (seed_similarity * 1.55)
                    + (keyword_overlap * 0.58)
                    + (genre_overlap * 0.32)
                    + (audience_score * 0.44)
                    + (float(row.get("quality_score") or 0.0) * 0.28)
                    + (float(base_score) * 0.18)
                    + min(seed_weight * 0.07, 0.24)
                    - (seed_rank * 0.035)
                )
                current_context = seed_context_by_movie_id.get(movie_id)
                if not current_context or cluster_score > float(current_context.get("cluster_score") or 0.0):
                    seed_context_by_movie_id[movie_id] = {
                        "seed_movie_id": int(seed_id),
                        "seed_title": seed_title,
                        "seed_similarity": round(seed_similarity, 4),
                        "cluster_score": float(cluster_score),
                    }
                lane_scores.append((movie_id, cluster_score))

            lane_scores.sort(key=lambda item: item[1], reverse=True)
            seed_rankings.append([movie_id for movie_id, _ in lane_scores[:80]])

        clustered_ids: list[int] = []
        seen_cluster_ids: set[int] = set()
        max_lane_length = max((len(ranking) for ranking in seed_rankings), default=0)
        for lane_index in range(max_lane_length):
            for ranking in seed_rankings:
                if lane_index >= len(ranking):
                    continue
                movie_id = ranking[lane_index]
                if movie_id in seen_cluster_ids:
                    continue
                seen_cluster_ids.add(movie_id)
                clustered_ids.append(movie_id)

        return clustered_ids

    if is_test_ai_experiment and positive_signal_ids:
        clustered_candidate_ids = build_seed_cluster_ranked_ids(positive_signal_ids)
        if clustered_candidate_ids:
            clustered_seen_ids = set(clustered_candidate_ids)
            ranked_candidate_ids = clustered_candidate_ids + [
                movie_id
                for movie_id in ranked_candidate_ids
                if movie_id not in clustered_seen_ids
            ]

    def build_recommendation_payload(row, reason_mode: str) -> dict:
        movie_id = int(row["id"])
        seed_context = seed_context_by_movie_id.get(movie_id, {})
        payload = {
            "id": movie_id,
            "title": str(row["title"]),
            "poster_url": fetch_poster_from_tmdb(movie_id),
            "rating": float(row["vote_average"]),
            "recommendation_reason": build_recommendation_reason(
                movie_id=movie_id,
                positive_indices=positive_indices,
                positive_signal_weights=positive_signal_weights,
                positive_similarity_scores=positive_similarity_scores,
                onboarding_genre_tokens=onboarding_genre_tokens,
                genre_profile=genre_profile,
                mode=reason_mode,
                seed_context=seed_context,
                is_test_experiment=is_test_ai_experiment,
            ),
        }
        if is_test_ai_experiment:
            payload.update(
                {
                    "recommendation_variant": TEST_AI_ALGORITHM_VARIANT,
                    "recommendation_seed_movie_id": seed_context.get("seed_movie_id") if seed_context else None,
                    "recommendation_seed_title": seed_context.get("seed_title") if seed_context else None,
                    "recommendation_similarity": seed_context.get("seed_similarity") if seed_context else None,
                }
            )
        return payload

    if is_explore_mode:
        exploration_pool = movies_df[~movies_df["id"].isin(blocked_ids)].copy()
        if exploration_pool.empty:
            return []

        ranked_bonus = {
            movie_id: max(0.0, 1.0 - (rank / 120.0))
            for rank, movie_id in enumerate(ranked_candidate_ids[:120])
        }
        genre_distance_scores = np.array(
            [
                1.0 - (len(set(tokens) & genre_profile) / max(len(genre_profile), 1))
                if genre_profile
                else 1.0
                for tokens in exploration_pool["genre_tokens"]
            ]
        )
        exploration_pool["exploration_score"] = [
            (ranked_bonus.get(int(row["id"]), 0.0) * 0.32)
            + (genre_distance_scores[idx] * 0.26)
            + (float(row["quality_score"]) * 0.24)
            + (collaborative_scores.get(int(row["id"]), 0.0) * 0.03)
            + (
                positive_similarity_scores[movie_index_by_id[int(row["id"])]]
                * (0.08 if positive_signal_ids else 0.0)
            )
            for idx, (_, row) in enumerate(exploration_pool.iterrows())
        ]
        exploration_pool = exploration_pool.sort_values("exploration_score", ascending=False)
        shortlisted_ids = [
            int(row["id"])
            for _, row in exploration_pool.head(max(limit * 8, 40)).iterrows()
        ]
        selected_ids = pick_diverse_movie_ids(shortlisted_ids, limit, per_genre_cap=2)
        selected_rows = movies_df[movies_df["id"].isin(selected_ids)].copy()
        selected_rows["selection_rank"] = selected_rows["id"].apply(
            lambda movie_id: selected_ids.index(int(movie_id))
        )
        selected_rows = selected_rows.sort_values("selection_rank")
        return [
            build_recommendation_payload(row, "explore")
            for _, row in selected_rows.iterrows()
        ]

    if is_test_ai_experiment:
        if is_tinder_mode and positive_signal_ids:
            exploration_slots = max(1, min(3, limit // 6))
        else:
            exploration_slots = max(1, limit // 4) if positive_signal_ids else 0
    else:
        exploration_slots = 0 if is_tinder_mode else (max(1, limit // 5) if positive_signal_ids else 0)
    main_slots = max(limit - exploration_slots, 0)
    main_per_genre_cap = 2 if is_test_ai_experiment and is_tinder_mode else 3
    selected_ids = pick_diverse_movie_ids(ranked_candidate_ids, main_slots, per_genre_cap=main_per_genre_cap)
    used_ids = blocked_ids | set(selected_ids)

    if len(selected_ids) < main_slots:
        filler_pool = movies_df[~movies_df["id"].isin(used_ids)]
        filler_pool = filler_pool.sort_values("quality_score", ascending=False)
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
            if is_test_ai_experiment:
                exploration_similarity_scores = np.array(
                    [
                        positive_similarity_scores[movie_index_by_id[int(movie_id)]]
                        if int(movie_id) in movie_index_by_id
                        else 0.0
                        for movie_id in exploration_pool["id"]
                    ]
                )
                exploration_pool["exploration_score"] = (
                    (exploration_pool["audience_rating_score"] * 0.36)
                    + (exploration_pool["quality_score"] * 0.24)
                    + (genre_distance_scores * 0.25)
                    + (exploration_similarity_scores * 0.12)
                    + ((exploration_pool["popularity"] / max_popularity) * 0.03)
                )
                exploration_shortlist = exploration_pool.sort_values("exploration_score", ascending=False).head(max(exploration_slots * 18, 36))
                selected_ids.extend([int(row["id"]) for _, row in exploration_shortlist.head(exploration_slots).iterrows()])
            else:
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
        fallback_pool = fallback_pool.sort_values("quality_score", ascending=False)
        selected_ids.extend([int(row["id"]) for _, row in fallback_pool.head(limit - len(selected_ids)).iterrows()])

    selected_rows = movies_df[movies_df["id"].isin(selected_ids)].copy()
    selected_rows["selection_rank"] = selected_rows["id"].apply(
        lambda movie_id: selected_ids.index(int(movie_id))
    )
    selected_rows = selected_rows.sort_values("selection_rank")

    return [
        build_recommendation_payload(row, "tinder" if is_tinder_mode else "spotlight")
        for _, row in selected_rows.head(limit).iterrows()
    ]

@app.get("/movies/feed")
def get_movie_feed(
    limit: int = 10,
    exclude_ids: Optional[str] = None,
    mode: str = "core",
    current_user: dict = Depends(get_current_user),
):
    return compute_recommendation_feed(
        current_user_id=current_user["id"],
        limit=limit,
        exclude_ids=exclude_ids,
        mode=mode,
    )


@app.post("/recommendations/impressions")
def create_recommendation_impression(
    payload: RecommendationImpressionPayload,
    current_user: dict = Depends(get_current_user),
):
    recorded = record_recommendation_impression(
        user_id=current_user["id"],
        movie_id=payload.movie_id,
        mode=payload.mode,
        rank=payload.rank,
        reason=payload.reason,
        algorithm_variant=payload.algorithm_variant,
        seed_movie_id=payload.seed_movie_id,
        seed_title=payload.seed_title,
        seed_similarity=payload.seed_similarity,
    )
    return {"recorded": recorded}


@app.get("/ai/test/metrics")
def get_test_ai_metrics(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    if not is_test_ai_experiment_user(cursor, current_user["id"]):
        conn.close()
        raise HTTPException(status_code=403, detail="Reserve au compte test.")

    cursor.execute(
        """
        SELECT
            COUNT(*) AS shown_count,
            SUM(CASE WHEN responded_at IS NOT NULL THEN 1 ELSE 0 END) AS response_count,
            SUM(CASE WHEN reaction_rating >= 4 OR reaction_type IN ('watch_later', 'playlist_add') THEN 1 ELSE 0 END) AS positive_count,
            SUM(CASE WHEN reaction_rating <= 2.5 THEN 1 ELSE 0 END) AS negative_count,
            AVG(CASE WHEN reaction_rating IS NOT NULL THEN reaction_rating ELSE NULL END) AS average_rating
        FROM recommendation_impressions
        WHERE user_id = ?
        """,
        (current_user["id"],),
    )
    overview_row = dict(cursor.fetchone() or {})

    cursor.execute(
        """
        SELECT
            algorithm_variant,
            mode,
            COUNT(*) AS shown_count,
            SUM(CASE WHEN responded_at IS NOT NULL THEN 1 ELSE 0 END) AS response_count,
            SUM(CASE WHEN reaction_rating >= 4 OR reaction_type IN ('watch_later', 'playlist_add') THEN 1 ELSE 0 END) AS positive_count,
            SUM(CASE WHEN reaction_rating <= 2.5 THEN 1 ELSE 0 END) AS negative_count,
            AVG(CASE WHEN reaction_rating IS NOT NULL THEN reaction_rating ELSE NULL END) AS average_rating
        FROM recommendation_impressions
        WHERE user_id = ?
        GROUP BY algorithm_variant, mode
        ORDER BY shown_count DESC
        """,
        (current_user["id"],),
    )
    grouped_rows = [dict(row) for row in cursor.fetchall()]

    cursor.execute(
        """
        SELECT
            movie_id,
            mode,
            algorithm_variant,
            reason,
            reaction_type,
            reaction_rating,
            shown_at,
            responded_at,
            seed_title
        FROM recommendation_impressions
        WHERE user_id = ?
        ORDER BY shown_at DESC
        LIMIT 24
        """,
        (current_user["id"],),
    )
    recent_rows = [dict(row) for row in cursor.fetchall()]

    cursor.execute(
        """
        SELECT
            movie_id,
            COUNT(*) AS shown_count,
            SUM(CASE WHEN responded_at IS NOT NULL THEN 1 ELSE 0 END) AS response_count,
            SUM(CASE WHEN reaction_rating >= 4 OR reaction_type IN ('watch_later', 'playlist_add') THEN 1 ELSE 0 END) AS positive_count,
            SUM(CASE WHEN reaction_rating <= 2.5 THEN 1 ELSE 0 END) AS negative_count,
            AVG(CASE WHEN reaction_rating IS NOT NULL THEN reaction_rating ELSE NULL END) AS average_rating
        FROM recommendation_impressions
        WHERE user_id = ?
        GROUP BY movie_id
        HAVING SUM(CASE WHEN responded_at IS NOT NULL THEN 1 ELSE 0 END) > 0
        ORDER BY positive_count DESC, response_count DESC, average_rating DESC
        LIMIT 6
        """,
        (current_user["id"],),
    )
    top_movie_rows = [dict(row) for row in cursor.fetchall()]

    cursor.execute(
        """
        SELECT
            seed_movie_id,
            seed_title,
            COUNT(*) AS shown_count,
            SUM(CASE WHEN responded_at IS NOT NULL THEN 1 ELSE 0 END) AS response_count,
            SUM(CASE WHEN reaction_rating >= 4 OR reaction_type IN ('watch_later', 'playlist_add') THEN 1 ELSE 0 END) AS positive_count,
            SUM(CASE WHEN reaction_rating <= 2.5 THEN 1 ELSE 0 END) AS negative_count,
            AVG(CASE WHEN reaction_rating IS NOT NULL THEN reaction_rating ELSE NULL END) AS average_rating
        FROM recommendation_impressions
        WHERE user_id = ?
          AND COALESCE(seed_title, '') != ''
        GROUP BY seed_movie_id, seed_title
        HAVING SUM(CASE WHEN responded_at IS NOT NULL THEN 1 ELSE 0 END) > 0
        ORDER BY positive_count DESC, response_count DESC, average_rating DESC
        LIMIT 6
        """,
        (current_user["id"],),
    )
    top_seed_rows = [dict(row) for row in cursor.fetchall()]
    feedback_profile = get_test_ai_feedback_profile(cursor, current_user["id"])
    conn.close()

    overview_shown_count = int(overview_row.get("shown_count") or 0)
    overview_response_count = int(overview_row.get("response_count") or 0)
    overview_positive_count = int(overview_row.get("positive_count") or 0)
    overview_negative_count = int(overview_row.get("negative_count") or 0)
    overview_average_rating = overview_row.get("average_rating")

    overview = {
        "shown_count": overview_shown_count,
        "response_count": overview_response_count,
        "positive_count": overview_positive_count,
        "negative_count": overview_negative_count,
        "average_rating": round(float(overview_average_rating), 2) if overview_average_rating is not None else None,
        "response_rate": round(overview_response_count / overview_shown_count, 3) if overview_shown_count else 0.0,
        "positive_rate": round(overview_positive_count / overview_response_count, 3) if overview_response_count else 0.0,
    }

    by_mode = []
    for row in grouped_rows:
        shown_count = int(row["shown_count"] or 0)
        response_count = int(row["response_count"] or 0)
        positive_count = int(row["positive_count"] or 0)
        negative_count = int(row["negative_count"] or 0)
        average_rating = row.get("average_rating")
        by_mode.append(
            {
                **row,
                "shown_count": shown_count,
                "response_count": response_count,
                "positive_count": positive_count,
                "negative_count": negative_count,
                "average_rating": round(float(average_rating), 2) if average_rating is not None else None,
                "response_rate": round(response_count / shown_count, 3) if shown_count else 0.0,
                "positive_rate": round(positive_count / response_count, 3) if response_count else 0.0,
            }
        )

    top_movies = []
    for row in top_movie_rows:
        response_count = int(row["response_count"] or 0)
        positive_count = int(row["positive_count"] or 0)
        average_rating = row.get("average_rating")
        movie_id = int(row["movie_id"])
        top_movies.append(
            {
                "movie_id": movie_id,
                "title": get_display_movie_title(movie_id),
                "shown_count": int(row["shown_count"] or 0),
                "response_count": response_count,
                "positive_count": positive_count,
                "negative_count": int(row["negative_count"] or 0),
                "average_rating": round(float(average_rating), 2) if average_rating is not None else None,
                "positive_rate": round(positive_count / response_count, 3) if response_count else 0.0,
            }
        )

    top_seeds = []
    for row in top_seed_rows:
        response_count = int(row["response_count"] or 0)
        positive_count = int(row["positive_count"] or 0)
        average_rating = row.get("average_rating")
        top_seeds.append(
            {
                "seed_movie_id": int(row["seed_movie_id"]) if row["seed_movie_id"] is not None else None,
                "seed_title": str(row["seed_title"] or ""),
                "shown_count": int(row["shown_count"] or 0),
                "response_count": response_count,
                "positive_count": positive_count,
                "negative_count": int(row["negative_count"] or 0),
                "average_rating": round(float(average_rating), 2) if average_rating is not None else None,
                "positive_rate": round(positive_count / response_count, 3) if response_count else 0.0,
            }
        )

    positive_genres = [
        {"name": present_affinity_token(token), "score": round(float(score), 2)}
        for token, score in sorted(
            (
                (str(token), float(score))
                for token, score in dict(feedback_profile.get("genre_biases") or {}).items()
                if float(score) > 0
            ),
            key=lambda item: item[1],
            reverse=True,
        )[:6]
    ]
    negative_genres = [
        {"name": present_affinity_token(token), "score": round(float(score), 2)}
        for token, score in sorted(
            (
                (str(token), float(score))
                for token, score in dict(feedback_profile.get("genre_biases") or {}).items()
                if float(score) < 0
            ),
            key=lambda item: item[1],
        )[:4]
    ]

    recent = []
    for row in recent_rows:
        reaction_rating = row.get("reaction_rating")
        recent.append(
            {
                "movie_id": int(row["movie_id"]),
                "movie_title": get_display_movie_title(int(row["movie_id"])),
                "mode": str(row["mode"] or ""),
                "algorithm_variant": str(row["algorithm_variant"] or ""),
                "reason": str(row["reason"] or ""),
                "reaction_type": str(row["reaction_type"] or ""),
                "reaction_rating": float(reaction_rating) if reaction_rating is not None else None,
                "shown_at": row["shown_at"],
                "responded_at": row["responded_at"],
                "seed_title": str(row["seed_title"] or ""),
                "is_positive": (
                    (reaction_rating is not None and float(reaction_rating) >= 4.0)
                    or str(row["reaction_type"] or "") in {"watch_later", "playlist_add"}
                ),
            }
        )

    return {
        "variant": TEST_AI_ALGORITHM_VARIANT,
        "overview": overview,
        "by_mode": by_mode,
        "top_movies": top_movies,
        "top_seeds": top_seeds,
        "feedback_profile": {
            "total_feedback_count": int(feedback_profile.get("total_feedback_count") or 0),
            "positive_count": int(feedback_profile.get("positive_count") or 0),
            "negative_count": int(feedback_profile.get("negative_count") or 0),
            "positive_genres": positive_genres,
            "negative_genres": negative_genres,
        },
        "recent": recent,
    }


def fetch_now_playing_movies(limit: int = 18) -> list[dict]:
    cached_items = now_playing_cache.get("items", [])
    cached_expiration = float(now_playing_cache.get("expires_at") or 0.0)
    if cached_items and cached_expiration > time.time():
        return [dict(movie) for movie in list(cached_items)[:limit]]

    try:
        url = f"https://api.themoviedb.org/3/movie/now_playing?api_key={TMDB_API_KEY}&language=fr-FR&page=1"
        results = requests.get(url, timeout=3).json().get("results", [])[:limit]
    except Exception:
        results = []

    movies = [
        {
            "id": int(movie["id"]),
            "title": str(movie.get("title") or ""),
            "poster_url": f"https://image.tmdb.org/t/p/w500{movie.get('poster_path', '')}" if movie.get("poster_path") else "",
            "rating": float(movie.get("vote_average") or 0),
            "overview": str(movie.get("overview") or ""),
        }
        for movie in results
    ]
    now_playing_cache["items"] = movies
    now_playing_cache["expires_at"] = time.time() + NOW_PLAYING_CACHE_TTL_SECONDS
    return [dict(movie) for movie in movies[:limit]]


def fetch_friend_rated_movies(current_user_id: int, limit: int = 18) -> list[dict]:
    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
            ur.movie_id AS id,
            ur.title,
            ur.poster_url,
            ur.rating,
            ur.added_at,
            u.username
        FROM user_ratings ur
        JOIN follows f ON f.followed_id = ur.user_id
        JOIN users u ON u.id = ur.user_id
        WHERE f.follower_id = ?
        ORDER BY ur.added_at DESC
        LIMIT ?
        """,
        (current_user_id, limit),
    )
    movies = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return movies


@app.get("/movies/news/highlights")
def movie_news_highlights(current_user: dict = Depends(get_current_user)):
    is_test_ai_experiment = normalize_username(str(current_user["username"])).lower() == "test"
    cached_payload = news_highlights_cache.get(current_user["id"])
    if not is_test_ai_experiment and cached_payload and cached_payload[0] > time.time():
        payload = cached_payload[1]
        return {
            key: [dict(movie) for movie in value]
            for key, value in payload.items()
        }

    popular_now = fetch_now_playing_movies(limit=18)
    popular_ids = {movie["id"] for movie in popular_now}
    tinder_preview = compute_recommendation_feed(
        current_user_id=current_user["id"],
        limit=24,
        exclude_ids=",".join(str(movie_id) for movie_id in popular_ids),
        mode="tinder",
    )
    tinder_preview_ids = {movie["id"] for movie in tinder_preview}

    tailored = compute_recommendation_feed(
        current_user_id=current_user["id"],
        limit=18,
        exclude_ids=",".join(str(movie_id) for movie_id in (popular_ids | tinder_preview_ids)),
        mode="spotlight",
    )
    tailored_ids = {movie["id"] for movie in tailored}

    discovery = compute_recommendation_feed(
        current_user_id=current_user["id"],
        limit=18,
        exclude_ids=",".join(str(movie_id) for movie_id in (popular_ids | tinder_preview_ids | tailored_ids)),
        mode="explore",
    )

    friend_rated = fetch_friend_rated_movies(current_user["id"], limit=18)

    payload = {
        "popular_now": popular_now,
        "tailored_for_you": tailored,
        "discovery_for_you": discovery,
        "friends_recent_ratings": friend_rated,
    }
    if not is_test_ai_experiment:
        news_highlights_cache[current_user["id"]] = (
            time.time() + NEWS_HIGHLIGHTS_CACHE_TTL_SECONDS,
            payload,
        )
    if not is_test_ai_experiment and len(news_highlights_cache) > 256:
        expired_user_ids = [
            user_id
            for user_id, value in news_highlights_cache.items()
            if value[0] <= time.time()
        ]
        for user_id in expired_user_ids:
            news_highlights_cache.pop(user_id, None)

    return {
        key: [dict(movie) for movie in value]
        for key, value in payload.items()
    }

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
            u.avatar_url,
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
            u.avatar_url,
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
    preferences = get_user_preferences(cursor, int(profile_row["id"]))
    conn.close()

    return {
        "id": profile_row["id"],
        "username": profile_row["username"],
        "avatar_url": profile_row["avatar_url"],
        "followers_count": profile_row["followers_count"],
        "following_count": profile_row["following_count"],
        "reviews_count": profile_row["reviews_count"],
        "favorites_count": profile_row["favorites_count"],
        "is_following": bool(profile_row["is_following"]),
        "is_self": profile_row["id"] == current_user["id"],
        **serialize_profile_preferences(preferences),
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


@app.get("/webpush/public-key")
def get_web_push_public_key(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    _, public_key = get_or_create_web_push_vapid_config(cursor)
    conn.commit()
    conn.close()

    if not public_key:
        raise HTTPException(
            status_code=503,
            detail="Les notifications web ne sont pas disponibles pour le moment",
        )

    return {"public_key": public_key}


@app.post("/webpush/subscribe")
def register_web_push_subscription(
    payload: WebPushSubscribePayload,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    endpoint = payload.endpoint.strip()
    p256dh = payload.keys.p256dh.strip()
    auth_secret = payload.keys.auth.strip()

    if not endpoint or not p256dh or not auth_secret:
        raise HTTPException(status_code=400, detail="Souscription Web Push invalide")

    subscription_payload = {
        "endpoint": endpoint,
        "expirationTime": payload.expirationTime,
        "keys": {
            "p256dh": p256dh,
            "auth": auth_secret,
        },
    }

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO web_push_subscriptions (
            user_id,
            endpoint,
            subscription_json,
            user_agent,
            is_active
        )
        VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(endpoint) DO UPDATE SET
            user_id = excluded.user_id,
            subscription_json = excluded.subscription_json,
            user_agent = excluded.user_agent,
            is_active = 1,
            updated_at = CURRENT_TIMESTAMP
        """,
        (
            current_user["id"],
            endpoint,
            json.dumps(subscription_payload, ensure_ascii=False),
            request.headers.get("user-agent"),
        ),
    )
    conn.commit()
    conn.close()
    return {"status": "subscribed"}


@app.post("/webpush/unsubscribe")
def unregister_web_push_subscription(
    payload: WebPushUnsubscribePayload,
    current_user: dict = Depends(get_current_user),
):
    endpoint = payload.endpoint.strip()
    if not endpoint:
        raise HTTPException(status_code=400, detail="Endpoint Web Push requis")

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE web_push_subscriptions
        SET is_active = 0, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND endpoint = ?
        """,
        (current_user["id"], endpoint),
    )
    conn.commit()
    conn.close()
    return {"status": "unsubscribed"}


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


@app.put("/social/reviews/{review_id}")
def update_review(
    review_id: int,
    payload: ReviewUpdate,
    current_user: dict = Depends(get_current_user),
):
    review_content = payload.content.strip()

    if payload.rating < 1 or payload.rating > 5:
        raise HTTPException(status_code=400, detail="La note doit être comprise entre 1 et 5")
    if len(review_content) < 10:
        raise HTTPException(status_code=400, detail="La critique doit contenir au moins 10 caractères")

    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT movie_id, title, poster_url
        FROM reviews
        WHERE id = ? AND user_id = ?
        """,
        (review_id, current_user["id"]),
    )
    review_row = cursor.fetchone()
    if not review_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Critique introuvable")

    cursor.execute(
        """
        UPDATE reviews
        SET rating = ?, content = ?
        WHERE id = ? AND user_id = ?
        """,
        (payload.rating, review_content, review_id, current_user["id"]),
    )
    cursor.execute(
        """
        INSERT OR REPLACE INTO user_ratings (user_id, movie_id, rating, title, poster_url)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            current_user["id"],
            review_row["movie_id"],
            payload.rating,
            review_row["title"],
            review_row["poster_url"],
        ),
    )
    conn.commit()

    updated_reviews = fetch_serialized_reviews(
        cursor,
        current_user["id"],
        "r.id = ?",
        (review_id,),
        1,
    )
    conn.close()

    if not updated_reviews:
        raise HTTPException(status_code=500, detail="Impossible de relire la critique modifiée")

    return updated_reviews[0]


@app.delete("/social/reviews/{review_id}")
def delete_review(review_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id FROM reviews WHERE id = ? AND user_id = ?",
        (review_id, current_user["id"]),
    )
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Critique introuvable")

    cursor.execute("DELETE FROM notifications WHERE review_id = ?", (review_id,))
    cursor.execute("DELETE FROM comments WHERE review_id = ?", (review_id,))
    cursor.execute("DELETE FROM review_likes WHERE review_id = ?", (review_id,))
    cursor.execute("DELETE FROM reviews WHERE id = ? AND user_id = ?", (review_id, current_user["id"]))
    conn.commit()
    conn.close()
    return {"status": "deleted"}


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
            u.avatar_url,
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
            "avatar_url": conversation_row["participant_avatar_url"],
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
                "avatar_url": conversation_row["participant_avatar_url"],
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
    send_web_push_notifications(
        cursor,
        [recipient_user_id],
        title=f"Message de @{current_user['username']}",
        body=build_direct_message_push_body(current_user["username"], content, movie_title),
        route=f"/messages?conversationId={conversation_id}",
        extra_data={
            "type": "dm",
            "conversationId": conversation_id,
            "senderUsername": current_user["username"],
            "tag": f"conversation-{conversation_id}",
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
            "sender_id": current_user["id"],
            "sender_username": current_user["username"],
            "preview": build_message_preview(content, movie_title),
            "movie_title": movie_title or None,
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


@app.get("/downloads/mobile")
def download_mobile_archive():
    if not os.path.exists(MOBILE_ARCHIVE_PATH):
        raise HTTPException(status_code=404, detail="Archive mobile introuvable")
    return FileResponse(
        MOBILE_ARCHIVE_PATH,
        media_type="application/gzip",
        filename="wechoose-mobile.tar.gz",
    )


@app.get("/search/people")
def search_people(query: str):
    return list(search_tmdb_people(query))[:8]


@app.get("/search/soundtracks")
def search_soundtracks_endpoint(query: str):
    return list(search_soundtracks(query))[:8]

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
