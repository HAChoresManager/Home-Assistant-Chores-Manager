"""Afwezigheid per persoon (v2.7), deel 2: wat de rest ervan merkt. De
sensor (overview) en de WS-state (build_state) rekenen met de effectieve
toewijzing, de ochtendsamenvatting slaat de afwezige over, afvinken werkt
gewoon (ook door wie weg is) en schuift de beurt vanaf de doener, weken in
een afwezigheid zijn voor diens streak neutraal, en de vakantiemodus wint.

Vaste datums: 2026-10-07 is een woensdag (VANDAAG); weken beginnen op
maandag: 2026-09-21, -28, 2026-10-05, -12.
"""
from datetime import date, datetime, timedelta

import pytest

from chores_manager.db.absences import end_absence, start_absence
from chores_manager.db.assignees import save_assignee
from chores_manager.db.chores import get_chore, save_chore
from chores_manager.db.completions import assignee_streaks, complete_chore, leaderboard
from chores_manager.db.overview import build_state, notification_summary, overview
from chores_manager.db.schema import create_database
from chores_manager.db.vacations import end_vacation, start_vacation

VANDAAG = date(2026, 10, 7)  # woensdag
ELKE_DAG = {"weekdays": [1, 2, 3, 4, 5, 6, 7]}


def _tijd(dag: date, minuut: int = 0) -> str:
    return f"{dag.isoformat()}T10:{minuut:02d}:00+02:00"


@pytest.fixture
def db(tmp_path):
    pad = str(tmp_path / "chores_v2.db")
    create_database(pad)
    for order, (slug, name, color) in enumerate((
            ("laura", "Laura", "#83c44a"), ("martijn", "Martijn", "#4dd8ff"),
            ("noud", "Noud", "#ff9800"))):
        save_assignee(pad, {"id": slug, "name": name, "color": color,
                            "sort_order": order})
    return pad


def _taak(db, chore_id, **extra):
    data = {"id": chore_id, "name": chore_id.capitalize(), "schedule_type": "daily",
            "schedule_config": ELKE_DAG, "next_due": VANDAAG.isoformat(),
            "duration_minutes": 20}
    data.update(extra)
    return save_chore(db, data, VANDAAG, _tijd(VANDAAG))


@pytest.fixture
def taken(db):
    """bad: vast Laura; vuilnis: rotatie van twee; stof: rotatie van drie;
    afwas: wie kan. Alles vandaag, Laura overal aan de beurt."""
    _taak(db, "bad", assignment_type="fixed", assigned_to="laura")
    _taak(db, "vuilnis", assignment_type="rotating", rotation=["laura", "martijn"])
    _taak(db, "stof", assignment_type="rotating",
          rotation=["laura", "martijn", "noud"])
    _taak(db, "afwas")
    return db


def _weg(db, who="laura", until="2026-10-12", dag=VANDAAG):
    return start_absence(db, who, dag, until, _tijd(dag, 1))


def _rijen(data):
    return {t["id"]: t for t in data["tasks_today"]}


