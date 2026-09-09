import unittest

from fastapi import HTTPException

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


if __name__ == "__main__":
    unittest.main()
