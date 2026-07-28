"""De acht legacy-taken uit docs/legacy-state.yaml als testgevallen.

Twee doelen tegelijk:

1. **De vertaaltabel legacy -> v2.** V2_MAPPING is de blauwdruk voor het
   opnieuw invoeren van de taken in fase 5. Let op het weekdagverschil: legacy
   telt 0-based vanaf maandag, v2 gebruikt ISO 1-7. Het bewijs zit in de data
   en wordt hieronder getest: legacy weekday 2 hoort bij next_due_date
   2025-10-29 (een woensdag), legacy weekday 5 bij 2026-01-31 (een zaterdag).

2. **De kern van §4.2 op echte data.** In het oude systeem waren alle acht
   taken rood (282 tot 101 dagen te laat). Na één nachtelijke rol op de
   opnamedag: drie taken gewoon "vandaag", twee binnen de coulance, drie echt
   urgent — en die drie zijn het ook echt waard.

De opnamedag (2026-07-28) wordt niet aangenomen maar per taak afgeleid uit
next_due_date - days_until_due; de test eist dat alle acht op dezelfde dag
uitkomen.
"""
from datetime import date, timedelta
from pathlib import Path

import pytest
import yaml

from scheduling.calculator import DUE, GRACE, URGENT, overdue_days, roll_forward, urgency
from scheduling.types import validate_schedule

LEGACY_PATH = Path(__file__).resolve().parents[1] / "docs" / "legacy-state.yaml"

# id -> (schedule_type, schedule_config, next_due na de nachtelijke rol op de
# opnamedag, achterstand in dagen daarna, urgentie bij prioriteit normal).
# Alle legacy-taken staan op "Middel" -> normal (coulance 3).
V2_MAPPING = {
    # Dagelijks, alle dagen actief. Oud: 282 dagen te laat — dé bug.
    "wasmachine": (
        "daily", {"weekdays": [1, 2, 3, 4, 5, 6, 7]}, date(2026, 7, 28), 0, DUE),
    # "Meerdere keren per week", active_days wo+zo -> daily [3, 7] (§4.1).
    "planten": (
        "daily", {"weekdays": [3, 7]}, date(2026, 7, 26), 2, GRACE),
    # Dagelijks, active_days null -> alle dagen.
    "vaatwasser_in-_en_uitruimen": (
        "daily", {"weekdays": [1, 2, 3, 4, 5, 6, 7]}, date(2026, 7, 28), 0, DUE),
    # Wekelijks, legacy weekday 2 = woensdag -> ISO 3. Enige taak met
    # use_alternating 1: wordt rotating ["martijn", "laura"] in v2.
    "ah_boodschappenlijst_maken": (
        "weekly", {"weekday": 3}, date(2026, 7, 22), 6, URGENT),
    # Wekelijks, legacy weekday 5 = zaterdag -> ISO 6.
    "apparatuur_onderhoud": (
        "weekly", {"weekday": 6}, date(2026, 7, 25), 3, GRACE),
    # "Wekelijks" met frequency_times 5 en active_days ma-vr -> daily [1-5]
    # (§4.1: lunchtrommels). Opnamedag is een dinsdag -> gewoon vandaag.
    "lunch_trommels_vullen": (
        "daily", {"weekdays": [1, 2, 3, 4, 5]}, date(2026, 7, 28), 0, DUE),
    # Halfjaarlijks -> interval 180. 115 dagen te laat is minder dan één
    # cyclus, dus dat blijft 115 — betekenisvolle achterstand (§4.2).
    "vriezer_ontdooien": (
        "interval", {"days": 180}, date(2026, 4, 4), 115, URGENT),
    "afzuigkap_koolstoffilter_wassen": (
        "interval", {"days": 180}, date(2026, 4, 18), 101, URGENT),
}


@pytest.fixture(scope="module")
def attrs():
    data = yaml.safe_load(LEGACY_PATH.read_text(encoding="utf-8"))
    return data["attributes"]


@pytest.fixture(scope="module")
def tasks(attrs):
    return {t["id"]: t for t in attrs["overdue_tasks"]}


@pytest.fixture(scope="module")
def opnamedag(tasks):
    dagen = {date.fromisoformat(t["next_due_date"]) - timedelta(days=t["days_until_due"])
             for t in tasks.values()}
    assert dagen == {date(2026, 7, 28)}, f"momentopname niet intern consistent: {dagen}"
    return dagen.pop()


def test_de_acht_taken_zijn_compleet_gedekt(tasks):
    assert set(tasks) == set(V2_MAPPING)
    assert len(tasks) == 8


def test_alle_v2_configs_valideren(tasks):
    for chore_id, (schedule_type, config, *_rest) in V2_MAPPING.items():
        assert validate_schedule(schedule_type, config) == config, chore_id


def test_alle_legacy_prioriteiten_zijn_middel(tasks):
    # documenteert waarom de urgentieverwachtingen op 'normal' rekenen
    assert {t["priority"] for t in tasks.values()} == {"Middel"}