class TestSensor:
    def test_tasks_today_effectief_met_covering_for(self, taken):
        _weg(taken)
        rijen = _rijen(overview(taken, VANDAAG))
        assert {k: rijen["bad"][k] for k in (
            "assignee_id", "assignee_name", "assignee_color",
            "covering_for", "covering_for_name")} == {
            "assignee_id": None, "assignee_name": "wie kan", "assignee_color": None,
            "covering_for": "laura", "covering_for_name": "Laura"}
        for chore_id in ("vuilnis", "stof"):
            assert rijen[chore_id]["assignee_id"] == "martijn"
            assert rijen[chore_id]["assignee_name"] == "Martijn"
            assert rijen[chore_id]["assignee_color"] == "#4dd8ff"
            assert rijen[chore_id]["covering_for"] == "laura"
            assert rijen[chore_id]["covering_for_name"] == "Laura"
        assert rijen["afwas"]["assignee_id"] is None
        assert rijen["afwas"]["covering_for"] is None
        assert rijen["afwas"]["covering_for_name"] is None

    def test_zonder_afwezigheid_geen_covering_for(self, taken):
        rijen = _rijen(overview(taken, VANDAAG))
        assert rijen["bad"]["assignee_id"] == "laura"
        assert all(r["covering_for"] is None and r["covering_for_name"] is None
                   for r in rijen.values())

    def test_persons_en_absences(self, taken):
        _weg(taken)
        _weg(taken, "noud", until=None)
        data = overview(taken, VANDAAG)
        assert data["persons"]["laura"]["absent"] is True
        assert data["persons"]["laura"]["absent_until"] == "2026-10-12"
        assert data["persons"]["noud"]["absent"] is True
        assert data["persons"]["noud"]["absent_until"] is None
        assert data["persons"]["martijn"]["absent"] is False
        assert data["persons"]["martijn"]["absent_until"] is None
        assert data["absences"] == [
            {"assignee_id": "laura", "start_date": "2026-10-07", "until": "2026-10-12"},
            {"assignee_id": "noud", "start_date": "2026-10-07", "until": None}]
        # de tellers zijn ongewijzigd: er is evenveel te doen
        assert data["open_today"] == 4
        # stof: Laura en Noud weg, dus Martijn
        assert _rijen(data)["stof"]["assignee_id"] == "martijn"

    def test_na_het_einde_weer_gewoon(self, taken):
        _weg(taken, dag=date(2026, 10, 5))
        end_absence(taken, "laura", VANDAAG)
        data = overview(taken, VANDAAG)
        assert _rijen(data)["bad"]["assignee_id"] == "laura"
        assert data["absences"] == []
        assert data["persons"]["laura"]["absent"] is False

    def test_build_state(self, taken):
        _weg(taken)
        state = build_state(taken, VANDAAG)
        chores = {c["id"]: c for c in state["chores"]}
        assert (chores["bad"]["current_assignee"], chores["bad"]["covering_for"]) == (
            None, "laura")
        assert (chores["vuilnis"]["current_assignee"],
                chores["vuilnis"]["covering_for"]) == ("martijn", "laura")
        assert (chores["afwas"]["current_assignee"], chores["afwas"]["covering_for"]) == (
            None, None)
        # de opgeslagen toewijzing blijft wat hij was
        assert chores["bad"]["assigned_to"] == "laura"
        assert chores["vuilnis"]["rotation_index"] == 0
        assert state["absences"] == [
            {"assignee_id": "laura", "start_date": "2026-10-07", "until": "2026-10-12"}]


class TestMeldingen:
    def test_geen_ochtendmelding_voor_de_afwezige(self, taken):
        _weg(taken)
        summary = notification_summary(taken, VANDAAG)
        assert "laura" not in summary
        assert sorted(c["id"] for c in summary["martijn"]["due"]) == [
            "afwas", "bad", "stof", "vuilnis"]
        # bad is "wie kan" geworden en telt dus ook voor Noud
        assert sorted(c["id"] for c in summary["noud"]["due"]) == ["afwas", "bad"]

    def test_zonder_afwezigheid_ongewijzigd(self, taken):
        summary = notification_summary(taken, VANDAAG)
        assert sorted(c["id"] for c in summary["laura"]["due"]) == [
            "afwas", "bad", "stof", "vuilnis"]
        assert sorted(c["id"] for c in summary["martijn"]["due"]) == ["afwas"]

    def test_iedereen_in_de_rotatie_weg_wordt_wie_kan(self, taken):
        _weg(taken)
        _weg(taken, "martijn")
        summary = notification_summary(taken, VANDAAG)
        assert set(summary) == {"noud"}
        assert sorted(c["id"] for c in summary["noud"]["due"]) == [
            "afwas", "bad", "stof", "vuilnis"]


