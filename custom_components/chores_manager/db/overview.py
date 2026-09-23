"""Samengestelde leesweergaven voor sensor (§2.4) en WS-state (§2.3).

Puur compositie over de andere store-modules plus scheduling; geen HA. Alles
hier is met pytest te testen — de HA-lagen (sensor.py, websocket.py) doen
niets anders dan deze functies in een executor aanroepen.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional

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
    recent_full_completions,
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


_TASKS_TODAY_LIMIT = 8


def _tasks_today(chores: list[dict], assignees_by_id: dict,
                 recent_done: dict) -> list[dict]:
    """Compacte lijst voor Lovelace (fase 5, stap B): wat er vandaag speelt
    mét wie het moet doen. Compact — geen beschrijvingen, geen andere
    velden — maar wél de ids: met `id` en `assignee_id` kan een kaart de
    service chores_manager.mark_done aanroepen en zo een taak met één tik
    afvinken zonder het panel te openen. Eerst vandaag (prioriteit, dan
    naam), dan achterstand op cyclusfractie; maximaal acht items.

    Net-afgevinkte taken blijven even staan als status "done" (recent_done,
    uit recent_full_completions; overview bepaalt het venster). Ze sorteren
    mee in de vandaag-groep, zodat een afgevinkte taak niet verspringt; een
    taak uit de achterstand landt daar ook — acceptabel. Is een taak weer
    open (vandaag of achterstand, bijv. na undo), dan telt dat, niet de
    voltooiing. De limiet van acht geldt inclusief done-rijen.
    """
    def rij(chore: dict, status: str) -> dict:
        assignee = (None if chore["assignment_type"] == "anyone"
                    else assignees_by_id.get(chore["current_assignee"]))
        row = {
            "id": chore["id"],
            "name": chore["name"],
            "icon": chore["icon"],
            "status": status,
            "assignee_id": assignee["id"] if assignee else None,
            "assignee_name": assignee["name"] if assignee else "wie kan",
            "assignee_color": assignee["color"] if assignee else None,
        }
        if status == "done":
            row.update(recent_done[chore["id"]])
        return row

    def is_open(chore: dict) -> bool:
        return chore["urgency"] == "due" or chore["overdue_days"] > 0

    vandaag = sorted(
        [(c, "today") for c in chores if c["urgency"] == "due"]
        + [(c, "done") for c in chores
           if c["id"] in recent_done and not is_open(c)],
        key=lambda pair: (_PRIORITY_RANK.get(pair[0]["priority"], 9),
                          pair[0]["name"]))
    achter = sorted(
        (c for c in chores if c["overdue_days"] > 0),
        key=lambda c: -(c["cycle_fraction"] or 0))
    return ([rij(c, status) for c, status in vandaag]
            + [rij(c, "overdue") for c in achter])[:_TASKS_TODAY_LIMIT]


_RECENT_COMPLETIONS_LIMIT = 8


def _recent_completions(database_path: str) -> list[dict]:
    """De laatste acht voltooiingen voor Lovelace, nieuwste eerst: dezelfde
    feed-query als het panel, maar compact (geen notities). Met `id` kan een
    kaart chores_manager.revert_completion aanroepen — een "laatst
    gedaan"-lijst waarin een verkeerd afgevinkte taak terug kan."""
    return [
        {
            "id": row["id"],
            "chore_id": row["chore_id"],
            "chore_name": row["chore_name"],
            "icon": row["icon"],
            "assignee_id": row["assignee_id"],
            "assignee_name": row["assignee_name"],
            "assignee_color": row["color"],
            "completed_at": row["completed_at"],
            "minutes": row["minutes"],
            "is_full": bool(row["is_full_completion"]),
            "subtask_name": row["subtask_name"],
        }
        for row in feed(database_path, _RECENT_COMPLETIONS_LIMIT)
    ]


