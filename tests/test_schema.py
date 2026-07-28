"""Rooktest voor het v2-schema en de verbindingslaag (B1/B2 van fase 2a).

CLAUDE.md zegt "unit tests alleen voor scheduling/" — dit bestand is bewust
minimaal: geen logica, alleen de controle dat de DDL aanlegt wat §3 belooft en
dat de verbindingslaag doet wat hij zegt (foreign keys, commit/rollback). Tot
fase 2b raakt niets anders deze code aan, dus zonder deze rooktest zou een
DDL-typefout pas maanden later opvallen.
"""
import sqlite3

import pytest

from chores_manager.store.connection import get_connection
from chores_manager.store.schema import apply_schema, create_database


@pytest.fixture
def conn():
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")
    apply_schema(conn)
    yield conn
    conn.close()


def test_alle_vier_tabellen_en_indexen_bestaan(conn):
    tabellen = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")}
    assert tabellen == {"assignees", "chores", "subtasks", "completions"}
    indexen = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'")}
    assert indexen == {"idx_completions_completed_at", "idx_completions_assignee",
                       "idx_completions_chore"}


def test_apply_schema_is_idempotent(conn):
    apply_schema(conn)  # tweede keer mag geen fout geven


def _insert_assignee(conn, slug="martijn"):
    conn.execute("INSERT INTO assignees (id, name, color) VALUES (?, ?, ?)",
                 (slug, slug.capitalize(), "#336699"))


def _insert_chore(conn, chore_id="was-draaien"):
    conn.execute(
        "INSERT INTO chores (id, name, schedule_type, schedule_config, next_due,"
        " created_at, updated_at) VALUES (?, ?, 'daily', '{\"weekdays\": [1,2,3,4,5,6,7]}',"
        " '2026-07-28', '2026-07-28T03:00:00', '2026-07-28T03:00:00')",
        (chore_id, "Was draaien"))


def test_foreign_key_wordt_afgedwongen(conn):
    _insert_assignee(conn)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO completions (chore_id, assignee_id, completed_at, minutes)"
            " VALUES ('bestaat-niet', 'martijn', '2026-07-28T20:00:00', 20)")


def test_subtasks_cascaden_mee_met_hun_taak(conn):
    _insert_chore(conn)
    conn.execute("INSERT INTO subtasks (chore_id, name) VALUES ('was-draaien', 'witte was')")
    conn.execute("DELETE FROM chores WHERE id = 'was-draaien'")
    assert conn.execute("SELECT COUNT(*) FROM subtasks").fetchone()[0] == 0


def test_check_constraint_weigert_onbekende_prioriteit(conn):
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO chores (id, name, schedule_type, next_due, priority,"
            " created_at, updated_at) VALUES ('x', 'X', 'daily', '2026-07-28',"
            " 'spoed', '2026-07-28', '2026-07-28')")


class TestVerbindingslaag:
    def test_commit_bij_normaal_verlaten(self, tmp_path):
        pad = str(tmp_path / "chores.db")
        create_database(pad)
        with get_connection(pad) as conn:
            _insert_assignee(conn)
        with get_connection(pad) as conn:
            rij = conn.execute("SELECT name FROM assignees").fetchone()
            assert rij["name"] == "Martijn"  # row_factory: toegang op kolomnaam

    def test_rollback_bij_exception(self, tmp_path):
        pad = str(tmp_path / "chores.db")
        create_database(pad)
        with pytest.raises(RuntimeError):
            with get_connection(pad) as conn:
                _insert_assignee(conn)
                raise RuntimeError("opzettelijk")
        with get_connection(pad) as conn:
            assert conn.execute("SELECT COUNT(*) FROM assignees").fetchone()[0] == 0

    def test_foreign_keys_staan_aan(self, tmp_path):
        pad = str(tmp_path / "chores.db")
        create_database(pad)
        with pytest.raises(sqlite3.IntegrityError):
            with get_connection(pad) as conn:
                conn.execute(
                    "INSERT INTO completions (chore_id, assignee_id, completed_at, minutes)"
                    " VALUES ('nee', 'nee', '2026-07-28', 10)")
