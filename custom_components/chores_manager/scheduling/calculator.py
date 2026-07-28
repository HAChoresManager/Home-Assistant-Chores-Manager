"""Vervaldatums (§4.2), achterstand en urgentie (§4.3), rotatie (§4.4).

Alle functies zijn puur: "vandaag" komt altijd als parameter binnen en er wordt
nergens naar de klok gekeken. De nachtelijke rol van 03:00 (scheduler.py, fase
2b) doet niets anders dan roll_forward aanroepen per taak.

Twee besluiten die het plan openliet, hier vastgelegd:

- **Afkappen op maandeinde.** Een maanddag die een maand niet heeft (31 in
  juni, 29 februari buiten een schrikkeljaar) valt op de laatste dag van die
  maand. De taak bestaat dus elke maand respectievelijk elk jaar.
- **Interval-taken rollen ook per hele cycli door.** Wie meer dan één volledige
  cyclus achterloopt, rolt in roll_forward door naar de meest recente geplande
  keer — overgeslagen cycli stapelen niet, precies zoals bij de kalendertypen
  (§4.2). Binnen één cyclus verandert er niets: 100 dagen te laat op een
  180-dagentaak blijft 100 dagen te laat.
"""
from __future__ import annotations

import calendar
from datetime import date, timedelta

from .types import (
    DAILY,
    INTERVAL,
    MONTHLY,
    WEEKLY,
    YEARLY,
    ScheduleError,
    validate_schedule,
)

# Coulance in dagen per prioriteit (§4.3)
GRACE_DAYS = {"low": 7, "normal": 3, "high": 1, "critical": 0}

# Urgentietoestanden
UPCOMING = "upcoming"  # vóór de vervaldatum — neutraal
DUE = "due"            # vandaag aan de beurt
GRACE = "grace"        # over tijd, binnen de coulance — gedempt
URGENT = "urgent"      # over tijd, coulance voorbij — nadrukkelijk


# --- kalenderrooster -------------------------------------------------------

def _clamped(year: int, month: int, day: int) -> date:
    """Datum in (year, month), afgekapt op de laatste dag van die maand."""
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


def _next_in_weekdays(start: date, weekdays: set, strict: bool) -> date:
    day = start + timedelta(days=1) if strict else start
    for offset in range(7):
        candidate = day + timedelta(days=offset)
        if candidate.isoweekday() in weekdays:
            return candidate
    raise ScheduleError("geen geldige weekdag gevonden")  # onbereikbaar na validatie


def _prev_in_weekdays(start: date, weekdays: set) -> date:
    for offset in range(7):
        candidate = start - timedelta(days=offset)
        if candidate.isoweekday() in weekdays:
            return candidate
    raise ScheduleError("geen geldige weekdag gevonden")


def _next_monthly(start: date, monthday: int, strict: bool) -> date:
    candidate = _clamped(start.year, start.month, monthday)
    if candidate > start or (not strict and candidate == start):
        return candidate
    year, month = (start.year + 1, 1) if start.month == 12 else (start.year, start.month + 1)
    return _clamped(year, month, monthday)


def _prev_monthly(start: date, monthday: int) -> date:
    candidate = _clamped(start.year, start.month, monthday)
    if candidate <= start:
        return candidate
    year, month = (start.year - 1, 12) if start.month == 1 else (start.year, start.month - 1)
    return _clamped(year, month, monthday)


def _next_yearly(start: date, month: int, day: int, strict: bool) -> date:
    candidate = _clamped(start.year, month, day)
    if candidate > start or (not strict and candidate == start):
        return candidate
    return _clamped(start.year + 1, month, day)


def _prev_yearly(start: date, month: int, day: int) -> date:
    candidate = _clamped(start.year, month, day)
    if candidate <= start:
        return candidate
    return _clamped(start.year - 1, month, day)


def _next_occurrence(schedule_type: str, cfg: dict, start: date, strict: bool) -> date:
    if schedule_type == DAILY:
        return _next_in_weekdays(start, set(cfg["weekdays"]), strict)
    if schedule_type == WEEKLY:
        return _next_in_weekdays(start, {cfg["weekday"]}, strict)
    if schedule_type == MONTHLY:
        return _next_monthly(start, cfg["monthday"], strict)
    if schedule_type == YEARLY:
        return _next_yearly(start, cfg["month"], cfg["day"], strict)
    raise ScheduleError(f"{schedule_type} heeft geen kalenderrooster")


