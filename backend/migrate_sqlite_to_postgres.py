#!/usr/bin/env python3
"""Migrate Qulte backend data from SQLite to PostgreSQL.

This script is intentionally standalone so we can prepare and validate a
controlled cutover before switching the live API runtime to PostgreSQL.
"""

from __future__ import annotations

import argparse
import os
import sqlite3
from pathlib import Path

import psycopg
from psycopg.rows import dict_row


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_SQLITE_PATH = os.getenv("SQLITE_PATH", str(BASE_DIR / "wechoose.db"))
DEFAULT_POSTGRES_URL = os.getenv("POSTGRES_URL", "").strip()
SCHEMA_PATH = BASE_DIR / "postgres_schema.sql"

TABLES_IN_ORDER: list[tuple[str, list[str], bool]] = [
    ("users", ["id", "username", "password_hash", "avatar_url"], True),
    (
        "user_preferences",
        [
            "user_id",
            "favorite_genres",
            "favorite_people",
            "favorite_movie_ids",
            "people_seed_movie_ids",
            "onboarding_completed_at",
            "updated_at",
            "profile_genres",
            "profile_people",
            "profile_people_data",
            "profile_movie_ids",
            "profile_soundtrack",
            "profile_description",
            "tutorial_completed_at",
        ],
        False,
    ),
    ("user_ratings", ["user_id", "movie_id", "rating", "title", "poster_url", "added_at"], False),
    ("playlists", ["id", "user_id", "name"], True),
    ("playlist_items", ["playlist_id", "movie_id", "title", "poster_url", "rating", "added_at", "sort_index"], False),
    ("follows", ["follower_id", "followed_id", "created_at"], False),
    ("blocked_users", ["blocker_id", "blocked_id", "created_at"], False),
    ("reviews", ["id", "user_id", "movie_id", "title", "poster_url", "rating", "content", "created_at"], True),
    ("review_likes", ["review_id", "user_id", "created_at"], False),
    ("comments", ["id", "review_id", "user_id", "parent_id", "content", "created_at"], True),
    ("notifications", ["id", "user_id", "actor_user_id", "type", "review_id", "comment_id", "is_read", "created_at"], True),
    (
        "direct_conversations",
        ["id", "user_one_id", "user_two_id", "user_one_last_read_message_id", "user_two_last_read_message_id", "created_at"],
        True,
    ),
    (
        "direct_messages",
        ["id", "conversation_id", "sender_id", "content", "movie_id", "movie_title", "movie_poster_url", "movie_rating", "created_at", "reply_to_message_id"],
        True,
    ),
    ("mobile_devices", ["id", "user_id", "platform", "token", "app_version", "is_active", "created_at", "updated_at"], True),
    (
        "web_push_subscriptions",
        ["id", "user_id", "endpoint", "subscription_json", "user_agent", "is_active", "created_at", "updated_at"],
        True,
    ),
    ("app_settings", ["key", "value", "updated_at"], False),
    (
        "recommendation_impressions",
        [
            "id",
            "request_id",
            "user_id",
            "movie_id",
            "mode",
            "algorithm_variant",
            "rank",
            "reason",
            "seed_movie_id",
            "seed_title",
            "seed_similarity",
            "shown_at",
            "responded_at",
            "reaction_type",
            "reaction_rating",
        ],
        True,
    ),
    (
        "moderation_reports",
        [
            "id",
            "reporter_user_id",
            "target_user_id",
            "target_review_id",
            "target_comment_id",
            "target_conversation_id",
            "reason",
            "details",
            "created_at",
        ],
        True,
    ),
]

RESET_SEQUENCE_TABLES = [
    "users",
    "playlists",
    "reviews",
    "comments",
    "notifications",
    "direct_conversations",
    "direct_messages",
    "mobile_devices",
    "web_push_subscriptions",
    "recommendation_impressions",
    "moderation_reports",
]


def is_valid_fk(value, allowed_ids: set[int], *, allow_none: bool = False) -> bool:
    if value is None:
        return allow_none
    return int(value) in allowed_ids


def build_reference_sets(sqlite_conn: sqlite3.Connection) -> dict[str, set[int]]:
    cursor = sqlite_conn.cursor()
    references: dict[str, set[int]] = {}
    for table_name in [
        "users",
        "playlists",
        "reviews",
        "comments",
        "direct_conversations",
        "direct_messages",
    ]:
        cursor.execute(f"SELECT id FROM {table_name}")
        references[table_name] = {int(row[0]) for row in cursor.fetchall() if row[0] is not None}
    return references


