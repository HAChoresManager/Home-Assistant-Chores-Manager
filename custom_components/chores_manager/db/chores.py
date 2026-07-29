"""Taakopslag tegen het v2-schema (§3.2).

Puur sqlite plus de scheduling-package; geen Home Assistant. Tijdstippen en
"vandaag" komen altijd als parameter binnen, zodat alles deterministisch te
testen is.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import date, timedelta
from typing import Any, Optional

from ..scheduling.calculator import initial_next_due, next_due_after_completion
from ..scheduling.types import validate_schedule
from .connection import get_connection
from .errors import StoreError

PRIORITIES = ("low", "normal", "high", "critical")
ASSIGNMENT_TYPES = ("fixed", "rotating", "anyone")
SUBTASK_MODES = (None, "checklist", "counter")


def row_to_chore(row: sqlite3.Row) -> dict:
    """Databaserij naar dict, met schedule_config en rotation geparsed."""
    chore = dict(row)
    chore["schedule_config"] = json.loads(chore["schedule_config"])
    chore["rotation"] = json.loads(chore["rotation"])
    return chore


def list_chores(database_path: str, include_inactive: bool = False) -> list[dict]:
    query = "SELECT * FROM chores"
    if not include_inactive:
        query += " WHERE active = 1"
    query += " ORDER BY next_due, name"
    with get_connection(database_path) as conn:
        return [row_to_chore(r) for r in conn.execute(query)]


def get_chore(database_path: str, chore_id: str) -> Optional[dict]:
    with get_connection(database_path) as conn:
        row = conn.execute("SELECT * FROM chores WHERE id = ?", (chore_id,)).fetchone()
        return row_to_chore(row) if row else None


def save_chore(database_path: str, data: dict, today: date, now_iso: str) -> dict:
    """Taak aanmaken of bijwerken (op id). Valideert alles vóór het schrijven.

    Bij een nieuwe taak zonder next_due wordt die berekend: eerste geplande
    keer op of na vandaag (interval: vandaag zelf). created_at en
    rotation_index blijven bij een update behouden, tenzij expliciet
    meegegeven.
    """
    chore_id = (data.get("id") or "").strip()
    name = (data.get("name") or "").strip()
    if not chore_id:
        raise StoreError("taak heeft een id nodig")
    if not name:
        raise StoreError("taak heeft een naam nodig")

    schedule_type = data.get("schedule_type")
    schedule_config = validate_schedule(schedule_type, data.get("schedule_config"))

    priority = data.get("priority", "normal")
    if priority not in PRIORITIES:
        raise StoreError(f"onbekende prioriteit {priority!r}")

    assignment_type = data.get("assignment_type", "anyone")
    if assignment_type not in ASSIGNMENT_TYPES:
        raise StoreError(f"onbekende toewijzing {assignment_type!r}")
    assigned_to = data.get("assigned_to")
    rotation = data.get("rotation") or []
    if assignment_type == "fixed" and not assigned_to:
        raise StoreError("'fixed' vereist assigned_to")
    if assignment_type == "rotating" and len(rotation) < 2:
        raise StoreError("'rotating' vereist een rotation van minstens twee personen")
    if assignment_type != "fixed":
        assigned_to = None
    if assignment_type != "rotating":
        rotation = []

    subtask_mode = data.get("subtask_mode")
    if subtask_mode not in SUBTASK_MODES:
        raise StoreError(f"onbekende subtask_mode {subtask_mode!r}")
    subtask_target = data.get("subtask_target")
    if subtask_mode == "counter":
        if not isinstance(subtask_target, int) or isinstance(subtask_target, bool) or subtask_target < 1:
            raise StoreError("'counter' vereist een subtask_target van minstens 1")
    else:
        subtask_target = None

    duration = data.get("duration_minutes", 15)
    if not isinstance(duration, int) or isinstance(duration, bool) or duration < 1:
        raise StoreError("duration_minutes moet een positief geheel getal zijn")

    next_due = data.get("next_due")
    if isinstance(next_due, date):
        next_due = next_due.isoformat()
    if next_due is None:
        next_due = initial_next_due(schedule_type, schedule_config, today).isoformat()

    with get_connection(database_path) as conn:
        existing = conn.execute(
            "SELECT created_at, rotation_index FROM chores WHERE id = ?", (chore_id,)
        ).fetchone()
        rotation_index = data.get("rotation_index")
        if rotation_index is None:
            rotation_index = existing["rotation_index"] if existing else 0
        fields = (
            name, data.get("description", ""), data.get("icon", "📋"),
            1 if data.get("active", 1) else 0,
            schedule_type, json.dumps(schedule_config), next_due,
            duration, priority,
            assignment_type, assigned_to, json.dumps(rotation), rotation_index,
            subtask_mode, subtask_target, now_iso,
        )
        if existing:
            conn.execute(
                "UPDATE chores SET name=?, description=?, icon=?, active=?,"
                " schedule_type=?, schedule_config=?, next_due=?,"
                " duration_minutes=?, priority=?,"
                " assignment_type=?, assigned_to=?, rotation=?, rotation_index=?,"
                " subtask_mode=?, subtask_target=?, updated_at=?"
                " WHERE id=?",
                fields + (chore_id,))
        else:
            conn.execute(
                "INSERT INTO chores (name, description, icon, active,"
                " schedule_type, schedule_config, next_due,"
                " duration_minutes, priority,"
                " assignment_type, assigned_to, rotation, rotation_index,"
                " subtask_mode, subtask_target, updated_at, id, created_at)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                fields + (chore_id, now_iso))
    return get_chore(database_path, chore_id)


def delete_chore(database_path: str, chore_id: str) -> str:
    """Verwijder een taak. Met voltooiingshistorie: deactiveren in plaats van
    verwijderen, zodat feed en ranglijst (§5) hun verwijzingen houden.

    Geeft 'deleted' of 'deactivated' terug.
    """
    with get_connection(database_path) as conn:
        history = conn.execute(
            "SELECT COUNT(*) FROM completions WHERE chore_id = ?", (chore_id,)
        ).fetchone()[0]
        if history:
            conn.execute("UPDATE chores SET active = 0 WHERE id = ?", (chore_id,))
            return "deactivated"
        conn.execute("DELETE FROM chores WHERE id = ?", (chore_id,))
        return "deleted"


def restore_chore(database_path: str, chore_id: str, today: date, now_iso: str) -> dict:
    """Gearchiveerde taak terugzetten (fase 5, E1): active = 1 en een verse
    next_due — de datum van vóór het archiveren kan maanden oud zijn en zou
    de taak meteen diep in de achterstand zetten.

    Bewust initial_next_due en niet roll_forward: roll_forward laat
    binnen-cyclus-achterstand staan (een intervaltaak van 180 dagen zou tot
    een volle cyclus achterstand terugkrijgen). Terugzetten is een nieuwe
    start: interval begint vandaag, kalendertypen op de eerstvolgende
    geplande keer op of na vandaag."""
    chore = get_chore(database_path, chore_id)
    if chore is None:
        raise StoreError(f"onbekende taak {chore_id!r}")
    new_due = initial_next_due(
        chore["schedule_type"], chore["schedule_config"], today)
    with get_connection(database_path) as conn:
        conn.execute(
            "UPDATE chores SET active = 1, next_due = ?, updated_at = ? WHERE id = ?",
            (new_due.isoformat(), now_iso, chore_id))
    return get_chore(database_path, chore_id)


def set_next_due(database_path: str, chore_id: str, next_due: date, now_iso: str) -> None:
    with get_connection(database_path) as conn:
        conn.execute(
            "UPDATE chores SET next_due = ?, updated_at = ? WHERE id = ?",
            (next_due.isoformat(), now_iso, chore_id))


def snooze_chore(database_path: str, chore_id: str, mode: str, today: date, now_iso: str) -> date:
    """§2.3 snooze: 'tomorrow' zet de taak op morgen; 'skip' slaat de komende
    geplande keer over en rolt door naar de eerstvolgende daarna."""
    chore = get_chore(database_path, chore_id)
    if chore is None:
        raise StoreError(f"onbekende taak {chore_id!r}")
    if mode == "tomorrow":
        new_due = today + timedelta(days=1)
    elif mode == "skip":
        anchor = max(today, date.fromisoformat(chore["next_due"]))
        new_due = next_due_after_completion(
            chore["schedule_type"], chore["schedule_config"], anchor)
    else:
        raise StoreError(f"onbekende snooze-modus {mode!r}")
    set_next_due(database_path, chore_id, new_due, now_iso)
    return new_due


def roll_all_forward(database_path: str, today: date, now_iso: str) -> list[tuple]:
    """De nachtelijke rol (§4.2) over alle actieve taken. Geeft per gewijzigde
    taak (id, oude next_due, nieuwe next_due) terug."""
    from ..scheduling.calculator import roll_forward

    changes = []
    for chore in list_chores(database_path):
        old = date.fromisoformat(chore["next_due"])
        new = roll_forward(chore["schedule_type"], chore["schedule_config"], old, today)
        if new != old:
            set_next_due(database_path, chore["id"], new, now_iso)
            changes.append((chore["id"], old.isoformat(), new.isoformat()))
    return changes
