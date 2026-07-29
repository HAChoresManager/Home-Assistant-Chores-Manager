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
    """Werk de deeltakenlijst van een taak bij naar precies deze namen.

    Sinds fase 5 (E2) mag dat ook mét voltooiingshistorie: het schema heeft
    ON DELETE SET NULL, dus een geschrapte stap laat zijn voltooiingen staan
    (minuten en feit blijven; alleen de koppeling naar de stapnaam vervalt).
    Stappen waarvan de naam blijft, behouden hun rij — en daarmee hun
    historie én hun vinkje in de lopende ronde. Alleen wat echt verdwijnt
    wordt verwijderd, alleen wat echt nieuw is komt erbij.
    """
    cleaned = [n.strip() for n in names if n and n.strip()]
    if len(set(cleaned)) != len(cleaned):
        raise StoreError("elke deeltaak heeft een unieke naam nodig")
    with get_connection(database_path) as conn:
        existing = [(r["id"], r["name"]) for r in conn.execute(
            "SELECT id, name FROM subtasks WHERE chore_id = ? ORDER BY position, id",
            (chore_id,))]
        keep = {name: sid for sid, name in existing}
        for sid, name in existing:
            # weg als de naam vervalt, of als dit een oude dubbele rij is
            # (van vóór de uniekheidscheck hierboven) — per naam blijft er één
            if name not in cleaned or keep[name] != sid:
                # ON DELETE SET NULL laat de voltooiingen van deze stap staan
                conn.execute("DELETE FROM subtasks WHERE id = ?", (sid,))
        for position, name in enumerate(cleaned):
            if name in keep:
                conn.execute("UPDATE subtasks SET position = ? WHERE id = ?",
                             (position, keep[name]))
            else:
                conn.execute(
                    "INSERT INTO subtasks (chore_id, name, position) VALUES (?, ?, ?)",
                    (chore_id, name, position))
    return list_subtasks(database_path, chore_id)