def _prev_occurrence(schedule_type: str, cfg: dict, start: date) -> date:
    if schedule_type == DAILY:
        return _prev_in_weekdays(start, set(cfg["weekdays"]))
    if schedule_type == WEEKLY:
        return _prev_in_weekdays(start, {cfg["weekday"]})
    if schedule_type == MONTHLY:
        return _prev_monthly(start, cfg["monthday"])
    if schedule_type == YEARLY:
        return _prev_yearly(start, cfg["month"], cfg["day"])
    raise ScheduleError(f"{schedule_type} heeft geen kalenderrooster")


# --- vervaldatums (§4.2) ---------------------------------------------------

def initial_next_due(schedule_type: str, config: dict, today: date) -> date:
    """next_due bij het aanmaken van een taak.

    Kalendertypen: de eerste geplande keer op of na vandaag. Interval: vandaag
    zelf — een nieuwe interval-taak is meteen aan de beurt. Wil je dat niet
    (je hebt de vriezer net ontdooid), geef dan bij het aanmaken expliciet een
    next_due mee; dat besluit ligt bij de aanroeper, niet hier.
    """
    cfg = validate_schedule(schedule_type, config)
    if schedule_type == INTERVAL:
        return today
    return _next_occurrence(schedule_type, cfg, today, strict=False)


def next_due_after_completion(schedule_type: str, config: dict, completed_on: date) -> date:
    """§4.2, bij afvinken: de eerstvolgende geplande keer ná de voltooiingsdag."""
    cfg = validate_schedule(schedule_type, config)
    if schedule_type == INTERVAL:
        return completed_on + timedelta(days=cfg["days"])
    return _next_occurrence(schedule_type, cfg, completed_on, strict=True)


def roll_forward(schedule_type: str, config: dict, next_due: date, today: date) -> date:
    """§4.2, de nachtelijke rol.

    Staat next_due op of na vandaag, dan verandert er niets. Staat hij in het
    verleden, dan rolt hij door naar de meest recente geplande keer op of vóór
    vandaag. Een dagelijkse taak die maanden bleef liggen komt zo op vandaag
    uit; een wekelijkse op de laatste geplande weekdag; een interval-taak
    verschuift alleen per hele cycli (zie moduledocstring).

    Er wordt nooit teruggerold: een handmatig gezette next_due die buiten het
    rooster valt (bv. gisteren, op een donderdag, bij een woensdagtaak) blijft
    staan tot het rooster hem inhaalt.
    """
    cfg = validate_schedule(schedule_type, config)
    if next_due >= today:
        return next_due
    if schedule_type == INTERVAL:
        cycles = (today - next_due).days // cfg["days"]
        return next_due + timedelta(days=cycles * cfg["days"])
    return max(_prev_occurrence(schedule_type, cfg, today), next_due)


def overdue_days(next_due: date, today: date) -> int:
    """§4.2: dagen over tijd; 0 voor vandaag en alles in de toekomst."""
    return max(0, (today - next_due).days)


# --- urgentie (§4.3) -------------------------------------------------------

def urgency(next_due: date, priority: str, today: date) -> str:
    """Urgentietoestand: neutraal tot de vervaldatum, gedempt binnen de
    coulance, nadrukkelijk daarna.

    Bij coulance 0 (critical) bestaat de gedempte toestand niet: één dag over
    tijd is meteen URGENT.
    """
    if priority not in GRACE_DAYS:
        raise ScheduleError(f"onbekende prioriteit {priority!r}")
    days_over = (today - next_due).days
    if days_over < 0:
        return UPCOMING
    if days_over == 0:
        return DUE
    if days_over <= GRACE_DAYS[priority]:
        return GRACE
    return URGENT


# --- rotatie (§4.4) --------------------------------------------------------

def current_assignee(rotation: list, rotation_index: int):
    """Wie is aan de beurt. None bij een lege rotatie; een index die buiten de
    lijst is geraakt (rotatie ingekort) vouwt modulo terug in plaats van te
    crashen."""
    if not rotation:
        return None
    return rotation[rotation_index % len(rotation)]


def advance_rotation(rotation: list, rotation_index: int) -> int:
    """Bij afvinken schuift de index één plek op, met wrap naar 0."""
    if not rotation:
        return 0
    return (rotation_index + 1) % len(rotation)