def overview(database_path: str, today: date, now: Optional[datetime] = None,
             recent_done_seconds: int = 0) -> dict:
    """De samenvatting van §2.4: sensortoestand plus attributen.

    Met `now` en `recent_done_seconds` (de sensor geeft
    const.RECENT_DONE_SECONDS mee; const.py zelf kan hier niet geïmporteerd
    worden, want die importeert HA) bevat tasks_today ook net-afgevinkte
    taken met status "done". Zonder: alleen wat openstaat. De tellers
    (open_today, due_today, overdue) tellen done-rijen nooit mee.
    """
    chores = [enrich_chore(database_path, chore, today)
              for chore in list_chores(database_path)]
    due_today = sum(1 for c in chores if c["urgency"] == "due")
    overdue = sum(1 for c in chores if c["overdue_days"] > 0)
    assignees_by_id = {a["id"]: a for a in list_assignees(database_path)}
    recent_done = (
        recent_full_completions(
            database_path, now - timedelta(seconds=recent_done_seconds))
        if now is not None and recent_done_seconds > 0 else {})
    board = leaderboard(database_path, today)
    streaks = assignee_streaks(database_path, today)
    # Iedereen die iets deed telt mee, mét de ranglijstvlag erbij: filteren
    # is presentatie en hoort bij de afnemer (Lovelace), niet bij de sensor.
    # De kleur zit erbij (fase 5) zodat een kaart de naam kan kleuren.
    persons = {
        p["id"]: {
            "name": p["name"],
            "minutes": p["minutes"],
            "tasks": p["tasks"],
            "streak": streaks.get(p["id"], 0),
            "in_leaderboard": bool(p["include_in_leaderboard"]),
            "color": p.get("color"),
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
        "tasks_today": _tasks_today(chores, assignees_by_id, recent_done),
        "recent_completions": _recent_completions(database_path),
    }


_PRIORITY_RANK = {"critical": 0, "high": 1, "normal": 2, "low": 3}


def notification_summary(database_path: str, today: date) -> dict:
    """Per actieve persoon wat er nú speelt, voor de ochtendmelding (§6).

    'anyone'-taken tellen voor iedereen mee; 'fixed' en 'rotating' alleen
    voor wie aan de beurt is. Alleen vandaag en achterstand — upcoming hoort
    niet in een ochtendmelding. De lijsten zijn voorgesorteerd op
    belangrijkheid (achterstand op cyclusfractie, vandaag op prioriteit en
    dan duur), zodat pick_notify_action gewoon de kop pakt.
    """
    chores = [enrich_chore(database_path, chore, today)
              for chore in list_chores(database_path)]
    summary = {}
    for person in list_assignees(database_path):
        mine = [c for c in chores
                if c["assignment_type"] == "anyone"
                or c["current_assignee"] == person["id"]]
        due = sorted(
            (c for c in mine if c["urgency"] == "due"),
            key=lambda c: (_PRIORITY_RANK.get(c["priority"], 9),
                           c["duration_minutes"]))
        overdue = sorted(
            (c for c in mine if c["overdue_days"] > 0),
            key=lambda c: -(c["cycle_fraction"] or 0))
        summary[person["id"]] = {
            "assignee": dict(person), "due": due, "overdue": overdue}
    return summary


def pick_notify_action(due: list, overdue: list):
    """De taak achter de ene "Klaar"-knop in de ochtendmelding.

    Eerst de zwaarste achterstand (hoogste cyclusfractie — die dreigt bij de
    volgende rol door te schuiven, dus daar helpt een knop het meest),
    anders de belangrijkste taak van vandaag (prioriteit, bij gelijke
    prioriteit de kortste: de laagste drempel om 'm echt in te drukken).
    De lijsten komen voorgesorteerd uit notification_summary.
    """
    if overdue:
        return overdue[0]
    if due:
        return due[0]
    return None


def build_state(database_path: str, today: date, feed_limit: int = 100) -> dict:
    """De volledige begintoestand voor chores_manager/state (§2.3).

    Sinds 3b ook met weekhistorie (Activiteit-scherm) en de vlaggen die de
    beheer-UI nodig heeft om verwijderen eerlijk aan te kondigen: has_history
    per taak en in_use per persoon (archiveren versus echt weg, het
    2b-besluit).
    """
    counts = history_counts(database_path)
    chores = []
    archived = []
    for chore in list_chores(database_path, include_inactive=True):
        if not chore["active"]:
            # gearchiveerd (E1): alleen wat Beheer nodig heeft om ze te
            # tonen en terug te zetten — geen urgentie, die is betekenisloos
            archived.append({
                "id": chore["id"],
                "name": chore["name"],
                "icon": chore["icon"],
                "schedule_type": chore["schedule_type"],
                "schedule_config": chore["schedule_config"],
            })
            continue
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
        "archived_chores": archived,
        "assignees": assignees,
        "leaderboard": board,
        "feed": feed(database_path, feed_limit),
        "week_history": week_history(database_path, today),
        "completed_today": completed_today_count(database_path, today),
    }
