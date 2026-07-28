"""De vijf planningstypen en validatie van schedule_config (§4.1).

| schedule_type | schedule_config           | voorbeeld                        |
|---------------|---------------------------|----------------------------------|
| daily         | {"weekdays": [1, ..., 7]} | elke dag, of alleen wo en zo     |
| weekly        | {"weekday": 3}            | elke woensdag                    |
| monthly       | {"monthday": 15}          | elke maand op de 15e             |
| interval      | {"days": 180}             | elke 180 dagen na afvinken       |
| yearly        | {"month": 6, "day": 15}   | elk jaar op 15 juni              |

ISO-weekdagen: 1 = maandag, 7 = zondag.

Validatie is bewust streng: onbekende sleutels zijn een fout. Het oude schema
ging juist stuk aan zes overlappende velden die elkaar tegenspraken; dat mag
hier niet opnieuw insluipen.
"""
from __future__ import annotations

import json
from typing import Any

DAILY = "daily"
WEEKLY = "weekly"
MONTHLY = "monthly"
INTERVAL = "interval"
YEARLY = "yearly"
SCHEDULE_TYPES = (DAILY, WEEKLY, MONTHLY, INTERVAL, YEARLY)

# Hoogste geldige dag per maand; februari op 29 zodat een planning op de
# schrikkeldag geldig is. Hoe niet-schrikkeljaren daarmee omgaan bepaalt de
# calculator: afkappen op de laatste dag van de maand.
_MAX_DAY = (31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)

_ALLOWED_KEYS = {
    DAILY: {"weekdays"},
    WEEKLY: {"weekday"},
    MONTHLY: {"monthday"},
    INTERVAL: {"days"},
    YEARLY: {"month", "day"},
}


class ScheduleError(ValueError):
    """Ongeldig planningstype of ongeldige schedule_config."""


def _require_int(config: dict, key: str, low: int, high: int) -> int:
    value = config.get(key)
    # bool is een subklasse van int; True als weekdag is een fout, geen 1
    if isinstance(value, bool) or not isinstance(value, int):
        raise ScheduleError(f"'{key}' moet een geheel getal zijn, kreeg {value!r}")
    if not low <= value <= high:
        raise ScheduleError(f"'{key}' moet tussen {low} en {high} liggen, kreeg {value}")
    return value


def parse_schedule_config(text: str) -> dict:
    """Lees een schedule_config zoals die als JSON-tekst in de database staat."""
    try:
        config = json.loads(text)
    except (TypeError, json.JSONDecodeError) as err:
        raise ScheduleError(f"schedule_config is geen geldige JSON: {err}") from err
    if not isinstance(config, dict):
        raise ScheduleError("schedule_config moet een JSON-object zijn")
    return config


def validate_schedule(schedule_type: str, config: Any) -> dict:
    """Controleer een schedule_config en geef de genormaliseerde vorm terug.

    Genormaliseerd betekent: alleen de toegestane sleutels, weekdagen gesorteerd
    en ontdubbeld gecontroleerd. De teruggegeven dict is veilig om als JSON op
    te slaan.
    """
    if schedule_type not in SCHEDULE_TYPES:
        raise ScheduleError(f"onbekend schedule_type {schedule_type!r}")
    if not isinstance(config, dict):
        raise ScheduleError(f"schedule_config moet een dict zijn, kreeg {type(config).__name__}")

    unknown = set(config) - _ALLOWED_KEYS[schedule_type]
    if unknown:
        raise ScheduleError(
            f"onbekende sleutels voor {schedule_type}: {sorted(unknown)}")

    if schedule_type == DAILY:
        weekdays = config.get("weekdays")
        if not isinstance(weekdays, (list, tuple)) or not weekdays:
            raise ScheduleError("'weekdays' moet een niet-lege lijst zijn")
        for day in weekdays:
            if isinstance(day, bool) or not isinstance(day, int) or not 1 <= day <= 7:
                raise ScheduleError(f"weekdag moet 1-7 zijn (ISO), kreeg {day!r}")
        if len(set(weekdays)) != len(weekdays):
            raise ScheduleError("'weekdays' bevat dubbele waarden")
        return {"weekdays": sorted(weekdays)}

    if schedule_type == WEEKLY:
        return {"weekday": _require_int(config, "weekday", 1, 7)}

    if schedule_type == MONTHLY:
        return {"monthday": _require_int(config, "monthday", 1, 31)}

    if schedule_type == INTERVAL:
        return {"days": _require_int(config, "days", 1, 3650)}

    # YEARLY
    month = _require_int(config, "month", 1, 12)
    day = _require_int(config, "day", 1, _MAX_DAY[month - 1])
    return {"month": month, "day": day}
