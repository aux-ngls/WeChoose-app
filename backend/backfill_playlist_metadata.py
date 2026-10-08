"""Backfill playlist browse metadata without slowing down API requests."""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import main


def as_dict(row: Any) -> dict[str, Any]:
    return dict(row)


def resolve_primary_genre(media_type: str, media_id: int) -> str:
    normalized_media_type = main.normalize_media_type(media_type)
    if normalized_media_type == "movie":
        return main.get_movie_primary_genre(media_id)

    details = main.get_tmdb_media_details(normalized_media_type, media_id) or {}
    genres = details.get("genres") if isinstance(details, dict) else []
    return str(genres[0]) if isinstance(genres, list) and genres else "Autres"


def resolve_rating_row(row: dict[str, Any]) -> tuple[int, str, int, str]:
    user_id = int(row["user_id"])
    media_type = main.normalize_media_type(row.get("media_type") or "movie")
    media_id = int(row["movie_id"])
    return user_id, media_type, media_id, resolve_primary_genre(media_type, media_id)


def resolve_playlist_row(row: dict[str, Any]) -> tuple[int, str, int, str, str]:
    playlist_id = int(row["playlist_id"])
    media_type = main.normalize_media_type(row.get("media_type") or "movie")
    media_id = int(row["movie_id"])
    primary_genre = str(row.get("primary_genre") or "").strip()
    if not primary_genre:
        primary_genre = resolve_primary_genre(media_type, media_id)

    provider_names = main.load_json_list(row.get("subscription_provider_names"))
    if bool(row.get("needs_provider_refresh")):
        provider_names = main.build_media_subscription_provider_names(media_id, media_type)

    return (
        playlist_id,
        media_type,
        media_id,
        primary_genre or "Autres",
        main.dump_json_list(provider_names),
    )


def fetch_rows() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    connection = main.get_db_connection(row_factory=True)
    try:
        cursor = connection.cursor()
        cursor.execute(
            """
            SELECT user_id, movie_id, media_type
            FROM user_ratings
            WHERE primary_genre IS NULL OR primary_genre = ''
            """
        )
        rating_rows = [as_dict(row) for row in cursor.fetchall()]

        cursor.execute(
            f"""
            SELECT
                pi.playlist_id,
                pi.movie_id,
                pi.media_type,
                pi.primary_genre,
                pi.subscription_provider_names,
                CASE
                    WHEN p.name = {main.SQL_PARAM} AND pi.metadata_updated_at IS NULL THEN 1
                    ELSE 0
                END AS needs_provider_refresh
            FROM playlist_items pi
            JOIN playlists p ON p.id = pi.playlist_id
            WHERE pi.primary_genre IS NULL
               OR pi.primary_genre = ''
               OR (p.name = {main.SQL_PARAM} AND pi.metadata_updated_at IS NULL)
            """,
            (main.WATCH_LATER_NAME, main.WATCH_LATER_NAME),
        )
        playlist_rows = [as_dict(row) for row in cursor.fetchall()]
        return rating_rows, playlist_rows
    finally:
        connection.close()


def apply_updates(
    rating_updates: list[tuple[int, str, int, str]],
    playlist_updates: list[tuple[int, str, int, str, str]],
) -> None:
    connection = main.get_db_connection()
    try:
        cursor = connection.cursor()
        for user_id, media_type, media_id, primary_genre in rating_updates:
            cursor.execute(
                f"""
                UPDATE user_ratings
                SET primary_genre = {main.SQL_PARAM}, metadata_updated_at = CURRENT_TIMESTAMP
                WHERE user_id = {main.SQL_PARAM}
                  AND media_type = {main.SQL_PARAM}
                  AND movie_id = {main.SQL_PARAM}
                """,
                (primary_genre, user_id, media_type, media_id),
            )

        for playlist_id, media_type, media_id, primary_genre, provider_names in playlist_updates:
            cursor.execute(
                f"""
                UPDATE playlist_items
                SET primary_genre = {main.SQL_PARAM},
                    subscription_provider_names = {main.SQL_PARAM},
                    metadata_updated_at = CURRENT_TIMESTAMP
                WHERE playlist_id = {main.SQL_PARAM}
                  AND media_type = {main.SQL_PARAM}
                  AND movie_id = {main.SQL_PARAM}
                """,
                (primary_genre, provider_names, playlist_id, media_type, media_id),
            )
        connection.commit()
    finally:
        connection.close()


def run(*, dry_run: bool = False, workers: int = 6) -> None:
    rating_rows, playlist_rows = fetch_rows()
    print(f"Rows to enrich: ratings={len(rating_rows)}, playlist_items={len(playlist_rows)}")
    if dry_run or (not rating_rows and not playlist_rows):
        return

    with ThreadPoolExecutor(max_workers=max(1, min(workers, 8))) as executor:
        rating_updates = list(executor.map(resolve_rating_row, rating_rows))
        playlist_updates = list(executor.map(resolve_playlist_row, playlist_rows))

    apply_updates(rating_updates, playlist_updates)
    print(f"Rows enriched: ratings={len(rating_updates)}, playlist_items={len(playlist_updates)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--workers", type=int, default=6)
    arguments = parser.parse_args()
    run(dry_run=arguments.dry_run, workers=arguments.workers)
