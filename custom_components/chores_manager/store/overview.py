"""Samengestelde leesweergaven voor sensor (§2.4) en WS-state (§2.3).

Puur compositie over de andere store-modules plus scheduling; geen HA. Alles
hier is met pytest te testen — de HA-lagen (sensor_v2.py, websocket.py) doen
niets anders dan deze functies in een executor aanroepen.
"""
from __future__ import annotations

from datetime import date

from ..scheduling.calculator import current_assignee, cycle_fraction, overdue_days, urgency
from .assignees import assignee_in_use, list_assignees
from .chores import list_chores
from .completions import (
    assignee_streaks,
    completed_today_count,
    feed,
    history_counts,
    instance_progress,
    leaderboard,
    week_history,
)
from .subtasks import list_subtasks


def enrich_chore(database_path: str, chore: dict, today: date) -> dict:
    """Berekende velden bij een taak: achterstand, urgentie, wie aan de beurt
    is, en de voortgang van de lopende instantie."""
    due = date.fromisoformat(chore["next_due"])
    enriched = dict(chore)
    enriched["overdue_days"] = overdue_days(due, today)
    enriched["urgency"] = urgency(due, chore["priority"], today)
    enriched["cycle_fraction"] = cycle_fraction(
        chore["schedule_type"], chore["schedule_config"], due, today)
    if chore["assignment_type"] == "fixed":
        enriched["current_assignee"] = chore["assigned_to"]
    elif chore["assignment_type"] == "rotating":
        enriched["current_assignee"] = current_assignee(
            chore["rotation"], chore["rotation_index"])
    else:
        enriched["current_assignee"] = None
    if chore["subtask_mode"] == "checklist":
        enriched["subtasks"] = list_subtasks(database_path, chore["id"])
        progress = instance_progress(database_path, chore["id"])
        enriched["subtasks_done"] = progress["done_subtask_ids"]
    elif chore["subtask_mode"] == "counter":
        enriched["subtasks"] = []
        progress = instance_progress(database_path, chore["id"])
        enriched["counter_ticks"] = progress["ticks"]
    else:
        enriched["subtasks"] = []
    return enriched


def overview(database_path: str, today: date) -> dict:
    """De samenvatting van §2.4: sensortoestand plus attributen."""
    chores = list_chores(database_path)
    due_dates = [date.fromisoformat(c["next_due"]) for c in chores]
    due_today = sum(1 for d in due_dates if d == today)
    overdue = sum(1 for d in due_dates if d < today)
    board = leaderboard(database_path, today)
    streaks = assignee_streaks(database_path, today)
    persons = {
        p["id"]: {
            "name": p["name"],
            "minutes": p["minutes"],
            "tasks": p["tasks"],
            "streak": streaks.get(p["id"], 0),
        }
        for p in board["persons"]
    }
    return {
        "open_today": due_today + overdue,
        "due_today": due_today,
        "overdue": overdue,
        "completed_today": completed_today_count(database_path, today),
        "week_minutes_total": board["total_minutes"],
        "persons": persons,
    }


def build_state(database_path: str, today: date, feed_limit: int = 100) -> dict:
    """De volledige begintoestand voor chores_manager/state (§2.3).

    Sinds 3b ook met weekhistorie (Activiteit-scherm) en de vlaggen die de
    beheer-UI nodig heeft om verwijderen eerlijk aan te kondigen: has_history
    per taak en in_use per persoon (archiveren versus echt weg, het
    2b-besluit).
    """
    counts = history_counts(database_path)
    chores = []
    for chore in list_chores(database_path):
        enriched = enrich_chore(database_path, chore, today)
        enriched["has_history"] = bool(counts.get(chore["id"]))
        chores.append(enriched)
    board = leaderboard(database_path, today)
    streaks = assignee_streaks(database_path, today)
    for person in board["persons"]:
        person["streak"] = streaks.get(person["id"], 0)
    assignees = []
    for person in list_assignees(database_path):
        person = dict(person)
        person["in_use"] = assignee_in_use(database_path, person["id"])
        assignees.append(person)
    return {
        "today": today.isoformat(),
        "chores": chores,
        "assignees": assignees,
        "leaderboard": board,
        "feed": feed(database_path, feed_limit),
        "week_history": week_history(database_path, today),
        "completed_today": completed_today_count(database_path, today),
    }
