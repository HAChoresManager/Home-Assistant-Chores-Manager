"""Deeltaakopslag tegen het v2-schema (§3.3). Puur sqlite, geen HA.

Alleen nodig voor subtask_mode = 'checklist'. Bij 'counter' is er niets om op
te slaan — daar telt completions de tikken (§4.5).
"""
from __future__ import annotations

import sqlite3

from .connection import get_connection
from .errors import StoreError


def list_subtasks(database_path: str, chore_id: str) -> list[dict]:
    with get_connection(database_path) as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM subtasks WHERE chore_id = ? ORDER BY position, id",
            (chore_id,))]


def set_subtasks(database_path: str, chore_id: str, names: list[str]) -> list[dict]:
    """Vervang de deeltakenlijst van een taak.

    Deeltaken waar voltooiingshistorie aan hangt kunnen niet weg — §3.4
    verwijst met subtask_id naar deze tabel en het schema kent geen SET NULL.
    In dat geval faalt de vervanging met een duidelijke melding; het schrappen
    van deeltaken met historie is een fase-3-besluit (zie rapportage 2b).
    """
    cleaned = [n.strip() for n in names if n and n.strip()]
    with get_connection(database_path) as conn:
        referenced = conn.execute(
            "SELECT COUNT(*) FROM completions co JOIN subtasks st ON st.id = co.subtask_id"
            " WHERE st.chore_id = ?", (chore_id,)).fetchone()[0]
        existing = [r["name"] for r in conn.execute(
            "SELECT name FROM subtasks WHERE chore_id = ? ORDER BY position, id",
            (chore_id,))]
        if referenced:
            if cleaned == existing:
                # ongewijzigd: niets doen, anders sneuvelen de FK-verwijzingen
                return list_subtasks(database_path, chore_id)
            raise StoreError(
                "deeltaken met voltooiingshistorie kunnen niet vervangen worden")
        conn.execute("DELETE FROM subtasks WHERE chore_id = ?", (chore_id,))
        for position, name in enumerate(cleaned):
            conn.execute(
                "INSERT INTO subtasks (chore_id, name, position) VALUES (?, ?, ?)",
                (chore_id, name, position))
    return list_subtasks(database_path, chore_id)