class TestAfvinken:
    def test_vervanger_schuift_de_beurt_vanaf_de_doener(self, taken):
        _weg(taken, dag=date(2026, 10, 5))
        # rotatie van twee: Martijn vervangt Laura; de beurt schuift door
        # vanaf Martijn en staat dus weer op Laura (index 0)
        complete_chore(taken, "vuilnis", "martijn", VANDAAG, _tijd(VANDAAG, 2))
        assert get_chore(taken, "vuilnis")["rotation_index"] == 0
        # rotatie van drie: vanaf Martijn naar Noud
        complete_chore(taken, "stof", "martijn", VANDAAG, _tijd(VANDAAG, 3))
        assert get_chore(taken, "stof")["rotation_index"] == 2

        morgen = VANDAAG + timedelta(days=1)
        rijen = _rijen(overview(taken, morgen))
        assert (rijen["vuilnis"]["assignee_id"], rijen["vuilnis"]["covering_for"]) == (
            "martijn", "laura")
        assert (rijen["stof"]["assignee_id"], rijen["stof"]["covering_for"]) == (
            "noud", None)

        # terug: geen inhaal — vuilnis is gewoon Laura's beurt, stof blijft
        # bij Noud en daarna pas Laura
        end_absence(taken, "laura", morgen)
        rijen = _rijen(overview(taken, morgen))
        assert (rijen["vuilnis"]["assignee_id"], rijen["vuilnis"]["covering_for"]) == (
            "laura", None)
        assert rijen["stof"]["assignee_id"] == "noud"
        complete_chore(taken, "stof", "noud", morgen, _tijd(morgen, 4))
        assert get_chore(taken, "stof")["rotation_index"] == 0

    def test_afwezige_vinkt_toch_af(self, taken):
        _weg(taken)
        result = complete_chore(taken, "bad", "laura", VANDAAG, _tijd(VANDAAG, 2))
        assert result["was_full"] is True
        laura = next(p for p in leaderboard(taken, VANDAAG)["persons"]
                     if p["id"] == "laura")
        assert (laura["minutes"], laura["tasks"]) == (20, 1)
        data = overview(taken, VANDAAG)
        assert data["completed_today"] == 1
        assert data["persons"]["laura"]["tasks"] == 1

    def test_afwezige_in_de_rotatie_vinkt_af(self, taken):
        # Laura doet haar eigen beurt toch: de beurt schuift vanaf haar door
        _weg(taken)
        complete_chore(taken, "stof", "laura", VANDAAG, _tijd(VANDAAG, 2))
        assert get_chore(taken, "stof")["rotation_index"] == 1


class TestStreak:
    def test_neutraal_over_een_weekgrens_de_ander_normaal(self, db):
        _taak(db, "bad", next_due="2026-09-21")
        for dag in (date(2026, 9, 22), date(2026, 10, 13)):
            complete_chore(db, "bad", "laura", dag, _tijd(dag))
            complete_chore(db, "bad", "martijn", dag, _tijd(dag, 1))
        today = date(2026, 10, 14)
        # zonder afwezigheid breken de lege weken van 28-09 en 05-10
        assert assignee_streaks(db, today) == {"laura": 1, "martijn": 1}
        # do 01-10 t/m di 06-10 weg (terug wo 07-10): twee weken neutraal,
        # alleen voor Laura
        start_absence(db, "laura", date(2026, 10, 1), None, _tijd(date(2026, 10, 1)))
        end_absence(db, "laura", date(2026, 10, 7))
        assert assignee_streaks(db, today) == {"laura": 2, "martijn": 1}

    def test_de_ander_telt_de_weken_gewoon_mee(self, db):
        _taak(db, "bad", next_due="2026-09-21")
        for dag in (date(2026, 9, 22), date(2026, 9, 29), date(2026, 10, 6),
                    date(2026, 10, 13)):
            complete_chore(db, "bad", "martijn", dag, _tijd(dag))
        complete_chore(db, "bad", "laura", date(2026, 10, 13),
                       _tijd(date(2026, 10, 13), 1))
        start_absence(db, "laura", date(2026, 10, 1), None, _tijd(date(2026, 10, 1)))
        end_absence(db, "laura", date(2026, 10, 7))
        streaks = assignee_streaks(db, date(2026, 10, 14))
        assert streaks["martijn"] == 4
        # 12-10 +1, 05-10 en 28-09 neutraal, 21-09 leeg -> stop
        assert streaks["laura"] == 1

    def test_lopende_afwezigheid_tot_vandaag(self, db):
        _taak(db, "bad", next_due="2026-09-21")
        for dag in (date(2026, 9, 22), date(2026, 9, 29)):
            complete_chore(db, "bad", "laura", dag, _tijd(dag))
        # sinds 05-10 weg en nog niet terug: 05-10 en 12-10 neutraal
        start_absence(db, "laura", date(2026, 10, 5), None, _tijd(date(2026, 10, 5)))
        assert assignee_streaks(db, date(2026, 10, 14)) == {"laura": 2}


