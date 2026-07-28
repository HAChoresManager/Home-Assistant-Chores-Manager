"""Personenopslag tegen het v2-schema (§3.1). Puur sqlite, geen HA."""
from __future__ import annotations

import sqlite3
from typing import Optional

from .connection import get_connection
from .errors import StoreError


def list_assignees(database_path: str, include_inactive: bool = False) -> list[dict]:
    query = "SELECT * FROM assignees"
    if not include_inactive:
        query += " WHERE active = 1"
    query += " ORDER BY sort_order, name"
    with get_connection(database_path) as conn:
        return [dict(r) for r in conn.execute(query)]


def get_assignee(database_path: str, assignee_id: str) -> Optional[dict]:
    with get_connection(database_path) as conn:
        row = conn.execute(
            "SELECT * FROM assignees WHERE id = ?", (assignee_id,)).fetchone()
        return dict(row) if row else None


def save_assignee(database_path: str, data: dict) -> dict:
    """Persoon aanmaken of bijwerken (op id). Het id is een stabiele slug en
    verandert nooit; de weergavenaam mag wel wijzigen (§3.1)."""
    assignee_id = (data.get("id") or "").strip()
    name = (data.get("name") or "").strip()
    color = (data.get("color") or "").strip()
    if not assignee_id:
        raise StoreError("persoon heeft een id (slug) nodig")
    if not name:
        raise StoreError("persoon heeft een naam nodig")
    if not color:
        raise StoreError("persoon heeft een kleur nodig")

    fields = (
        name, color, data.get("ha_user_id"), data.get("notify_service"),
        1 if data.get("notifications_enabled", 1) else 0,
        1 if data.get("active", 1) else 0,
        1 if data.get("include_in_leaderboard", 1) else 0,
        data.get("sort_order", 0),
    )
    with get_connection(database_path) as conn:
        existing = conn.execute(
            "SELECT id FROM assignees WHERE id = ?", (assignee_id,)).fetchone()
        if existing:
            conn.execute(
                "UPDATE assignees SET name=?, color=?, ha_user_id=?, notify_service=?,"
                " notifications_enabled=?, active=?, include_in_leaderboard=?,"
                " sort_order=? WHERE id=?",
                fields + (assignee_id,))
        else:
            conn.execute(
                "INSERT INTO assignees (name, color, ha_user_id, notify_service,"
                " notifications_enabled, active, include_in_leaderboard, sort_order, id)"
                " VALUES (?,?,?,?,?,?,?,?,?)",
                fields + (assignee_id,))
    return get_assignee(database_path, assignee_id)


def assignee_in_use(database_path: str, assignee_id: str) -> bool:
    """Wordt er naar deze persoon verwezen: voltooiingen, een vaste
    toewijzing, of lidmaatschap van een rotatielijst (JSON-kolom)."""
    with get_connection(database_path) as conn:
        referenced = conn.execute(
            "SELECT (SELECT COUNT(*) FROM completions WHERE assignee_id = ?)"
            " + (SELECT COUNT(*) FROM chores WHERE assigned_to = ?)"
            " + (SELECT COUNT(*) FROM chores WHERE rotation LIKE ?)",
            (assignee_id, assignee_id, f'%"{assignee_id}"%')).fetchone()[0]
        return referenced > 0


def delete_assignee(database_path: str, assignee_id: str) -> str:
    """Verwijder een persoon. Met voltooiingshistorie, een vaste toewijzing of
    een plek in een rotatielijst: deactiveren, zodat de historie (§3.4
    verwijst naar assignees.id) en de toewijzing niet loskomen. Geeft
    'deleted' of 'deactivated' terug."""
    if assignee_in_use(database_path, assignee_id):
        with get_connection(database_path) as conn:
            conn.execute(
                "UPDATE assignees SET active = 0 WHERE id = ?", (assignee_id,))
        return "deactivated"
    with get_connection(database_path) as conn:
        conn.execute("DELETE FROM assignees WHERE id = ?", (assignee_id,))
        return "deleted"