def sanitize_row(table: str, row: tuple, columns: list[str], refs: dict[str, set[int]]) -> tuple | None:
    record = dict(zip(columns, row))

    if table == "user_preferences":
        return row if is_valid_fk(record["user_id"], refs["users"]) else None
    if table == "user_ratings":
        return row if is_valid_fk(record["user_id"], refs["users"]) else None
    if table == "playlists":
        return row if is_valid_fk(record["user_id"], refs["users"]) else None
    if table == "playlist_items":
        return row if is_valid_fk(record["playlist_id"], refs["playlists"]) else None
    if table in {"follows", "blocked_users"}:
        if not is_valid_fk(record["follower_id"] if table == "follows" else record["blocker_id"], refs["users"]):
            return None
        if not is_valid_fk(record["followed_id"] if table == "follows" else record["blocked_id"], refs["users"]):
            return None
        return row
    if table == "reviews":
        return row if is_valid_fk(record["user_id"], refs["users"]) else None
    if table == "review_likes":
        if not is_valid_fk(record["review_id"], refs["reviews"]):
            return None
        if not is_valid_fk(record["user_id"], refs["users"]):
            return None
        return row
    if table == "comments":
        if not is_valid_fk(record["review_id"], refs["reviews"]):
            return None
        if not is_valid_fk(record["user_id"], refs["users"]):
            return None
        if not is_valid_fk(record["parent_id"], refs["comments"], allow_none=True):
            record["parent_id"] = None
        return tuple(record[column] for column in columns)
    if table == "notifications":
        if not is_valid_fk(record["user_id"], refs["users"]):
            return None
        if not is_valid_fk(record["actor_user_id"], refs["users"], allow_none=True):
            record["actor_user_id"] = None
        if not is_valid_fk(record["review_id"], refs["reviews"], allow_none=True):
            record["review_id"] = None
        if not is_valid_fk(record["comment_id"], refs["comments"], allow_none=True):
            record["comment_id"] = None
        return tuple(record[column] for column in columns)
    if table == "direct_conversations":
        if not is_valid_fk(record["user_one_id"], refs["users"]):
            return None
        if not is_valid_fk(record["user_two_id"], refs["users"]):
            return None
        return row
    if table == "direct_messages":
        if not is_valid_fk(record["conversation_id"], refs["direct_conversations"]):
            return None
        if not is_valid_fk(record["sender_id"], refs["users"]):
            return None
        if not is_valid_fk(record["reply_to_message_id"], refs["direct_messages"], allow_none=True):
            record["reply_to_message_id"] = None
        return tuple(record[column] for column in columns)
    if table == "mobile_devices":
        return row if is_valid_fk(record["user_id"], refs["users"]) else None
    if table == "web_push_subscriptions":
        return row if is_valid_fk(record["user_id"], refs["users"]) else None
    if table == "recommendation_impressions":
        if not is_valid_fk(record["user_id"], refs["users"], allow_none=True):
            record["user_id"] = None
        return tuple(record[column] for column in columns)
    if table == "moderation_reports":
        for key, ref_name in [
            ("reporter_user_id", "users"),
            ("target_user_id", "users"),
            ("target_review_id", "reviews"),
            ("target_comment_id", "comments"),
            ("target_conversation_id", "direct_conversations"),
        ]:
            allow_none = key != "reporter_user_id"
            if not is_valid_fk(record[key], refs[ref_name], allow_none=allow_none):
                if allow_none:
                    record[key] = None
                else:
                    return None
        return tuple(record[column] for column in columns)

    return row


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Migrate Qulte SQLite data to PostgreSQL.")
    parser.add_argument("--sqlite-path", default=DEFAULT_SQLITE_PATH, help="Path to the SQLite database file.")
    parser.add_argument("--postgres-url", default=DEFAULT_POSTGRES_URL, help="PostgreSQL connection URL.")
    parser.add_argument("--schema-only", action="store_true", help="Create/update the PostgreSQL schema without copying data.")
    parser.add_argument("--reset", action="store_true", help="Truncate target tables before importing.")
    return parser.parse_args()


def load_schema_sql() -> str:
    return SCHEMA_PATH.read_text(encoding="utf-8")


