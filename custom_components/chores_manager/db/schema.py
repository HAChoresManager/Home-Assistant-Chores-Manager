"""DDL voor het v2-schema (REFACTOR_PLAN.md §3). Alle nieuwe DDL staat hier.

De oude DDL in db/base.py, theme_service.py en db/migrations.py hoort bij het
oude schema en wordt in fase 2b ontmanteld — voeg daar niets meer aan toe.

De CHECK-constraints leggen de enumeraties uit §3 vast in de database zelf,
zodat een typefout in aanroepende code niet stilletjes als data eindigt. NULL
passeert een CHECK (SQL: unknown), dus het optionele subtask_mode blijft
gewoon NULL-baar.
"""
from __future__ import annotations

import sqlite3

from .connection import get_connection

SCHEMA = """
CREATE TABLE IF NOT EXISTS assignees (
    id                     TEXT PRIMARY KEY,   -- stabiele slug, verandert nooit
    name                   TEXT NOT NULL,      -- weergavenaam, mag wijzigen
    color                  TEXT NOT NULL,
    ha_user_id             TEXT,               -- koppeling voor notificaties
    notify_service         TEXT,               -- bv. notify.mobile_app_martijn
    notifications_enabled  INTEGER NOT NULL DEFAULT 1,  -- aan/uit per persoon (§6)
    active                 INTEGER NOT NULL DEFAULT 1,
    include_in_leaderboard INTEGER NOT NULL DEFAULT 1,
    sort_order             INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chores (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    description      TEXT NOT NULL DEFAULT '',
    icon             TEXT NOT NULL DEFAULT '📋',
    active           INTEGER NOT NULL DEFAULT 1,

    -- planning (§4.1)
    schedule_type    TEXT NOT NULL CHECK (
        schedule_type IN ('daily', 'weekly', 'monthly', 'interval', 'yearly')),
    schedule_config  TEXT NOT NULL DEFAULT '{}',  -- JSON, vorm hangt af van type
    next_due         DATE NOT NULL,

    -- inspanning en urgentie (§4.3)
    duration_minutes INTEGER NOT NULL DEFAULT 15,
    priority         TEXT NOT NULL DEFAULT 'normal' CHECK (
        priority IN ('low', 'normal', 'high', 'critical')),

    -- toewijzing (§4.4)
    assignment_type  TEXT NOT NULL DEFAULT 'anyone' CHECK (
        assignment_type IN ('fixed', 'rotating', 'anyone')),
    assigned_to      TEXT REFERENCES assignees(id),   -- alleen bij 'fixed'
    rotation         TEXT NOT NULL DEFAULT '[]',      -- JSON: ["martijn","laura"]
    rotation_index   INTEGER NOT NULL DEFAULT 0,

    -- deeltaken (§4.5)
    subtask_mode     TEXT CHECK (subtask_mode IN ('checklist', 'counter')),
    subtask_target   INTEGER,     -- alleen bij 'counter'

    created_at       TIMESTAMP NOT NULL,
    updated_at       TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS subtasks (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    chore_id TEXT NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
    name     TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS completions (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    chore_id           TEXT NOT NULL REFERENCES chores(id),
    subtask_id         INTEGER REFERENCES subtasks(id),
    is_full_completion INTEGER NOT NULL DEFAULT 1,
    assignee_id        TEXT NOT NULL REFERENCES assignees(id),
    completed_at       TIMESTAMP NOT NULL,
    minutes            INTEGER NOT NULL,   -- momentopname, geen verwijzing (§3.4)
    note               TEXT
);

CREATE INDEX IF NOT EXISTS idx_completions_completed_at
    ON completions (completed_at);
CREATE INDEX IF NOT EXISTS idx_completions_assignee
    ON completions (assignee_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_completions_chore
    ON completions (chore_id);
"""


def apply_schema(conn: sqlite3.Connection) -> None:
    """Leg het v2-schema aan op een open verbinding. Idempotent."""
    conn.executescript(SCHEMA)
    _migrate(conn)


def _migrate(conn: sqlite3.Connection) -> None:
    """Kleine, idempotente migraties voor databases van vóór een kolom.

    CREATE TABLE IF NOT EXISTS raakt een bestaande tabel niet aan, dus een
    kolom die later aan het schema is toegevoegd, moet hier per bestaande
    database met ALTER TABLE bijgezet worden.
    """
    kolommen = {row[1] for row in conn.execute("PRAGMA table_info(assignees)")}
    if "notifications_enabled" not in kolommen:
        # fase 4: meldingen aan/uit per persoon; standaard aan (§6)
        conn.execute("ALTER TABLE assignees ADD COLUMN"
                     " notifications_enabled INTEGER NOT NULL DEFAULT 1")


def create_database(database_path: str) -> None:
    """Maak (of open) een databasebestand en leg het v2-schema aan."""
    with get_connection(database_path) as conn:
        apply_schema(conn)
