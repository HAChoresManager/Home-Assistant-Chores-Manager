"""DDL voor het v2-schema (REFACTOR_PLAN.md §3). Alle nieuwe DDL staat hier.

De oude DDL in db/base.py, theme_service.py en db/migrations.py hoort bij het
oude schema en wordt in fase 2b ontmanteld — voeg daar niets meer aan toe.

De CHECK-constraints leggen de enumeraties uit §3 vast in de database zelf,
zodat een typefout in aanroepende code niet stilletjes als data eindigt. NULL
passeert een CHECK (SQL: unknown), dus het optionele subtask_mode blijft
gewoon NULL-baar.

Acht tabellen: assignees, chores, subtasks, completions, (sinds v2.5) skips,
(sinds v2.6) vacations met de momentopname vacation_frozen, en (sinds v2.7)
absences.
Een nieuwe tabel komt er via CREATE TABLE IF NOT EXISTS vanzelf bij op een
bestaande database — apply_schema draait bij elke start. Alleen een nieuwe
kolom in een bestaande tabel heeft een stap in _migrate nodig.
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
    -- SET NULL (fase 5, E2): een geschrapte checkliststap laat de voltooiing
    -- staan — minuten en feit blijven, alleen de koppeling vervalt
    subtask_id         INTEGER REFERENCES subtasks(id) ON DELETE SET NULL,
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

-- Overslaan (v2.5): "deze keer doet niemand het". Geen voltooiing — geen
-- minuten, geen beurt — maar wel een instantiegrens (completions.py) en een
-- regel in de activiteit. Terugdraaien zet previous_next_due terug.
CREATE TABLE IF NOT EXISTS skips (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    -- CASCADE: een taak zónder voltooiingen mag echt weg (delete_chore) en
    -- neemt zijn overslaglog mee; met voltooiingen wordt hij gearchiveerd
    chore_id          TEXT NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
    -- wie oversloeg; NULL = onbekend (automatisering, ongekoppelde kijker).
    -- SET NULL: iemand zonder andere historie mag echt weg
    assignee_id       TEXT REFERENCES assignees(id) ON DELETE SET NULL,
    skipped_at        TIMESTAMP NOT NULL,
    previous_next_due DATE NOT NULL,
    new_next_due      DATE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_skips_chore
    ON skips (chore_id, skipped_at);
CREATE INDEX IF NOT EXISTS idx_skips_skipped_at
    ON skips (skipped_at);

-- Vakantiemodus (v2.6): zolang een vakantie aanstaat, staan alle taken stil.
-- De historie blijft bewaard: de streakberekening telt vakantieweken als
-- neutraal (completions.assignee_streaks, vacations.vacation_weeks).
CREATE TABLE IF NOT EXISTS vacations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    start_date  DATE NOT NULL,       -- dag waarop de modus aanging
    until       DATE,                -- geplande laatste dag (t/m); NULL = open einde
    ended_on    DATE,                -- resume-dag (dag waarop hij uitging); NULL = actief
    created_at  TIMESTAMP NOT NULL   -- ISO-tijdstip van aanzetten
);

-- hooguit één actieve vakantie: alle actieve rijen hebben dezelfde
-- indexwaarde (1), dus een tweede botst op de unieke index
CREATE UNIQUE INDEX IF NOT EXISTS idx_vacations_one_active
    ON vacations ((ended_on IS NULL)) WHERE ended_on IS NULL;

-- Momentopname van next_due per actieve taak bij het aanzetten; alleen nodig
-- tot het einde (dan opgeruimd). Zo schuift een intervaltaak die tijdens de
-- vakantie nieuw is of een andere datum kreeg niet dubbel op.
CREATE TABLE IF NOT EXISTS vacation_frozen (
    vacation_id INTEGER NOT NULL REFERENCES vacations(id) ON DELETE CASCADE,
    chore_id    TEXT NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
    next_due    DATE NOT NULL,
    PRIMARY KEY (vacation_id, chore_id)
);

-- Afwezigheid per persoon (v2.7): één persoon is een tijd weg, het
-- huishouden draait door. Puur een berekening op de toewijzing
-- (scheduling.effective_assignee); taken en beurten worden niet aangeraakt.
-- De historie blijft bewaard: de streak van die persoon telt de weken als
-- neutraal (vacations.vacation_weeks).
CREATE TABLE IF NOT EXISTS absences (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    -- CASCADE: een persoon zonder historie mag echt weg (delete_assignee)
    -- en neemt zijn afwezigheden mee; met historie wordt hij gearchiveerd
    -- en eindigt een lopende afwezigheid
    assignee_id TEXT NOT NULL REFERENCES assignees(id) ON DELETE CASCADE,
    start_date  DATE NOT NULL,       -- dag waarop de afwezigheid begon
    until       DATE,                -- geplande laatste dag (t/m); NULL = open einde
    ended_on    DATE,                -- dag van terugkomst; NULL = loopt nog
    created_at  TIMESTAMP NOT NULL   -- ISO-tijdstip van aanzetten
);

-- hooguit één lopende afwezigheid per persoon
CREATE UNIQUE INDEX IF NOT EXISTS idx_absences_one_active
    ON absences (assignee_id) WHERE ended_on IS NULL;
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

    _migrate_completions_fk(conn)


def _migrate_completions_fk(conn: sqlite3.Connection) -> None:
    """Fase 5 (E2): completions.subtask_id krijgt ON DELETE SET NULL.

    SQLite kan een foreign key niet wijzigen met ALTER TABLE, dus dit is de
    documenteerde weg: tabel herbouwen en de rijen overzetten — in één
    transactie, zodat de (echte!) data bij elke fout onaangeroerd blijft.
    De pragma foreign_keys werkt alleen buiten een transactie; vandaar de
    expliciete commit vooraf (een eerdere migratiestap kan er een geopend
    hebben) en het herstel in de finally.
    """
    # Op index (2 = table, 6 = on_delete): de verbinding heeft hier niet
    # altijd een Row-factory (apply_schema accepteert elke verbinding).
    fk = next((tuple(row) for row
               in conn.execute("PRAGMA foreign_key_list(completions)")
               if row[2] == "subtasks"), None)
    if fk is None or fk[6] == "SET NULL":
        return

    conn.commit()
    conn.execute("PRAGMA foreign_keys = OFF")
    try:
        # Zelfherstel: een eerder afgebroken poging kan de tussentabel
        # achtergelaten hebben; zonder deze regel faalt elke start daarna
        # op "table completions_nieuw already exists".
        conn.execute("DROP TABLE IF EXISTS completions_nieuw")
        # Expliciete BEGIN: Python's sqlite3 (legacy-transactiebeheer) laat
        # DDL in autocommit lopen — zonder BEGIN staat de CREATE al vast
        # vóór de INSERT en is de rollback hieronder een halve leugen. Mét
        # BEGIN is de hele rebuild echt één transactie.
        conn.execute("BEGIN")
        conn.execute("""
            CREATE TABLE completions_nieuw (
                id                 INTEGER PRIMARY KEY AUTOINCREMENT,
                chore_id           TEXT NOT NULL REFERENCES chores(id),
                subtask_id         INTEGER REFERENCES subtasks(id) ON DELETE SET NULL,
                is_full_completion INTEGER NOT NULL DEFAULT 1,
                assignee_id        TEXT NOT NULL REFERENCES assignees(id),
                completed_at       TIMESTAMP NOT NULL,
                minutes            INTEGER NOT NULL,
                note               TEXT
            )""")
        conn.execute(
            "INSERT INTO completions_nieuw (id, chore_id, subtask_id,"
            " is_full_completion, assignee_id, completed_at, minutes, note)"
            " SELECT id, chore_id, subtask_id, is_full_completion,"
            " assignee_id, completed_at, minutes, note FROM completions")
        conn.execute("DROP TABLE completions")
        conn.execute("ALTER TABLE completions_nieuw RENAME TO completions")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_completions_completed_at"
                     " ON completions (completed_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_completions_assignee"
                     " ON completions (assignee_id, completed_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_completions_chore"
                     " ON completions (chore_id)")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.execute("PRAGMA foreign_keys = ON")


def create_database(database_path: str) -> None:
    """Maak (of open) een databasebestand en leg het v2-schema aan."""
    with get_connection(database_path) as conn:
        apply_schema(conn)
