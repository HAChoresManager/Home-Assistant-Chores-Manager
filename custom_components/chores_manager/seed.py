"""TIJDELIJK — seed van de v2-database met de acht legacy-taken.

Bron: docs/legacy-state.yaml (momentopname 28-07-2026) vertaald met de
vertaaltabel uit tests/test_legacy_tasks.py. De data staat hier hard
ingebakken omdat docs/ niet wordt meegedeployed naar Home Assistant.

Bedoeld om fase 2b te kunnen verifiëren, en hij bespaart handwerk in fase 5.
Zodra de taken in fase 5 definitief zijn ingevoerd, gaan dit bestand en de
service chores_manager.v2_seed weg.

De next_due-waarden zijn bewust de verouderde legacy-waarden: zo demonstreert
één draai van de nachtelijke rol (service chores_manager.v2_roll) het gedrag
van §4.2 op echte data — dagelijkse taken komen op vandaag uit, de
interval-taken houden hun betekenisvolle achterstand.

Geen Home Assistant-imports: dit bestand is met pytest te testen. De
serviceregistratie zit in v2_setup.py.
"""
from __future__ import annotations

from .store.assignees import save_assignee
from .store.chores import save_chore
from .store.schema import create_database
from .store.subtasks import set_subtasks

# Wie kan is bewust GEEN persoon meer (§3.1): die twee taken worden 'anyone'.
# Noud doet mee met eigen streak maar buiten de tijdsranglijst (§10.1).
SEED_ASSIGNEES = [
    {"id": "laura", "name": "Laura", "color": "#83c44a", "sort_order": 0},
    {"id": "martijn", "name": "Martijn", "color": "#4dd8ff", "sort_order": 1},
    {"id": "noud", "name": "Noud", "color": "#013589", "sort_order": 2,
     "include_in_leaderboard": 0},
]

# De vier beschrijvingsstappen van de afzuigkap worden echte deeltaken (§4.5).
AFZUIGKAP_STAPPEN = [
    "Filter en houder losmaken en in vaatwasser op heetste (70 graden - P3) programma.",
    "Randjes aan binnenkant afzuigkap schoonmaken.",
    "Wanneer vaatwasser klaar het koolstoffilter in een voorverwarmde oven leggen op 80 graden voor 10 minuten.",
    "Terugplaatsen filter in houder en terugplaatsen in afzuigkap.",
]

SEED_CHORES = [
    {
        "id": "wasmachine", "name": "Was draaien", "icon": "👕",
        "description": "Voor 19:00", "duration_minutes": 20,
        "schedule_type": "daily",
        "schedule_config": {"weekdays": [1, 2, 3, 4, 5, 6, 7]},
        "assignment_type": "fixed", "assigned_to": "laura",
        "next_due": "2025-10-19",
    },
    {
        "id": "planten", "name": "Planten water geven", "icon": "🌱",
        "duration_minutes": 5,
        "schedule_type": "daily", "schedule_config": {"weekdays": [3, 7]},
        "assignment_type": "anyone",
        "next_due": "2025-10-26",
    },
    {
        "id": "vaatwasser_in-_en_uitruimen", "name": "Keuken opruimen",
        "icon": "🍽️", "duration_minutes": 20,
        "schedule_type": "daily",
        "schedule_config": {"weekdays": [1, 2, 3, 4, 5, 6, 7]},
        "assignment_type": "fixed", "assigned_to": "martijn",
        "next_due": "2025-10-26",
    },
    {
        # Enige echte rotatie in de legacy-data. Martijn stond toegewezen en
        # is dus aan de beurt: index 0 in ["martijn", "laura"].
        "id": "ah_boodschappenlijst_maken", "name": "AH Boodschappenlijst maken",
        "icon": "🛒", "duration_minutes": 30,
        "schedule_type": "weekly", "schedule_config": {"weekday": 3},
        "assignment_type": "rotating", "rotation": ["martijn", "laura"],
        "rotation_index": 0,
        "next_due": "2025-10-29",
    },
    {
        "id": "apparatuur_onderhoud", "name": "Apparatuur onderhoud",
        "icon": "📋", "duration_minutes": 30,
        "schedule_type": "weekly", "schedule_config": {"weekday": 6},
        "assignment_type": "fixed", "assigned_to": "martijn",
        "next_due": "2026-01-31",
    },
    {
        "id": "lunch_trommels_vullen", "name": "Lunch trommels vullen",
        "icon": "🍲", "duration_minutes": 15,
        "schedule_type": "daily",
        "schedule_config": {"weekdays": [1, 2, 3, 4, 5]},
        "assignment_type": "anyone",
        "next_due": "2026-02-04",
    },
    {
        "id": "vriezer_ontdooien", "name": "Vriezer keuken ontdooien",
        "icon": "🧊", "duration_minutes": 30,
        "schedule_type": "interval", "schedule_config": {"days": 180},
        "assignment_type": "fixed", "assigned_to": "laura",
        "next_due": "2026-04-04",
    },
    {
        "id": "afzuigkap_koolstoffilter_wassen",
        "name": "Afzuigkap koolstoffilter wassen",
        "icon": "💨", "duration_minutes": 15,
        "schedule_type": "interval", "schedule_config": {"days": 180},
        "assignment_type": "fixed", "assigned_to": "martijn",
        "subtask_mode": "checklist",
        "next_due": "2026-04-18",
    },
]


def seed_v2(database_path: str, today, now_iso: str) -> dict:
    """Zet de acht taken en drie personen in de v2-database.

    Idempotent: bestaande rijen worden op id bijgewerkt, voltooiingen blijven
    staan. Geeft een samenvatting terug voor het servicelog.
    """
    create_database(database_path)
    for assignee in SEED_ASSIGNEES:
        save_assignee(database_path, assignee)
    for chore in SEED_CHORES:
        save_chore(database_path, chore, today, now_iso)
    set_subtasks(database_path, "afzuigkap_koolstoffilter_wassen", AFZUIGKAP_STAPPEN)
    return {
        "assignees": len(SEED_ASSIGNEES),
        "chores": len(SEED_CHORES),
        "subtasks": len(AFZUIGKAP_STAPPEN),
    }
