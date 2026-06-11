import ast
import asyncio
import base64
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import suppress
import importlib.util
import json
import hashlib
import logging
import os
import re
import sqlite3
import datetime
import secrets
import smtplib
import subprocess
import time
import uuid
from functools import lru_cache
from email.message import EmailMessage
from email.utils import formataddr
from html import unescape as html_unescape
from threading import Lock
from typing import Any, Optional
from urllib.parse import parse_qs, quote_plus, unquote, urlparse
from fastapi import FastAPI, HTTPException, Depends, status, WebSocket, WebSocketDisconnect, Query, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
import pandas as pd
import pickle
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
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

try:
    from redis import asyncio as redis_async
except Exception:
    redis_async = None

try:
    import psycopg
except Exception:
    psycopg = None

try:
    from psycopg_pool import ConnectionPool
except Exception:
    ConnectionPool = None

# --- CONFIGURATION SÉCURITÉ ---
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper())
logger = logging.getLogger("qulte-api")

DEFAULT_SECRET_KEY = "votre_super_cle_secrete_a_changer_en_prod"
DEFAULT_TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8"
DATABASE_PATH = os.getenv("SQLITE_PATH", "wechoose.db").strip() or "wechoose.db"
DATABASE_URL = os.getenv("DATABASE_URL", "").strip() or os.getenv("POSTGRES_URL", "").strip()
DATABASE_BACKEND = "postgres" if DATABASE_URL else "sqlite"
POSTGRES_POOL_MIN_SIZE = int(os.getenv("POSTGRES_POOL_MIN_SIZE", "1") or "1")
POSTGRES_POOL_MAX_SIZE = int(os.getenv("POSTGRES_POOL_MAX_SIZE", "10") or "10")
POSTGRES_POOL_TIMEOUT_SECONDS = float(os.getenv("POSTGRES_POOL_TIMEOUT_SECONDS", "5") or "5")
REDIS_URL = os.getenv("REDIS_URL", "").strip()
SECRET_KEY = os.getenv("SECRET_KEY", DEFAULT_SECRET_KEY).strip() or DEFAULT_SECRET_KEY
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 180 # 180 jours, adapté à une app mobile
SLOW_REQUEST_LOG_SECONDS = float(os.getenv("SLOW_REQUEST_LOG_SECONDS", "1.5") or "1.5")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

TMDB_API_KEY = os.getenv("TMDB_API_KEY", DEFAULT_TMDB_API_KEY).strip() or DEFAULT_TMDB_API_KEY
WATCHMODE_API_KEY = os.getenv("WATCHMODE_API_KEY", "").strip()
FCM_SERVER_KEY = os.getenv("FCM_SERVER_KEY", "").strip()
WEB_PUSH_SUBJECT = os.getenv("WEB_PUSH_SUBJECT", "").strip() or "mailto:qulte.developpeur@gmail.com"
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "").strip() or "qulte.developpeur@gmail.com"
SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587") or "587")
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "1").strip() != "0"
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "").strip() or SUPPORT_EMAIL
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "").strip() or "Qulte"
PASSWORD_RESET_CODE_EXPIRE_MINUTES = int(os.getenv("PASSWORD_RESET_CODE_EXPIRE_MINUTES", "20") or "20")
PASSWORD_RESET_EMAIL_SUBJECT = "Code de réinitialisation Qulte"
app = FastAPI(title="Qulte API")

WATCH_LATER_SYSTEM_ID = -1
FAVORITES_SYSTEM_ID = -2
HISTORY_SYSTEM_ID = -3
WATCH_LATER_NAME = "À regarder plus tard"
PLAYLIST_SORT_OPTIONS = {"manual", "genre", "recent", "oldest", "rating"}
NOW_PLAYING_CACHE_TTL_SECONDS = 300
NEWS_HIGHLIGHTS_CACHE_TTL_SECONDS = 90
TMDB_WATCH_PROVIDERS_CACHE_TTL_SECONDS = 60 * 60 * 6
TMDB_MOVIE_DETAILS_CACHE_TTL_SECONDS = 60 * 60 * 6
WATCHMODE_SOURCES_CACHE_TTL_SECONDS = 60 * 60 * 6
TMDB_WATCH_PAGE_LINKS_CACHE_TTL_SECONDS = 60 * 60 * 12
TMDB_WATCH_SCRAPER_STATUS_KEY = "tmdb_watch_scraper_status"
now_playing_cache: dict[str, object] = {"expires_at": 0.0, "items": []}
news_highlights_cache: dict[int, tuple[float, dict]] = {}
tmdb_watch_providers_cache: dict[int, tuple[float, dict[str, Any]]] = {}
tmdb_movie_details_cache: dict[int, tuple[float, dict[str, Any]]] = {}
watchmode_sources_cache: dict[str, tuple[float, dict[str, Any]]] = {}
TEST_AI_ALGORITHM_VARIANT = "seed_cluster_feedback_v1"
GLOBAL_RECOMMENDATION_AI_ENABLED = True
TEST_AI_DASHBOARD_USERNAME = "test"
TEST_RESET_USERNAMES = {
    username.strip().lower()
    for username in os.getenv("TEST_RESET_USERNAMES", "test,apple.review").split(",")
    if username.strip()
}
PASS_REACTION_TYPES = {"pass"}
PASS_RECONSIDER_COOLDOWN_DAYS = 14
MOBILE_ARCHIVE_PATH = "/home/wechoose/frontend/public/downloads/wechoose-mobile.tar.gz"
MOBILE_TRAILER_PLAYER_PATH = "/home/wechoose/frontend/public/mobile-trailer-player.html"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
AVATAR_UPLOAD_DIR = os.path.join(BASE_DIR, "uploads", "avatars")
AVATAR_PUBLIC_PREFIX = "/uploads/avatars"
POSTGRES_SCHEMA_PATH = os.path.join(BASE_DIR, "postgres_schema.sql")
MAX_AVATAR_BYTES = 5 * 1024 * 1024
AVATAR_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
OBJECTIONABLE_TERMS = {
    "gore",
    "kill yourself",
    "lynch",
    "nazi",
    "pedo",
    "pornhub",
    "rape",
    "rapist",
    "suicide",
}

if SECRET_KEY == DEFAULT_SECRET_KEY:
    logger.warning("SECRET_KEY utilise encore la valeur par defaut. A remplacer en production.")

if TMDB_API_KEY == DEFAULT_TMDB_API_KEY:
    logger.warning("TMDB_API_KEY utilise encore la valeur par defaut du projet.")

if DATABASE_BACKEND == "postgres" and psycopg is None:
    raise RuntimeError("DATABASE_URL/POSTGRES_URL defini mais psycopg n'est pas installe.")

REQUEST_COUNT = Counter(
    "qulte_http_requests_total",
    "Nombre total de requetes HTTP",
    ["method", "path", "status"],
)
REQUEST_LATENCY = Histogram(
    "qulte_http_request_duration_seconds",
    "Temps de reponse HTTP",
    ["method", "path"],
)
RATE_LIMIT_HITS = Counter(
    "qulte_rate_limit_hits_total",
    "Nombre de reponses 429",
    ["scope"],
)

DEFAULT_RATE_LIMIT = (120, 60.0)
STRICT_RATE_LIMITS = {
    "auth.login": (10, 60.0),
    "auth.password_reset.request": (6, 600.0),
    "auth.password_reset.confirm": (12, 600.0),
    "mobile.devices.register": (12, 60.0),
    "messages.create": (45, 60.0),
    "reviews.create": (20, 60.0),
    "comments.create": (30, 60.0),
}
rate_limit_events: dict[tuple[str, str], deque[float]] = defaultdict(deque)
rate_limit_lock = Lock()
tmdb_cache_lock = Lock()
notification_executor = ThreadPoolExecutor(max_workers=int(os.getenv("NOTIFICATION_WORKERS", "4") or "4"))
DBIntegrityError = (sqlite3.IntegrityError, psycopg.IntegrityError) if psycopg is not None else (sqlite3.IntegrityError,)
SQL_PARAM = "%s" if DATABASE_BACKEND == "postgres" else "?"


class HybridRow:
    def __init__(self, columns: list[str], values):
        self._columns = list(columns)
        self._values = tuple(values)
        self._mapping = dict(zip(columns, values))

    def __getitem__(self, key):
        if isinstance(key, int):
            return self._values[key]
        return self._mapping[key]

    def get(self, key, default=None):
        return self._mapping.get(key, default)

    def keys(self):
        return self._mapping.keys()

    def values(self):
        return self._mapping.values()

    def items(self):
        return self._mapping.items()

    def __iter__(self):
        return iter(self._values)

    def __len__(self):
        return len(self._values)


def row_uses_mapping_access(row: object) -> bool:
    return hasattr(row, "keys")


def row_get_value(row: Any, key: str, index: int):
    return row[key] if row_uses_mapping_access(row) else row[index]


def sql_placeholders(count: int) -> str:
    return ",".join(SQL_PARAM for _ in range(max(0, count)))


class PostgresCompatCursor:
    def __init__(self, cursor, *, row_factory_enabled: bool):
        self._cursor = cursor
        self._row_factory_enabled = row_factory_enabled
        self.lastrowid = None

    def execute(self, query, params=None):
        if params is None:
            self._cursor.execute(query)
        else:
            self._cursor.execute(query, params)
        return self

    def fetchone(self):
        row = self._cursor.fetchone()
        if row is None or not self._row_factory_enabled:
            return row
        columns = [column.name for column in self._cursor.description]
        return HybridRow(columns, row)

    def fetchall(self):
        rows = self._cursor.fetchall()
        if not self._row_factory_enabled:
            return rows
        columns = [column.name for column in self._cursor.description]
        return [HybridRow(columns, row) for row in rows]

    @property
    def rowcount(self):
        return self._cursor.rowcount

    def __getattr__(self, name):
        return getattr(self._cursor, name)


class PostgresCompatConnection:
    def __init__(self, conn, *, row_factory: bool):
        self._conn = conn
        self._row_factory = row_factory

    def cursor(self):
        return PostgresCompatCursor(self._conn.cursor(), row_factory_enabled=self._row_factory)

    def commit(self):
        return self._conn.commit()

    def rollback(self):
        return self._conn.rollback()

    def close(self):
        return self._conn.close()

    def execute(self, query, params=None):
        cursor = self.cursor()
        cursor.execute(query, params)
        return cursor


class PooledPostgresCompatConnection(PostgresCompatConnection):
    def __init__(self, pool, conn, *, row_factory: bool):
        super().__init__(conn, row_factory=row_factory)
        self._pool = pool

    def close(self):
        if self._conn is None:
            return None

        conn = self._conn
        self._conn = None
        try:
            if not conn.closed:
                # A SELECT starts a transaction in psycopg; reset it before reuse.
                conn.rollback()
        finally:
            return self._pool.putconn(conn)


class RealtimeConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, list[asyncio.Queue]] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        self.active_connections.setdefault(user_id, []).append(queue)
        logger.debug(
            "Realtime connect user=%s connections=%s",
            user_id,
            len(self.active_connections.get(user_id, [])),
        )
        return queue

    def disconnect(self, user_id: int, queue: asyncio.Queue):
        user_connections = self.active_connections.get(user_id, [])
        if queue in user_connections:
            user_connections.remove(queue)
        if not user_connections and user_id in self.active_connections:
            del self.active_connections[user_id]
        logger.debug(
            "Realtime disconnect user=%s remaining=%s",
            user_id,
            len(self.active_connections.get(user_id, [])),
        )

    async def send_to_user(self, user_id: int, payload: dict):
        user_connections = list(self.active_connections.get(user_id, []))
        logger.debug(
            "Realtime send user=%s connections=%s type=%s",
            user_id,
            len(user_connections),
            payload.get("type"),
        )
        for queue in user_connections:
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                logger.warning("Realtime queue pleine pour user=%s, fermeture de la connexion.", user_id)
                self.disconnect(user_id, queue)

    async def broadcast_to_users(self, user_ids: list[int], payload: dict):
        unique_user_ids = list(dict.fromkeys(user_ids))
        for user_id in unique_user_ids:
            await self.send_to_user(user_id, payload)


realtime_manager = RealtimeConnectionManager()
redis_client = None
redis_listener_task: Optional[asyncio.Task] = None
postgres_pool: Optional[Any] = None
REDIS_REALTIME_CHANNEL = "qulte:realtime"


async def publish_realtime_event(user_ids: list[int], payload: dict):
    unique_user_ids = list(dict.fromkeys(user_ids))
    if redis_client is not None:
        try:
            await redis_client.publish(
                REDIS_REALTIME_CHANNEL,
                json.dumps({"user_ids": unique_user_ids, "payload": payload}),
            )
            return
        except Exception:
            logger.exception("Echec publication realtime Redis, fallback local.")

    await realtime_manager.broadcast_to_users(unique_user_ids, payload)


async def redis_realtime_listener():
    if redis_client is None:
        return

    pubsub = redis_client.pubsub()
    await pubsub.subscribe(REDIS_REALTIME_CHANNEL)
    logger.info("Redis pub/sub temps reel actif sur %s", REDIS_REALTIME_CHANNEL)
    try:
        async for message in pubsub.listen():
            if message.get("type") != "message":
                continue
            try:
                event = json.loads(message.get("data") or "{}")
            except (TypeError, json.JSONDecodeError):
                continue

            user_ids = [int(user_id) for user_id in event.get("user_ids") or []]
            payload = event.get("payload") or {}
            await realtime_manager.broadcast_to_users(user_ids, payload)
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("Listener Redis realtime arrete sur erreur.")
    finally:
        await pubsub.unsubscribe(REDIS_REALTIME_CHANNEL)
        await pubsub.close()

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


def get_observed_path(request: Request) -> str:
    route = request.scope.get("route")
    route_path = getattr(route, "path", None)
    if isinstance(route_path, str) and route_path:
        return route_path
    return request.url.path


def get_rate_limit_scope(request: Request) -> Optional[str]:
    path = request.url.path
    method = request.method.upper()
    if path == "/auth/login" and method == "POST":
        return "auth.login"
    if path == "/auth/password-reset/request" and method == "POST":
        return "auth.password_reset.request"
    if path == "/auth/password-reset/confirm" and method == "POST":
        return "auth.password_reset.confirm"
    if path == "/mobile/devices/register" and method == "POST":
        return "mobile.devices.register"
    if path.startswith("/messages/conversations/") and path.endswith("/messages") and method == "POST":
        return "messages.create"
    if path == "/social/reviews" and method == "POST":
        return "reviews.create"
    if "/comments" in path and method == "POST":
        return "comments.create"
    return None


def get_rate_limit_client_id(request: Request) -> str:
    client_host = request.client.host if request.client else "unknown"
    if client_host in {"127.0.0.1", "::1", "localhost"}:
        forwarded_for = request.headers.get("x-forwarded-for", "")
        forwarded_host = forwarded_for.split(",", 1)[0].strip()
        if forwarded_host:
            return forwarded_host
    return client_host


def check_rate_limit(scope: str, request: Request) -> bool:
    max_requests, period_seconds = STRICT_RATE_LIMITS.get(scope, DEFAULT_RATE_LIMIT)
    key = (scope, get_rate_limit_client_id(request))
    now = time.time()

    with rate_limit_lock:
        bucket = rate_limit_events[key]
        while bucket and bucket[0] <= now - period_seconds:
            bucket.popleft()

        if len(bucket) >= max_requests:
            return False

        bucket.append(now)
        return True


@app.middleware("http")
async def observability_and_rate_limit_middleware(request: Request, call_next):
    observed_path = get_observed_path(request)
    rate_limit_scope = get_rate_limit_scope(request)
    started_at = time.perf_counter()

    if rate_limit_scope and not check_rate_limit(rate_limit_scope, request):
        RATE_LIMIT_HITS.labels(scope=rate_limit_scope).inc()
        latency = time.perf_counter() - started_at
        REQUEST_COUNT.labels(method=request.method, path=observed_path, status="429").inc()
        REQUEST_LATENCY.labels(method=request.method, path=observed_path).observe(latency)
        return PlainTextResponse("Trop de requetes, reessaie dans un instant.", status_code=429)

    response = await call_next(request)
    latency = time.perf_counter() - started_at
    REQUEST_COUNT.labels(
        method=request.method,
        path=observed_path,
        status=str(response.status_code),
    ).inc()
    REQUEST_LATENCY.labels(method=request.method, path=observed_path).observe(latency)
    response.headers["X-Response-Time"] = f"{latency:.4f}s"
    if latency >= SLOW_REQUEST_LOG_SECONDS:
        logger.warning(
            "Requete lente %s %s status=%s duration=%.3fs",
            request.method,
            observed_path,
            response.status_code,
            latency,
        )
    return response


@app.on_event("startup")
async def startup_runtime_services():
    global redis_client, redis_listener_task, postgres_pool
    if DATABASE_BACKEND == "postgres":
        if ConnectionPool is None:
            logger.warning("psycopg_pool indisponible. Connexions PostgreSQL directes sans pool.")
        else:
            try:
                postgres_pool = ConnectionPool(
                    DATABASE_URL,
                    min_size=POSTGRES_POOL_MIN_SIZE,
                    max_size=POSTGRES_POOL_MAX_SIZE,
                    timeout=POSTGRES_POOL_TIMEOUT_SECONDS,
                    open=True,
                )
                logger.info(
                    "Pool PostgreSQL actif min=%s max=%s timeout=%.1fs.",
                    POSTGRES_POOL_MIN_SIZE,
                    POSTGRES_POOL_MAX_SIZE,
                    POSTGRES_POOL_TIMEOUT_SECONDS,
                )
            except Exception:
                postgres_pool = None
                logger.exception("Impossible de demarrer le pool PostgreSQL. Connexions directes en fallback.")

    if REDIS_URL and redis_async is not None:
        try:
            redis_client = redis_async.from_url(REDIS_URL, decode_responses=True)
            await redis_client.ping()
            redis_listener_task = asyncio.create_task(redis_realtime_listener())
            logger.info("Redis active pour le temps reel.")
        except Exception:
            redis_client = None
            redis_listener_task = None
            logger.exception("Impossible de demarrer Redis realtime, fallback local.")
    elif REDIS_URL and redis_async is None:
        logger.warning("REDIS_URL defini mais package redis indisponible. Fallback local.")


@app.on_event("shutdown")
async def shutdown_runtime_services():
    global redis_client, redis_listener_task, postgres_pool
    notification_executor.shutdown(wait=False, cancel_futures=False)
    if postgres_pool is not None:
        postgres_pool.close()
        postgres_pool = None
    if redis_listener_task is not None:
        redis_listener_task.cancel()
        try:
            await redis_listener_task
        except asyncio.CancelledError:
            pass
        redis_listener_task = None
    if redis_client is not None:
        await redis_client.close()
        redis_client = None


@app.get("/healthz")
def healthcheck():
    db_status = "ok"
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        conn.close()
    except Exception:
        db_status = "error"
        logger.exception("Healthcheck base de donnees en erreur.")

    redis_status = "disabled"
    if REDIS_URL:
        redis_status = "connected" if redis_client is not None else "error"

    scraper_status_payload = get_json_app_setting(TMDB_WATCH_SCRAPER_STATUS_KEY) or {"status": "ok"}
    scraper_status = str(scraper_status_payload.get("status") or "ok")
    overall_status = "ok" if db_status == "ok" and redis_status != "error" and scraper_status != "warning" else "degraded"
    return {
        "status": overall_status,
        "database": db_status,
        "redis": redis_status,
        "database_mode": DATABASE_BACKEND,
        "watch_provider_scraper": scraper_status_payload,
    }


@app.get("/metrics")
def metrics():
    return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)

# --- 1. INITIALISATION BDD ---
def execute_insert_and_get_id(cursor, query: str, params=()) -> int:
    if DATABASE_BACKEND == "postgres":
        cursor.execute(f"{query.strip().rstrip(';')} RETURNING id", params)
        row = cursor.fetchone()
        if not row:
            raise RuntimeError("Insertion PostgreSQL sans identifiant retourné.")
        return int(row[0])

    cursor.execute(query, params)
    return int(cursor.lastrowid)


def get_db_connection(*, row_factory: bool = False):
    if DATABASE_BACKEND == "postgres":
        if postgres_pool is not None:
            return PooledPostgresCompatConnection(
                postgres_pool,
                postgres_pool.getconn(),
                row_factory=row_factory,
            )

        conn = psycopg.connect(DATABASE_URL)
        return PostgresCompatConnection(conn, row_factory=row_factory)

    conn = sqlite3.connect(
        DATABASE_PATH,
        timeout=30,
        check_same_thread=False,
    )
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA busy_timeout = 5000")
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