class TestVakantieWint:
    def test_tijdens_de_vakantie_niets_extras(self, taken):
        _weg(taken)
        start_vacation(taken, VANDAAG, None, _tijd(VANDAAG, 2))
        data = overview(taken, VANDAAG)
        assert data["tasks_today"] == []
        # feiten blijven: wie weg is, staat er gewoon bij
        assert data["persons"]["laura"]["absent"] is True
        assert [a["assignee_id"] for a in data["absences"]] == ["laura"]
        assert notification_summary(taken, VANDAAG) == {}
        # in de state telt de afwezigheid niet mee in de toewijzing
        chores = {c["id"]: c for c in build_state(taken, VANDAAG)["chores"]}
        assert (chores["bad"]["current_assignee"], chores["bad"]["covering_for"]) == (
            "laura", None)
        assert chores["vuilnis"]["current_assignee"] == "laura"

    def test_starten_en_eindigen_tijdens_de_vakantie(self, taken):
        start_vacation(taken, VANDAAG, None, _tijd(VANDAAG))
        _weg(taken)
        terug = VANDAAG + timedelta(days=2)
        end_vacation(taken, terug, _tijd(terug))
        # na de vakantie geldt de afwezigheid gewoon
        assert _rijen(overview(taken, terug))["bad"]["covering_for"] == "laura"
        end_absence(taken, "laura", terug)
        assert _rijen(overview(taken, terug))["bad"]["assignee_id"] == "laura"

    def test_streak_vakantie_en_afwezigheid_samen(self, db):
        _taak(db, "bad", next_due="2026-09-14")
        for dag in (date(2026, 9, 15), date(2026, 10, 13)):
            complete_chore(db, "bad", "laura", dag, _tijd(dag))
        # vakantie in de week van 21-09, afwezigheid in die van 28-09 en
        # 05-10: samen een aaneengesloten neutrale periode voor Laura
        start_vacation(db, date(2026, 9, 23), None, _tijd(date(2026, 9, 23)))
        end_vacation(db, date(2026, 9, 25), _tijd(date(2026, 9, 25)))
        start_absence(db, "laura", date(2026, 9, 30), None, _tijd(date(2026, 9, 30)))
        end_absence(db, "laura", date(2026, 10, 8))
        assert assignee_streaks(db, date(2026, 10, 14)) == {"laura": 2}


def test_done_rij_draagt_ook_covering_for(taken):
    _weg(taken)
    complete_chore(taken, "vuilnis", "martijn", VANDAAG, _tijd(VANDAAG, 2))
    nu = datetime.fromisoformat(_tijd(VANDAAG, 3))
    vuilnis = _rijen(overview(taken, VANDAAG, nu, recent_done_seconds=300))["vuilnis"]
    assert vuilnis["status"] == "done"
    # de beurt staat weer op Laura, en die is weg: Martijn opnieuw
    assert (vuilnis["assignee_id"], vuilnis["covering_for"]) == ("martijn", "laura")