@pytest.mark.parametrize("chore_id", sorted(V2_MAPPING))
class TestNachtelijkeRolOpEchteData:
    def test_rol_en_achterstand(self, tasks, opnamedag, chore_id):
        schedule_type, config, verwacht_due, verwacht_over, verwacht_urgentie = V2_MAPPING[chore_id]
        legacy_due = date.fromisoformat(tasks[chore_id]["next_due_date"])

        rolled = roll_forward(schedule_type, config, legacy_due, opnamedag)
        assert rolled == verwacht_due
        assert overdue_days(rolled, opnamedag) == verwacht_over
        assert urgency(rolled, "normal", opnamedag) == verwacht_urgentie

    def test_achterstand_wordt_nooit_groter(self, tasks, opnamedag, chore_id):
        schedule_type, config, *_ = V2_MAPPING[chore_id]
        legacy_due = date.fromisoformat(tasks[chore_id]["next_due_date"])
        oud = -tasks[chore_id]["days_until_due"]

        rolled = roll_forward(schedule_type, config, legacy_due, opnamedag)
        assert overdue_days(rolled, opnamedag) <= oud


def test_van_acht_keer_rood_naar_drie_echt_urgent(tasks, opnamedag):
    # Oud: 8/8 overdue. Nieuw: rood is zeldzaam en betekent iets (§4.3).
    telling = {DUE: 0, GRACE: 0, URGENT: 0}
    for chore_id, (schedule_type, config, *_rest) in V2_MAPPING.items():
        legacy_due = date.fromisoformat(tasks[chore_id]["next_due_date"])
        rolled = roll_forward(schedule_type, config, legacy_due, opnamedag)
        telling[urgency(rolled, "normal", opnamedag)] += 1
    assert all(t["is_overdue"] for t in tasks.values())  # oud beeld: alles rood
    assert telling == {DUE: 3, GRACE: 2, URGENT: 3}      # nieuw beeld


class TestWeekdagnummering:
    """Legacy is 0-based vanaf maandag; bewijs uit de data zelf."""

    def test_weekday_2_is_woensdag(self, tasks):
        taak = tasks["ah_boodschappenlijst_maken"]
        assert taak["weekday"] == 2
        assert date.fromisoformat(taak["next_due_date"]).isoweekday() == 3  # ISO: wo

    def test_weekday_5_is_zaterdag(self, tasks):
        taak = tasks["apparatuur_onderhoud"]
        assert taak["weekday"] == 5
        assert date.fromisoformat(taak["next_due_date"]).isoweekday() == 6  # ISO: za


class TestBevestigingenVanHetPlan:
    """Claims uit het plan die de momentopname hard maakt."""

    def test_wie_kan_is_een_nepgebruiker(self, attrs, tasks):
        # §3.1: "Wie kan" staat als assignee in de database
        assert "wie_kan" in {a["id"] for a in attrs["assignees"]}
        # en twee taken zijn eraan toegewezen -> assignment_type 'anyone' in v2
        wie_kan = {cid for cid, t in tasks.items() if t["assigned_to"] == "Wie kan"}
        assert wie_kan == {"planten", "lunch_trommels_vullen"}

    def test_twee_taken_tellen_nergens_mee(self, attrs):
        # §3.1: de stats tellen alleen Laura (2) en Martijn (4) — 6 van de 8
        totalen = {naam: s["total_tasks"] for naam, s in attrs["stats"].items()}
        assert totalen == {"Laura": 2, "Martijn": 4}

    def test_alleen_boodschappen_roteert(self, tasks):
        # §4.4 zegt "bij vijf taken gevuld terwijl use_alternating op 0 staat";
        # de data is nét anders: vijf taken hebben alternate_with gevuld, maar
        # bij één daarvan (de boodschappenlijst) staat use_alternating aan.
        # Vier dode instellingen dus, plus één echte rotatie.
        echt = {cid for cid, t in tasks.items() if t["use_alternating"] == 1}
        assert echt == {"ah_boodschappenlijst_maken"}
        gevuld = {cid for cid, t in tasks.items() if t["alternate_with"]}
        assert len(gevuld) == 5
        dode_instelling = {cid for cid, t in tasks.items()
                           if t["alternate_with"] and not t["use_alternating"]}
        assert len(dode_instelling) == 4

    def test_afzuigkap_beschrijving_is_een_checklist(self, tasks):
        # §4.5: vier stappen als platte tekst -> subtask_mode 'checklist' in v2
        stappen = tasks["afzuigkap_koolstoffilter_wassen"]["description"].splitlines()
        assert len(stappen) == 4

    def test_niemand_is_gekoppeld_aan_ha(self, attrs):
        # §6: ha_user_id is null bij iedereen — eerst koppelen, dan bouwen
        assert all(a["ha_user_id"] is None for a in attrs["assignees"])