def init_postgres_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    with open(POSTGRES_SCHEMA_PATH, "r", encoding="utf-8") as schema_file:
        cursor.execute(schema_file.read())
    cursor.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT")
    cursor.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users ((lower(email))) WHERE email IS NOT NULL AND email <> ''"
    )
    cursor.execute(
        "ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS owned_streaming_services TEXT DEFAULT '[]'"
    )
    cursor.execute("ALTER TABLE playlist_items ADD COLUMN IF NOT EXISTS primary_genre TEXT")
    cursor.execute(
        "ALTER TABLE playlist_items ADD COLUMN IF NOT EXISTS subscription_provider_names TEXT DEFAULT '[]'"
    )
    cursor.execute("ALTER TABLE playlist_items ADD COLUMN IF NOT EXISTS metadata_updated_at TIMESTAMP")
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS password_reset_codes (
            id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            code_hash TEXT NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            used_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_password_reset_codes_user_created ON password_reset_codes(user_id, created_at DESC)"
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS movie_provider_link_cache (
            movie_id INTEGER NOT NULL,
            region_code TEXT NOT NULL,
            provider_links_json TEXT NOT NULL DEFAULT '{}',
            source_page_url TEXT,
            fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL,
            PRIMARY KEY (movie_id, region_code)
        )
        """
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_movie_provider_link_cache_expires ON movie_provider_link_cache(expires_at)"
    )
    conn.commit()
    conn.close()


def init_sqlite_db():
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
    ensure_column("users", "email", "TEXT")
    cursor.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email) WHERE email IS NOT NULL AND email != ''"
    )

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
    ensure_column("user_preferences", "owned_streaming_services", "TEXT DEFAULT '[]'")
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
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON playlists(user_id)"
    )

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
    if "primary_genre" not in playlist_item_columns:
        cursor.execute("ALTER TABLE playlist_items ADD COLUMN primary_genre TEXT")
    if "subscription_provider_names" not in playlist_item_columns:
        cursor.execute("ALTER TABLE playlist_items ADD COLUMN subscription_provider_names TEXT DEFAULT '[]'")
    if "metadata_updated_at" not in playlist_item_columns:
        cursor.execute("ALTER TABLE playlist_items ADD COLUMN metadata_updated_at TIMESTAMP")
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist_sort ON playlist_items(playlist_id, sort_index)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist_added_at ON playlist_items(playlist_id, added_at)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_playlist_items_movie_id ON playlist_items(movie_id)"
    )

    # Table FOLLOWS
    cursor.execute('''CREATE TABLE IF NOT EXISTS follows (
                        follower_id INTEGER,
                        followed_id INTEGER,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (follower_id, followed_id))''')
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_follows_followed_id ON follows(followed_id)"
    )

    # Table BLOCKED_USERS
    cursor.execute('''CREATE TABLE IF NOT EXISTS blocked_users (
                        blocker_id INTEGER,
                        blocked_id INTEGER,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (blocker_id, blocked_id))''')
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked_id ON blocked_users(blocked_id)"
    )

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
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_reviews_user_created_at ON reviews(user_id, created_at DESC)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_reviews_movie_id ON reviews(movie_id)"
    )

    # Table REVIEW_LIKES
    cursor.execute('''CREATE TABLE IF NOT EXISTS review_likes (
                        review_id INTEGER,
                        user_id INTEGER,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (review_id, user_id))''')
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_review_likes_user_id ON review_likes(user_id)"
    )

    # Table COMMENTS
    cursor.execute('''CREATE TABLE IF NOT EXISTS comments (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        review_id INTEGER,
                        user_id INTEGER,
                        parent_id INTEGER,
                        content TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_comments_review_parent_created ON comments(review_id, parent_id, created_at)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id)"
    )

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
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created ON notifications(user_id, is_read, created_at DESC)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_notifications_review_id ON notifications(review_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_notifications_comment_id ON notifications(comment_id)"
    )

    # Table DIRECT_CONVERSATIONS
    cursor.execute('''CREATE TABLE IF NOT EXISTS direct_conversations (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_one_id INTEGER,
                        user_two_id INTEGER,
                        user_one_last_read_message_id INTEGER DEFAULT 0,
                        user_two_last_read_message_id INTEGER DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(user_one_id, user_two_id))''')
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_direct_conversations_user_one ON direct_conversations(user_one_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_direct_conversations_user_two ON direct_conversations(user_two_id)"
    )

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
    ensure_column("direct_messages", "reply_to_message_id", "INTEGER")
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation_id_id ON direct_messages(conversation_id, id DESC)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_direct_messages_sender_id ON direct_messages(sender_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_direct_messages_reply_to ON direct_messages(reply_to_message_id)"
    )

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

    # Table PASSWORD_RESET_CODES
    cursor.execute('''CREATE TABLE IF NOT EXISTS password_reset_codes (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER,
                        code_hash TEXT,
                        expires_at TIMESTAMP,
                        used_at TIMESTAMP,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_password_reset_codes_user_created ON password_reset_codes(user_id, created_at DESC)"
    )

    # Table MOVIE_PROVIDER_LINK_CACHE
    cursor.execute('''CREATE TABLE IF NOT EXISTS movie_provider_link_cache (
                        movie_id INTEGER NOT NULL,
                        region_code TEXT NOT NULL,
                        provider_links_json TEXT NOT NULL DEFAULT '{}',
                        source_page_url TEXT,
                        fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        expires_at TIMESTAMP,
                        PRIMARY KEY (movie_id, region_code))''')
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_movie_provider_link_cache_expires ON movie_provider_link_cache(expires_at)"
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

    # Table MODERATION_REPORTS
    cursor.execute('''CREATE TABLE IF NOT EXISTS moderation_reports (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        reporter_user_id INTEGER,
                        target_user_id INTEGER,
                        target_review_id INTEGER,
                        target_comment_id INTEGER,
                        target_conversation_id INTEGER,
                        reason TEXT,
                        details TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_moderation_reports_reporter ON moderation_reports(reporter_user_id)"
    )
    
    conn.commit()
    conn.close()


def init_db():
    os.makedirs(AVATAR_UPLOAD_DIR, exist_ok=True)

    if DATABASE_BACKEND == "postgres":
        init_postgres_db()
        return

    init_sqlite_db()

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
    email: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str
    has_completed_onboarding: bool = False
    has_completed_tutorial: bool = False


class RecoveryEmailPayload(BaseModel):
    email: str = ""


class PasswordResetRequestPayload(BaseModel):
    identifier: str


class PasswordResetConfirmPayload(BaseModel):
    identifier: str
    code: str
    new_password: str


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
    owned_streaming_services: Optional[list[str]] = None


class ModerationReportPayload(BaseModel):
    reason: str
    details: str = ""


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


def normalize_email(value: Optional[str]) -> str:
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8").strip().lower()
        except UnicodeDecodeError:
            return value.decode("utf-8", errors="ignore").strip().lower()
    return value.strip().lower() if isinstance(value, str) else ""


def validate_recovery_email(value: str) -> str:
    normalized = normalize_email(value)
    if not normalized:
        return ""
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", normalized):
        raise HTTPException(status_code=400, detail="Adresse e-mail invalide")
    return normalized


def normalize_password_reset_identifier(value: str) -> str:
    normalized = normalize_email(value)
    if not normalized:
        raise HTTPException(status_code=400, detail="Identifiant ou e-mail requis")
    return normalized[:255]


def normalize_password_reset_code(value: str) -> str:
    normalized = "".join(character for character in normalize_email(value) if character.isdigit())
    if len(normalized) != 6:
        raise HTTPException(status_code=400, detail="Code de réinitialisation invalide")
    return normalized


def generate_password_reset_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_password_reset_code(code: str) -> str:
    return hashlib.sha256(f"{SECRET_KEY}:{code}".encode("utf-8")).hexdigest()


def decode_db_text(value: Optional[str]) -> str:
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8")
        except UnicodeDecodeError:
            return value.decode("utf-8", errors="ignore")
    return value if isinstance(value, str) else ""


def send_email_message(recipient: str, subject: str, text_body: str) -> None:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((SMTP_FROM_NAME, SMTP_FROM_EMAIL))
    message["To"] = recipient
    message["Reply-To"] = SUPPORT_EMAIL
    message.set_content(text_body)

    if SMTP_HOST:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as smtp_client:
            smtp_client.ehlo()
            if SMTP_USE_TLS:
                smtp_client.starttls()
                smtp_client.ehlo()
            if SMTP_USERNAME:
                smtp_client.login(SMTP_USERNAME, SMTP_PASSWORD)
            smtp_client.send_message(message)
        return

    sendmail_path = "/usr/sbin/sendmail"
    if os.path.exists(sendmail_path):
        subprocess.run(
            [sendmail_path, "-t", "-i"],
            input=message.as_bytes(),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
        return

    raise RuntimeError("Aucune methode d'envoi d'e-mail n'est configuree")


def send_password_reset_email(recipient: str, username: str, code: str) -> None:
    text_body = (
        f"Bonjour,\n\n"
        f"Tu as demande la reinitialisation du mot de passe du compte Qulte @{username}.\n\n"
        f"Ton code de reinitialisation est : {code}\n\n"
        f"Ce code expire dans {PASSWORD_RESET_CODE_EXPIRE_MINUTES} minutes.\n"
        f"Si tu n'es pas a l'origine de cette demande, tu peux ignorer cet e-mail.\n\n"
        f"Besoin d'aide : {SUPPORT_EMAIL}\n"
    )
    send_email_message(recipient, PASSWORD_RESET_EMAIL_SUBJECT, text_body)


def normalize_profile_description(value: Optional[str]) -> str:
    return " ".join(decode_db_text(value).split())[:180]


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


def normalize_streaming_service_label(value: str) -> str:
    normalized = normalize_preference_label(value)
    if not normalized:
        return ""

    aliases = {
        "prime": "Prime Video",
        "amazon prime": "Prime Video",
        "amazon prime video": "Prime Video",
        "prime video": "Prime Video",
        "disney+": "Disney+",
        "disney plus": "Disney+",
        "netflix": "Netflix",
        "canal+": "Canal+",
        "canal plus": "Canal+",
        "apple tv+": "Apple TV+",
        "apple tv plus": "Apple TV+",
        "paramount+": "Paramount+",
        "paramount plus": "Paramount+",
        "max": "Max",
        "ocs": "OCS",
        "mubi": "MUBI",
        "arte": "ARTE",
        "arte.tv": "ARTE",
        "arte tv": "ARTE",
    }
    return aliases.get(normalized.lower(), normalized)


def normalize_genre_token(value: str) -> str:
    return normalize_preference_label(value).replace(" ", "").lower()


def normalize_report_reason(value: str) -> str:
    normalized = normalize_preference_label(value).lower()
    return (normalized[:48] or "other")


def normalize_report_details(value: Optional[str]) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.split())[:500]


def normalize_moderation_text(value: Optional[str]) -> str:
    if not isinstance(value, str):
        return ""
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def contains_objectionable_text(value: Optional[str]) -> bool:
    normalized = normalize_moderation_text(value)
    if not normalized:
        return False

    for term in OBJECTIONABLE_TERMS:
        if term in normalized:
            return True
    return False


def ensure_clean_ugc_text(value: Optional[str]):
    if contains_objectionable_text(value):
        raise HTTPException(
            status_code=400,
            detail="Ce contenu ne peut pas être publié en l'état.",
        )


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
    raw_text = decode_db_text(raw_value)
    if not raw_text:
        return []

    try:
        parsed_value = json.loads(raw_text)
    except (TypeError, json.JSONDecodeError):
        return []

    return parsed_value if isinstance(parsed_value, list) else []


def load_json_dict(raw_value: Optional[str]) -> dict:
    raw_text = decode_db_text(raw_value)
    if not raw_text:
        return {}

    try:
        parsed_value = json.loads(raw_text)
    except (TypeError, json.JSONDecodeError):
        return {}

    return parsed_value if isinstance(parsed_value, dict) else {}


def dedupe_list(values: list) -> list:
    return list(dict.fromkeys(values))


def get_blocked_user_ids(cursor, user_id: int) -> set[int]:
    cursor.execute(
        f"SELECT blocked_id FROM blocked_users WHERE blocker_id = {SQL_PARAM}",
        (int(user_id),),
    )
    return {int(row[0]) for row in cursor.fetchall()}


def get_hidden_user_ids(cursor, user_id: int) -> set[int]:
    hidden_user_ids = set(get_blocked_user_ids(cursor, user_id))
    cursor.execute(
        f"SELECT blocker_id FROM blocked_users WHERE blocked_id = {SQL_PARAM}",
        (int(user_id),),
    )
    hidden_user_ids.update(int(row[0]) for row in cursor.fetchall())
    return hidden_user_ids


def is_hidden_user_relationship(cursor, current_user_id: int, target_user_id: int) -> bool:
    if int(current_user_id) == int(target_user_id):
        return False

    cursor.execute(
        """
        SELECT 1
        FROM blocked_users
        WHERE (blocker_id = {param} AND blocked_id = {param})
           OR (blocker_id = {param} AND blocked_id = {param})
        LIMIT 1
        """.format(param=SQL_PARAM),
        (int(current_user_id), int(target_user_id), int(target_user_id), int(current_user_id)),
    )
    return cursor.fetchone() is not None


def ensure_user_interaction_allowed(cursor, current_user_id: int, target_user_id: int):
    if is_hidden_user_relationship(cursor, current_user_id, target_user_id):
        raise HTTPException(status_code=403, detail="Interaction indisponible pour ce compte.")


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
    cursor.execute(f"SELECT COUNT(*) FROM user_ratings WHERE user_id = {SQL_PARAM}", (user_id,))
    ratings_count = int(cursor.fetchone()[0] or 0)
    cursor.execute(
        """
        SELECT COUNT(*)
        FROM playlist_items pi
        JOIN playlists p ON p.id = pi.playlist_id
        WHERE p.user_id = {param} AND p.name = {param}
        """.format(param=SQL_PARAM),
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
            owned_streaming_services,
            tutorial_completed_at
        FROM user_preferences
        WHERE user_id = {param}
        """.format(param=SQL_PARAM),
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
            "owned_streaming_services": [],
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
    owned_streaming_services = dedupe_list(
        [
            normalize_streaming_service_label(value)
            for value in load_json_list(row[11])
            if isinstance(value, str) and normalize_streaming_service_label(value)
        ]
    )

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
        "owned_streaming_services": owned_streaming_services,
        "has_completed_onboarding": bool(row[4]) or has_existing_taste_signals(cursor, user_id),
        "has_completed_tutorial": bool(row[12]),
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
        "owned_streaming_services": [
            normalize_streaming_service_label(value)
            for value in preferences.get("owned_streaming_services", [])
            if isinstance(value, str) and normalize_streaming_service_label(value)
        ],
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
    cursor.execute(f"SELECT id, username, avatar_url FROM users WHERE username = {SQL_PARAM}", (username,))
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


def fetch_user_by_reset_identifier(cursor, identifier: str):
    normalized_identifier = normalize_password_reset_identifier(identifier)
    cursor.execute(
        f"""
        SELECT id, username, email
        FROM users
        WHERE lower(username) = {SQL_PARAM}
           OR lower(coalesce(email, '')) = {SQL_PARAM}
        LIMIT 1
        """,
        (normalized_identifier, normalized_identifier),
    )
    return cursor.fetchone()

# --- 4. ROUTES AUTH ---
@app.post("/auth/signup", response_model=Token)
def signup(user: UserCreate):
    username = normalize_username(user.username)
    password = user.password.strip()
    email = validate_recovery_email(user.email or "")

    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Le nom d'utilisateur doit contenir au moins 3 caractères")
    if len(password) < 4:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 4 caractères")

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if email:
            cursor.execute(
                f"SELECT 1 FROM users WHERE lower(coalesce(email, '')) = {SQL_PARAM} LIMIT 1",
                (email,),
            )
            if cursor.fetchone():
                raise HTTPException(status_code=400, detail="Cette adresse e-mail est deja utilisee")
        hashed_pw = get_password_hash(password)
        user_id = execute_insert_and_get_id(
            cursor,
            f"INSERT INTO users (username, password_hash, email) VALUES ({SQL_PARAM}, {SQL_PARAM}, {SQL_PARAM})",
            (username, hashed_pw, email or None),
        )
        get_or_create_watch_later_id(cursor, user_id)
        conn.commit()
    except HTTPException:
        conn.rollback()
        conn.close()
        raise
    except DBIntegrityError:
        conn.rollback()
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
    cursor.execute(f"SELECT id, password_hash FROM users WHERE username = {SQL_PARAM}", (username,))
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


@app.post("/auth/password-reset/request")
def request_password_reset(payload: PasswordResetRequestPayload):
    conn = get_db_connection()
    cursor = conn.cursor()
    user_row = fetch_user_by_reset_identifier(cursor, payload.identifier)

    if not user_row:
        conn.close()
        return {"status": "sent"}

    user_id = int(row_get_value(user_row, "id", 0))
    username = decode_db_text(row_get_value(user_row, "username", 1))
    email = validate_recovery_email(row_get_value(user_row, "email", 2))

    if not email:
        conn.close()
        return {"status": "sent"}

    code = generate_password_reset_code()
    code_hash = hash_password_reset_code(code)
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=PASSWORD_RESET_CODE_EXPIRE_MINUTES)

    try:
        cursor.execute(
            f"DELETE FROM password_reset_codes WHERE user_id = {SQL_PARAM} AND used_at IS NULL",
            (user_id,),
        )
        execute_insert_and_get_id(
            cursor,
            f"""
            INSERT INTO password_reset_codes (user_id, code_hash, expires_at)
            VALUES ({SQL_PARAM}, {SQL_PARAM}, {SQL_PARAM})
            """,
            (user_id, code_hash, expires_at),
        )
        send_password_reset_email(email, username, code)
        conn.commit()
    except Exception:
        conn.rollback()
        logger.exception("Impossible d'envoyer l'e-mail de reinitialisation a %s", email)
        raise HTTPException(status_code=503, detail="Impossible d'envoyer le code de reinitialisation pour le moment.")
    finally:
        conn.close()

    return {"status": "sent"}


@app.post("/auth/password-reset/confirm")
def confirm_password_reset(payload: PasswordResetConfirmPayload):
    normalized_password = payload.new_password.strip()
    if len(normalized_password) < 4:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 4 caractères")

    normalized_code = normalize_password_reset_code(payload.code)
    conn = get_db_connection()
    cursor = conn.cursor()
    user_row = fetch_user_by_reset_identifier(cursor, payload.identifier)

    if not user_row:
        conn.close()
        raise HTTPException(status_code=400, detail="Code ou identifiant invalide")

    user_id = int(row_get_value(user_row, "id", 0))
    code_hash = hash_password_reset_code(normalized_code)
    cursor.execute(
        f"""
        SELECT id
        FROM password_reset_codes
        WHERE user_id = {SQL_PARAM}
          AND code_hash = {SQL_PARAM}
          AND used_at IS NULL
          AND expires_at > CURRENT_TIMESTAMP
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (user_id, code_hash),
    )
    code_row = cursor.fetchone()
    if not code_row:
        conn.close()
        raise HTTPException(status_code=400, detail="Code ou identifiant invalide")

    hashed_pw = get_password_hash(normalized_password)
    cursor.execute(
        f"UPDATE users SET password_hash = {SQL_PARAM} WHERE id = {SQL_PARAM}",
        (hashed_pw, user_id),
    )
    cursor.execute(
        f"UPDATE password_reset_codes SET used_at = CURRENT_TIMESTAMP WHERE user_id = {SQL_PARAM} AND used_at IS NULL",
        (user_id,),
    )
    conn.commit()
    conn.close()
    return {"status": "updated"}

@app.get("/users/me")
def read_users_me(current_user: dict = Depends(get_current_user)):
    return current_user


@app.get("/users/me/recovery-email")
def get_recovery_email(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(f"SELECT email FROM users WHERE id = {SQL_PARAM}", (current_user["id"],))
    row = cursor.fetchone()
    conn.close()
    return {"email": validate_recovery_email(row_get_value(row, "email", 0) if row else "")}


@app.put("/users/me/recovery-email")
def update_recovery_email(
    payload: RecoveryEmailPayload,
    current_user: dict = Depends(get_current_user),
):
    email = validate_recovery_email(payload.email)
    conn = get_db_connection()
    cursor = conn.cursor()
    if email:
        cursor.execute(
            f"""
            SELECT id
            FROM users
            WHERE lower(coalesce(email, '')) = {SQL_PARAM}
              AND id <> {SQL_PARAM}
            LIMIT 1
            """,
            (email, current_user["id"]),
        )
        if cursor.fetchone():
            conn.close()
            raise HTTPException(status_code=400, detail="Cette adresse e-mail est deja utilisee")

    cursor.execute(
        f"UPDATE users SET email = {SQL_PARAM} WHERE id = {SQL_PARAM}",
        (email or None, current_user["id"]),
    )
    conn.commit()
    conn.close()
    return {"email": email}


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
        raise HTTPException(status_code=400, detail="Format image non supporté")

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
    cursor.execute(f"SELECT avatar_url FROM users WHERE id = {SQL_PARAM}", (current_user["id"],))
    row = cursor.fetchone()
    previous_avatar_url = row["avatar_url"] if row else None
    cursor.execute(
        f"UPDATE users SET avatar_url = {SQL_PARAM} WHERE id = {SQL_PARAM}",
        (avatar_url, current_user["id"]),
    )
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
        VALUES ({param}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
            tutorial_completed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        """.format(param=SQL_PARAM),
        (current_user["id"],),
    )
    conn.commit()
    conn.close()
    return {"status": "completed"}


def delete_many_by_ids(cursor, table_name: str, column_name: str, values: list[int]) -> int:
    ids = [int(value) for value in dict.fromkeys(values)]
    if not ids:
        return 0

    placeholders = sql_placeholders(len(ids))
    cursor.execute(
        f"DELETE FROM {table_name} WHERE {column_name} IN ({placeholders})",
        ids,
    )
    return max(cursor.rowcount, 0)


def is_test_reset_user(cursor, user_id: int, username: str) -> bool:
    normalized_username = str(username).strip().lower()
    if normalized_username in TEST_RESET_USERNAMES:
        return True

    placeholders = sql_placeholders(len(TEST_RESET_USERNAMES))
    cursor.execute(
        f"""
        SELECT 1
        FROM users
        WHERE id = {SQL_PARAM}
          AND lower(username) IN ({placeholders})
        LIMIT 1
        """,
        (user_id, *sorted(TEST_RESET_USERNAMES)),
    )
    return cursor.fetchone() is not None


@app.post("/users/me/reset-test-data")
def reset_test_user_data(current_user: dict = Depends(get_current_user)):
    user_id = int(current_user["id"])
    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    if not is_test_reset_user(cursor, user_id, str(current_user["username"])):
        conn.close()
        raise HTTPException(status_code=403, detail="Reset reserve au compte test.")
    reset_counts, previous_avatar_url = purge_user_data(cursor, user_id, delete_account=False)
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


@app.post("/users/me/reset-recommendation-profile")
def reset_recommendation_profile_route(current_user: dict = Depends(get_current_user)):
    user_id = int(current_user["id"])
    conn = get_db_connection()
    cursor = conn.cursor()
    reset_counts = reset_recommendation_profile(cursor, user_id)
    conn.commit()
    preferences = get_user_preferences(cursor, user_id)
    conn.close()

    return {
        "status": "reset",
        "counts": reset_counts,
        "has_completed_onboarding": preferences["has_completed_onboarding"],
        "has_completed_tutorial": preferences["has_completed_tutorial"],
    }