def open_sqlite(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def open_postgres(url: str):
    return psycopg.connect(url, row_factory=dict_row)


def apply_schema(pg_conn) -> None:
    schema_sql = load_schema_sql()
    with pg_conn.cursor() as cur:
        cur.execute(schema_sql)
    pg_conn.commit()


def reset_postgres_data(pg_conn) -> None:
    ordered_tables = [table for table, _, _ in reversed(TABLES_IN_ORDER)]
    table_list = ", ".join(ordered_tables)
    with pg_conn.cursor() as cur:
        cur.execute(f"TRUNCATE TABLE {table_list} RESTART IDENTITY CASCADE")
    pg_conn.commit()


def fetch_all_rows(sqlite_conn: sqlite3.Connection, table: str, columns: list[str]) -> list[tuple]:
    quoted_columns = ", ".join(columns)
    cursor = sqlite_conn.cursor()
    order_clause = " ORDER BY id" if "id" in columns else ""
    cursor.execute(f"SELECT {quoted_columns} FROM {table}{order_clause}")
    return [tuple(row[column] for column in columns) for row in cursor.fetchall()]


def import_table(sqlite_conn: sqlite3.Connection, pg_conn, table: str, columns: list[str], refs: dict[str, set[int]]) -> tuple[int, int]:
    rows = fetch_all_rows(sqlite_conn, table, columns)
    if not rows:
        return 0, 0

    sanitized_rows: list[tuple] = []
    skipped_count = 0
    for row in rows:
        sanitized = sanitize_row(table, row, columns, refs)
        if sanitized is None:
            skipped_count += 1
            continue
        sanitized_rows.append(sanitized)

    if not sanitized_rows:
        return 0, skipped_count

    column_list = ", ".join(columns)
    placeholders = ", ".join(["%s"] * len(columns))
    sql = f"INSERT INTO {table} ({column_list}) VALUES ({placeholders})"

    with pg_conn.cursor() as cur:
        cur.executemany(sql, sanitized_rows)
    pg_conn.commit()
    if "id" in columns:
        id_index = columns.index("id")
        refs[table] = {int(row[id_index]) for row in sanitized_rows if row[id_index] is not None}
    return len(sanitized_rows), skipped_count


def reset_sequences(pg_conn) -> None:
    with pg_conn.cursor() as cur:
        for table_name in RESET_SEQUENCE_TABLES:
            cur.execute(
                """
                SELECT setval(
                    pg_get_serial_sequence(%s, 'id'),
                    COALESCE((SELECT MAX(id) FROM """ + table_name + """), 1),
                    COALESCE((SELECT MAX(id) IS NOT NULL FROM """ + table_name + """), false)
                )
                """,
                (table_name,),
            )
    pg_conn.commit()


def print_table_counts(pg_conn) -> None:
    print("\nPostgreSQL counts:")
    with pg_conn.cursor() as cur:
        for table_name, _, _ in TABLES_IN_ORDER:
            cur.execute(f"SELECT COUNT(*) AS count FROM {table_name}")
            row = cur.fetchone()
            print(f"  - {table_name}: {row['count']}")


def main() -> int:
    args = parse_args()

    if not args.postgres_url:
        raise SystemExit("POSTGRES_URL manquant. Passe --postgres-url ou exporte la variable d'environnement.")

    sqlite_path = Path(args.sqlite_path).expanduser().resolve()
    if not sqlite_path.exists():
        raise SystemExit(f"Base SQLite introuvable: {sqlite_path}")

    print(f"SQLite source : {sqlite_path}")
    print("PostgreSQL cible : configured")

    sqlite_conn = open_sqlite(str(sqlite_path))
    pg_conn = open_postgres(args.postgres_url)
    refs = build_reference_sets(sqlite_conn)

    try:
        print("1/4 - Application du schema PostgreSQL...")
        apply_schema(pg_conn)

        if args.schema_only:
            print("Schema cree/mis a jour. Fin (mode schema-only).")
            return 0

        if args.reset:
            print("2/4 - Reinitialisation des tables PostgreSQL...")
            reset_postgres_data(pg_conn)
        else:
            print("2/4 - Pas de reset cible (mode append).")

        print("3/4 - Copie des donnees...")
        for table_name, columns, _ in TABLES_IN_ORDER:
            imported_count, skipped_count = import_table(sqlite_conn, pg_conn, table_name, columns, refs)
            suffix = f" ({skipped_count} ignoree(s))" if skipped_count else ""
            print(f"  - {table_name}: {imported_count} ligne(s){suffix}")

        print("4/4 - Recalage des sequences...")
        reset_sequences(pg_conn)
        print_table_counts(pg_conn)
        print("\nMigration terminee.")
        return 0
    finally:
        sqlite_conn.close()
        pg_conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
