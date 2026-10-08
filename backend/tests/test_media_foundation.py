import unittest
import datetime
import os
import sqlite3
import sys
import tempfile
from unittest.mock import patch

from fastapi import HTTPException

os.environ.pop("DATABASE_URL", None)
os.environ.pop("POSTGRES_URL", None)
os.environ["SQLITE_PATH"] = tempfile.NamedTemporaryFile(prefix="qulte-media-tests-", suffix=".db").name
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import main


EMPTY_PROVIDERS = {
    "region": "FR",
    "link": "",
    "subscription": [],
    "rent": [],
    "buy": [],
}


class MediaFoundationTests(unittest.TestCase):
    def make_playlist_connection(self):
        connection = sqlite3.connect(":memory:")
        connection.row_factory = sqlite3.Row
        connection.executescript(
            """
            CREATE TABLE playlists (
                id INTEGER PRIMARY KEY,
                user_id INTEGER,
                name TEXT
            );
            CREATE TABLE playlist_items (
                playlist_id INTEGER,
                movie_id INTEGER,
                media_type TEXT,
                title TEXT,
                poster_url TEXT,
                rating REAL,
                added_at TIMESTAMP,
                sort_index INTEGER,
                primary_genre TEXT,
                subscription_provider_names TEXT,
                metadata_updated_at TIMESTAMP
            );
            CREATE TABLE user_ratings (
                user_id INTEGER,
                movie_id INTEGER,
                media_type TEXT,
                rating REAL,
                title TEXT,
                poster_url TEXT,
                primary_genre TEXT,
                metadata_updated_at TIMESTAMP,
                added_at TIMESTAMP
            );
            CREATE TABLE user_preferences (
                user_id INTEGER PRIMARY KEY,
                owned_streaming_services TEXT
            );
            """
        )
        return connection

    def test_pooled_connection_is_returned_after_context_error(self):
        class FakeNativeConnection:
            closed = False

            def __init__(self):
                self.rollback_count = 0

            def rollback(self):
                self.rollback_count += 1

        class FakePool:
            def __init__(self):
                self.returned = []

            def putconn(self, connection):
                self.returned.append(connection)

        native_connection = FakeNativeConnection()
        pool = FakePool()

        with self.assertRaises(RuntimeError):
            with main.PooledPostgresCompatConnection(
                pool,
                native_connection,
                row_factory=False,
            ):
                raise RuntimeError("route failure")

        self.assertEqual(native_connection.rollback_count, 1)
        self.assertEqual(pool.returned, [native_connection])

    def test_pool_timeout_uses_temporary_direct_connection(self):
        class SaturatedPool:
            def getconn(self):
                raise main.PoolTimeout("pool saturated")

            def get_stats(self):
                return {"pool_size": 10, "pool_available": 0, "requests_waiting": 1}

        class FakeNativeConnection:
            closed = False

            def close(self):
                self.closed = True

        native_connection = FakeNativeConnection()
        with patch.object(main, "DATABASE_BACKEND", "postgres"), \
            patch.object(main, "DATABASE_URL", "postgresql://example.invalid/qulte"), \
            patch.object(main, "postgres_pool", SaturatedPool()), \
            patch.object(main.psycopg, "connect", return_value=native_connection) as connect:
            connection = main.get_db_connection()

        self.assertIsInstance(connection, main.PostgresCompatConnection)
        self.assertNotIsInstance(connection, main.PooledPostgresCompatConnection)
        connect.assert_called_once_with(
            "postgresql://example.invalid/qulte",
            connect_timeout=main.POSTGRES_CONNECT_TIMEOUT_SECONDS,
            application_name="qulte-api-direct",
        )

    def test_movie_and_tv_ids_are_disambiguated_by_media_type(self):
        movie = main.normalize_tmdb_media_item(
            {"id": 42, "media_type": "movie", "title": "Film", "vote_average": 7.2}
        )
        series = main.normalize_tmdb_media_item(
            {"id": 42, "media_type": "tv", "name": "Serie", "vote_average": 8.1}
        )

        self.assertEqual((movie["media_type"], movie["id"]), ("movie", 42))
        self.assertEqual((series["media_type"], series["id"]), ("tv", 42))

    def test_tv_details_expose_series_specific_fields(self):
        payload = main.build_tmdb_tv_details_payload(
            {
                "id": 1396,
                "name": "Breaking Bad",
                "overview": "Synopsis",
                "vote_average": 8.9,
                "first_air_date": "2008-01-20",
                "episode_run_time": [47],
                "created_by": [{"name": "Vince Gilligan"}],
                "genres": [{"name": "Drame"}],
                "number_of_seasons": 5,
                "number_of_episodes": 62,
                "seasons": [{"id": 1, "season_number": 1, "name": "Saison 1", "episode_count": 7}],
                "videos": {"results": []},
                "credits": {"cast": []},
            },
            EMPTY_PROVIDERS,
        )

        self.assertEqual(payload["media_type"], "tv")
        self.assertEqual(payload["title"], "Breaking Bad")
        self.assertEqual(payload["release_date"], "2008")
        self.assertEqual(payload["runtime"], 47)
        self.assertEqual(payload["creators"], ["Vince Gilligan"])
        self.assertEqual(payload["number_of_seasons"], 5)
        self.assertEqual(payload["number_of_episodes"], 62)

    def test_invalid_media_type_is_rejected(self):
        with self.assertRaises(HTTPException) as context:
            main.normalize_media_type("book")

        self.assertEqual(context.exception.status_code, 422)

    def test_media_type_accepts_database_bytes(self):
        self.assertEqual(main.normalize_media_type(b"movie"), "movie")
        self.assertEqual(main.normalize_media_type(b"tv"), "tv")

    def test_tv_recommendations_skip_rated_watch_later_and_excluded_series(self):
        class FakeCursor:
            def __init__(self):
                self.last_query = ""

            def execute(self, query, params=None):
                self.last_query = query

            def fetchone(self):
                if "FROM playlists" in self.last_query:
                    return (100,)
                return None

            def fetchall(self):
                if "FROM user_preferences" in self.last_query:
                    return []
                if "FROM user_ratings" in self.last_query:
                    return [(1, 5.0)]
                if "FROM playlist_items" in self.last_query:
                    return [(2,)]
                if "FROM recommendation_impressions" in self.last_query:
                    return [(3, "pass", "2099-01-01 00:00:00", "2099-01-01 00:00:00")]
                return []

        class FakeConnection:
            def cursor(self):
                return FakeCursor()

            def commit(self):
                return None

            def close(self):
                return None

        candidates = [
            {"id": 1, "name": "Rated", "vote_average": 8.0, "vote_count": 200, "popularity": 80},
            {"id": 2, "name": "Watch Later", "vote_average": 8.0, "vote_count": 200, "popularity": 80},
            {"id": 3, "name": "Passed", "vote_average": 8.0, "vote_count": 200, "popularity": 80},
            {"id": 4, "name": "Excluded by client", "vote_average": 8.0, "vote_count": 200, "popularity": 80},
            {"id": 5, "name": "Candidate", "vote_average": 8.2, "vote_count": 260, "popularity": 120},
        ]

        with patch.object(main, "get_db_connection", return_value=FakeConnection()), \
            patch.object(main, "get_user_preferences", return_value={"favorite_genres": []}), \
            patch.object(main, "get_tmdb_tv_genre_ids", return_value={}), \
            patch.object(main, "fetch_tmdb_tv_candidates", return_value=candidates):
            payload = main.compute_tv_recommendation_feed(
                current_user_id=12,
                limit=10,
                exclude_ids="4",
            )

        self.assertEqual([item["id"] for item in payload], [5])
        self.assertEqual(payload[0]["media_type"], "tv")

    def test_private_profile_content_requires_follow(self):
        class FakeCursor:
            def __init__(self, row):
                self.row = row

            def execute(self, query, params=None):
                return None

            def fetchone(self):
                return self.row

        self.assertFalse(main.can_view_profile_content(FakeCursor((False, False)), 1, 2))
        self.assertTrue(main.can_view_profile_content(FakeCursor((False, True)), 1, 2))
        self.assertTrue(main.can_view_profile_content(FakeCursor((True, False)), 1, 2))
        self.assertTrue(main.can_view_profile_content(FakeCursor(None), 1, 1))

    def test_public_social_feed_uses_relevance_ranking(self):
        cursor = object()

        class FakeConnection:
            def cursor(self):
                return cursor

            def close(self):
                return None

        with patch.object(main, "get_db_connection", return_value=FakeConnection()), \
            patch.object(main, "fetch_relevant_public_reviews", return_value=[]) as fetch_reviews:
            payload = main.social_feed(scope="public", current_user={"id": 7})

        self.assertEqual(payload, [])
        fetch_reviews.assert_called_once_with(cursor, 7, 30)

    def test_public_review_relevance_combines_buzz_and_affinity(self):
        now = datetime.datetime(2026, 10, 8, 12, 0, 0)
        popular = main.score_public_review_candidate(
            {
                "created_at": now.isoformat(),
                "likes_count": 3,
                "comments_count": 1,
                "rating": 4.5,
            },
            now,
        )
        personalized = main.score_public_review_candidate(
            {
                "created_at": now.isoformat(),
                "likes_count": 0,
                "comments_count": 0,
                "rating": 4.5,
                "my_rating": 4.5,
                "same_media_saved": True,
            },
            now,
        )

        self.assertGreater(personalized["affinity_score"], 0)
        self.assertGreater(personalized["total_score"], popular["total_score"])

    def test_social_rankings_are_built_from_community_activity(self):
        connection = sqlite3.connect(":memory:")
        connection.row_factory = sqlite3.Row
        cursor = connection.cursor()
        cursor.executescript(
            """
            CREATE TABLE user_ratings (
                user_id INTEGER,
                media_type TEXT,
                movie_id INTEGER,
                rating REAL,
                title TEXT,
                poster_url TEXT,
                added_at TIMESTAMP
            );
            CREATE TABLE playlists (id INTEGER, user_id INTEGER);
            CREATE TABLE playlist_items (
                playlist_id INTEGER,
                media_type TEXT,
                movie_id INTEGER,
                rating REAL,
                title TEXT,
                poster_url TEXT,
                added_at TIMESTAMP
            );
            CREATE TABLE reviews (
                user_id INTEGER,
                media_type TEXT,
                movie_id INTEGER,
                rating REAL,
                title TEXT,
                poster_url TEXT,
                created_at TIMESTAMP
            );
            """
        )
        now = datetime.datetime.utcnow().isoformat()
        cursor.executemany(
            "INSERT INTO user_ratings VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                (1, "movie", 10, 5.0, "Film commun", "poster-10", now),
                (2, "movie", 10, 4.5, "Film commun", "poster-10", now),
                (1, "tv", 20, 4.0, "Serie", "poster-20", now),
            ],
        )
        cursor.executemany("INSERT INTO playlists VALUES (?, ?)", [(1, 1), (2, 2)])
        cursor.executemany(
            "INSERT INTO playlist_items VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                (1, "movie", 10, 5.0, "Film commun", "poster-10", now),
                (2, "movie", 10, 4.5, "Film commun", "poster-10", now),
                (1, "tv", 20, 4.0, "Serie", "poster-20", now),
            ],
        )
        cursor.execute(
            "INSERT INTO reviews VALUES (?, ?, ?, ?, ?, ?, ?)",
            (1, "movie", 10, 5.0, "Film commun", "poster-10", now),
        )

        payload = main.build_social_rankings(cursor, "all", 10)
        sections = {section["key"]: section for section in payload["sections"]}

        self.assertEqual(set(sections), {"most_watched", "top_rated", "trending", "most_saved"})
        self.assertEqual(sections["most_watched"]["items"][0]["movie_id"], 10)
        self.assertEqual(sections["most_saved"]["items"][0]["people_count"], 2)
        self.assertEqual(sections["trending"]["items"][0]["media_type"], "movie")
        connection.close()

    def test_social_ranking_item_decodes_postgres_byte_values(self):
        item = main.serialize_social_ranking_item(
            {
                "movie_id": 42,
                "media_type": b"movie",
                "title": "Le Fabuleux Destin d'Amélie Poulain".encode("utf-8"),
                "poster_url": b"https://image.tmdb.org/t/p/w500/poster.jpg",
                "average_rating": 4.5,
                "ratings_count": 3,
                "people_count": 3,
                "activity_count": 3,
            },
            rank=1,
            metric="top_rated",
        )

        self.assertEqual(item["title"], "Le Fabuleux Destin d'Amélie Poulain")
        self.assertEqual(item["poster_url"], "https://image.tmdb.org/t/p/w500/poster.jpg")
        self.assertEqual(item["media_type"], "movie")
        self.assertNotIn("b'", item["title"])

    def test_invalid_social_feed_scope_is_rejected(self):
        with self.assertRaises(HTTPException) as context:
            main.social_feed(scope="unknown", current_user={"id": 7})

        self.assertEqual(context.exception.status_code, 400)

    def test_playlist_browse_filters_and_searches_before_pagination(self):
        connection = self.make_playlist_connection()
        cursor = connection.cursor()
        cursor.execute("INSERT INTO playlists VALUES (?, ?, ?)", (7, 42, "Grande playlist"))
        cursor.executemany(
            """
            INSERT INTO playlist_items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (7, 101, "movie", "Alpha", "poster-101", 7.0, "2026-01-01", 1, "Action", "[]", "2026-01-01"),
                (7, 102, "tv", "Serie beta", "poster-102", 8.0, "2026-01-02", 2, "Drame", "[]", "2026-01-02"),
                (7, 103, "movie", "Gamma", "poster-103", 6.0, "2026-01-03", 3, "Comedie", "[]", "2026-01-03"),
                (7, 104, "tv", "Serie delta", "poster-104", 9.0, "2026-01-04", 4, "Drame", "[]", "2026-01-04"),
                (7, 105, "movie", "Cible cachee", "poster-105", 8.5, "2026-01-05", 5, "Thriller", "[]", "2026-01-05"),
            ],
        )

        with patch.object(main, "get_tmdb_media_details", side_effect=AssertionError("TMDB called while browsing")), \
            patch.object(main, "get_tmdb_media_watch_providers", side_effect=AssertionError("TMDB providers called while browsing")), \
            patch.object(main, "get_tmdb_tv_summary", side_effect=AssertionError("TMDB TV called while browsing")):
            first_page = main.browse_playlist_rows(
                cursor,
                7,
                42,
                offset=0,
                limit=2,
                sort_mode="manual",
                query="",
                only_owned_streaming_services=False,
                media_type_filter="all",
            )
            search_page = main.browse_playlist_rows(
                cursor,
                7,
                42,
                offset=0,
                limit=2,
                sort_mode="recent",
                query="cible cachee",
                only_owned_streaming_services=False,
                media_type_filter="all",
            )
            movie_page = main.browse_playlist_rows(
                cursor,
                7,
                42,
                offset=0,
                limit=10,
                sort_mode="recent",
                query="",
                only_owned_streaming_services=False,
                media_type_filter="movie",
            )

        self.assertEqual([item["id"] for item in first_page["items"]], [101, 102])
        self.assertEqual(first_page["playlist_total_count"], 5)
        self.assertTrue(first_page["has_more"])
        self.assertEqual([item["id"] for item in search_page["items"]], [105])
        self.assertEqual(search_page["playlist_total_count"], 1)
        self.assertEqual([item["id"] for item in movie_page["items"]], [105, 103, 101])
        self.assertFalse(movie_page["has_more"])
        connection.close()

    def test_watch_later_platform_filter_runs_in_database(self):
        connection = self.make_playlist_connection()
        cursor = connection.cursor()
        cursor.execute("INSERT INTO playlists VALUES (?, ?, ?)", (9, 42, main.WATCH_LATER_NAME))
        cursor.execute("INSERT INTO user_preferences VALUES (?, ?)", (42, '["Netflix", "Canal+"]'))
        cursor.executemany(
            "INSERT INTO playlist_items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (9, 201, "movie", "Netflix movie", "poster-201", 7.5, "2026-01-01", 1, "Action", '["Netflix"]', "2026-01-01"),
                (9, 202, "movie", "Prime movie", "poster-202", 8.0, "2026-01-02", 2, "Drame", '["Prime Video"]', "2026-01-02"),
                (9, 203, "tv", "Canal series", "poster-203", 8.5, "2026-01-03", 3, "Drame", '["Canal+"]', "2026-01-03"),
            ],
        )

        with patch.object(main, "get_tmdb_media_watch_providers", side_effect=AssertionError("TMDB providers called while filtering")):
            payload = main.browse_playlist_rows(
                cursor,
                main.WATCH_LATER_SYSTEM_ID,
                42,
                offset=0,
                limit=10,
                sort_mode="recent",
                query="",
                only_owned_streaming_services=True,
                media_type_filter="all",
            )

        self.assertEqual([item["id"] for item in payload["items"]], [203, 201])
        self.assertEqual(payload["playlist_total_count"], 2)
        self.assertFalse(payload["has_more"])
        connection.close()


if __name__ == "__main__":
    unittest.main()
