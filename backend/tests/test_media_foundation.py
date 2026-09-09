import unittest
import os
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


if __name__ == "__main__":
    unittest.main()