@app.delete("/users/me")
def delete_current_user_account(current_user: dict = Depends(get_current_user)):
    user_id = int(current_user["id"])
    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    reset_counts, previous_avatar_url = purge_user_data(cursor, user_id, delete_account=True)
    conn.commit()
    conn.close()

    previous_avatar_path = local_avatar_path_from_url(previous_avatar_url)
    if previous_avatar_path and os.path.exists(previous_avatar_path):
        try:
            os.remove(previous_avatar_path)
        except OSError:
            pass

    return {
        "status": "deleted",
        "counts": reset_counts,
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
        raise HTTPException(status_code=400, detail="Ajoute au moins quelques goûts pour lancer l'IA.")

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
        ) VALUES ({param}, {param}, {param}, {param}, {param}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
            favorite_genres = excluded.favorite_genres,
            favorite_people = excluded.favorite_people,
            favorite_movie_ids = excluded.favorite_movie_ids,
            people_seed_movie_ids = excluded.people_seed_movie_ids,
            onboarding_completed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        """.format(param=SQL_PARAM),
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
    conn = get_db_connection()
    cursor = conn.cursor()
    existing_preferences = get_user_preferences(cursor, current_user["id"])
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
    if payload.owned_streaming_services is None:
        owned_streaming_services = existing_preferences.get("owned_streaming_services", [])
    else:
        owned_streaming_services = dedupe_list(
            [
                normalize_streaming_service_label(value)
                for value in payload.owned_streaming_services
                if isinstance(value, str) and normalize_streaming_service_label(value)
            ]
        )[:12]
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
            owned_streaming_services,
            updated_at
        ) VALUES ({param}, {param}, {param}, {param}, {param}, {param}, {param}, {param}, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
            profile_genres = excluded.profile_genres,
            profile_people = excluded.profile_people,
            profile_people_data = excluded.profile_people_data,
            profile_movie_ids = excluded.profile_movie_ids,
            profile_soundtrack = excluded.profile_soundtrack,
            profile_description = excluded.profile_description,
            owned_streaming_services = excluded.owned_streaming_services,
            updated_at = CURRENT_TIMESTAMP
        """.format(param=SQL_PARAM),
        (
            current_user["id"],
            dump_json_list(profile_genres),
            dump_json_list(profile_people),
            dump_json_list(profile_people_data),
            dump_json_list(profile_movie_ids),
            dump_json_dict(profile_soundtrack or {}),
            profile_description,
            dump_json_list(owned_streaming_services),
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


def fetch_posters_from_tmdb(movie_ids: list[int]) -> dict[int, str]:
    unique_movie_ids = [int(movie_id) for movie_id in dict.fromkeys(movie_ids)]
    if not unique_movie_ids:
        return {}
    if len(unique_movie_ids) == 1:
        movie_id = unique_movie_ids[0]
        return {movie_id: fetch_poster_from_tmdb(movie_id)}

    poster_urls: dict[int, str] = {}
    max_workers = min(8, len(unique_movie_ids))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_by_movie_id = {
            executor.submit(fetch_poster_from_tmdb, movie_id): movie_id
            for movie_id in unique_movie_ids
        }
        for future in as_completed(future_by_movie_id):
            movie_id = future_by_movie_id[future]
            try:
                poster_urls[movie_id] = future.result()
            except Exception:
                poster_urls[movie_id] = "https://via.placeholder.com/500"

    return poster_urls

def get_cached_tmdb_payload(
    cache: dict[int, tuple[float, dict[str, Any]]],
    key: int,
    *,
    allow_stale: bool = False,
) -> Optional[dict[str, Any]]:
    with tmdb_cache_lock:
        cached_entry = cache.get(int(key))

    if not cached_entry:
        return None

    expires_at, payload = cached_entry
    if expires_at > time.time() or allow_stale:
        return payload

    return None


def set_cached_tmdb_payload(
    cache: dict[int, tuple[float, dict[str, Any]]],
    key: int,
    payload: dict[str, Any],
    ttl_seconds: int,
) -> dict[str, Any]:
    with tmdb_cache_lock:
        cache[int(key)] = (time.time() + ttl_seconds, payload)
        if len(cache) > 4096:
            oldest_keys = sorted(cache.items(), key=lambda item: item[1][0])[:1024]
            for cached_key, _ in oldest_keys:
                cache.pop(cached_key, None)
    return payload


def get_cached_watchmode_sources(cache_key: str, *, allow_stale: bool = False) -> Optional[dict[str, Any]]:
    with tmdb_cache_lock:
        cached_entry = watchmode_sources_cache.get(cache_key)

    if not cached_entry:
        return None

    expires_at, payload = cached_entry
    if expires_at > time.time() or allow_stale:
        return payload

    return None


def set_cached_watchmode_sources(cache_key: str, payload: dict[str, Any]) -> dict[str, Any]:
    with tmdb_cache_lock:
        watchmode_sources_cache[cache_key] = (
            time.time() + WATCHMODE_SOURCES_CACHE_TTL_SECONDS,
            payload,
        )
        if len(watchmode_sources_cache) > 4096:
            oldest_keys = sorted(watchmode_sources_cache.items(), key=lambda item: item[1][0])[:1024]
            for cached_key, _ in oldest_keys:
                watchmode_sources_cache.pop(cached_key, None)
    return payload


def fetch_tmdb_watch_providers_payload(movie_id: int) -> Optional[dict]:
    try:
        url = f"https://api.themoviedb.org/3/movie/{movie_id}/watch/providers?api_key={TMDB_API_KEY}"
        response = requests.get(url, timeout=2)
        response.raise_for_status()
        data = response.json()
    except Exception as exc:
        logger.warning("Echec TMDB watch providers pour movie_id=%s: %s", movie_id, exc)
        return None

    return data if isinstance(data, dict) else None


def normalize_watch_provider_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (value or "").strip().lower())


WATCHMODE_PROVIDER_ALIASES = {
    normalize_watch_provider_name("Amazon Video"): {
        normalize_watch_provider_name("Prime Video"),
        normalize_watch_provider_name("Amazon Prime Video"),
        normalize_watch_provider_name("Amazon"),
    },
    normalize_watch_provider_name("Amazon Prime Video"): {
        normalize_watch_provider_name("Prime Video"),
        normalize_watch_provider_name("Amazon"),
    },
    normalize_watch_provider_name("Amazon Prime Video with Ads"): {
        normalize_watch_provider_name("Prime Video"),
        normalize_watch_provider_name("Amazon"),
    },
    normalize_watch_provider_name("Apple TV Store"): {
        normalize_watch_provider_name("Apple TV"),
        normalize_watch_provider_name("iTunes"),
    },
    normalize_watch_provider_name("Canal VOD"): {
        normalize_watch_provider_name("Canal+"),
    },
    normalize_watch_provider_name("Disney Plus"): {
        normalize_watch_provider_name("Disney+"),
    },
    normalize_watch_provider_name("Google Play Movies"): {
        normalize_watch_provider_name("Google Play"),
    },
}


def sanitize_watchmode_url(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    if not cleaned or "paid plans only" in cleaned.lower():
        return None
    if cleaned.startswith("http://") or cleaned.startswith("https://") or "://" in cleaned:
        return cleaned
    return None


def utcnow_naive() -> datetime.datetime:
    return datetime.datetime.utcnow().replace(microsecond=0)


def parse_db_timestamp(value: Any) -> Optional[datetime.datetime]:
    if isinstance(value, datetime.datetime):
        return value.replace(tzinfo=None)
    if not isinstance(value, str) or not value.strip():
        return None
    cleaned = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.datetime.fromisoformat(cleaned)
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    return parsed


def lookup_provider_alias_match(provider_name: str, source_map: dict[str, Any]) -> Optional[Any]:
    normalized_name = normalize_watch_provider_name(provider_name)
    if not normalized_name:
        return None

    match = source_map.get(normalized_name)
    if match is not None:
        return match

    alias_names = WATCHMODE_PROVIDER_ALIASES.get(normalized_name, set())
    for alias_name in alias_names:
        match = source_map.get(alias_name)
        if match is not None:
            return match

    return None


def get_cached_tmdb_page_provider_links(movie_id: int, region_code: str, *, allow_stale: bool = False) -> Optional[dict[str, Any]]:
    conn = get_db_connection(row_factory=True)
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT provider_links_json, source_page_url, fetched_at, expires_at
            FROM movie_provider_link_cache
            WHERE movie_id = {SQL_PARAM} AND region_code = {SQL_PARAM}
            """,
            (int(movie_id), (region_code or "FR").strip().upper() or "FR"),
        )
        row = cursor.fetchone()
    finally:
        conn.close()

    if not row:
        return None

    expires_at = parse_db_timestamp(row_get_value(row, "expires_at", 3))
    if expires_at is not None and expires_at <= utcnow_naive() and not allow_stale:
        return None

    try:
        provider_links = json.loads(str(row_get_value(row, "provider_links_json", 0) or "{}"))
    except json.JSONDecodeError:
        provider_links = {}

    if not isinstance(provider_links, dict):
        provider_links = {}

    return {
        "provider_links": provider_links,
        "source_page_url": str(row_get_value(row, "source_page_url", 1) or ""),
        "fetched_at": row_get_value(row, "fetched_at", 2),
        "expires_at": row_get_value(row, "expires_at", 3),
    }


def set_cached_tmdb_page_provider_links(
    movie_id: int,
    region_code: str,
    provider_links: dict[str, str],
    source_page_url: str,
) -> dict[str, Any]:
    normalized_region = (region_code or "FR").strip().upper() or "FR"
    now = utcnow_naive()
    expires_at = now + datetime.timedelta(seconds=TMDB_WATCH_PAGE_LINKS_CACHE_TTL_SECONDS)
    serialized_links = json.dumps(provider_links, ensure_ascii=False, separators=(",", ":"))
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"""
            INSERT INTO movie_provider_link_cache (
                movie_id, region_code, provider_links_json, source_page_url, fetched_at, expires_at
            ) VALUES ({SQL_PARAM}, {SQL_PARAM}, {SQL_PARAM}, {SQL_PARAM}, {SQL_PARAM}, {SQL_PARAM})
            ON CONFLICT (movie_id, region_code) DO UPDATE SET
                provider_links_json = excluded.provider_links_json,
                source_page_url = excluded.source_page_url,
                fetched_at = excluded.fetched_at,
                expires_at = excluded.expires_at
            """,
            (
                int(movie_id),
                normalized_region,
                serialized_links,
                source_page_url,
                now.isoformat(sep=" "),
                expires_at.isoformat(sep=" "),
            ),
        )
        conn.commit()
    finally:
        conn.close()

    return {
        "provider_links": dict(provider_links),
        "source_page_url": source_page_url,
        "fetched_at": now.isoformat(sep=" "),
        "expires_at": expires_at.isoformat(sep=" "),
    }


def unwrap_provider_redirect_url(raw_url: str) -> Optional[str]:
    current_url = html_unescape((raw_url or "").strip())
    if not current_url.startswith(("http://", "https://")):
        return None

    for _ in range(4):
        parsed = urlparse(current_url)
        query_params = parse_qs(parsed.query)
        next_url = None
        for key in ("r", "u", "url", "target", "dest", "destination", "redirect", "redirect_url", "to", "next"):
            values = query_params.get(key)
            if not values:
                continue
            candidate = html_unescape(unquote(values[0] or "").strip())
            if candidate.startswith(("http://", "https://")) and candidate != current_url:
                next_url = candidate
                break
        if not next_url:
            break
        current_url = next_url

    return current_url


def extract_provider_name_from_offer_title(raw_title: str) -> Optional[str]:
    title = html_unescape((raw_title or "").strip())
    for marker in (" sur ", " on "):
        if marker in title:
            provider_name = title.rsplit(marker, 1)[-1].strip()
            return provider_name or None
    return None


def scrape_tmdb_watch_page_provider_links(page_url: str) -> dict[str, str]:
    if not isinstance(page_url, str) or "themoviedb.org" not in page_url:
        return {}

    try:
        response = requests.get(
            page_url,
            timeout=5,
            headers={"User-Agent": "Mozilla/5.0 (compatible; QulteBot/1.0)"},
        )
        response.raise_for_status()
        html = response.text
    except Exception as exc:
        logger.warning("Echec scraping TMDB watch page url=%s: %s", page_url, exc)
        return {}

    provider_links: dict[str, str] = {}
    for match in re.finditer(r'<a[^>]+href="([^"]+)"[^>]+title="([^"]+)"', html, flags=re.IGNORECASE):
        raw_href, raw_title = match.groups()
        provider_name = extract_provider_name_from_offer_title(raw_title)
        if not provider_name:
            continue

        resolved_url = unwrap_provider_redirect_url(raw_href)
        if not resolved_url or "themoviedb.org" in resolved_url:
            continue

        normalized_name = normalize_watch_provider_name(provider_name)
        if normalized_name and normalized_name not in provider_links:
            provider_links[normalized_name] = resolved_url

    return provider_links


@app.get("/app/runtime-alerts")
def get_runtime_alerts(current_user: dict = Depends(get_current_user)):
    del current_user
    alerts: list[dict[str, str]] = []
    scraper_status = get_json_app_setting(TMDB_WATCH_SCRAPER_STATUS_KEY) or {}
    if str(scraper_status.get("status") or "ok") == "warning":
        reason = str(scraper_status.get("last_failure_reason") or "scrape_failed")
        last_failure_at = str(scraper_status.get("last_failure_at") or "")
        message = (
            "Les liens streaming exacts de certains films peuvent être moins fiables pour le moment. "
            "Une mise à jour de la source TMDB est probablement nécessaire."
        )
        if reason == "zero_links_extracted":
            message = (
                "Qulte détecte un changement probable sur TMDB: certains liens streaming exacts "
                "peuvent ne plus être récupérés automatiquement."
            )
        if last_failure_at:
            message = f"{message} Dernière détection: {last_failure_at}."

        alerts.append(
            {
                "id": "tmdb-watch-scraper-warning",
                "tone": "error",
                "title": "Liens streaming à vérifier",
                "message": message,
            }
        )
    return {"items": alerts}


def build_provider_search_fallback_url(
    provider_name: str,
    movie_title: str,
    region_code: str,
) -> Optional[str]:
    normalized_name = normalize_watch_provider_name(provider_name)
    if not normalized_name:
        return None

    query = quote_plus((movie_title or "").strip())
    region = (region_code or "FR").strip().upper() or "FR"
    apple_locale = "fr" if region == "FR" else region.lower()

    if "amazonchannel" in normalized_name:
        return f"https://www.primevideo.com/search/ref=atv_nb_sr?phrase={query}" if query else "https://www.primevideo.com/"
    if "appletvchannel" in normalized_name:
        return f"https://tv.apple.com/{apple_locale}/search?term={query}" if query else f"https://tv.apple.com/{apple_locale}"

    provider_fallbacks = {
        normalize_watch_provider_name("Netflix"): (
            f"https://www.netflix.com/search?q={query}" if query else "https://www.netflix.com/"
        ),
        normalize_watch_provider_name("Amazon Video"): (
            f"https://www.primevideo.com/search/ref=atv_nb_sr?phrase={query}" if query else "https://www.primevideo.com/"
        ),
        normalize_watch_provider_name("Amazon Prime Video"): (
            f"https://www.primevideo.com/search/ref=atv_nb_sr?phrase={query}" if query else "https://www.primevideo.com/"
        ),
        normalize_watch_provider_name("Amazon Prime Video with Ads"): (
            f"https://www.primevideo.com/search/ref=atv_nb_sr?phrase={query}" if query else "https://www.primevideo.com/"
        ),
        normalize_watch_provider_name("Prime Video"): (
            f"https://www.primevideo.com/search/ref=atv_nb_sr?phrase={query}" if query else "https://www.primevideo.com/"
        ),
        normalize_watch_provider_name("Apple TV Store"): (
            f"https://tv.apple.com/{apple_locale}/search?term={query}" if query else f"https://tv.apple.com/{apple_locale}"
        ),
        normalize_watch_provider_name("Apple TV"): (
            f"https://tv.apple.com/{apple_locale}/search?term={query}" if query else f"https://tv.apple.com/{apple_locale}"
        ),
        normalize_watch_provider_name("Disney Plus"): "https://www.disneyplus.com/",
        normalize_watch_provider_name("Disney+"): "https://www.disneyplus.com/",
        normalize_watch_provider_name("Canal+"): "https://www.canalplus.com/",
        normalize_watch_provider_name("Canal VOD"): "https://vod.canalplus.com/",
        normalize_watch_provider_name("HBO Max"): "https://www.max.com/",
        normalize_watch_provider_name("Max"): "https://www.max.com/",
        normalize_watch_provider_name("Paramount Plus"): (
            f"https://www.paramountplus.com/fr/search/?q={query}" if region == "FR" and query else
            "https://www.paramountplus.com/fr/search/" if region == "FR" else
            f"https://www.paramountplus.com/search/?q={query}" if query else
            "https://www.paramountplus.com/search/"
        ),
        normalize_watch_provider_name("Paramount+"): (
            f"https://www.paramountplus.com/fr/search/?q={query}" if region == "FR" and query else
            "https://www.paramountplus.com/fr/search/" if region == "FR" else
            f"https://www.paramountplus.com/search/?q={query}" if query else
            "https://www.paramountplus.com/search/"
        ),
    }
    return provider_fallbacks.get(normalized_name)


def apply_provider_search_fallbacks(
    watch_providers: dict[str, Any],
    movie_title: str,
    region_code: str,
) -> dict[str, Any]:
    enriched = dict(watch_providers)
    for key in ("subscription", "rent", "buy"):
        items = watch_providers.get(key)
        if not isinstance(items, list):
            continue
        enriched_items: list[dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            enriched_item = dict(item)
            if not enriched_item.get("web_url"):
                fallback_url = build_provider_search_fallback_url(
                    str(enriched_item.get("name") or ""),
                    movie_title,
                    region_code,
                )
                if fallback_url:
                    enriched_item["web_url"] = fallback_url
            enriched_items.append(enriched_item)
        enriched[key] = enriched_items
    return enriched


def fetch_watchmode_payload(path: str, params: dict[str, Any]) -> Optional[Any]:
    if not WATCHMODE_API_KEY:
        return None

    try:
        response = requests.get(
            f"https://api.watchmode.com/v1{path}",
            params=params,
            headers={"X-API-Key": WATCHMODE_API_KEY},
            timeout=3,
        )
        response.raise_for_status()
        return response.json()
    except Exception as exc:
        logger.warning("Echec Watchmode path=%s params=%s: %s", path, params, exc)
        return None


def resolve_watchmode_title_id_for_tmdb_movie(movie_id: int) -> Optional[str]:
    payload = fetch_watchmode_payload(
        "/search",
        {
            "search_field": "tmdb_movie_id",
            "search_value": str(movie_id),
        },
    )
    if not isinstance(payload, dict):
        return None

    title_results = payload.get("title_results")
    if not isinstance(title_results, list):
        return None

    for item in title_results:
        if not isinstance(item, dict):
            continue
        if item.get("tmdb_type") != "movie":
            continue
        if int(item.get("tmdb_id") or 0) != int(movie_id):
            continue
        watchmode_id = item.get("id")
        if isinstance(watchmode_id, int):
            return str(watchmode_id)

    return None


def fetch_watchmode_sources_for_movie(movie_id: int, region_code: str) -> Optional[dict[str, Any]]:
    normalized_region = (region_code or "FR").strip().upper() or "FR"
    cache_key = f"{int(movie_id)}:{normalized_region}"
    cached_payload = get_cached_watchmode_sources(cache_key)
    if cached_payload is not None:
        return cached_payload

    watchmode_title_id = resolve_watchmode_title_id_for_tmdb_movie(int(movie_id))
    if not watchmode_title_id:
        return get_cached_watchmode_sources(cache_key, allow_stale=True)

    payload = fetch_watchmode_payload(
        f"/title/{watchmode_title_id}/sources",
        {"regions": normalized_region},
    )
    if not isinstance(payload, list):
        stale_payload = get_cached_watchmode_sources(cache_key, allow_stale=True)
        return stale_payload

    source_map: dict[str, dict[str, Any]] = {}
    first_web_url: Optional[str] = None

    for item in payload:
        if not isinstance(item, dict):
            continue
        source_name = str(item.get("name") or "").strip()
        if not source_name:
            continue
        normalized_name = normalize_watch_provider_name(source_name)
        if not normalized_name:
            continue
        source_payload = {
            "name": source_name,
            "type": str(item.get("type") or ""),
            "web_url": sanitize_watchmode_url(item.get("web_url")),
            "ios_url": sanitize_watchmode_url(item.get("ios_url")),
            "android_url": sanitize_watchmode_url(item.get("android_url")),
        }
        source_map[normalized_name] = source_payload
        if source_payload["web_url"] and not first_web_url:
            first_web_url = source_payload["web_url"]

    return set_cached_watchmode_sources(
        cache_key,
        {
            "region": normalized_region,
            "link": first_web_url or "",
            "sources_by_name": source_map,
        },
    )


def attach_watchmode_links_to_provider(provider: dict[str, Any], watchmode_sources_by_name: dict[str, Any]) -> dict[str, Any]:
    enriched_provider = dict(provider)
    match = lookup_provider_alias_match(str(provider.get("name") or ""), watchmode_sources_by_name)
    if not isinstance(match, dict):
        return enriched_provider

    enriched_provider["web_url"] = match.get("web_url")
    enriched_provider["ios_url"] = match.get("ios_url")
    enriched_provider["android_url"] = match.get("android_url")
    return enriched_provider


def attach_tmdb_scraped_links_to_provider(provider: dict[str, Any], scraped_links_by_name: dict[str, str]) -> dict[str, Any]:
    enriched_provider = dict(provider)
    if enriched_provider.get("web_url"):
        return enriched_provider

    match = lookup_provider_alias_match(str(provider.get("name") or ""), scraped_links_by_name)
    if isinstance(match, str) and match:
        enriched_provider["web_url"] = match
    return enriched_provider


def enhance_watch_providers_with_tmdb_scrape(movie_id: int, watch_providers: dict) -> dict:
    region_code = str(watch_providers.get("region") or "FR").strip().upper() or "FR"
    page_url = str(watch_providers.get("link") or "").strip()
    expected_missing_provider_count = sum(
        1
        for key in ("subscription", "rent", "buy")
        for item in (watch_providers.get(key) or [])
        if isinstance(item, dict) and not item.get("web_url")
    )
    cached_payload = get_cached_tmdb_page_provider_links(int(movie_id), region_code)

    provider_links_by_name: Optional[dict[str, str]] = None
    if isinstance(cached_payload, dict):
        cached_links = cached_payload.get("provider_links")
        if isinstance(cached_links, dict):
            provider_links_by_name = {
                normalize_watch_provider_name(str(key)): str(value)
                for key, value in cached_links.items()
                if str(value or "").startswith(("http://", "https://"))
            }

    if provider_links_by_name is None:
        scraped_links = scrape_tmdb_watch_page_provider_links(page_url)
        if scraped_links:
            cached_payload = set_cached_tmdb_page_provider_links(int(movie_id), region_code, scraped_links, page_url)
            provider_links_by_name = dict(scraped_links)
            mark_tmdb_watch_scraper_status(
                status_value="ok",
                movie_id=int(movie_id),
                region_code=region_code,
                page_url=page_url,
                extracted_links_count=len(scraped_links),
                expected_provider_count=expected_missing_provider_count,
            )
        else:
            if page_url and expected_missing_provider_count > 0:
                logger.warning(
                    "Aucun lien exact extrait depuis TMDB watch page movie_id=%s region=%s expected_missing=%s url=%s",
                    movie_id,
                    region_code,
                    expected_missing_provider_count,
                    page_url,
                )
                mark_tmdb_watch_scraper_status(
                    status_value="warning",
                    movie_id=int(movie_id),
                    region_code=region_code,
                    page_url=page_url,
                    reason="zero_links_extracted",
                    extracted_links_count=0,
                    expected_provider_count=expected_missing_provider_count,
                )
            stale_payload = get_cached_tmdb_page_provider_links(int(movie_id), region_code, allow_stale=True)
            stale_links = stale_payload.get("provider_links") if isinstance(stale_payload, dict) else None
            if isinstance(stale_links, dict):
                provider_links_by_name = {
                    normalize_watch_provider_name(str(key)): str(value)
                    for key, value in stale_links.items()
                    if str(value or "").startswith(("http://", "https://"))
                }
            else:
                provider_links_by_name = {}

    if not provider_links_by_name:
        return watch_providers

    enriched = dict(watch_providers)
    for key in ("subscription", "rent", "buy"):
        items = watch_providers.get(key)
        if not isinstance(items, list):
            continue
        enriched[key] = [attach_tmdb_scraped_links_to_provider(item, provider_links_by_name) for item in items]
    return enriched


def enhance_watch_providers_with_watchmode(movie_id: int, watch_providers: dict) -> dict:
    if not WATCHMODE_API_KEY:
        return watch_providers

    region_code = str(watch_providers.get("region") or "FR").strip().upper() or "FR"
    watchmode_payload = fetch_watchmode_sources_for_movie(int(movie_id), region_code)
    if not isinstance(watchmode_payload, dict):
        return watch_providers

    sources_by_name = watchmode_payload.get("sources_by_name")
    if not isinstance(sources_by_name, dict) or not sources_by_name:
        return watch_providers

    enriched = dict(watch_providers)
    for key in ("subscription", "rent", "buy"):
        items = watch_providers.get(key)
        if not isinstance(items, list):
            continue
        enriched[key] = [attach_watchmode_links_to_provider(item, sources_by_name) for item in items]

    if not enriched.get("link") and watchmode_payload.get("link"):
        enriched["link"] = str(watchmode_payload["link"])

    return enriched


def serialize_tmdb_watch_providers(data: dict) -> dict:
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


def get_tmdb_watch_providers(movie_id: int) -> dict:
    cached_payload = get_cached_tmdb_payload(tmdb_watch_providers_cache, movie_id)
    if cached_payload is not None:
        enhanced_payload = enhance_watch_providers_with_watchmode(movie_id, cached_payload)
        return enhance_watch_providers_with_tmdb_scrape(movie_id, enhanced_payload)

    provider_payload = fetch_tmdb_watch_providers_payload(movie_id)
    if provider_payload is not None:
        tmdb_payload = set_cached_tmdb_payload(
            tmdb_watch_providers_cache,
            movie_id,
            serialize_tmdb_watch_providers(provider_payload),
            TMDB_WATCH_PROVIDERS_CACHE_TTL_SECONDS,
        )
        enhanced_payload = enhance_watch_providers_with_watchmode(movie_id, tmdb_payload)
        return enhance_watch_providers_with_tmdb_scrape(movie_id, enhanced_payload)

    stale_payload = get_cached_tmdb_payload(tmdb_watch_providers_cache, movie_id, allow_stale=True)
    if stale_payload is not None:
        enhanced_payload = enhance_watch_providers_with_watchmode(movie_id, stale_payload)
        return enhance_watch_providers_with_tmdb_scrape(movie_id, enhanced_payload)

    return {
        "region": "",
        "link": "",
        "subscription": [],
        "rent": [],
        "buy": [],
    }


def fetch_tmdb_movie_details_payload(movie_id: int) -> Optional[dict]:
    try:
        url = f"https://api.themoviedb.org/3/movie/{movie_id}?api_key={TMDB_API_KEY}&language=fr-FR&append_to_response=videos,credits"
        response = requests.get(url, timeout=3)
        response.raise_for_status()
        data = response.json()
    except Exception as exc:
        logger.warning("Echec TMDB details pour movie_id=%s: %s", movie_id, exc)
        return None

    return data if isinstance(data, dict) and isinstance(data.get("id"), int) else None


def build_tmdb_movie_details_payload(data: dict, watch_providers: dict) -> dict:
    resolved_watch_providers = apply_provider_search_fallbacks(
        watch_providers,
        str(data.get("title") or ""),
        str(watch_providers.get("region") or ""),
    )
    trailer = next(
        (
            f"https://www.youtube.com/embed/{video['key']}"
            for video in data.get("videos", {}).get("results", [])
            if video.get("site") == "YouTube" and video.get("type") == "Trailer" and video.get("key")
        ),
        None,
    )
    cast = [
        {
            "id": int(actor["id"]) if isinstance(actor.get("id"), int) else None,
            "name": actor["name"],
            "character": actor["character"],
            "photo": f"https://image.tmdb.org/t/p/w200{actor['profile_path']}" if actor.get("profile_path") else None,
        }
        for actor in data.get("credits", {}).get("cast", [])[:8]
    ]
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
    return {
        "id": data["id"],
        "title": data["title"],
        "overview": data.get("overview") or "",
        "rating": data.get("vote_average") or 0,
        "poster_url": "https://image.tmdb.org/t/p/w500" + data.get("poster_path", "") if data.get("poster_path") else "",
        "trailer_url": trailer,
        "cast": cast,
        "release_date": data.get("release_date", "").split("-")[0],
        "runtime": int(data.get("runtime") or 0),
        "tagline": str(data.get("tagline") or ""),
        "genres": genres[:4],
        "directors": [str(name) for name in directors],
        "watch_providers": resolved_watch_providers,
    }


def get_tmdb_details(movie_id):
    cached_payload = get_cached_tmdb_payload(tmdb_movie_details_cache, movie_id)
    if cached_payload is not None:
        return cached_payload

    with ThreadPoolExecutor(max_workers=2) as executor:
        details_future = executor.submit(fetch_tmdb_movie_details_payload, movie_id)
        watch_providers_future = executor.submit(get_tmdb_watch_providers, movie_id)
        data = details_future.result()
        watch_providers = watch_providers_future.result()

    if data is not None:
        payload = build_tmdb_movie_details_payload(data, watch_providers)
        return set_cached_tmdb_payload(
            tmdb_movie_details_cache,
            movie_id,
            payload,
            TMDB_MOVIE_DETAILS_CACHE_TTL_SECONDS,
        )

    stale_payload = get_cached_tmdb_payload(tmdb_movie_details_cache, movie_id, allow_stale=True)
    if stale_payload is not None:
        return stale_payload

    summary = get_tmdb_movie_summary(movie_id)
    if summary is not None:
        return {
            "id": summary["id"],
            "title": summary["title"],
            "overview": "",
            "rating": summary.get("rating") or 0,
            "poster_url": summary.get("poster_url") or "",
            "trailer_url": None,
            "cast": [],
            "release_date": "",
            "runtime": 0,
            "tagline": "",
            "genres": [],
            "directors": [],
            "watch_providers": watch_providers,
        }

    return None


@lru_cache(maxsize=512)
def get_tmdb_person_details(person_id: int) -> Optional[dict]:
    try:
        response = requests.get(
            f"https://api.themoviedb.org/3/person/{person_id}",
            params={
                "api_key": TMDB_API_KEY,
                "language": "fr-FR",
                "append_to_response": "movie_credits",
            },
            timeout=3,
        )
        data = response.json()
    except Exception:
        return None

    if not isinstance(data, dict) or not isinstance(data.get("id"), int):
        return None

    known_movies: list[dict] = []
    seen_movie_ids: set[int] = set()
    credits = data.get("movie_credits") if isinstance(data.get("movie_credits"), dict) else {}
    credit_items = list(credits.get("cast") or []) + list(credits.get("crew") or [])
    credit_items.sort(
        key=lambda movie: (
            float(movie.get("vote_count") or 0.0),
            float(movie.get("popularity") or 0.0),
            float(movie.get("vote_average") or 0.0),
        ),
        reverse=True,
    )

    for movie in credit_items:
        normalized_movie = normalize_tmdb_movie(movie if isinstance(movie, dict) else {})
        if not normalized_movie:
            continue
        movie_id = int(normalized_movie["id"])
        if movie_id in seen_movie_ids:
            continue
        seen_movie_ids.add(movie_id)
        normalized_movie["release_date"] = str(movie.get("release_date") or "")[:4]
        normalized_movie["character"] = normalize_preference_label(str(movie.get("character") or ""))
        normalized_movie["job"] = normalize_preference_label(str(movie.get("job") or ""))
        known_movies.append(normalized_movie)
        if len(known_movies) >= 18:
            break

    return {
        "id": int(data["id"]),
        "name": normalize_preference_label(str(data.get("name") or "")),
        "biography": str(data.get("biography") or "").strip(),
        "birthday": str(data.get("birthday") or "").strip() or None,
        "deathday": str(data.get("deathday") or "").strip() or None,
        "place_of_birth": str(data.get("place_of_birth") or "").strip() or None,
        "known_for_department": normalize_preference_label(str(data.get("known_for_department") or "")) or None,
        "photo_url": (
            f"https://image.tmdb.org/t/p/w500{data.get('profile_path')}"
            if data.get("profile_path")
            else None
        ),
        "known_for_movies": known_movies,
    }

# --- Helpers Playlists ---
def get_or_create_watch_later_id(cursor, user_id):
    cursor.execute(
        f"SELECT id FROM playlists WHERE user_id = {SQL_PARAM} AND name = {SQL_PARAM}",
        (user_id, WATCH_LATER_NAME),
    )
    row = cursor.fetchone()
    if row:
        return row[0]

    return execute_insert_and_get_id(
        cursor,
        f"INSERT INTO playlists (name, user_id) VALUES ({SQL_PARAM}, {SQL_PARAM})",
        (WATCH_LATER_NAME, user_id),
    )


def get_custom_playlist_id(cursor, playlist_id: int, user_id: int) -> int:
    cursor.execute(
        f"SELECT id FROM playlists WHERE id = {SQL_PARAM} AND user_id = {SQL_PARAM}",
        (playlist_id, user_id),
    )
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


def normalize_playlist_sort(playlist_id: int, requested_sort: Optional[str]) -> str:
    normalized_sort = (requested_sort or "").strip().lower()
    if normalized_sort not in PLAYLIST_SORT_OPTIONS:
        normalized_sort = ""

    if playlist_id == WATCH_LATER_SYSTEM_ID:
        return normalized_sort or "genre"
    if playlist_id in (FAVORITES_SYSTEM_ID, HISTORY_SYSTEM_ID):
        return normalized_sort if normalized_sort and normalized_sort != "manual" else "recent"
    return normalized_sort or "manual"


def get_user_owned_streaming_services(cursor, user_id: int) -> list[str]:
    cursor.execute(
        f"SELECT owned_streaming_services FROM user_preferences WHERE user_id = {SQL_PARAM}",
        (int(user_id),),
    )
    row = cursor.fetchone()
    raw_services = row_get_value(row, "owned_streaming_services", 0) if row else "[]"
    return dedupe_list(
        [
            normalized
            for normalized in (
                normalize_streaming_service_label(str(value))
                for value in load_json_list(raw_services)
            )
            if normalized
        ]
    )


def build_movie_subscription_provider_names(movie_id: int) -> list[str]:
    watch_providers = get_tmdb_watch_providers(int(movie_id))
    return dedupe_list(
        [
            normalized
            for normalized in (
                normalize_streaming_service_label(provider.get("name", ""))
                for provider in watch_providers.get("subscription", [])
            )
            if normalized
        ]
    )


def fetch_playlist_base_rows(cursor, playlist_id: int, user_id: int) -> tuple[list[dict], bool, Optional[int]]:
    if playlist_id == WATCH_LATER_SYSTEM_ID:
        target_id = get_or_create_watch_later_id(cursor, user_id)
        cursor.execute(
            f"""
            SELECT
                movie_id AS id,
                title,
                poster_url,
                rating,
                COALESCE(added_at, '1970-01-01 00:00:00') AS added_at,
                COALESCE(sort_index, 2147483647) AS sort_index,
                COALESCE(primary_genre, '') AS primary_genre,
                COALESCE(subscription_provider_names, '[]') AS subscription_provider_names
            FROM playlist_items
            WHERE playlist_id = {SQL_PARAM}
            ORDER BY COALESCE(sort_index, 2147483647) ASC, COALESCE(added_at, '1970-01-01 00:00:00') DESC, movie_id DESC
            """,
            (target_id,),
        )
        return [dict(row) for row in cursor.fetchall()], True, target_id

    if playlist_id == FAVORITES_SYSTEM_ID:
        cursor.execute(
            f"""
            SELECT
                movie_id AS id,
                title,
                poster_url,
                rating,
                COALESCE(added_at, '1970-01-01 00:00:00') AS added_at,
                2147483647 AS sort_index
            FROM user_ratings
            WHERE user_id = {SQL_PARAM} AND rating >= 4
            ORDER BY COALESCE(added_at, '1970-01-01 00:00:00') DESC, movie_id DESC
            """,
            (user_id,),
        )
        return [dict(row) for row in cursor.fetchall()], False, None

    if playlist_id == HISTORY_SYSTEM_ID:
        cursor.execute(
            f"""
            SELECT
                movie_id AS id,
                title,
                poster_url,
                rating,
                COALESCE(added_at, '1970-01-01 00:00:00') AS added_at,
                2147483647 AS sort_index
            FROM user_ratings
            WHERE user_id = {SQL_PARAM}
            ORDER BY COALESCE(added_at, '1970-01-01 00:00:00') DESC, movie_id DESC
            """,
            (user_id,),
        )
        return [dict(row) for row in cursor.fetchall()], False, None

    target_id = get_custom_playlist_id(cursor, playlist_id, user_id)
    cursor.execute(
        f"""
        SELECT
            movie_id AS id,
            title,
            poster_url,
            rating,
            COALESCE(added_at, '1970-01-01 00:00:00') AS added_at,
            COALESCE(sort_index, 2147483647) AS sort_index,
            COALESCE(primary_genre, '') AS primary_genre,
            COALESCE(subscription_provider_names, '[]') AS subscription_provider_names
        FROM playlist_items
        WHERE playlist_id = {SQL_PARAM}
        ORDER BY COALESCE(sort_index, 2147483647) ASC, COALESCE(added_at, '1970-01-01 00:00:00') DESC, movie_id DESC
        """,
        (target_id,),
    )
    return [dict(row) for row in cursor.fetchall()], False, target_id


def hydrate_playlist_row_metadata(
    cursor,
    playlist_db_id: Optional[int],
    row: dict,
    *,
    include_watch_providers: bool,
) -> dict:
    movie_id = int(row.get("id") or 0)
    next_primary_genre = decode_db_text(row.get("primary_genre")) or get_movie_primary_genre(movie_id)
    raw_provider_names = row.get("subscription_provider_names")
    if isinstance(raw_provider_names, list):
        parsed_provider_names = raw_provider_names
    else:
        parsed_provider_names = load_json_list(raw_provider_names)
    next_provider_names = dedupe_list(
        [
            normalized
            for normalized in (
                normalize_streaming_service_label(str(value))
                for value in parsed_provider_names
            )
            if normalized
        ]
    )

    should_persist = False
    if decode_db_text(row.get("primary_genre")) != next_primary_genre:
        should_persist = True

    if include_watch_providers and not next_provider_names:
        next_provider_names = build_movie_subscription_provider_names(movie_id)
        should_persist = True

    row["primary_genre"] = next_primary_genre or "Autres"
    row["subscription_provider_names"] = next_provider_names

    if playlist_db_id is not None and should_persist:
        cursor.execute(
            f"""
            UPDATE playlist_items
            SET primary_genre = {SQL_PARAM},
                subscription_provider_names = {SQL_PARAM},
                metadata_updated_at = CURRENT_TIMESTAMP
            WHERE playlist_id = {SQL_PARAM} AND movie_id = {SQL_PARAM}
            """,
            (
                row["primary_genre"],
                dump_json_list(next_provider_names),
                int(playlist_db_id),
                movie_id,
            ),
        )

    return row


def sort_playlist_rows(rows: list[dict], sort_mode: str) -> list[dict]:
    ordered_rows = list(rows)
    if sort_mode == "manual":
        ordered_rows.sort(
            key=lambda row: (
                str(row.get("added_at") or ""),
                int(row.get("id") or 0),
            ),
            reverse=True,
        )
        ordered_rows.sort(key=lambda row: int(row.get("sort_index") or 2147483647))
    elif sort_mode == "genre":
        ordered_rows.sort(
            key=lambda row: (
                str(row.get("primary_genre") or "Autres").lower(),
                str(row.get("title") or "").lower(),
                int(row.get("id") or 0),
            )
        )
    elif sort_mode == "oldest":
        ordered_rows.sort(
            key=lambda row: (
                str(row.get("added_at") or ""),
                int(row.get("id") or 0),
            )
        )
    elif sort_mode == "rating":
        ordered_rows.sort(
            key=lambda row: (
                -float(row.get("rating") or 0.0),
                str(row.get("title") or "").lower(),
                int(row.get("id") or 0),
            )
        )
    else:
        ordered_rows.sort(
            key=lambda row: (
                str(row.get("added_at") or ""),
                int(row.get("id") or 0),
            ),
            reverse=True,
        )
    return ordered_rows


def browse_playlist_rows(
    cursor,
    playlist_id: int,
    user_id: int,
    *,
    offset: int,
    limit: int,
    sort_mode: str,
    query: str,
    only_owned_streaming_services: bool,
) -> dict:
    base_rows, is_watch_later, playlist_db_id = fetch_playlist_base_rows(cursor, playlist_id, user_id)
    playlist_total_count = len(base_rows)
    trimmed_query = query.strip().lower()

    hydrated_rows = [
        hydrate_playlist_row_metadata(
            cursor,
            playlist_db_id,
            row,
            include_watch_providers=False,
        )
        for row in base_rows
    ]

    if trimmed_query:
        hydrated_rows = [
            row for row in hydrated_rows if trimmed_query in str(row.get("title") or "").lower()
        ]

    ordered_rows = sort_playlist_rows(hydrated_rows, sort_mode)

    if is_watch_later and only_owned_streaming_services:
        owned_services = set(get_user_owned_streaming_services(cursor, user_id))
        if owned_services:
            page_rows: list[dict] = []
            matched_count = 0
            for row in ordered_rows:
                hydrated_row = hydrate_playlist_row_metadata(
                    cursor,
                    playlist_db_id,
                    row,
                    include_watch_providers=True,
                )
                if not owned_services.intersection(hydrated_row.get("subscription_provider_names") or []):
                    continue
                if matched_count < offset:
                    matched_count += 1
                    continue
                if len(page_rows) < limit:
                    page_rows.append(hydrated_row)
                    matched_count += 1
                    continue
                return {
                    "items": page_rows,
                    "playlist_total_count": playlist_total_count,
                    "next_offset": offset + len(page_rows),
                    "has_more": True,
                }

            return {
                "items": page_rows,
                "playlist_total_count": playlist_total_count,
                "next_offset": offset + len(page_rows),
                "has_more": False,
            }

    page_rows = ordered_rows[offset : offset + limit]
    return {
        "items": page_rows,
        "playlist_total_count": playlist_total_count,
        "next_offset": offset + len(page_rows),
        "has_more": offset + len(page_rows) < len(ordered_rows),
    }


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


def is_test_dashboard_username(username: str) -> bool:
    return normalize_username(username).lower() == TEST_AI_DASHBOARD_USERNAME


def is_test_dashboard_user(cursor, user_id: int) -> bool:
    cursor.execute(f"SELECT username FROM users WHERE id = {SQL_PARAM}", (int(user_id),))
    row = cursor.fetchone()
    if not row:
        return False
    return is_test_dashboard_username(str(row[0]))


def is_recommendation_ai_enabled_user(cursor, user_id: int) -> bool:
    if GLOBAL_RECOMMENDATION_AI_ENABLED:
        return True
    return is_test_dashboard_user(cursor, user_id)


def get_test_ai_feedback_profile(cursor, user_id: int) -> dict[str, object]:
    cursor.execute(
        """
        SELECT movie_id, reaction_type, reaction_rating
        FROM recommendation_impressions
        WHERE user_id = {param}
          AND responded_at IS NOT NULL
          AND COALESCE(reaction_type, '') NOT LIKE {param}
        ORDER BY responded_at DESC
        LIMIT 160
        """.format(param=SQL_PARAM),
        (int(user_id), "undo%"),
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
        elif reaction_type in PASS_REACTION_TYPES:
            feedback_value = -0.36
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
    if not is_recommendation_ai_enabled_user(cursor, user_id):
        return

    cursor.execute(
        """
        SELECT id
        FROM recommendation_impressions
        WHERE user_id = {param} AND movie_id = {param}
        ORDER BY shown_at DESC
        LIMIT 1
        """.format(param=SQL_PARAM),
        (int(user_id), int(movie_id)),
    )
    row = cursor.fetchone()
    if not row:
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
                responded_at,
            reaction_type,
            reaction_rating
        )
            VALUES ({param}, {param}, {param}, {param}, {param}, {param}, {param}, CURRENT_TIMESTAMP, {param}, {param})
            """.format(param=SQL_PARAM),
            (
                str(uuid.uuid4()),
                int(user_id),
                int(movie_id),
                "tinder",
                TEST_AI_ALGORITHM_VARIANT,
                0,
                "Interaction directe",
                reaction_type,
                reaction_rating,
            ),
        )
        return

    cursor.execute(
        """
        UPDATE recommendation_impressions
        SET responded_at = CURRENT_TIMESTAMP,
            reaction_type = {param},
            reaction_rating = {param}
        WHERE id = {param}
        """.format(param=SQL_PARAM),
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
        VALUES ({param}, {param}, {param}, {param}, {param}, {param}, {param}, {param}, {param}, {param})
        """.format(param=SQL_PARAM),
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
        if not is_recommendation_ai_enabled_user(cursor, user_id):
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
            WHERE user_id = {param}
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
         AND other.user_id != {param}
        GROUP BY other.user_id
        HAVING overlap_count >= 2 AND similarity_score > 0
        ORDER BY similarity_score DESC, overlap_count DESC
        LIMIT 10
        """.format(param=SQL_PARAM),
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
            WHERE user_id = {param} AND rating >= 4
            ORDER BY added_at DESC
            LIMIT 24
            """.format(param=SQL_PARAM),
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


def serialize_db_datetime(value):
    if isinstance(value, datetime.datetime):
        return value.isoformat()
    if isinstance(value, datetime.date):
        return value.isoformat()
    return value


def serialize_json_safe(value):
    if isinstance(value, bytes):
        return decode_db_text(value)
    if isinstance(value, (datetime.datetime, datetime.date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): serialize_json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [serialize_json_safe(item) for item in value]
    return value


def serialize_review_row(row: Any) -> dict:
    row_keys = set(row.keys())
    return {
        "id": row["id"],
        "movie_id": row["movie_id"],
        "title": row["title"],
        "poster_url": row["poster_url"],
        "rating": row["rating"],
        "content": row["content"],
        "created_at": serialize_db_datetime(row["created_at"]),
        "author": {
            "id": row["user_id"],
            "username": row["username"],
            "avatar_url": row["avatar_url"] if "avatar_url" in row_keys else None,
        },
        "likes_count": row["likes_count"],
        "liked_by_me": bool(row["liked_by_me"]),
        "comments_count": row["comments_count"] if "comments_count" in row_keys else 0,
    }


def serialize_user_row(row: Any) -> dict:
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


def serialize_blocked_user_row(row: Any) -> dict:
    return {
        "id": row["id"],
        "username": row["username"],
        "avatar_url": row["avatar_url"],
        "blocked_at": serialize_db_datetime(row["blocked_at"]),
    }


def serialize_comment_row(row: Any) -> dict:
    row_keys = set(row.keys())
    return {
        "id": row["id"],
        "review_id": row["review_id"],
        "parent_id": row["parent_id"],
        "content": row["content"],
        "created_at": serialize_db_datetime(row["created_at"]),
        "author": {
            "id": row["user_id"],
            "username": row["username"],
            "avatar_url": row["avatar_url"] if "avatar_url" in row_keys else None,
        },
        "reply_to_username": row["reply_to_username"] if "reply_to_username" in row_keys else None,
    }


def build_notification_message(row: Any) -> str:
    actor_username = row["actor_username"]
    review_title = row["review_title"] or "ce film"
    notification_type = row["type"]

    if notification_type == "follow":
        return f"@{actor_username} s'est abonné à toi"
    if notification_type == "like":
        return f"@{actor_username} a aimé ta critique sur {review_title}"
    if notification_type == "review":
        return f"@{actor_username} a publié une critique sur {review_title}"
    if notification_type == "comment":
        return f"@{actor_username} a commenté ta critique sur {review_title}"
    if notification_type == "reply":
        return f"@{actor_username} a répondu à ton commentaire sur {review_title}"
    return f"Nouvelle activité de @{actor_username}"


def serialize_notification_row(row: Any) -> dict:
    comment_preview = row["comment_preview"] or ""
    return {
        "id": row["id"],
        "type": row["type"],
        "created_at": serialize_db_datetime(row["created_at"]),
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
        "comment_id": row["comment_id"],
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
        VALUES ({param}, {param}, {param}, {param}, {param})
        """.format(param=SQL_PARAM),
        (user_id, actor_user_id, notification_type, review_id, comment_id),
    )


def insert_moderation_report(
    cursor,
    *,
    reporter_user_id: int,
    reason: str,
    details: str = "",
    target_user_id: Optional[int] = None,
    target_review_id: Optional[int] = None,
    target_comment_id: Optional[int] = None,
    target_conversation_id: Optional[int] = None,
):
    cursor.execute(
        """
        INSERT INTO moderation_reports (
            reporter_user_id,
            target_user_id,
            target_review_id,
            target_comment_id,
            target_conversation_id,
            reason,
            details
        )
        VALUES ({param}, {param}, {param}, {param}, {param}, {param}, {param})
        """.format(param=SQL_PARAM),
        (
            int(reporter_user_id),
            target_user_id,
            target_review_id,
            target_comment_id,
            target_conversation_id,
            normalize_report_reason(reason),
            normalize_report_details(details),
        ),
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

    placeholders = sql_placeholders(len(unique_user_ids))
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
        token = decode_db_text(row_get_value(row, "token", 0)).strip()
        if token:
            tokens.append(token)
    return tokens


def get_app_setting(cursor, key: str) -> Optional[str]:
    cursor.execute(f"SELECT value FROM app_settings WHERE key = {SQL_PARAM}", (key,))
    row = cursor.fetchone()
    if not row:
        return None
    return str(row_get_value(row, "value", 0))


def set_app_setting(cursor, key: str, value: str):
    cursor.execute(
        """
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ({param}, {param}, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = CURRENT_TIMESTAMP
        """.format(param=SQL_PARAM),
        (key, value),
    )


def get_json_app_setting(key: str) -> Optional[dict[str, Any]]:
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        raw_value = get_app_setting(cursor, key)
    finally:
        conn.close()

    if not raw_value:
        return None

    try:
        payload = json.loads(raw_value)
    except json.JSONDecodeError:
        return None

    return payload if isinstance(payload, dict) else None


def set_json_app_setting(key: str, payload: dict[str, Any]) -> None:
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        set_app_setting(cursor, key, json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
        conn.commit()
    finally:
        conn.close()


def mark_tmdb_watch_scraper_status(
    *,
    status_value: str,
    movie_id: Optional[int] = None,
    region_code: str = "FR",
    page_url: str = "",
    reason: str = "",
    extracted_links_count: int = 0,
    expected_provider_count: int = 0,
) -> None:
    now_iso = utcnow_naive().isoformat() + "Z"
    previous = get_json_app_setting(TMDB_WATCH_SCRAPER_STATUS_KEY) or {}
    consecutive_failures = int(previous.get("consecutive_failures") or 0)

    if status_value == "ok":
        payload = {
            "status": "ok",
            "last_ok_at": now_iso,
            "last_checked_movie_id": movie_id,
            "last_checked_region": region_code,
            "last_checked_page_url": page_url,
            "last_extracted_links_count": extracted_links_count,
            "consecutive_failures": 0,
            "last_failure_at": previous.get("last_failure_at"),
            "last_failure_reason": previous.get("last_failure_reason"),
            "last_failure_movie_id": previous.get("last_failure_movie_id"),
            "last_failure_region": previous.get("last_failure_region"),
            "last_failure_page_url": previous.get("last_failure_page_url"),
        }
    else:
        payload = {
            "status": "warning",
            "last_ok_at": previous.get("last_ok_at"),
            "last_checked_movie_id": movie_id,
            "last_checked_region": region_code,
            "last_checked_page_url": page_url,
            "last_failure_at": now_iso,
            "last_failure_reason": reason or "scrape_failed",
            "last_failure_movie_id": movie_id,
            "last_failure_region": region_code,
            "last_failure_page_url": page_url,
            "last_extracted_links_count": extracted_links_count,
            "last_expected_provider_count": expected_provider_count,
            "consecutive_failures": consecutive_failures + 1,
        }

    set_json_app_setting(TMDB_WATCH_SCRAPER_STATUS_KEY, payload)


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

    placeholders = sql_placeholders(len(unique_user_ids))
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
        row_id = row_get_value(row, "id", 0)
        endpoint = row_get_value(row, "endpoint", 1)
        raw_subscription = row_get_value(row, "subscription_json", 2)
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
                        WHERE token = {param}
                        """.format(param=SQL_PARAM),
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
                WHERE token = {param}
                """.format(param=SQL_PARAM),
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
                    WHERE id = {param}
                    """.format(param=SQL_PARAM),
                    (subscription["id"],),
                )
        except Exception:
            continue


def deliver_push_notifications(
    user_ids: list[int],
    *,
    title: str,
    body: str,
    route: str,
    extra_data: Optional[dict] = None,
    include_native: bool = True,
    include_web: bool = False,
):
    if not user_ids:
        return

    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    try:
        if include_native:
            send_native_push_notifications(
                cursor,
                user_ids,
                title=title,
                body=body,
                route=route,
                extra_data=extra_data,
            )
        if include_web:
            send_web_push_notifications(
                cursor,
                user_ids,
                title=title,
                body=body,
                route=route,
                extra_data=extra_data,
            )
        conn.commit()
    except Exception:
        logger.exception("Echec envoi des notifications push.")
    finally:
        conn.close()


def enqueue_push_notifications(
    user_ids: list[int],
    *,
    title: str,
    body: str,
    route: str,
    extra_data: Optional[dict] = None,
    include_native: bool = True,
    include_web: bool = False,
):
    if not user_ids:
        return

    notification_executor.submit(
        deliver_push_notifications,
        list(dict.fromkeys(user_ids)),
        title=title,
        body=body,
        route=route,
        extra_data=dict(extra_data or {}),
        include_native=include_native,
        include_web=include_web,
    )


def fetch_serialized_reviews(cursor, current_user_id: int, where_clause: str, params=(), limit: Optional[int] = None) -> list[dict]:
    hidden_user_ids = get_hidden_user_ids(cursor, current_user_id)
    query = """
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
                WHERE rl.review_id = r.id AND rl.user_id = {param}
            ) AS liked_by_me,
            (SELECT COUNT(*) FROM comments c WHERE c.review_id = r.id) AS comments_count
        FROM reviews r
        JOIN users u ON u.id = r.user_id
        WHERE {where_clause}
    """.format(param=SQL_PARAM, where_clause=where_clause)

    query_params = (current_user_id, *params)
    if hidden_user_ids:
        placeholders = sql_placeholders(len(hidden_user_ids))
        query += f" AND r.user_id NOT IN ({placeholders})"
        query_params = (*query_params, *hidden_user_ids)

    query += """
        ORDER BY r.created_at DESC, r.id DESC
    """
    if limit is not None:
        query += f" LIMIT {SQL_PARAM}"
        query_params = (*query_params, limit)

    cursor.execute(query, query_params)
    return [serialize_review_row(row) for row in cursor.fetchall()]


def fetch_review_comments(cursor, review_id: int, current_user_id: int) -> list[dict]:
    hidden_user_ids = get_hidden_user_ids(cursor, current_user_id)
    query = """
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
        WHERE c.review_id = {param}
    """.format(param=SQL_PARAM)
    query_params: tuple = (review_id,)
    if hidden_user_ids:
        placeholders = sql_placeholders(len(hidden_user_ids))
        query += f" AND c.user_id NOT IN ({placeholders})"
        query_params = (*query_params, *hidden_user_ids)

    query += """
        ORDER BY COALESCE(c.parent_id, c.id), c.parent_id IS NOT NULL, c.created_at ASC, c.id ASC
    """
    cursor.execute(query, query_params)
    return [serialize_comment_row(row) for row in cursor.fetchall()]


def fetch_notifications_payload(cursor, user_id: int, limit: int) -> dict:
    hidden_user_ids = get_hidden_user_ids(cursor, user_id)
    unread_query = f"SELECT COUNT(*) FROM notifications WHERE user_id = {SQL_PARAM} AND is_read = 0"
    unread_params: tuple = (user_id,)
    if hidden_user_ids:
        placeholders = sql_placeholders(len(hidden_user_ids))
        unread_query += f" AND actor_user_id NOT IN ({placeholders})"
        unread_params = (*unread_params, *hidden_user_ids)
    cursor.execute(unread_query, unread_params)
    unread_count = int(cursor.fetchone()[0])

    query = """
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
        WHERE n.user_id = {param}
        AND n.is_read = 0
    """.format(param=SQL_PARAM)
    query_params: tuple = (user_id,)
    if hidden_user_ids:
        placeholders = sql_placeholders(len(hidden_user_ids))
        query += f" AND n.actor_user_id NOT IN ({placeholders})"
        query_params = (*query_params, *hidden_user_ids)

    query += """
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT {param}
    """.format(param=SQL_PARAM)
    query_params = (*query_params, limit)
    cursor.execute(query, query_params)
    return {
        "items": [serialize_notification_row(row) for row in cursor.fetchall()],
        "unread_count": unread_count,
    }


def normalize_direct_pair(user_one_id: int, user_two_id: int) -> tuple[int, int]:
    return (user_one_id, user_two_id) if user_one_id < user_two_id else (user_two_id, user_one_id)


def serialize_direct_message_row(row: Any, current_user_id: int) -> dict:
    row_keys = set(row.keys())
    return {
        "id": row["id"],
        "content": row["content"] or "",
        "created_at": serialize_db_datetime(row["created_at"]),
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
        "reply_to_message": (
            {
                "id": row["reply_message_id"],
                "content": row["reply_message_content"] or "",
                "sender": {
                    "id": row["reply_sender_id"],
                    "username": row["reply_sender_username"],
                },
                "movie": (
                    {
                        "id": row["reply_movie_id"],
                        "title": row["reply_movie_title"],
                        "poster_url": row["reply_movie_poster_url"],
                        "rating": row["reply_movie_rating"],
                    }
                    if row["reply_movie_id"] is not None
                    else None
                ),
            }
            if "reply_message_id" in row_keys and row["reply_message_id"] is not None
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


def serialize_direct_conversation_row(row: Any) -> dict:
    row_keys = set(row.keys())
    return {
        "id": row["id"],
        "created_at": serialize_db_datetime(row["created_at"]),
        "updated_at": serialize_db_datetime(row["updated_at"]),
        "participant": {
            "id": row["participant_id"],
            "username": row["participant_username"],
            "avatar_url": row["participant_avatar_url"] if "participant_avatar_url" in row_keys else None,
        },
        "last_message": (
            {
                "id": row["last_message_id"],
                "content": row["last_message_content"] or "",
                "created_at": serialize_db_datetime(row["updated_at"]),
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
        INSERT INTO direct_conversations (user_one_id, user_two_id)
        VALUES ({param}, {param})
        ON CONFLICT(user_one_id, user_two_id) DO NOTHING
        """.format(param=SQL_PARAM),
        (user_one_id, user_two_id),
    )
    cursor.execute(
        """
        SELECT id
        FROM direct_conversations
        WHERE user_one_id = {param} AND user_two_id = {param}
        """.format(param=SQL_PARAM),
        (user_one_id, user_two_id),
    )
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=500, detail="Impossible de creer la conversation")
    return int(row_get_value(row, "id", 0))


