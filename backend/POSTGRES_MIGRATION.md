# PostgreSQL Migration

This file must be kept up to date when the backend database migration path changes.

## Goal

Prepare a controlled move from the current SQLite production database to PostgreSQL without breaking the live API in one risky step.

## What exists now

- reference schema: `backend/postgres_schema.sql`
- migration script: `backend/migrate_sqlite_to_postgres.py`
- API runtime can now start in PostgreSQL mode when `DATABASE_URL` or `POSTGRES_URL` is set
- current production backend is still expected to remain on SQLite until PostgreSQL smoke tests are completed

## Required environment

```bash
export SQLITE_PATH=/home/wechoose/backend/wechoose.db
export POSTGRES_URL='postgresql://USER:PASSWORD@HOST:5432/qulte'
```

## Install dependencies

```bash
cd /home/wechoose/backend
pip install -r requirements.txt
```

## Create schema only

```bash
cd /home/wechoose/backend
python3 migrate_sqlite_to_postgres.py --schema-only
```

## Fresh full migration

```bash
cd /home/wechoose/backend
python3 migrate_sqlite_to_postgres.py --reset
```

## Recommended cutover workflow

1. Freeze writes or put the API in maintenance mode.
2. Run the migration with `--reset`.
3. Compare row counts on the main tables.
4. Smoke test auth, ratings, playlists, social, notifications, and messages against PostgreSQL.
5. Only then switch the API runtime from SQLite to PostgreSQL.

## Important note

The backend now contains a PostgreSQL compatibility runtime path, but the production cutover should still happen only after validating a migrated database with end-to-end smoke tests.
