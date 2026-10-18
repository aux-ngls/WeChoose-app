CREATE INDEX IF NOT EXISTS idx_user_ratings_activity
    ON user_ratings(added_at DESC, user_id);

CREATE INDEX IF NOT EXISTS idx_playlist_items_activity
    ON playlist_items(added_at DESC, playlist_id);

CREATE INDEX IF NOT EXISTS idx_reviews_user_media
    ON reviews(user_id, media_type, movie_id);