def get_direct_conversation_for_user(cursor, conversation_id: int, current_user_id: int):
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
                WHEN c.user_one_id = {param} THEN c.user_two_id
                ELSE c.user_one_id
            END AS participant_id,
            participant.username AS participant_username,
            participant.avatar_url AS participant_avatar_url
        FROM direct_conversations c
        JOIN users participant
            ON participant.id = CASE
                WHEN c.user_one_id = {param} THEN c.user_two_id
                ELSE c.user_one_id
            END
        WHERE c.id = {param}
          AND (c.user_one_id = {param} OR c.user_two_id = {param})
        """.format(param=SQL_PARAM),
        (current_user_id, current_user_id, conversation_id, current_user_id, current_user_id),
    )
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Conversation introuvable")
    ensure_user_interaction_allowed(cursor, current_user_id, int(row["participant_id"]))
    return row


def mark_direct_conversation_read(cursor, conversation_row: Any, current_user_id: int):
    cursor.execute(
        f"SELECT MAX(id) FROM direct_messages WHERE conversation_id = {SQL_PARAM}",
        (conversation_row["id"],),
    )
    last_message_id = int(cursor.fetchone()[0] or 0)

    if conversation_row["user_one_id"] == current_user_id:
        cursor.execute(
            f"UPDATE direct_conversations SET user_one_last_read_message_id = {SQL_PARAM} WHERE id = {SQL_PARAM}",
            (last_message_id, conversation_row["id"]),
        )
    else:
        cursor.execute(
            f"UPDATE direct_conversations SET user_two_last_read_message_id = {SQL_PARAM} WHERE id = {SQL_PARAM}",
            (last_message_id, conversation_row["id"]),
        )


def fetch_direct_conversations(cursor, current_user_id: int) -> list[dict]:
    hidden_user_ids = get_hidden_user_ids(cursor, current_user_id)
    query = """
        SELECT
            c.id,
            c.created_at,
            COALESCE(last_message.created_at, c.created_at) AS updated_at,
            CASE
                WHEN c.user_one_id = {param} THEN c.user_two_id
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
                  AND unread_message.sender_id != {param}
                  AND unread_message.id > CASE
                      WHEN c.user_one_id = {param} THEN COALESCE(c.user_one_last_read_message_id, 0)
                      ELSE COALESCE(c.user_two_last_read_message_id, 0)
                  END
            ) AS unread_count
        FROM direct_conversations c
        JOIN users participant
            ON participant.id = CASE
                WHEN c.user_one_id = {param} THEN c.user_two_id
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
        WHERE c.user_one_id = {param} OR c.user_two_id = {param}
    """.format(param=SQL_PARAM)
    query_params: tuple = (
        current_user_id,
        current_user_id,
        current_user_id,
        current_user_id,
        current_user_id,
        current_user_id,
    )
    if hidden_user_ids:
        placeholders = sql_placeholders(len(hidden_user_ids))
        query += f" AND participant.id NOT IN ({placeholders})"
        query_params = (*query_params, *hidden_user_ids)

    query += """
        ORDER BY updated_at DESC, c.id DESC
    """
    cursor.execute(query, query_params)
    return [serialize_direct_conversation_row(row) for row in cursor.fetchall()]


def get_total_unread_direct_messages(cursor, current_user_id: int) -> int:
    hidden_user_ids = get_hidden_user_ids(cursor, current_user_id)
    query = """
        SELECT COALESCE(SUM(unread_count), 0)
        FROM (
            SELECT (
                SELECT COUNT(*)
                FROM direct_messages unread_message
                WHERE unread_message.conversation_id = c.id
                  AND unread_message.sender_id != {param}
                  AND unread_message.id > CASE
                      WHEN c.user_one_id = {param} THEN COALESCE(c.user_one_last_read_message_id, 0)
                      ELSE COALESCE(c.user_two_last_read_message_id, 0)
                  END
            ) AS unread_count
            FROM direct_conversations c
            JOIN users participant
              ON participant.id = CASE
                  WHEN c.user_one_id = {param} THEN c.user_two_id
                  ELSE c.user_one_id
              END
            WHERE c.user_one_id = {param} OR c.user_two_id = {param}
    """.format(param=SQL_PARAM)
    query_params: tuple = (
        current_user_id,
        current_user_id,
        current_user_id,
        current_user_id,
        current_user_id,
    )
    if hidden_user_ids:
        placeholders = sql_placeholders(len(hidden_user_ids))
        query += f" AND participant.id NOT IN ({placeholders})"
        query_params = (*query_params, *hidden_user_ids)

    query += """
        ) AS unread_counts
    """
    cursor.execute(query, query_params)
    return int(cursor.fetchone()[0] or 0)


def fetch_blocked_user_summaries(cursor, user_id: int) -> list[dict]:
    cursor.execute(
        """
        SELECT
            u.id,
            u.username,
            u.avatar_url,
            bu.created_at AS blocked_at
        FROM blocked_users bu
        JOIN users u ON u.id = bu.blocked_id
        WHERE bu.blocker_id = {param}
        ORDER BY bu.created_at DESC, u.username ASC
        """.format(param=SQL_PARAM),
        (int(user_id),),
    )
    return [serialize_blocked_user_row(row) for row in cursor.fetchall()]


def purge_user_data(cursor, user_id: int, *, delete_account: bool) -> tuple[dict[str, int], Optional[str]]:
    reset_counts: dict[str, int] = {}

    cursor.execute(f"SELECT id FROM reviews WHERE user_id = {SQL_PARAM}", (user_id,))
    review_ids = [int(row["id"]) for row in cursor.fetchall()]
    cursor.execute(f"SELECT id FROM comments WHERE user_id = {SQL_PARAM}", (user_id,))
    comment_ids = [int(row["id"]) for row in cursor.fetchall()]
    cursor.execute(f"SELECT id FROM playlists WHERE user_id = {SQL_PARAM}", (user_id,))
    playlist_ids = [int(row["id"]) for row in cursor.fetchall()]
    cursor.execute(
        f"SELECT id FROM direct_conversations WHERE user_one_id = {SQL_PARAM} OR user_two_id = {SQL_PARAM}",
        (user_id, user_id),
    )
    conversation_ids = [int(row["id"]) for row in cursor.fetchall()]
    cursor.execute(f"SELECT avatar_url FROM users WHERE id = {SQL_PARAM}", (user_id,))
    avatar_row = cursor.fetchone()
    previous_avatar_url = avatar_row["avatar_url"] if avatar_row else None

    reset_counts["notifications"] = 0
    cursor.execute(
        f"DELETE FROM notifications WHERE user_id = {SQL_PARAM} OR actor_user_id = {SQL_PARAM}",
        (user_id, user_id),
    )
    reset_counts["notifications"] += max(cursor.rowcount, 0)
    reset_counts["notifications"] += delete_many_by_ids(cursor, "notifications", "review_id", review_ids)
    reset_counts["notifications"] += delete_many_by_ids(cursor, "notifications", "comment_id", comment_ids)

    reset_counts["comments"] = 0
    reset_counts["comments"] += delete_many_by_ids(cursor, "comments", "review_id", review_ids)
    reset_counts["comments"] += delete_many_by_ids(cursor, "comments", "parent_id", comment_ids)
    cursor.execute(f"DELETE FROM comments WHERE user_id = {SQL_PARAM}", (user_id,))
    reset_counts["comments"] += max(cursor.rowcount, 0)

    reset_counts["review_likes"] = 0
    reset_counts["review_likes"] += delete_many_by_ids(cursor, "review_likes", "review_id", review_ids)
    cursor.execute(f"DELETE FROM review_likes WHERE user_id = {SQL_PARAM}", (user_id,))
    reset_counts["review_likes"] += max(cursor.rowcount, 0)

    cursor.execute(f"DELETE FROM reviews WHERE user_id = {SQL_PARAM}", (user_id,))
    reset_counts["reviews"] = max(cursor.rowcount, 0)

    cursor.execute(
        f"DELETE FROM follows WHERE follower_id = {SQL_PARAM} OR followed_id = {SQL_PARAM}",
        (user_id, user_id),
    )
    reset_counts["follows"] = max(cursor.rowcount, 0)

    cursor.execute(f"DELETE FROM user_ratings WHERE user_id = {SQL_PARAM}", (user_id,))
    reset_counts["ratings"] = max(cursor.rowcount, 0)

    cursor.execute(f"DELETE FROM recommendation_impressions WHERE user_id = {SQL_PARAM}", (user_id,))
    reset_counts["recommendation_impressions"] = max(cursor.rowcount, 0)

    reset_counts["playlist_items"] = delete_many_by_ids(cursor, "playlist_items", "playlist_id", playlist_ids)
    cursor.execute(f"DELETE FROM playlists WHERE user_id = {SQL_PARAM}", (user_id,))
    reset_counts["playlists"] = max(cursor.rowcount, 0)

    reset_counts["direct_messages"] = delete_many_by_ids(cursor, "direct_messages", "conversation_id", conversation_ids)
    cursor.execute(
        f"DELETE FROM direct_conversations WHERE user_one_id = {SQL_PARAM} OR user_two_id = {SQL_PARAM}",
        (user_id, user_id),
    )
    reset_counts["direct_conversations"] = max(cursor.rowcount, 0)

    cursor.execute(f"DELETE FROM user_preferences WHERE user_id = {SQL_PARAM}", (user_id,))
    reset_counts["preferences"] = max(cursor.rowcount, 0)

    cursor.execute(f"DELETE FROM mobile_devices WHERE user_id = {SQL_PARAM}", (user_id,))
    reset_counts["mobile_devices"] = max(cursor.rowcount, 0)

    cursor.execute(f"DELETE FROM web_push_subscriptions WHERE user_id = {SQL_PARAM}", (user_id,))
    reset_counts["web_push_subscriptions"] = max(cursor.rowcount, 0)

    cursor.execute(
        f"DELETE FROM blocked_users WHERE blocker_id = {SQL_PARAM} OR blocked_id = {SQL_PARAM}",
        (user_id, user_id),
    )
    reset_counts["blocked_users"] = max(cursor.rowcount, 0)

    reset_counts["moderation_reports"] = 0
    cursor.execute(
        f"DELETE FROM moderation_reports WHERE reporter_user_id = {SQL_PARAM} OR target_user_id = {SQL_PARAM}",
        (user_id, user_id),
    )
    reset_counts["moderation_reports"] += max(cursor.rowcount, 0)
    reset_counts["moderation_reports"] += delete_many_by_ids(cursor, "moderation_reports", "target_review_id", review_ids)
    reset_counts["moderation_reports"] += delete_many_by_ids(cursor, "moderation_reports", "target_comment_id", comment_ids)
    reset_counts["moderation_reports"] += delete_many_by_ids(cursor, "moderation_reports", "target_conversation_id", conversation_ids)

    if delete_account:
        cursor.execute(f"DELETE FROM users WHERE id = {SQL_PARAM}", (user_id,))
        reset_counts["user"] = max(cursor.rowcount, 0)
    else:
        cursor.execute(f"UPDATE users SET avatar_url = NULL WHERE id = {SQL_PARAM}", (user_id,))
        reset_counts["avatar"] = 1 if previous_avatar_url else 0
        get_or_create_watch_later_id(cursor, user_id)

    return reset_counts, previous_avatar_url


def reset_recommendation_profile(cursor, user_id: int) -> dict[str, int]:
    reset_counts: dict[str, int] = {}
    watch_later_id = get_or_create_watch_later_id(cursor, user_id)

    cursor.execute(f"DELETE FROM user_ratings WHERE user_id = {SQL_PARAM}", (user_id,))
    reset_counts["ratings"] = max(cursor.rowcount, 0)

    cursor.execute(f"DELETE FROM recommendation_impressions WHERE user_id = {SQL_PARAM}", (user_id,))
    reset_counts["recommendation_impressions"] = max(cursor.rowcount, 0)

    cursor.execute(f"DELETE FROM playlist_items WHERE playlist_id = {SQL_PARAM}", (watch_later_id,))
    reset_counts["watch_later_items"] = max(cursor.rowcount, 0)

    cursor.execute(
        """
        UPDATE user_preferences
        SET favorite_genres = {param},
            favorite_people = {param},
            favorite_movie_ids = {param},
            people_seed_movie_ids = {param},
            onboarding_completed_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = {param}
        """.format(param=SQL_PARAM),
        (
            dump_json_list([]),
            dump_json_list([]),
            dump_json_list([]),
            dump_json_list([]),
            user_id,
        ),
    )
    reset_counts["onboarding_preferences"] = max(cursor.rowcount, 0)

    return reset_counts

# --- 6. ROUTES PLAYLISTS & RATINGS ---
class PlaylistCreate(BaseModel):
    name: str


class PlaylistMovePayload(BaseModel):
    source_movie_id: int
    target_movie_id: int


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
    reply_to_message_id: Optional[int] = None


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
        f"SELECT id, name FROM playlists WHERE user_id = {SQL_PARAM} AND name != {SQL_PARAM} ORDER BY id DESC",
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


@app.get("/playlists/previews")
def get_playlist_previews(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    watch_later_id = get_or_create_watch_later_id(cursor, current_user["id"])
    conn.commit()

    cursor.execute(
        f"SELECT id, name FROM playlists WHERE user_id = {SQL_PARAM} AND name != {SQL_PARAM} ORDER BY id DESC",
        (current_user["id"], WATCH_LATER_NAME),
    )
    custom_playlists = [dict(row) for row in cursor.fetchall()]

    playlist_sources = [
        {
            "id": WATCH_LATER_SYSTEM_ID,
            "name": "⏰ À regarder plus tard",
            "type": "system",
            "system_key": "watch-later",
            "readonly": False,
            "real_id": watch_later_id,
            "source": "playlist_items",
        },
        {
            "id": FAVORITES_SYSTEM_ID,
            "name": "⭐ Mes Tops (4-5★)",
            "type": "system",
            "system_key": "favorites",
            "readonly": True,
            "source": "favorites",
        },
        {
            "id": HISTORY_SYSTEM_ID,
            "name": "👁️ Historique",
            "type": "system",
            "system_key": "history",
            "readonly": True,
            "source": "history",
        },
    ] + [
        {
            "id": int(playlist["id"]),
            "name": playlist["name"],
            "type": "custom",
            "system_key": None,
            "readonly": False,
            "real_id": int(playlist["id"]),
            "source": "custom",
        }
        for playlist in custom_playlists
    ]

    previews = []
    for playlist in playlist_sources:
        source = playlist["source"]
        if source in {"playlist_items", "custom"}:
            cursor.execute(
                f"SELECT COUNT(*) AS count FROM playlist_items WHERE playlist_id = {SQL_PARAM}",
                (playlist["real_id"],),
            )
            count = int(cursor.fetchone()["count"] or 0)
            order_clause = (
                "COALESCE(added_at, '1970-01-01 00:00:00') DESC, movie_id DESC"
                if source == "playlist_items"
                else "COALESCE(sort_index, 2147483647) ASC, COALESCE(added_at, '1970-01-01 00:00:00') DESC, movie_id DESC"
            )
            cursor.execute(
                f"""
                SELECT movie_id AS id, title, poster_url, rating, COALESCE(added_at, '1970-01-01 00:00:00') AS added_at
                FROM playlist_items
                WHERE playlist_id = {SQL_PARAM}
                ORDER BY {order_clause}
                LIMIT 3
                """,
                (playlist["real_id"],),
            )
        elif source == "favorites":
            cursor.execute(
                f"SELECT COUNT(*) AS count FROM user_ratings WHERE user_id = {SQL_PARAM} AND rating >= 4",
                (current_user["id"],),
            )
            count = int(cursor.fetchone()["count"] or 0)
            cursor.execute(
                f"""
                SELECT movie_id AS id, title, poster_url, rating, added_at
                FROM user_ratings
                WHERE user_id = {SQL_PARAM} AND rating >= 4
                ORDER BY added_at DESC
                LIMIT 3
                """,
                (current_user["id"],),
            )
        else:
            cursor.execute(
                f"SELECT COUNT(*) AS count FROM user_ratings WHERE user_id = {SQL_PARAM}",
                (current_user["id"],),
            )
            count = int(cursor.fetchone()["count"] or 0)
            cursor.execute(
                f"""
                SELECT movie_id AS id, title, poster_url, rating, added_at
                FROM user_ratings
                WHERE user_id = {SQL_PARAM}
                ORDER BY added_at DESC
                LIMIT 3
                """,
                (current_user["id"],),
            )

        preview_movies = [dict(row) for row in cursor.fetchall()]
        previews.append({
            "id": playlist["id"],
            "name": playlist["name"],
            "type": playlist["type"],
            "system_key": playlist["system_key"],
            "readonly": playlist["readonly"],
            "count": count,
            "preview_movies": preview_movies,
        })

    conn.close()
    return previews


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
        f"SELECT 1 FROM playlists WHERE user_id = {SQL_PARAM} AND lower(name) = lower({SQL_PARAM})",
        (current_user["id"], playlist_name),
    )
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Cette playlist existe déjà")

    new_id = execute_insert_and_get_id(
        cursor,
        f"INSERT INTO playlists (name, user_id) VALUES ({SQL_PARAM}, {SQL_PARAM})",
        (playlist_name, current_user["id"]),
    )
    conn.commit()
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
            f"SELECT movie_id as id, title, poster_url, rating, COALESCE(added_at, '1970-01-01 00:00:00') as added_at FROM playlist_items WHERE playlist_id = {SQL_PARAM} ORDER BY COALESCE(added_at, '1970-01-01 00:00:00') DESC, movie_id DESC",
            (real_id,),
        )
    elif playlist_id == FAVORITES_SYSTEM_ID:
        cursor.execute(
            f"SELECT movie_id as id, title, poster_url, rating, added_at FROM user_ratings WHERE user_id = {SQL_PARAM} AND rating >= 4 ORDER BY added_at DESC",
            (current_user["id"],),
        )
    elif playlist_id == HISTORY_SYSTEM_ID:
        cursor.execute(
            f"SELECT movie_id as id, title, poster_url, rating, added_at FROM user_ratings WHERE user_id = {SQL_PARAM} ORDER BY added_at DESC",
            (current_user["id"],),
        )
    else:
        target_id = get_custom_playlist_id(cursor, playlist_id, current_user["id"])
        cursor.execute(
            f"SELECT movie_id as id, title, poster_url, rating, COALESCE(added_at, '1970-01-01 00:00:00') as added_at, COALESCE(sort_index, 0) as sort_index FROM playlist_items WHERE playlist_id = {SQL_PARAM} ORDER BY COALESCE(sort_index, 2147483647) ASC, COALESCE(added_at, '1970-01-01 00:00:00') DESC, movie_id DESC",
            (target_id,),
        )
    
    movies = [dict(row) for row in cursor.fetchall()]
    conn.close()

    for movie in movies:
        movie["primary_genre"] = get_movie_primary_genre(int(movie["id"]))
        movie["subscription_provider_names"] = []

    if playlist_id == WATCH_LATER_SYSTEM_ID:
        for movie in movies:
            watch_providers = get_tmdb_watch_providers(int(movie["id"]))
            movie["subscription_provider_names"] = dedupe_list(
                [
                    normalize_streaming_service_label(provider.get("name", ""))
                    for provider in watch_providers.get("subscription", [])
                    if normalize_streaming_service_label(provider.get("name", ""))
                ]
            )

    if playlist_id == WATCH_LATER_SYSTEM_ID:
        movies.sort(
            key=lambda movie: (
                str(movie.get("primary_genre") or "Autres").lower(),
                str(movie.get("title") or "").lower(),
            )
        )

    return movies


@app.get("/playlists/{playlist_id}/paged")
def get_playlist_content_paged(
    playlist_id: int,
    limit: int = 60,
    offset: int = 0,
    sort: Optional[str] = None,
    query: str = "",
    only_owned_streaming_services: bool = False,
    current_user: dict = Depends(get_current_user),
):
    safe_limit = max(1, min(limit, 240))
    safe_offset = max(0, offset)
    resolved_sort = normalize_playlist_sort(playlist_id, sort)

    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    if playlist_id == WATCH_LATER_SYSTEM_ID:
        conn.commit()

    payload = browse_playlist_rows(
        cursor,
        playlist_id,
        current_user["id"],
        offset=safe_offset,
        limit=safe_limit,
        sort_mode=resolved_sort,
        query=query,
        only_owned_streaming_services=only_owned_streaming_services,
    )
    conn.commit()
    conn.close()
    payload["resolved_sort"] = resolved_sort
    return payload

@app.post("/playlists/{playlist_id}/add/{movie_id}")
def add_to_specific_playlist(playlist_id: int, movie_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    target_id = get_playlist_target_id(cursor, playlist_id, current_user["id"])
    
    info = get_tmdb_details(movie_id)
    if info:
        try:
            primary_genre = get_movie_primary_genre(movie_id)
            subscription_provider_names = (
                build_movie_subscription_provider_names(movie_id)
                if playlist_id == WATCH_LATER_SYSTEM_ID
                else []
            )
            cursor.execute(
                f"SELECT COALESCE(MAX(sort_index), 0) + 1 FROM playlist_items WHERE playlist_id = {SQL_PARAM}",
                (target_id,),
            )
            next_sort_index = int(cursor.fetchone()[0] or 1)
            cursor.execute(
                f"""
                INSERT INTO playlist_items (
                    playlist_id,
                    movie_id,
                    title,
                    poster_url,
                    rating,
                    added_at,
                    sort_index,
                    primary_genre,
                    subscription_provider_names,
                    metadata_updated_at
                ) VALUES (
                    {SQL_PARAM},
                    {SQL_PARAM},
                    {SQL_PARAM},
                    {SQL_PARAM},
                    {SQL_PARAM},
                    CURRENT_TIMESTAMP,
                    {SQL_PARAM},
                    {SQL_PARAM},
                    {SQL_PARAM},
                    CURRENT_TIMESTAMP
                )
                """,
                (
                    target_id,
                    info["id"],
                    info["title"],
                    info["poster_url"],
                    info["rating"],
                    next_sort_index,
                    primary_genre,
                    dump_json_list(subscription_provider_names),
                ),
            )
            reaction_type = "watch_later" if playlist_id == WATCH_LATER_SYSTEM_ID else "playlist_add"
            mark_recommendation_reaction(
                cursor,
                current_user["id"],
                movie_id,
                reaction_type,
            )
            conn.commit()
        except DBIntegrityError:
            pass
        
    conn.close()
    return {"status": "added"}

@app.delete("/playlists/{playlist_id}/remove/{movie_id}")
def remove_from_specific_playlist(playlist_id: int, movie_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    target_id = get_playlist_target_id(cursor, playlist_id, current_user["id"])

    cursor.execute(
        f"DELETE FROM playlist_items WHERE playlist_id = {SQL_PARAM} AND movie_id = {SQL_PARAM}",
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
        f"SELECT movie_id FROM playlist_items WHERE playlist_id = {SQL_PARAM}",
        (target_id,),
    )
    existing_movie_ids = {int(row[0]) for row in cursor.fetchall()}
    if existing_movie_ids != set(ordered_movie_ids):
        conn.close()
        raise HTTPException(status_code=400, detail="La liste des films ne correspond pas à la playlist")

    for index, movie_id in enumerate(ordered_movie_ids, start=1):
        cursor.execute(
            f"UPDATE playlist_items SET sort_index = {SQL_PARAM} WHERE playlist_id = {SQL_PARAM} AND movie_id = {SQL_PARAM}",
            (index, target_id, movie_id),
        )

    conn.commit()
    conn.close()
    return {"status": "reordered"}

@app.post("/playlists/{playlist_id}/move")
def move_playlist_movie(
    playlist_id: int,
    payload: PlaylistMovePayload,
    current_user: dict = Depends(get_current_user),
):
    conn = get_db_connection()
    cursor = conn.cursor()
    target_id = get_playlist_target_id(cursor, playlist_id, current_user["id"])

    cursor.execute(
        f"""
        SELECT movie_id
        FROM playlist_items
        WHERE playlist_id = {SQL_PARAM}
        ORDER BY COALESCE(sort_index, 2147483647) ASC, COALESCE(added_at, '1970-01-01 00:00:00') DESC, movie_id DESC
        """,
        (target_id,),
    )
    ordered_movie_ids = [int(row[0]) for row in cursor.fetchall()]
    if payload.source_movie_id not in ordered_movie_ids or payload.target_movie_id not in ordered_movie_ids:
        conn.close()
        raise HTTPException(status_code=400, detail="Film introuvable dans cette playlist")

    source_index = ordered_movie_ids.index(payload.source_movie_id)
    target_index = ordered_movie_ids.index(payload.target_movie_id)
    if source_index == target_index:
        conn.close()
        return {"status": "unchanged"}

    moved_movie_id = ordered_movie_ids.pop(source_index)
    ordered_movie_ids.insert(target_index, moved_movie_id)

    for index, movie_id in enumerate(ordered_movie_ids, start=1):
        cursor.execute(
            f"UPDATE playlist_items SET sort_index = {SQL_PARAM} WHERE playlist_id = {SQL_PARAM} AND movie_id = {SQL_PARAM}",
            (index, target_id, movie_id),
        )

    conn.commit()
    conn.close()
    return {"status": "moved"}

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
        """
        INSERT INTO user_ratings (user_id, movie_id, rating, title, poster_url)
        VALUES ({param}, {param}, {param}, {param}, {param})
        ON CONFLICT(user_id, movie_id) DO UPDATE SET
            rating = EXCLUDED.rating,
            title = EXCLUDED.title,
            poster_url = EXCLUDED.poster_url,
            added_at = CURRENT_TIMESTAMP
        """.format(param=SQL_PARAM),
        (current_user["id"], movie_id, rounded_rating, title, poster),
    )
    cursor.execute(
        f"UPDATE reviews SET rating = {SQL_PARAM} WHERE user_id = {SQL_PARAM} AND movie_id = {SQL_PARAM}",
        (rounded_rating, current_user["id"], movie_id),
    )
    cursor.execute(
        f"DELETE FROM playlist_items WHERE playlist_id = {SQL_PARAM} AND movie_id = {SQL_PARAM}",
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
        f"SELECT id FROM reviews WHERE user_id = {SQL_PARAM} AND movie_id = {SQL_PARAM} LIMIT 1",
        (current_user["id"], movie_id),
    )
    if cursor.fetchone():
        conn.close()
        raise HTTPException(
            status_code=400,
            detail="Cette note est liée à une critique. Modifie ou supprime la critique pour retirer la note.",
        )
    cursor.execute(
        f"DELETE FROM user_ratings WHERE user_id = {SQL_PARAM} AND movie_id = {SQL_PARAM}",
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
        f"SELECT rating FROM user_ratings WHERE user_id = {SQL_PARAM} AND movie_id = {SQL_PARAM}",
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
    only_now_playing: bool = False,
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
        f"SELECT movie_id, rating FROM user_ratings WHERE user_id = {SQL_PARAM} ORDER BY added_at DESC",
        (current_user_id,),
    )
    rating_rows = [(int(row[0]), float(row[1])) for row in cursor.fetchall()]
    rated_ids = {movie_id for movie_id, _ in rating_rows}
    disliked_ids = [movie_id for movie_id, rating in rating_rows if rating <= 2.5][:12]

    cursor.execute(
        f"SELECT movie_id FROM playlist_items WHERE playlist_id = {SQL_PARAM}",
        (watch_later_id,),
    )
    watch_later_ids = {int(row[0]) for row in cursor.fetchall()}

    cursor.execute(
        """
        SELECT movie_id, reaction_type, responded_at, shown_at
        FROM recommendation_impressions
        WHERE user_id = {param}
          AND mode = 'tinder'
        ORDER BY COALESCE(responded_at, shown_at) DESC
        LIMIT 500
        """.format(param=SQL_PARAM),
        (current_user_id,),
    )
    latest_reaction_by_movie: dict[int, tuple[str, str, str]] = {}
    for row in cursor.fetchall():
        movie_id = int(row[0])
        if movie_id in latest_reaction_by_movie:
            continue
        latest_reaction_by_movie[movie_id] = (
            str(row[1] or ""),
            str(row[2] or ""),
            str(row[3] or ""),
        )
    passed_ids = {
        movie_id
        for movie_id, (reaction_type, _, _) in latest_reaction_by_movie.items()
        if reaction_type in PASS_REACTION_TYPES
    }
    pass_cooldown_cutoff = datetime.datetime.utcnow() - datetime.timedelta(
        days=PASS_RECONSIDER_COOLDOWN_DAYS
    )
    def parse_reaction_datetime(raw_value: str):
        if not raw_value:
            return None
        normalized_value = raw_value.strip().replace("Z", "+00:00")
        if " " in normalized_value and "T" not in normalized_value:
            normalized_value = normalized_value.replace(" ", "T", 1)
        try:
            parsed_value = datetime.datetime.fromisoformat(normalized_value)
        except ValueError:
            return None
        if parsed_value.tzinfo is not None:
            parsed_value = parsed_value.astimezone(datetime.timezone.utc).replace(tzinfo=None)
        return parsed_value

    tinder_history_blocked_ids = set()
    for movie_id, (reaction_type, responded_at, _shown_at) in latest_reaction_by_movie.items():
        if reaction_type in PASS_REACTION_TYPES:
            responded_at_datetime = parse_reaction_datetime(responded_at)
            if responded_at_datetime is not None and responded_at_datetime < pass_cooldown_cutoff:
                continue
        tinder_history_blocked_ids.add(movie_id)

    cursor.execute(
        f"SELECT movie_id FROM playlist_items WHERE playlist_id = {SQL_PARAM} ORDER BY COALESCE(sort_index, 999999), added_at DESC LIMIT 12",
        (watch_later_id,),
    )
    recent_watch_later_ids = [int(row[0]) for row in cursor.fetchall()]
    is_test_ai_experiment = is_recommendation_ai_enabled_user(cursor, current_user_id)
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
        rated_ids | watch_later_ids | tinder_history_blocked_ids,
    ) if not is_tinder_mode else {}
    conn.close()

    onboarding_movie_ids = preferences["favorite_movie_ids"]
    people_seed_movie_ids = preferences["people_seed_movie_ids"]
    onboarding_movie_id_set = {int(movie_id) for movie_id in onboarding_movie_ids}
    request_exclude_ids = parse_exclude_ids(exclude_ids)
    seen_ids = rated_ids | watch_later_ids | onboarding_movie_id_set
    if is_tinder_mode:
        seen_ids = seen_ids | tinder_history_blocked_ids
    blocked_ids = seen_ids | request_exclude_ids
    interaction_count = len(seen_ids)
    real_interaction_count = len(rated_ids | watch_later_ids | passed_ids)
    cold_start_mode = real_interaction_count < 8 if is_test_ai_experiment else interaction_count < 6
    onboarding_genre_tokens = {
        normalize_genre_token(value)
        for value in preferences["favorite_genres"]
        if normalize_genre_token(value)
    }

    if movies_df.empty:
        return []

    now_playing_ids = {int(movie["id"]) for movie in fetch_now_playing_movies(limit=60)}
    allowed_movie_ids = set(now_playing_ids) if only_now_playing else set(int(movie_id) for movie_id in movie_ids_array.tolist())

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

    if passed_ids:
        passed_penalty = 0.14 if is_tinder_mode else 0.07
        passed_index_penalties = movies_df["id"].isin(passed_ids).to_numpy(dtype=float)
        hybrid_scores = hybrid_scores - (passed_index_penalties * passed_penalty)

    for idx, movie_id in enumerate(movie_ids_array):
        movie_id = int(movie_id)
        if movie_id in blocked_ids or movie_id not in allowed_movie_ids:
            continue
        candidate_scores[movie_id] = float(hybrid_scores[idx])

    seed_related_limit = 7 if is_test_ai_experiment else 5
    for seed_rank, seed_id in enumerate(positive_signal_ids[:seed_related_limit]):
        related_ids = get_tmdb_related_movie_ids(seed_id)
        seed_strength = positive_signal_weights.get(seed_id, 1.0)
        for rank, related_id in enumerate(related_ids):
            if related_id in blocked_ids or related_id not in allowed_movie_ids:
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
            if related_id in blocked_ids or related_id not in allowed_movie_ids:
                continue
            penalty = (1.35 if is_tinder_mode else 1.15) + min(seed_penalty_strength * 0.20, 0.45)
            penalty = penalty - (rank * 0.05) - (seed_rank * 0.12)
            candidate_scores[related_id] = candidate_scores.get(related_id, 0.0) - max(penalty, 0.10)

    for movie_id, score in collaborative_scores.items():
        if movie_id in blocked_ids or movie_id not in allowed_movie_ids:
            continue
        candidate_scores[movie_id] = candidate_scores.get(movie_id, 0.0) + min(score, 0.85 if is_spotlight_mode else 0.35)

    ranked_candidate_ids = [
        movie_id
        for movie_id, _ in sorted(candidate_scores.items(), key=lambda item: item[1], reverse=True)
        if movie_id not in blocked_ids
    ]
    seed_context_by_movie_id: dict[int, dict[str, object]] = {}
    poster_urls_by_movie_id: dict[int, str] = {}

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
            "poster_url": poster_urls_by_movie_id.get(movie_id) or fetch_poster_from_tmdb(movie_id),
            "rating": float(row["vote_average"]),
            "is_now_playing": movie_id in now_playing_ids,
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
        exploration_pool = movies_df[
            (~movies_df["id"].isin(blocked_ids)) & (movies_df["id"].isin(list(allowed_movie_ids)))
        ].copy()
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
        poster_urls_by_movie_id.update(fetch_posters_from_tmdb(selected_ids[:limit]))
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
        filler_pool = movies_df[
            (~movies_df["id"].isin(used_ids)) & (movies_df["id"].isin(list(allowed_movie_ids)))
        ]
        filler_pool = filler_pool.sort_values("quality_score", ascending=False)
        selected_ids.extend([int(row["id"]) for _, row in filler_pool.head(main_slots - len(selected_ids)).iterrows()])
        used_ids = blocked_ids | set(selected_ids)

    if exploration_slots > 0:
        exploration_pool = movies_df[
            (~movies_df["id"].isin(used_ids)) & (movies_df["id"].isin(list(allowed_movie_ids)))
        ].copy()
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
        fallback_pool = movies_df[
            (~movies_df["id"].isin(used_ids)) & (movies_df["id"].isin(list(allowed_movie_ids)))
        ]
        fallback_pool = fallback_pool.sort_values("quality_score", ascending=False)
        selected_ids.extend([int(row["id"]) for _, row in fallback_pool.head(limit - len(selected_ids)).iterrows()])

    selected_ids = [movie_id for movie_id in selected_ids if movie_id not in blocked_ids]
    selected_rows = movies_df[movies_df["id"].isin(selected_ids)].copy()
    selected_rows["selection_rank"] = selected_rows["id"].apply(
        lambda movie_id: selected_ids.index(int(movie_id))
    )
    selected_rows = selected_rows.sort_values("selection_rank")
    poster_urls_by_movie_id.update(fetch_posters_from_tmdb(selected_ids[:limit]))

    return [
        build_recommendation_payload(row, "tinder" if is_tinder_mode else "spotlight")
        for _, row in selected_rows.head(limit).iterrows()
    ]

@app.get("/movies/feed")
def get_movie_feed(
    limit: int = 10,
    exclude_ids: Optional[str] = None,
    mode: str = "core",
    only_now_playing: bool = False,
    current_user: dict = Depends(get_current_user),
):
    return compute_recommendation_feed(
        current_user_id=current_user["id"],
        limit=limit,
        exclude_ids=exclude_ids,
        mode=mode,
        only_now_playing=only_now_playing,
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
    if not is_test_dashboard_user(cursor, current_user["id"]):
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
        WHERE user_id = {param}
        """.format(param=SQL_PARAM),
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
        WHERE user_id = {param}
        GROUP BY algorithm_variant, mode
        ORDER BY shown_count DESC
        """.format(param=SQL_PARAM),
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
        WHERE user_id = {param}
        ORDER BY shown_at DESC
        LIMIT 24
        """.format(param=SQL_PARAM),
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
        WHERE user_id = {param}
        GROUP BY movie_id
        HAVING SUM(CASE WHEN responded_at IS NOT NULL THEN 1 ELSE 0 END) > 0
        ORDER BY positive_count DESC, response_count DESC, average_rating DESC
        LIMIT 6
        """.format(param=SQL_PARAM),
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
        WHERE user_id = {param}
          AND COALESCE(seed_title, '') != ''
        GROUP BY seed_movie_id, seed_title
        HAVING SUM(CASE WHEN responded_at IS NOT NULL THEN 1 ELSE 0 END) > 0
        ORDER BY positive_count DESC, response_count DESC, average_rating DESC
        LIMIT 6
        """.format(param=SQL_PARAM),
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
        WHERE f.follower_id = {param}
        ORDER BY ur.added_at DESC
        LIMIT {param}
        """.format(param=SQL_PARAM),
        (current_user_id, limit),
    )
    movies = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return movies


@app.get("/movies/news/highlights")
def movie_news_highlights(current_user: dict = Depends(get_current_user)):
    is_test_ai_experiment = is_test_dashboard_username(str(current_user["username"]))
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


def clamp_probability(value: float) -> float:
    return max(0.01, min(0.99, float(value)))


def probability_from_rating(rating: float) -> float:
    normalized_rating = max(0.5, min(5.0, float(rating)))
    return clamp_probability(0.04 + ((normalized_rating / 5.0) ** 1.45) * 0.94)


def build_group_recommendation_reason(
    *,
    probabilities: list[float],
    primary_genre: str,
    seen_count: int,
) -> str:
    if not probabilities:
        return "Suggestion equilibree pour le groupe."

    lowest_probability = min(probabilities)
    average_probability = sum(probabilities) / len(probabilities)
    normalized_genre = (primary_genre or "cinema").lower()
    seen_suffix = f" Deja vu par {seen_count} membre{'s' if seen_count > 1 else ''}." if seen_count else ""

    if lowest_probability >= 0.72:
        return f"Tres bon terrain commun, surtout cote {normalized_genre}.{seen_suffix}"
    if lowest_probability >= 0.58:
        return f"Bon compromis: tout le monde reste au-dessus de {round(lowest_probability * 100)}%.{seen_suffix}"
    return f"Meilleur equilibre trouve: {round(average_probability * 100)}% en moyenne.{seen_suffix}"


def build_group_recommendations(
    *,
    current_user_id: int,
    selected_user_ids: list[int],
    limit: int = 12,
    include_seen: bool = False,
) -> list[dict]:
    if movies_df.empty or vectors is None:
        return []

    deduped_selected_user_ids: list[int] = []
    for user_id in selected_user_ids:
        normalized_user_id = int(user_id)
        if normalized_user_id == current_user_id or normalized_user_id in deduped_selected_user_ids:
            continue
        deduped_selected_user_ids.append(normalized_user_id)

    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    hidden_user_ids = get_hidden_user_ids(cursor, current_user_id)

    valid_selected_user_ids: list[int] = []
    if deduped_selected_user_ids:
        placeholders = sql_placeholders(len(deduped_selected_user_ids))
        cursor.execute(
            f"SELECT id FROM users WHERE id IN ({placeholders})",
            tuple(deduped_selected_user_ids),
        )
        existing_user_ids = {int(row[0]) for row in cursor.fetchall()}
        for user_id in deduped_selected_user_ids:
            if user_id in existing_user_ids and user_id not in hidden_user_ids:
                valid_selected_user_ids.append(user_id)

    if not valid_selected_user_ids:
        conn.close()
        raise HTTPException(status_code=400, detail="Selection de profils invalide")

    group_user_ids = [int(current_user_id), *valid_selected_user_ids[:5]]
    placeholders = sql_placeholders(len(group_user_ids))
    cursor.execute(
        f"SELECT id, username FROM users WHERE id IN ({placeholders})",
        tuple(group_user_ids),
    )
    username_by_id = {
        int(row_get_value(row, "id", 0)): decode_db_text(row_get_value(row, "username", 1))
        for row in cursor.fetchall()
    }

    rated_by_movie_id: dict[int, list[dict[str, Any]]] = defaultdict(list)
    group_profiles: list[dict[str, Any]] = []

    for user_id in group_user_ids:
        preferences = get_user_preferences(cursor, user_id)
        watch_later_id = get_or_create_watch_later_id(cursor, user_id)
        cursor.execute(
            f"SELECT movie_id, rating FROM user_ratings WHERE user_id = {SQL_PARAM} ORDER BY added_at DESC",
            (user_id,),
        )
        rating_rows = [(int(row[0]), float(row[1])) for row in cursor.fetchall()]
        rating_by_movie_id = {movie_id: rating for movie_id, rating in rating_rows}
        for movie_id, rating in rating_rows:
            rated_by_movie_id[movie_id].append(
                {
                    "user_id": int(user_id),
                    "username": username_by_id.get(int(user_id)) or f"user-{user_id}",
                    "rating": float(rating),
                }
            )

        cursor.execute(
            f"SELECT movie_id FROM playlist_items WHERE playlist_id = {SQL_PARAM} ORDER BY added_at DESC LIMIT 18",
            (watch_later_id,),
        )
        watch_later_ids = [int(row[0]) for row in cursor.fetchall()]

        positive_signal_weights: dict[int, float] = {}
        for rank, (movie_id, rating) in enumerate(rating_rows[:24]):
            if rating < 3.5:
                continue
            signal_weight = max(0.35, float(rating) - 2.6) * max(0.45, 1.30 - (rank * 0.05))
            positive_signal_weights[movie_id] = max(
                positive_signal_weights.get(movie_id, 0.0),
                signal_weight,
            )

        for rank, movie_id in enumerate(watch_later_ids[:12]):
            watch_weight = max(0.25, 0.80 - (rank * 0.05))
            positive_signal_weights[movie_id] = max(
                positive_signal_weights.get(movie_id, 0.0),
                watch_weight,
            )

        for movie_id in preferences["favorite_movie_ids"][:12]:
            positive_signal_weights[int(movie_id)] = max(
                positive_signal_weights.get(int(movie_id), 0.0),
                1.25,
            )

        for movie_id in preferences["profile_movie_ids"][:10]:
            positive_signal_weights[int(movie_id)] = max(
                positive_signal_weights.get(int(movie_id), 0.0),
                0.95,
            )

        for movie_id in preferences["people_seed_movie_ids"][:10]:
            positive_signal_weights[int(movie_id)] = max(
                positive_signal_weights.get(int(movie_id), 0.0),
                0.72,
            )

        genre_tokens = {
            normalize_genre_token(value)
            for value in [*preferences["favorite_genres"], *preferences["profile_genres"]]
            if normalize_genre_token(value)
        }

        positive_indices: list[int] = []
        positive_vector_weights: list[float] = []
        for movie_id, weight in positive_signal_weights.items():
            movie_index = movie_index_by_id.get(int(movie_id))
            if movie_index is None:
                continue
            positive_indices.append(movie_index)
            positive_vector_weights.append(float(weight))

        negative_indices: list[int] = []
        negative_vector_weights: list[float] = []
        for movie_id, rating in rating_rows[:80]:
            if rating > 2.5:
                continue
            movie_index = movie_index_by_id.get(int(movie_id))
            if movie_index is None:
                continue
            negative_indices.append(movie_index)
            negative_vector_weights.append(max(0.20, 3.0 - float(rating)))

        similarity_scores = np.zeros(len(movies_df))
        if positive_indices:
            try:
                similarity_matrix = cosine_similarity(vectors, vectors[positive_indices])
                similarity_scores = np.average(
                    similarity_matrix,
                    axis=1,
                    weights=np.array(positive_vector_weights),
                )
            except Exception:
                similarity_scores = np.zeros(len(movies_df))

        negative_similarity_scores = np.zeros(len(movies_df))
        if negative_indices:
            try:
                negative_similarity_matrix = cosine_similarity(vectors, vectors[negative_indices])
                negative_similarity_scores = np.average(
                    negative_similarity_matrix,
                    axis=1,
                    weights=np.array(negative_vector_weights),
                )
            except Exception:
                negative_similarity_scores = np.zeros(len(movies_df))

        genre_scores = np.zeros(len(movies_df))
        if genre_tokens:
            genre_scores = np.array(
                [
                    len(set(tokens) & genre_tokens) / max(len(genre_tokens), 1)
                    if tokens else 0.0
                    for tokens in movies_df["genre_tokens"]
                ]
            )

        group_profiles.append(
            {
                "user_id": int(user_id),
                "username": username_by_id.get(int(user_id)) or f"user-{user_id}",
                "rating_by_movie_id": rating_by_movie_id,
                "has_personal_signals": bool(positive_indices or genre_tokens),
                "similarity_scores": similarity_scores,
                "negative_similarity_scores": negative_similarity_scores,
                "genre_scores": genre_scores,
            }
        )

    conn.commit()
    conn.close()

    audience_rating_scores = movies_df["audience_rating_score"].to_numpy()
    quality_scores = movies_df["quality_score"].to_numpy()
    candidate_scores: list[tuple[int, float, float, float, list[dict[str, Any]]]] = []

    for movie_id in movie_ids_array:
        normalized_movie_id = int(movie_id)
        seen_entries = rated_by_movie_id.get(normalized_movie_id, [])
        if seen_entries and not include_seen:
            continue

        movie_index = movie_index_by_id.get(normalized_movie_id)
        if movie_index is None:
            continue

        member_matches: list[dict[str, Any]] = []
        probabilities: list[float] = []
        for profile in group_profiles:
            rating = profile["rating_by_movie_id"].get(normalized_movie_id)
            if rating is not None:
                probability = probability_from_rating(float(rating))
            else:
                raw_probability = (
                    (float(profile["similarity_scores"][movie_index]) * 0.58)
                    + (float(profile["genre_scores"][movie_index]) * 0.18)
                    + (float(quality_scores[movie_index]) * 0.15)
                    + (float(audience_rating_scores[movie_index]) * 0.09)
                    - (float(profile["negative_similarity_scores"][movie_index]) * 0.36)
                )
                if profile["has_personal_signals"]:
                    probability = clamp_probability(0.42 + (raw_probability * 0.78))
                else:
                    probability = clamp_probability(0.50 + (raw_probability * 0.38))

            probabilities.append(probability)
            member_matches.append(
                {
                    "user_id": int(profile["user_id"]),
                    "username": str(profile["username"]),
                    "probability": round(probability, 3),
                    "percent": int(round(probability * 100)),
                    "has_seen": rating is not None,
                    "rating": float(rating) if rating is not None else None,
                }
            )

        if not probabilities:
            continue

        average_probability = float(sum(probabilities) / len(probabilities))
        minimum_probability = min(probabilities)
        score_spread = float(np.std(probabilities))
        seen_ratio = len(seen_entries) / max(len(group_profiles), 1)

        group_score = (
            (minimum_probability * 0.56)
            + (average_probability * 0.34)
            + (float(quality_scores[movie_index]) * 0.08)
            - (score_spread * 0.10)
            - (seen_ratio * 0.05 if include_seen else 0.0)
        )
        candidate_scores.append((
            normalized_movie_id,
            group_score,
            minimum_probability,
            average_probability,
            member_matches,
        ))

    candidate_scores.sort(key=lambda item: (item[1], item[2], item[3]), reverse=True)
    ranked_ids = [movie_id for movie_id, _score, _minimum, _average, _matches in candidate_scores]
    group_match_by_movie_id = {
        movie_id: {
            "group_score": group_score,
            "minimum_probability": minimum_probability,
            "average_probability": average_probability,
            "member_matches": member_matches,
        }
        for movie_id, group_score, minimum_probability, average_probability, member_matches in candidate_scores
    }
    selected_ids = pick_diverse_movie_ids(ranked_ids, limit, per_genre_cap=2 if len(group_profiles) >= 3 else 3)
    if not selected_ids:
        selected_ids = ranked_ids[:limit]
    poster_urls_by_movie_id = fetch_posters_from_tmdb(selected_ids[:limit])

    selected_rows = movies_df[movies_df["id"].isin(selected_ids)].copy()
    selected_rows["selection_rank"] = selected_rows["id"].apply(
        lambda movie_id: selected_ids.index(int(movie_id))
    )
    selected_rows = selected_rows.sort_values("selection_rank")

    return [
        {
            "id": int(row["id"]),
            "title": str(row["title"]),
            "poster_url": poster_urls_by_movie_id.get(int(row["id"])) or fetch_poster_from_tmdb(int(row["id"])),
            "rating": float(row["vote_average"]),
            "primary_genre": str(row.get("primary_genre") or "Autres"),
            "group_match_score": int(round(group_match_by_movie_id[int(row["id"])]["minimum_probability"] * 100)),
            "group_average_score": int(round(group_match_by_movie_id[int(row["id"])]["average_probability"] * 100)),
            "group_member_scores": group_match_by_movie_id[int(row["id"])]["member_matches"],
            "seen_by": rated_by_movie_id.get(int(row["id"]), []),
            "recommendation_reason": build_group_recommendation_reason(
                probabilities=[
                    float(match["probability"])
                    for match in group_match_by_movie_id[int(row["id"])]["member_matches"]
                ],
                primary_genre=str(row.get("primary_genre") or "Autres"),
                seen_count=len(rated_by_movie_id.get(int(row["id"]), [])),
            ),
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
    hidden_user_ids = get_hidden_user_ids(cursor, current_user["id"])
    query_sql = """
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
                WHERE f.follower_id = {param} AND f.followed_id = u.id
            ) AS is_following
        FROM users u
        WHERE u.id != {param}
          AND ({param} = '' OR lower(u.username) LIKE lower({param}))
    """.format(param=SQL_PARAM)
    query_params: tuple = (
        current_user["id"],
        current_user["id"],
        search_value,
        f"%{search_value}%",
    )
    if hidden_user_ids:
        placeholders = sql_placeholders(len(hidden_user_ids))
        query_sql += f" AND u.id NOT IN ({placeholders})"
        query_params = (*query_params, *hidden_user_ids)

    query_sql += """
        ORDER BY reviews_count DESC, followers_count DESC, u.username ASC
        LIMIT {param}
    """.format(param=SQL_PARAM)
    query_params = (*query_params, safe_limit)
    cursor.execute(query_sql, query_params)
    users = [serialize_user_row(row) for row in cursor.fetchall()]
    conn.close()
    return users


@app.get("/social/group-recommendations")
def social_group_recommendations(
    user_ids: str = "",
    limit: int = 12,
    include_seen: bool = False,
    current_user: dict = Depends(get_current_user),
):
    selected_user_ids = list(parse_exclude_ids(user_ids))
    safe_limit = max(4, min(limit, 24))
    if not selected_user_ids:
        raise HTTPException(status_code=400, detail="Aucun profil selectionne")

    return build_group_recommendations(
        current_user_id=current_user["id"],
        selected_user_ids=selected_user_ids,
        limit=safe_limit,
        include_seen=include_seen,
    )


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
                WHERE f.follower_id = {param} AND f.followed_id = u.id
            ) AS is_following
        FROM users u
        WHERE lower(u.username) = lower({param})
        """.format(param=SQL_PARAM),
        (current_user["id"], profile_username),
    )
    profile_row = cursor.fetchone()
    if not profile_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Profil introuvable")
    if is_hidden_user_relationship(cursor, current_user["id"], int(profile_row["id"])):
        conn.close()
        raise HTTPException(status_code=404, detail="Profil introuvable")

    reviews = fetch_serialized_reviews(
        cursor,
        current_user["id"],
        f"r.user_id = {SQL_PARAM}",
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
    cursor.execute(f"SELECT id FROM users WHERE id = {SQL_PARAM}", (target_user_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    ensure_user_interaction_allowed(cursor, current_user["id"], target_user_id)

    cursor.execute(
        """
        INSERT INTO follows (follower_id, followed_id)
        VALUES ({param}, {param})
        ON CONFLICT(follower_id, followed_id) DO NOTHING
        """.format(param=SQL_PARAM),
        (current_user["id"], target_user_id),
    )
    should_notify = cursor.rowcount > 0
    conn.commit()
    conn.close()
    if should_notify:
        conn = get_db_connection()
        cursor = conn.cursor()
        create_notification(cursor, target_user_id, current_user["id"], "follow")
        conn.commit()
        conn.close()
        enqueue_push_notifications(
            [target_user_id],
            title="Nouveau follower",
            body=f"@{current_user['username']} s'est abonné à toi",
            route="/social",
            extra_data={"type": "follow"},
        )
    return {"status": "followed"}


@app.delete("/social/follow/{target_user_id}")
def unfollow_user(target_user_id: int, current_user: dict = Depends(get_current_user)):
    if target_user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Action invalide")

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        f"DELETE FROM follows WHERE follower_id = {SQL_PARAM} AND followed_id = {SQL_PARAM}",
        (current_user["id"], target_user_id),
    )
    conn.commit()
    conn.close()
    return {"status": "unfollowed"}


@app.get("/social/blocks")
def social_blocks(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    blocked_users = fetch_blocked_user_summaries(cursor, current_user["id"])
    conn.close()
    return blocked_users


@app.post("/social/block/{target_user_id}")
def block_user(target_user_id: int, current_user: dict = Depends(get_current_user)):
    if target_user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Action invalide")

    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    cursor.execute(f"SELECT id FROM users WHERE id = {SQL_PARAM}", (target_user_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    cursor.execute(
        """
        INSERT INTO blocked_users (blocker_id, blocked_id)
        VALUES ({param}, {param})
        ON CONFLICT(blocker_id, blocked_id) DO NOTHING
        """.format(param=SQL_PARAM),
        (current_user["id"], target_user_id),
    )
    cursor.execute(
        f"DELETE FROM follows WHERE (follower_id = {SQL_PARAM} AND followed_id = {SQL_PARAM}) OR (follower_id = {SQL_PARAM} AND followed_id = {SQL_PARAM})",
        (current_user["id"], target_user_id, target_user_id, current_user["id"]),
    )
    conn.commit()
    conn.close()
    return {"status": "blocked"}


@app.delete("/social/block/{target_user_id}")
def unblock_user(target_user_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        f"DELETE FROM blocked_users WHERE blocker_id = {SQL_PARAM} AND blocked_id = {SQL_PARAM}",
        (current_user["id"], target_user_id),
    )
    conn.commit()
    conn.close()
    return {"status": "unblocked"}


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
        VALUES ({param}, {param}, {param}, {param}, 1)
        ON CONFLICT(token) DO UPDATE SET
            user_id = excluded.user_id,
            platform = excluded.platform,
            app_version = excluded.app_version,
            is_active = 1,
            updated_at = CURRENT_TIMESTAMP
        """.format(param=SQL_PARAM),
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
        WHERE user_id = {param} AND token = {param}
        """.format(param=SQL_PARAM),
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
        VALUES ({param}, {param}, {param}, {param}, 1)
        ON CONFLICT(endpoint) DO UPDATE SET
            user_id = excluded.user_id,
            subscription_json = excluded.subscription_json,
            user_agent = excluded.user_agent,
            is_active = 1,
            updated_at = CURRENT_TIMESTAMP
        """.format(param=SQL_PARAM),
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
        WHERE user_id = {param} AND endpoint = {param}
        """.format(param=SQL_PARAM),
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
        r.user_id = {param}
        OR r.user_id IN (
            SELECT followed_id
            FROM follows
            WHERE follower_id = {param}
        )
        """.format(param=SQL_PARAM),
        (current_user["id"], current_user["id"]),
        safe_limit,
    )
    conn.close()
    return reviews


@app.get("/social/reviews/{review_id}")
def get_social_review(review_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    reviews = fetch_serialized_reviews(cursor, current_user["id"], f"r.id = {SQL_PARAM}", (review_id,), 1)
    conn.close()
    if not reviews:
        raise HTTPException(status_code=404, detail="Critique introuvable")
    return reviews[0]


@app.post("/social/reviews")
def create_review(review: ReviewCreate, current_user: dict = Depends(get_current_user)):
    review_title = review.title.strip()
    review_content = review.content.strip()
    poster_url = review.poster_url.strip()
    review_rating = round(float(review.rating) * 2) / 2

    if review_rating < 0.5 or review_rating > 5:
        raise HTTPException(status_code=400, detail="La note doit être comprise entre 0,5 et 5")
    if len(review_title) < 1:
        raise HTTPException(status_code=400, detail="Le titre du film est requis")
    if len(review_content) < 1:
        raise HTTPException(status_code=400, detail="La critique ne peut pas être vide")
    ensure_clean_ugc_text(review_title)
    ensure_clean_ugc_text(review_content)

    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    review_id = execute_insert_and_get_id(
        cursor,
        """
        INSERT INTO reviews (user_id, movie_id, title, poster_url, rating, content)
        VALUES ({param}, {param}, {param}, {param}, {param}, {param})
        """.format(param=SQL_PARAM),
        (
            current_user["id"],
            review.movie_id,
            review_title,
            poster_url,
            review_rating,
            review_content,
        ),
    )
    cursor.execute(
        """
        INSERT INTO user_ratings (user_id, movie_id, rating, title, poster_url)
        VALUES ({param}, {param}, {param}, {param}, {param})
        ON CONFLICT(user_id, movie_id) DO UPDATE SET
            rating = EXCLUDED.rating,
            title = EXCLUDED.title,
            poster_url = EXCLUDED.poster_url,
            added_at = CURRENT_TIMESTAMP
        """.format(param=SQL_PARAM),
        (
            current_user["id"],
            review.movie_id,
            review_rating,
            review_title,
            poster_url,
        ),
    )
    cursor.execute(
        f"SELECT follower_id FROM follows WHERE followed_id = {SQL_PARAM}",
        (current_user["id"],),
    )
    follower_ids: list[int] = []
    for follower_row in cursor.fetchall():
        follower_id = int(follower_row["follower_id"])
        follower_ids.append(follower_id)
        create_notification(
            cursor,
            follower_id,
            current_user["id"],
            "review",
            review_id=review_id,
        )
    conn.commit()
    enqueue_push_notifications(
        follower_ids,
        title="Nouvelle critique",
        body=f"@{current_user['username']} a publié une critique sur {review_title}",
        route="/social",
        extra_data={"type": "review", "reviewId": review_id},
    )

    created_reviews = fetch_serialized_reviews(
        cursor,
        current_user["id"],
        f"r.id = {SQL_PARAM}",
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
    review_rating = round(float(payload.rating) * 2) / 2

    if review_rating < 0.5 or review_rating > 5:
        raise HTTPException(status_code=400, detail="La note doit être comprise entre 0,5 et 5")
    if len(review_content) < 1:
        raise HTTPException(status_code=400, detail="La critique ne peut pas être vide")
    ensure_clean_ugc_text(review_content)

    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT movie_id, title, poster_url
        FROM reviews
        WHERE id = {param} AND user_id = {param}
        """.format(param=SQL_PARAM),
        (review_id, current_user["id"]),
    )
    review_row = cursor.fetchone()
    if not review_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Critique introuvable")

    cursor.execute(
        """
        UPDATE reviews
        SET rating = {param}, content = {param}
        WHERE id = {param} AND user_id = {param}
        """.format(param=SQL_PARAM),
        (review_rating, review_content, review_id, current_user["id"]),
    )
    cursor.execute(
        """
        INSERT INTO user_ratings (user_id, movie_id, rating, title, poster_url)
        VALUES ({param}, {param}, {param}, {param}, {param})
        ON CONFLICT(user_id, movie_id) DO UPDATE SET
            rating = EXCLUDED.rating,
            title = EXCLUDED.title,
            poster_url = EXCLUDED.poster_url,
            added_at = CURRENT_TIMESTAMP
        """.format(param=SQL_PARAM),
        (
            current_user["id"],
            review_row["movie_id"],
            review_rating,
            review_row["title"],
            review_row["poster_url"],
        ),
    )
    conn.commit()

    updated_reviews = fetch_serialized_reviews(
        cursor,
        current_user["id"],
        f"r.id = {SQL_PARAM}",
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
        f"SELECT id FROM reviews WHERE id = {SQL_PARAM} AND user_id = {SQL_PARAM}",
        (review_id, current_user["id"]),
    )
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Critique introuvable")

    cursor.execute(f"DELETE FROM notifications WHERE review_id = {SQL_PARAM}", (review_id,))
    cursor.execute(f"DELETE FROM comments WHERE review_id = {SQL_PARAM}", (review_id,))
    cursor.execute(f"DELETE FROM review_likes WHERE review_id = {SQL_PARAM}", (review_id,))
    cursor.execute(
        f"DELETE FROM reviews WHERE id = {SQL_PARAM} AND user_id = {SQL_PARAM}",
        (review_id, current_user["id"]),
    )
    conn.commit()
    conn.close()
    return {"status": "deleted"}


@app.get("/social/reviews/{review_id}/comments")
def social_review_comments(review_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    cursor.execute(f"SELECT 1 FROM reviews WHERE id = {SQL_PARAM}", (review_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Critique introuvable")

    comments = fetch_review_comments(cursor, review_id, current_user["id"])
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
    ensure_clean_ugc_text(content)

    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    cursor.execute(
        f"SELECT id, user_id FROM reviews WHERE id = {SQL_PARAM}",
        (review_id,),
    )
    review_row = cursor.fetchone()
    if not review_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Critique introuvable")

    parent_user_id = None
    if payload.parent_id is not None:
        cursor.execute(
            f"SELECT id, user_id FROM comments WHERE id = {SQL_PARAM} AND review_id = {SQL_PARAM}",
            (payload.parent_id, review_id),
        )
        parent_row = cursor.fetchone()
        if not parent_row:
            conn.close()
            raise HTTPException(status_code=400, detail="Réponse invalide")
        parent_user_id = int(parent_row["user_id"])

    comment_id = execute_insert_and_get_id(
        cursor,
        """
        INSERT INTO comments (review_id, user_id, parent_id, content)
        VALUES ({param}, {param}, {param}, {param})
        """.format(param=SQL_PARAM),
        (review_id, current_user["id"], payload.parent_id, content),
    )

    review_owner_id = int(review_row["user_id"])
    ensure_user_interaction_allowed(cursor, current_user["id"], review_owner_id)
    review_notification_targets: list[int] = []
    reply_notification_targets: list[int] = []
    if review_owner_id != current_user["id"]:
        create_notification(
            cursor,
            review_owner_id,
            current_user["id"],
            "comment",
            review_id=review_id,
            comment_id=comment_id,
        )
        review_notification_targets.append(review_owner_id)

    if parent_user_id is not None and parent_user_id not in (current_user["id"], review_owner_id):
        create_notification(
            cursor,
            parent_user_id,
            current_user["id"],
            "reply",
            review_id=review_id,
            comment_id=comment_id,
        )
        reply_notification_targets.append(parent_user_id)

    conn.commit()
    if review_notification_targets:
        enqueue_push_notifications(
            review_notification_targets,
            title="Nouveau commentaire",
            body=f"@{current_user['username']} a commenté ta critique",
            route="/social",
            extra_data={"type": "comment", "reviewId": review_id, "commentId": comment_id},
        )
    if reply_notification_targets:
        enqueue_push_notifications(
            reply_notification_targets,
            title="Nouvelle réponse",
            body=f"@{current_user['username']} a répondu à ton commentaire",
            route="/social",
            extra_data={"type": "reply", "reviewId": review_id, "commentId": comment_id},
        )
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
        WHERE c.id = {param}
        """.format(param=SQL_PARAM),
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
    cursor.execute(f"SELECT user_id, title FROM reviews WHERE id = {SQL_PARAM}", (review_id,))
    review_row = cursor.fetchone()
    if not review_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Critique introuvable")
    review_owner_id = int(review_row["user_id"])
    review_title = str(review_row["title"] or "ce film")
    ensure_user_interaction_allowed(cursor, current_user["id"], review_owner_id)

    cursor.execute(
        f"SELECT 1 FROM review_likes WHERE review_id = {SQL_PARAM} AND user_id = {SQL_PARAM}",
        (review_id, current_user["id"]),
    )
    already_liked = cursor.fetchone() is not None

    if already_liked:
        cursor.execute(
            f"DELETE FROM review_likes WHERE review_id = {SQL_PARAM} AND user_id = {SQL_PARAM}",
            (review_id, current_user["id"]),
        )
    else:
        cursor.execute(
            f"INSERT INTO review_likes (review_id, user_id) VALUES ({SQL_PARAM}, {SQL_PARAM})",
            (review_id, current_user["id"]),
        )
        create_notification(cursor, review_owner_id, current_user["id"], "like", review_id=review_id)

    conn.commit()
    if not already_liked:
        enqueue_push_notifications(
            [review_owner_id],
            title="Critique aimée",
            body=f"@{current_user['username']} a aimé ta critique sur {review_title}",
            route="/social",
            extra_data={"type": "like", "reviewId": review_id},
        )
    cursor.execute(
        f"SELECT COUNT(*) FROM review_likes WHERE review_id = {SQL_PARAM}",
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
        f"UPDATE notifications SET is_read = 1 WHERE user_id = {SQL_PARAM} AND is_read = 0",
        (current_user["id"],),
    )
    updated_count = cursor.rowcount
    conn.commit()
    conn.close()
    return {"status": "ok", "updated": updated_count}


@app.post("/social/notifications/{notification_id}/read")
def social_notification_read(notification_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        f"UPDATE notifications SET is_read = 1 WHERE id = {SQL_PARAM} AND user_id = {SQL_PARAM} AND is_read = 0",
        (notification_id, current_user["id"]),
    )
    updated_count = cursor.rowcount
    conn.commit()
    conn.close()
    return {"status": "ok", "updated": updated_count}


@app.post("/social/reports/user/{target_user_id}")
def report_social_user(
    target_user_id: int,
    payload: ModerationReportPayload,
    current_user: dict = Depends(get_current_user),
):
    if target_user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Action invalide")

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(f"SELECT id FROM users WHERE id = {SQL_PARAM}", (target_user_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    insert_moderation_report(
        cursor,
        reporter_user_id=current_user["id"],
        target_user_id=target_user_id,
        reason=payload.reason,
        details=payload.details,
    )
    conn.commit()
    conn.close()
    return {"status": "reported"}


@app.post("/social/reports/review/{review_id}")
def report_social_review(
    review_id: int,
    payload: ModerationReportPayload,
    current_user: dict = Depends(get_current_user),
):
    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    cursor.execute(f"SELECT id, user_id FROM reviews WHERE id = {SQL_PARAM}", (review_id,))
    review_row = cursor.fetchone()
    if not review_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Critique introuvable")

    insert_moderation_report(
        cursor,
        reporter_user_id=current_user["id"],
        target_user_id=int(review_row["user_id"]),
        target_review_id=review_id,
        reason=payload.reason,
        details=payload.details,
    )
    conn.commit()
    conn.close()
    return {"status": "reported"}


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
    cursor.execute(f"SELECT id FROM users WHERE id = {SQL_PARAM}", (target_user_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    ensure_user_interaction_allowed(cursor, current_user["id"], target_user_id)

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
def get_direct_conversation_messages(
    conversation_id: int,
    limit: int = 40,
    before_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
):
    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    conversation_row = get_direct_conversation_for_user(cursor, conversation_id, current_user["id"])
    safe_limit = max(1, min(limit, 100))

    before_filter = f"AND dm.id < {SQL_PARAM}" if before_id is not None else ""
    query_params: tuple[Any, ...] = (conversation_id, before_id, safe_limit) if before_id is not None else (conversation_id, safe_limit)

    cursor.execute(
        """
        SELECT *
        FROM (
            SELECT
                dm.id,
                dm.content,
                dm.created_at,
                dm.sender_id,
                sender.username AS sender_username,
                dm.movie_id,
                dm.movie_title,
                dm.movie_poster_url,
                dm.movie_rating,
                dm.reply_to_message_id,
                reply_dm.id AS reply_message_id,
                reply_dm.content AS reply_message_content,
                reply_dm.sender_id AS reply_sender_id,
                reply_sender.username AS reply_sender_username,
                reply_dm.movie_id AS reply_movie_id,
                reply_dm.movie_title AS reply_movie_title,
                reply_dm.movie_poster_url AS reply_movie_poster_url,
                reply_dm.movie_rating AS reply_movie_rating
            FROM direct_messages dm
            JOIN users sender ON sender.id = dm.sender_id
            LEFT JOIN direct_messages reply_dm ON reply_dm.id = dm.reply_to_message_id
            LEFT JOIN users reply_sender ON reply_sender.id = reply_dm.sender_id
            WHERE dm.conversation_id = {param}
            {before_filter}
            ORDER BY dm.id DESC
            LIMIT {param}
        ) ordered_messages
        ORDER BY id ASC
        """.format(param=SQL_PARAM, before_filter=before_filter),
        query_params,
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


@app.post("/messages/conversations/{conversation_id}/read")
def mark_direct_conversation_as_read(
    conversation_id: int,
    current_user: dict = Depends(get_current_user),
):
    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    conversation_row = get_direct_conversation_for_user(cursor, conversation_id, current_user["id"])
    mark_direct_conversation_read(cursor, conversation_row, current_user["id"])
    conn.commit()
    conn.close()
    return {"status": "ok"}


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
    reply_to_message_id = payload.reply_to_message_id

    if movie_id is not None and (not movie_title or not movie_poster_url):
        details = get_tmdb_details(movie_id)
        if details:
            movie_title = details["title"]
            movie_poster_url = details["poster_url"]
            movie_rating = details["rating"]

    if not content and movie_id is None:
        raise HTTPException(status_code=400, detail="Le message ne peut pas être vide")
    ensure_clean_ugc_text(content)

    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    conversation_row = get_direct_conversation_for_user(cursor, conversation_id, current_user["id"])
    ensure_user_interaction_allowed(cursor, current_user["id"], int(conversation_row["participant_id"]))

    if reply_to_message_id is not None:
        cursor.execute(
            """
            SELECT id
            FROM direct_messages
            WHERE id = {param} AND conversation_id = {param}
            """.format(param=SQL_PARAM),
            (reply_to_message_id, conversation_id),
        )
        if not cursor.fetchone():
            conn.close()
            raise HTTPException(status_code=400, detail="Réponse invalide")

    message_id = execute_insert_and_get_id(
        cursor,
        """
        INSERT INTO direct_messages (
            conversation_id,
            sender_id,
            content,
            movie_id,
            movie_title,
            movie_poster_url,
            movie_rating,
            reply_to_message_id
        )
        VALUES ({param}, {param}, {param}, {param}, {param}, {param}, {param}, {param})
        """.format(param=SQL_PARAM),
        (
            conversation_id,
            current_user["id"],
            content,
            movie_id,
            movie_title or None,
            movie_poster_url or None,
            movie_rating,
            reply_to_message_id,
        ),
    )

    if conversation_row["user_one_id"] == current_user["id"]:
        cursor.execute(
            f"UPDATE direct_conversations SET user_one_last_read_message_id = {SQL_PARAM} WHERE id = {SQL_PARAM}",
            (message_id, conversation_id),
        )
    else:
        cursor.execute(
            f"UPDATE direct_conversations SET user_two_last_read_message_id = {SQL_PARAM} WHERE id = {SQL_PARAM}",
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
            dm.movie_rating,
            reply_dm.id AS reply_message_id,
            reply_dm.content AS reply_message_content,
            reply_dm.sender_id AS reply_sender_id,
            reply_sender.username AS reply_sender_username,
            reply_dm.movie_id AS reply_movie_id,
            reply_dm.movie_title AS reply_movie_title,
            reply_dm.movie_poster_url AS reply_movie_poster_url,
            reply_dm.movie_rating AS reply_movie_rating
        FROM direct_messages dm
        JOIN users sender ON sender.id = dm.sender_id
        LEFT JOIN direct_messages reply_dm ON reply_dm.id = dm.reply_to_message_id
        LEFT JOIN users reply_sender ON reply_sender.id = reply_dm.sender_id
        WHERE dm.id = {param}
        """.format(param=SQL_PARAM),
        (message_id,),
    )
    message_row = cursor.fetchone()

    if not message_row:
        conn.close()
        raise HTTPException(status_code=500, detail="Impossible de relire le message créé")

    serialized_message = serialize_direct_message_row(message_row, current_user["id"])
    recipient_user_id = int(conversation_row["participant_id"])
    enqueue_push_notifications(
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
        include_web=True,
    )
    conn.close()
    await publish_realtime_event(
        [current_user["id"], recipient_user_id],
        {
            "type": "messages.updated",
            "conversation_id": conversation_id,
            "message_id": message_id,
            "message": serialized_message,
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


@app.post("/messages/reports/conversations/{conversation_id}")
def report_direct_conversation(
    conversation_id: int,
    payload: ModerationReportPayload,
    current_user: dict = Depends(get_current_user),
):
    conn = get_db_connection(row_factory=True)
    cursor = conn.cursor()
    conversation_row = get_direct_conversation_for_user(cursor, conversation_id, current_user["id"])
    insert_moderation_report(
        cursor,
        reporter_user_id=current_user["id"],
        target_user_id=int(conversation_row["participant_id"]),
        target_conversation_id=conversation_id,
        reason=payload.reason,
        details=payload.details,
    )
    conn.commit()
    conn.close()
    return {"status": "reported"}


async def consume_realtime_websocket(websocket: WebSocket):
    while True:
        await websocket.receive_text()


@app.websocket("/ws/realtime")
async def realtime_websocket(websocket: WebSocket, token: str = Query(...)):
    try:
        user = get_user_from_token(token)
    except HTTPException:
        await websocket.close(code=1008)
        return

    queue = await realtime_manager.connect(user["id"], websocket)
    receive_task = asyncio.create_task(consume_realtime_websocket(websocket))
    try:
        while True:
            send_task = asyncio.create_task(queue.get())
            done, pending = await asyncio.wait(
                {receive_task, send_task},
                return_when=asyncio.FIRST_COMPLETED,
            )

            if receive_task in done:
                receive_task.result()

            if send_task in done:
                await websocket.send_json(serialize_json_safe(send_task.result()))
            else:
                send_task.cancel()
                with suppress(asyncio.CancelledError):
                    await send_task
    except WebSocketDisconnect:
        realtime_manager.disconnect(user["id"], queue)
    except Exception:
        logger.exception("Realtime websocket ferme sur erreur.")
        realtime_manager.disconnect(user["id"], queue)
    finally:
        receive_task.cancel()
        with suppress(asyncio.CancelledError):
            await receive_task


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
    details = get_tmdb_details(id)
    if not details:
        raise HTTPException(status_code=502, detail="Impossible de charger cette fiche film pour le moment.")
    return details


@app.get("/person/{person_id}")
def person_detail(person_id: int, current_user: dict = Depends(get_current_user)):
    person = get_tmdb_person_details(int(person_id))
    if not person:
        raise HTTPException(status_code=404, detail="Personne introuvable.")
    return person


@app.get("/mobile-trailer-player.html")
def mobile_trailer_player():
    return FileResponse(
        MOBILE_TRAILER_PLAYER_PATH,
        media_type="text/html",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@app.get("/support", response_class=HTMLResponse)
def support_page():
    return """<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Qulte - Support</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0b0b10;
        --panel: rgba(255,255,255,0.06);
        --border: rgba(255,255,255,0.12);
        --text: #f6f1eb;
        --muted: #d0c4bc;
        --accent: #f1788f;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top right, rgba(241,120,143,0.18), transparent 34%),
          radial-gradient(circle at bottom left, rgba(120,164,255,0.12), transparent 32%),
          var(--bg);
        color: var(--text);
        line-height: 1.6;
      }
      main {
        width: min(860px, calc(100% - 32px));
        margin: 0 auto;
        padding: 40px 0 72px;
      }
      .card {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 28px;
        padding: 24px;
        backdrop-filter: blur(18px);
      }
      h1, h2 { line-height: 1.15; margin: 0 0 14px; }
      h1 { font-size: clamp(2rem, 5vw, 3.4rem); }
      h2 { font-size: 1.1rem; margin-top: 26px; }
      p { margin: 0 0 14px; color: var(--muted); }
      ul { margin: 0; padding-left: 20px; color: var(--muted); }
      li + li { margin-top: 8px; }
      a { color: var(--accent); text-decoration: none; }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: 1px solid rgba(241,120,143,0.24);
        border-radius: 999px;
        padding: 8px 12px;
        margin-bottom: 16px;
        color: var(--text);
      }
    </style>
  </head>
  <body>
    <main>
      <div class="card">
        <div class="eyebrow">Qulte · Support</div>
        <h1>Besoin d'aide ?</h1>
        <p>Cette page de support concerne l'application mobile Qulte, disponible sur iPhone. Si tu rencontres un bug, un problème d'accès à ton compte, un souci lié aux messages, aux notifications ou à la gestion de ton profil, tu peux nous contacter directement.</p>

        <h2>Contacter l'équipe</h2>
        <p>Email de support : <a href="mailto:qulte.developpeur@gmail.com">qulte.developpeur@gmail.com</a></p>
        <p>Nous faisons le maximum pour répondre dans les meilleurs délais, en particulier pour les demandes liées à la sécurité du compte, aux contenus signalés ou à la suppression de données.</p>

        <h2>Dans ton message, indique si possible</h2>
        <ul>
          <li>le modèle de ton iPhone et la version iOS ;</li>
          <li>le nom de ton compte Qulte ;</li>
          <li>une description claire du problème ;</li>
          <li>les étapes pour reproduire le bug ;</li>
          <li>une capture d'écran si cela peut aider.</li>
        </ul>

        <h2>Compte, données et modération</h2>
        <p>Depuis l'application, tu peux gérer ton compte, modifier ton profil et demander la suppression de ton compte. Si un contenu te semble inapproprié ou si tu rencontres un problème avec un autre utilisateur, utilise les outils de signalement ou écris-nous directement.</p>

        <h2>Service</h2>
        <p>Qulte évolue régulièrement. Certaines fonctionnalités peuvent être temporairement indisponibles pendant une maintenance, une mise à jour ou une intervention technique. Lorsqu'un incident important est identifié, nous faisons le nécessaire pour rétablir le service aussi vite que possible.</p>
      </div>
    </main>
  </body>
</html>"""


@app.get("/privacy", response_class=HTMLResponse)
def privacy_page():
    return """<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Qulte - Politique de confidentialité</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0b0b10;
        --panel: rgba(255,255,255,0.06);
        --border: rgba(255,255,255,0.12);
        --text: #f6f1eb;
        --muted: #d0c4bc;
        --accent: #f1788f;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top right, rgba(241,120,143,0.18), transparent 34%),
          radial-gradient(circle at bottom left, rgba(120,164,255,0.12), transparent 32%),
          var(--bg);
        color: var(--text);
        line-height: 1.65;
      }
      main {
        width: min(900px, calc(100% - 32px));
        margin: 0 auto;
        padding: 40px 0 72px;
      }
      .card {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 28px;
        padding: 24px;
        backdrop-filter: blur(18px);
      }
      h1, h2 { line-height: 1.15; margin: 0 0 14px; }
      h1 { font-size: clamp(2rem, 5vw, 3.2rem); }
      h2 { font-size: 1.1rem; margin-top: 26px; }
      p { margin: 0 0 14px; color: var(--muted); }
      ul { margin: 0 0 14px; padding-left: 20px; color: var(--muted); }
      li + li { margin-top: 8px; }
      a { color: var(--accent); text-decoration: none; }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: 1px solid rgba(241,120,143,0.24);
        border-radius: 999px;
        padding: 8px 12px;
        margin-bottom: 16px;
        color: var(--text);
      }
    </style>
  </head>
  <body>
    <main>
      <div class="card">
        <div class="eyebrow">Qulte · Confidentialité</div>
        <h1>Politique de confidentialité</h1>
        <p>Qulte est une application mobile consacrée à la recommandation de films, à la création de playlists, aux critiques et aux interactions sociales entre utilisateurs. Cette politique explique de manière générale quelles données peuvent être traitées dans le cadre du service et dans quel but.</p>

        <h2>Données pouvant être traitées</h2>
        <ul>
          <li>données de compte, comme ton nom d'utilisateur et tes informations d'authentification ;</li>
          <li>contenus que tu publies dans l'application, comme tes critiques, commentaires, messages et éléments de profil ;</li>
          <li>interactions fonctionnelles, comme tes notes, playlists, films mis de côté, suivis, likes et notifications ;</li>
          <li>données techniques minimales nécessaires au bon fonctionnement et à la sécurité du service.</li>
        </ul>

        <h2>Finalités</h2>
        <p>Ces données sont utilisées pour fournir les fonctionnalités essentielles de Qulte, personnaliser l'expérience de recommandation, permettre les échanges entre utilisateurs, prévenir les abus, assurer la sécurité du service et améliorer la stabilité de l'application.</p>

        <h2>Partage et sous-traitance</h2>
        <p>Qulte peut s'appuyer sur des services techniques tiers indispensables au fonctionnement du produit, notamment pour l'hébergement, la diffusion de notifications ou l'accès à des données cinéma. Les données ne sont pas vendues en tant que telles à des tiers à des fins publicitaires externes.</p>

        <h2>Suppression et droits</h2>
        <p>Depuis l'application, tu peux demander la suppression de ton compte. Si tu souhaites exercer un droit d'accès, de rectification ou de suppression concernant tes données, tu peux également nous contacter à l'adresse suivante : <a href="mailto:qulte.developpeur@gmail.com">qulte.developpeur@gmail.com</a>.</p>

        <h2>Sécurité</h2>
        <p>Des mesures raisonnables sont mises en œuvre pour protéger les comptes, les données et l'intégrité du service. Aucune solution technique n'offrant une sécurité absolue, nous encourageons aussi les utilisateurs à choisir un mot de passe robuste et à nous signaler rapidement tout comportement suspect.</p>

        <h2>Mises à jour</h2>
        <p>Cette politique peut évoluer pour refléter les changements du service, de l'infrastructure ou des obligations applicables. La version publiée sur cette page fait foi pour les informations générales communiquées aux utilisateurs et à Apple dans le cadre de la distribution de l'application.</p>
      </div>
    </main>
  </body>
</html>"""

@app.get("/movies/news")
def news():
    url = f"https://api.themoviedb.org/3/movie/now_playing?api_key={TMDB_API_KEY}&language=fr-FR&page=1"
    res = requests.get(url).json().get('results', [])[:10]
    return [{"id": m['id'], "title": m['title'], "poster_url": "https://image.tmdb.org/t/p/w500"+m.get('poster_path', ""), "rating": m['vote_average'], "overview": m['overview']} for m in res]

@app.post("/movies/dislike/{movie_id}")
def dislike_movie(movie_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        f"SELECT 1 FROM user_ratings WHERE user_id = {SQL_PARAM} AND movie_id = {SQL_PARAM} LIMIT 1",
        (current_user["id"], movie_id),
    )
    if cursor.fetchone():
        conn.close()
        return {"status": "skipped_rated"}

    mark_recommendation_reaction(
        cursor,
        current_user["id"],
        movie_id,
        "pass",
    )
    conn.commit()
    conn.close()
    return {"status": "passed"}


@app.delete("/movies/dislike/{movie_id}")
def undo_dislike_movie(movie_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    mark_recommendation_reaction(
        cursor,
        current_user["id"],
        movie_id,
        "undo_pass",
    )
    conn.commit()
    conn.close()
    return {"status": "removed"}


def mount_reliure_api():
    reliure_main_path = os.getenv(
        "RELIURE_BACKEND_MAIN",
        "/home/wechoose/reliure/backend/main.py",
    )
    if not os.path.exists(reliure_main_path):
        return

    spec = importlib.util.spec_from_file_location("reliure_backend_main", reliure_main_path)
    if not spec or not spec.loader:
        return

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    reliure_app = getattr(module, "app", None)
    if reliure_app is not None:
        app.mount("/reliure", reliure_app)


mount_reliure_api()
