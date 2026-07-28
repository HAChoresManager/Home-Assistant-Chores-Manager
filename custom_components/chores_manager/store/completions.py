"""Voltooiingen, ranglijst, feed en streaks tegen het v2-schema (§3.4, §5).

Puur sqlite plus scheduling; geen HA. Tijdstippen komen als ISO-string binnen
(lokale tijd met offset), "vandaag" als date. De datumcomponent van
completed_at is daardoor de lokale datum, en omdat ISO-strings lexicografisch
sorteren, werken weekgrenzen als stringvergelijking op 'YYYY-MM-DD'.

De minuteninvariant van §3.4 — de som over alle regels van een taakinstantie
is altijd gelijk aan duration_minutes — wordt hier afgedwongen. Omdat minutes
een geheel getal is en het plan met gladde delingen rekent (duration / 4),
krijgen tussenstappen duration // n minuten en de afrondende regel de rest.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import date, timedelta
from typing import Optional

from ..scheduling.calculator import advance_rotation, next_due_after_completion
from .connection import get_connection
from .errors import StoreError


def week_start(day: date) -> date:
    """Maandag van de week waar `day` in valt (§5.2)."""
    return day - timedelta(days=day.isoweekday() - 1)


def _instance_start(conn: sqlite3.Connection, chore_id: str) -> str:
    """Tijdstip van de laatste volledige voltooiing; '' als die er nooit was.
    Alles ná dit tijdstip hoort bij de lopende taakinstantie."""
    row = conn.execute(
        "SELECT MAX(completed_at) FROM completions"
        " WHERE chore_id = ? AND is_full_completion = 1", (chore_id,)).fetchone()
    return row[0] or ""


def instance_progress(database_path: str, chore_id: str) -> dict:
    """Voortgang van de lopende instantie: afgevinkte deeltaak-ids (checklist)
    en het aantal tikken (counter), plus de al gecrediteerde minuten."""
    with get_connection(database_path) as conn:
        since = _instance_start(conn, chore_id)
        rows = conn.execute(
            "SELECT subtask_id, minutes FROM completions"
            " WHERE chore_id = ? AND completed_at > ?", (chore_id, since)).fetchall()
        return {
            "done_subtask_ids": [r["subtask_id"] for r in rows if r["subtask_id"]],
            "ticks": len(rows),
            "minutes_credited": sum(r["minutes"] for r in rows),
        }


def complete_chore(
    database_path: str,
    chore_id: str,
    assignee_id: str,
    today: date,
    now_iso: str,
    subtask_id: Optional[int] = None,
    note: Optional[str] = None,
) -> dict:
    """Vink een taak, deeltaak of counter-tik af (§3.4, §4.5).

    - Gewone taak: één regel, is_full = 1, minutes = duration_minutes.
    - Checklist mét subtask_id: deelregel; de laatste ontbrekende deeltaak
      maakt de instantie vol en rolt next_due door.
    - Counter zonder subtask_id: tik; de tik die subtask_target haalt maakt
      vol.
    - Checklist of counter zónder alle stappen: afronden kan ook in één keer
      (geen subtask_id bij checklist): de regel krijgt de resterende minuten
      zodat de som altijd op duration_minutes uitkomt.

    Alleen een volledige voltooiing rolt next_due door en schuift de rotatie
    (§4.4). Geeft een dict terug met alles wat nodig is om dit binnen vijf
    minuten terug te draaien (§2.3 undo).
    """
    with get_connection(database_path) as conn:
        row = conn.execute("SELECT * FROM chores WHERE id = ?", (chore_id,)).fetchone()
        if row is None:
            raise StoreError(f"onbekende taak {chore_id!r}")
        if not row["active"]:
            raise StoreError(f"taak {chore_id!r} is niet actief")
        assignee = conn.execute(
            "SELECT id FROM assignees WHERE id = ? AND active = 1", (assignee_id,)).fetchone()
        if assignee is None:
            raise StoreError(f"onbekende of inactieve persoon {assignee_id!r}")

        duration = row["duration_minutes"]
        mode = row["subtask_mode"]
        since = _instance_start(conn, chore_id)
        instance_rows = conn.execute(
            "SELECT subtask_id, minutes FROM completions"
            " WHERE chore_id = ? AND completed_at > ?", (chore_id, since)).fetchall()
        credited = sum(r["minutes"] for r in instance_rows)

        if mode == "checklist" and subtask_id is not None:
            subtasks = conn.execute(
                "SELECT id FROM subtasks WHERE chore_id = ?", (chore_id,)).fetchall()
            valid_ids = {r["id"] for r in subtasks}
            if subtask_id not in valid_ids:
                raise StoreError(f"deeltaak {subtask_id} hoort niet bij {chore_id!r}")
            done_ids = {r["subtask_id"] for r in instance_rows if r["subtask_id"]}
            if subtask_id in done_ids:
                raise StoreError("deeltaak is al afgevinkt in deze ronde")
            total = len(valid_ids)
            # >= vangt het geval dat de lijst tussentijds is ingekort
            was_full = len(done_ids) + 1 >= total
            share = duration // total
            minutes = max(0, duration - credited) if was_full else share
        elif mode == "counter" and subtask_id is None:
            target = row["subtask_target"] or 1
            ticks = len(instance_rows)
            # de doeltik sluit de ronde; een tik daarna begint vanzelf een
            # nieuwe ronde, want _instance_start schuift mee. >= vangt een
            # tussentijds verlaagd doel.
            was_full = ticks + 1 >= target
            share = duration // target
            minutes = max(0, duration - credited) if was_full else share
        elif subtask_id is not None:
            raise StoreError(f"taak {chore_id!r} heeft geen deeltaken van dit type")
        else:
            # gewone taak, of een checklist/counter in één keer afronden
            was_full = True
            minutes = max(0, duration - credited)

        cursor = conn.execute(
            "INSERT INTO completions (chore_id, subtask_id, is_full_completion,"
            " assignee_id, completed_at, minutes, note) VALUES (?,?,?,?,?,?,?)",
            (chore_id, subtask_id, 1 if was_full else 0,
             assignee_id, now_iso, minutes, note))
        undo = {
            "row_id": cursor.lastrowid,
            "chore_id": chore_id,
            "was_full": was_full,
            "completed_at": now_iso,
            "prev_next_due": row["next_due"],
            "prev_rotation_index": row["rotation_index"],
            "new_next_due": row["next_due"],
        }
        if was_full:
            new_due = next_due_after_completion(
                row["schedule_type"], json.loads(row["schedule_config"]), today)
            rotation = json.loads(row["rotation"])
            new_index = (advance_rotation(rotation, row["rotation_index"])
                         if row["assignment_type"] == "rotating" else row["rotation_index"])
            conn.execute(
                "UPDATE chores SET next_due = ?, rotation_index = ?, updated_at = ?"
                " WHERE id = ?",
                (new_due.isoformat(), new_index, now_iso, chore_id))
            undo["new_next_due"] = new_due.isoformat()
        return undo


def undo_completion(database_path: str, undo: dict) -> None:
    """Draai één voltooiing terug: de regel weg, en bij een volledige
    voltooiing ook next_due en rotation_index terugzetten (§2.3)."""
    with get_connection(database_path) as conn:
        conn.execute("DELETE FROM completions WHERE id = ?", (undo["row_id"],))
        if undo["was_full"]:
            conn.execute(
                "UPDATE chores SET next_due = ?, rotation_index = ? WHERE id = ?",
                (undo["prev_next_due"], undo["prev_rotation_index"], undo["chore_id"]))


def leaderboard(database_path: str, today: date) -> dict:
    """Weekstand (§5.1): per actieve persoon minuten en volledige taken sinds
    maandag, plus het weektotaal. 'Taken' telt alleen volledige voltooiingen;
    losse tikken en deelstappen tellen wel mee in de minuten."""
    start = week_start(today).isoformat()
    with get_connection(database_path) as conn:
        totals = {r["assignee_id"]: r for r in conn.execute(
            "SELECT assignee_id, SUM(minutes) AS minutes,"
            " SUM(is_full_completion) AS tasks"
            " FROM completions WHERE completed_at >= ? GROUP BY assignee_id",
            (start,))}
        persons = []
        for a in conn.execute(
                "SELECT * FROM assignees WHERE active = 1 ORDER BY sort_order, name"):
            row = totals.get(a["id"])
            persons.append({
                "id": a["id"],
                "name": a["name"],
                "color": a["color"],
                "include_in_leaderboard": a["include_in_leaderboard"],
                "minutes": row["minutes"] if row else 0,
                "tasks": row["tasks"] if row else 0,
            })
    persons.sort(key=lambda p: -p["minutes"])
    return {
        "week_start": start,
        "total_minutes": sum(p["minutes"] for p in persons),
        "persons": persons,
    }


def assignee_streaks(database_path: str, today: date) -> dict:
    """Streak per persoon (§5.3): aaneengesloten weken met minstens één
    voltooiing, terugtellend vanaf de huidige week. Een nog lege lopende week
    breekt de streak niet — dan begint het tellen bij vorige week."""
    with get_connection(database_path) as conn:
        rows = conn.execute(
            "SELECT DISTINCT assignee_id, substr(completed_at, 1, 10) AS day"
            " FROM completions").fetchall()
    weeks_per_assignee: dict = {}
    for row in rows:
        weeks_per_assignee.setdefault(row["assignee_id"], set()).add(
            week_start(date.fromisoformat(row["day"])))
    current = week_start(today)
    streaks = {}
    for assignee_id, weeks in weeks_per_assignee.items():
        cursor = current if current in weeks else current - timedelta(days=7)
        streak = 0
        while cursor in weeks:
            streak += 1
            cursor -= timedelta(days=7)
        streaks[assignee_id] = streak
    return streaks


def feed(database_path: str, limit: int = 20) -> list[dict]:
    """Activiteitenfeed (§5.4): wie deed wat wanneer, nieuwste eerst."""
    with get_connection(database_path) as conn:
        return [dict(r) for r in conn.execute(
            "SELECT co.id, co.chore_id, ch.name AS chore_name, ch.icon,"
            " co.subtask_id, st.name AS subtask_name, co.is_full_completion,"
            " co.assignee_id, a.name AS assignee_name, a.color,"
            " co.completed_at, co.minutes, co.note"
            " FROM completions co"
            " JOIN chores ch ON ch.id = co.chore_id"
            " JOIN assignees a ON a.id = co.assignee_id"
            " LEFT JOIN subtasks st ON st.id = co.subtask_id"
            " ORDER BY co.completed_at DESC, co.id DESC LIMIT ?", (limit,))]


def completed_today_count(database_path: str, today: date) -> int:
    """Aantal volledige voltooiingen vandaag (voor de sensor, §2.4)."""
    start = today.isoformat()
    end = (today + timedelta(days=1)).isoformat()
    with get_connection(database_path) as conn:
        return conn.execute(
            "SELECT COUNT(*) FROM completions WHERE is_full_completion = 1"
            " AND completed_at >= ? AND completed_at < ?", (start, end)).fetchone()[0]
