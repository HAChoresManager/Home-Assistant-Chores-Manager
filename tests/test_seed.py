"""De seed (TIJDELIJK, fase 2b) tegen de vertaaltabel en de nachtelijke rol.

Dit is de brug tussen 2a en 2b: seed de acht taken met hun verouderde
legacy-next_due, draai één keer de rol, en de uitkomsten moeten exact de
tabel uit de fase 2a-rapportage zijn.
"""
from datetime import date

import pytest

from chores_manager.seed import SEED_CHORES, seed_v2
from chores_manager.db.chores import get_chore, list_chores, roll_all_forward
from chores_manager.db.overview import build_state, overview
from chores_manager.db.subtasks import list_subtasks

OPNAMEDAG = date(2026, 7, 28)
NU = "2026-07-28T10:00:00+02:00"

# id -> next_due na de nachtelijke rol op de opnamedag (de 2a-tabel)
NA_DE_ROL = {
    "wasmachine": "2026-07-28",
    "planten": "2026-07-26",
    "vaatwasser_in-_en_uitruimen": "2026-07-28",
    "ah_boodschappenlijst_maken": "2026-07-22",
    "apparatuur_onderhoud": "2026-07-25",
    "lunch_trommels_vullen": "2026-07-28",
    "vriezer_ontdooien": "2026-04-04",
    "afzuigkap_koolstoffilter_wassen": "2026-04-18",
}


@pytest.fixture
def db(tmp_path):
    pad = str(tmp_path / "chores_v2.db")
    resultaat = seed_v2(pad, OPNAMEDAG, NU)
    assert resultaat == {"assignees": 3, "chores": 8, "subtasks": 4}
    return pad


def test_seed_is_idempotent(db):
    seed_v2(db, OPNAMEDAG, NU)
    assert len(list_chores(db)) == 8
    assert len(list_subtasks(db, "afzuigkap_koolstoffilter_wassen")) == 4


def test_wie_kan_bestaat_niet_meer(db):
    state = build_state(db, OPNAMEDAG)
    assert {a["id"] for a in state["assignees"]} == {"laura", "martijn", "noud"}
    anyone = {c["id"] for c in state["chores"] if c["assignment_type"] == "anyone"}
    assert anyone == {"planten", "lunch_trommels_vullen"}


def test_boodschappen_roteert_en_martijn_is_aan_de_beurt(db):
    state = build_state(db, OPNAMEDAG)
    bood = next(c for c in state["chores"] if c["id"] == "ah_boodschappenlijst_maken")
    assert bood["rotation"] == ["martijn", "laura"]
    assert bood["current_assignee"] == "martijn"


def test_voor_de_rol_alles_verouderd(db):
    data = overview(db, OPNAMEDAG)
    assert data["open_today"] == 8
    assert data["overdue"] == 8
    assert data["due_today"] == 0


def test_de_rol_geeft_exact_de_2a_tabel(db):
    changes = roll_all_forward(db, OPNAMEDAG, NU)
    # de twee interval-taken staan binnen hun cyclus en veranderen niet
    assert {c[0] for c in changes} == set(NA_DE_ROL) - {
        "vriezer_ontdooien", "afzuigkap_koolstoffilter_wassen"}
    for chore_id, verwacht in NA_DE_ROL.items():
        assert get_chore(db, chore_id)["next_due"] == verwacht, chore_id
    data = overview(db, OPNAMEDAG)
    assert data["open_today"] == 8
    assert data["due_today"] == 3   # was, keuken, lunchtrommels
    assert data["overdue"] == 5     # planten, apparatuur, boodschappen + 2 interval


def test_alle_seed_taken_dekken_de_acht_legacy_ids():
    assert {c["id"] for c in SEED_CHORES} == set(NA_DE_ROL)
