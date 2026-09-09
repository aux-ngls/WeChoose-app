-- Add media_type to existing movie-scoped tables, then replace old movie-only
-- uniqueness constraints with composite constraints so TMDB movie and TV ids can coexist.
ALTER TABLE user_ratings
    ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'movie';
ALTER TABLE playlist_items
    ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'movie';
ALTER TABLE reviews
    ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'movie';
ALTER TABLE direct_messages
    ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'movie';
ALTER TABLE recommendation_impressions
    ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'movie';
ALTER TABLE movie_provider_link_cache
    ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'movie';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_ratings_media_type_check') THEN
        ALTER TABLE user_ratings
            ADD CONSTRAINT user_ratings_media_type_check CHECK (media_type IN ('movie', 'tv'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'playlist_items_media_type_check') THEN
        ALTER TABLE playlist_items
            ADD CONSTRAINT playlist_items_media_type_check CHECK (media_type IN ('movie', 'tv'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_media_type_check') THEN
        ALTER TABLE reviews
            ADD CONSTRAINT reviews_media_type_check CHECK (media_type IN ('movie', 'tv'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'direct_messages_media_type_check') THEN
        ALTER TABLE direct_messages
            ADD CONSTRAINT direct_messages_media_type_check CHECK (media_type IN ('movie', 'tv'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recommendation_impressions_media_type_check') THEN
        ALTER TABLE recommendation_impressions
            ADD CONSTRAINT recommendation_impressions_media_type_check CHECK (media_type IN ('movie', 'tv'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movie_provider_link_cache_media_type_check') THEN
        ALTER TABLE movie_provider_link_cache
            ADD CONSTRAINT movie_provider_link_cache_media_type_check CHECK (media_type IN ('movie', 'tv'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_ratings_media
    ON user_ratings(user_id, media_type, movie_id);
CREATE INDEX IF NOT EXISTS idx_playlist_items_media
    ON playlist_items(playlist_id, media_type, movie_id);
CREATE INDEX IF NOT EXISTS idx_reviews_media
    ON reviews(media_type, movie_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_direct_messages_media
    ON direct_messages(media_type, movie_id)
    WHERE movie_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recommendation_impressions_user_media
    ON recommendation_impressions(user_id, media_type, movie_id, shown_at DESC);
CREATE INDEX IF NOT EXISTS idx_movie_provider_link_cache_media
    ON movie_provider_link_cache(media_type, movie_id, region_code);

ALTER TABLE user_ratings
    DROP CONSTRAINT IF EXISTS user_ratings_pkey;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_ratings_media_pkey') THEN
        ALTER TABLE user_ratings
            ADD CONSTRAINT user_ratings_media_pkey PRIMARY KEY (user_id, media_type, movie_id);
    END IF;
END $$;

ALTER TABLE playlist_items
    DROP CONSTRAINT IF EXISTS playlist_items_playlist_id_movie_id_key;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'playlist_items_playlist_media_key') THEN
        ALTER TABLE playlist_items
            ADD CONSTRAINT playlist_items_playlist_media_key UNIQUE (playlist_id, media_type, movie_id);
    END IF;
END $$;

ALTER TABLE movie_provider_link_cache
    DROP CONSTRAINT IF EXISTS movie_provider_link_cache_pkey;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movie_provider_link_cache_media_pkey') THEN
        ALTER TABLE movie_provider_link_cache
            ADD CONSTRAINT movie_provider_link_cache_media_pkey PRIMARY KEY (media_type, movie_id, region_code);
    END IF;
END $$;
