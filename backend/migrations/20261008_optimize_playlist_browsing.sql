-- Materialize metadata used by playlist browsing so reads never need TMDB calls.
ALTER TABLE user_ratings
    ADD COLUMN IF NOT EXISTS primary_genre TEXT;
ALTER TABLE user_ratings
    ADD COLUMN IF NOT EXISTS metadata_updated_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_user_ratings_browse_recent
    ON user_ratings(user_id, added_at DESC, movie_id);
CREATE INDEX IF NOT EXISTS idx_user_ratings_browse_rating
    ON user_ratings(user_id, rating DESC, title, movie_id);
CREATE INDEX IF NOT EXISTS idx_user_ratings_browse_genre
    ON user_ratings(user_id, primary_genre, title, movie_id);

CREATE INDEX IF NOT EXISTS idx_playlist_items_browse_media
    ON playlist_items(playlist_id, media_type, added_at DESC);
CREATE INDEX IF NOT EXISTS idx_playlist_items_browse_genre
    ON playlist_items(playlist_id, primary_genre, title, movie_id);
CREATE INDEX IF NOT EXISTS idx_playlist_items_browse_rating
    ON playlist_items(playlist_id, rating DESC, title, movie_id);
