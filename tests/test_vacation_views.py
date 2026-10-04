"""Vakantiemodus (v2.6, deel 2): leesweergaven en streaks. build_state en de
sensor (overview) tonen de vakantie, de sensor telt dan niets open, de
ochtendsamenvatting is leeg, en weken in een vakantie zijn voor de streak
neutraal (completions.assignee_streaks, vacations.vacation_weeks).

Vaste datums; weken beginnen op maandag: 2026-09-07, -14, -21, -28,
2026-10-05, -12, -19. 2026-10-03 is een zaterdag.
"""
from datetime import date, datetime, timedelta

import pytest

from chores_manager.db.assignees import save_assignee
from chores_manager.db.chores import save_chore
from chores_manager.db.completions import assignee_streaks, complete_chore
from chores_manager.db.connection import get_connection
from chores_manager.db.overview import build_state, notification_summary, overview
from chores_manager.db.schema import create_database
from chores_manager.db.vacations import end_vacation, start_vacation, vacation_weeks

ELKE_DAG = {"weekdays": [1, 2, 3, 4, 5, 6, 7]}
START = date(2026, 10, 3)  # zaterdag


def _tijd(dag: date, minuut: int = 0) -> str:
    return f"{dag.isoformat()}T10:{minuut:02d}:00+02:00"


@pytest.fixture
def db(tmp_path):
    pad = str(tmp_path / "chores_v2.db")
    create_database(pad)
    save_assignee(pad, {"id": "laura", "name": "Laura", "color": "#83c44a"})
    save_chore(pad, {"id": "afwas", "name": "Afwas", "schedule_type": "daily",
                     "schedule_config": ELKE_DAG, "next_due": "2026-09-01"},
               date(2026, 9, 1), "2026-09-01T09:00:00+02:00")
    return pad


def _gedaan(db, *dagen):
    """Laura vinkt de afwas af op elk van deze dagen (vóór een vakantie)."""
    for dag in dagen:
        complete_chore(db, "afwas", "laura", dag, _tijd(dag))


def _vakantie(db, start, resume=None):
    """Een vakantie vanaf `start`; met resume meteen weer beëindigd."""
    start_vacation(db, start, None, _tijd(start, 30))
    if resume is not None:
        end_vacation(db, resume, _tijd(resume, 31))


def _weken(db, today):
    with get_connection(db) as conn:
        return vacation_weeks(conn, today)


class TestVakantieweken:
    def test_beeindigd_tot_de_dag_voor_resume(self, db):
        # zo 04-10 t/m zo 04-10 (resume ma 05-10): alleen de week van 28-09
        _vakantie(db, date(2026, 10, 4), date(2026, 10, 5))
        assert _weken(db, date(2026, 10, 21)) == {date(2026, 9, 28)}

    def test_over_een_weekgrens(self, db):
        _vakantie(db, date(2026, 9, 24), date(2026, 9, 30))
        assert _weken(db, date(2026, 10, 21)) == {date(2026, 9, 21), date(2026, 9, 28)}

    def test_nul_dagen_is_geen_vakantieweek(self, db):
        _vakantie(db, date(2026, 9, 30), date(2026, 9, 30))
        assert _weken(db, date(2026, 10, 21)) == set()

    def test_actief_zonder_until_tot_vandaag(self, db):
        _vakantie(db, date(2026, 10, 13))
        assert _weken(db, date(2026, 10, 21)) == {date(2026, 10, 12), date(2026, 10, 19)}

    def test_actief_met_until_tot_de_laatste_van_until_en_vandaag(self, db):
        start_vacation(db, date(2026, 10, 13), "2026-10-14", _tijd(date(2026, 10, 13)))
        # until verstreken, het automatische einde draaide nog niet
        assert _weken(db, date(2026, 10, 21)) == {date(2026, 10, 12)}
        # until in de toekomst: alleen tot en met vandaag
        assert _weken(db, date(2026, 10, 13)) == {date(2026, 10, 12)}


class TestStreaks:
    """Neutraal → door; voltooiing → +1; leeg → stop, behalve de huidige
    week (nog bezig)."""

    def test_zonder_vakantie_ongewijzigd(self, db):
        _gedaan(db, date(2026, 10, 5), date(2026, 10, 12))
        assert assignee_streaks(db, date(2026, 10, 21)) == {"laura": 2}

    def test_vakantie_over_een_weekgrens_breekt_niet(self, db):
        _gedaan(db, date(2026, 9, 7), date(2026, 9, 14),
                date(2026, 10, 5), date(2026, 10, 12))
        # zonder vakantie zouden de lege weken van 21-09 en 28-09 breken
        assert assignee_streaks(db, date(2026, 10, 21)) == {"laura": 2}
        _vakantie(db, date(2026, 9, 24), date(2026, 9, 30))  # do 24-09 t/m di 29-09
        assert assignee_streaks(db, date(2026, 10, 21)) == {"laura": 4}

    def test_actieve_vakantie_in_de_huidige_week(self, db):
        _gedaan(db, date(2026, 9, 28), date(2026, 10, 5))
        # zonder vakantie: lopende week leeg (telt niet), 12-10 leeg -> 0
        assert assignee_streaks(db, date(2026, 10, 21)) == {"laura": 0}
        _vakantie(db, date(2026, 10, 12))  # sindsdien aan
        assert assignee_streaks(db, date(2026, 10, 21)) == {"laura": 2}

    def test_vakantieweek_met_voltooiing_verlengt_niet(self, db):
        _gedaan(db, date(2026, 9, 28), date(2026, 10, 5), date(2026, 10, 12))
        assert assignee_streaks(db, date(2026, 10, 14)) == {"laura": 3}
        # wo 07-10 t/m do 08-10: de week van 05-10 is neutraal, ondanks de
        # voltooiing van maandag
        _vakantie(db, date(2026, 10, 7), date(2026, 10, 9))
        assert assignee_streaks(db, date(2026, 10, 14)) == {"laura": 2}

    def test_lege_week_net_voor_de_vakantie_breekt(self, db):
        _gedaan(db, date(2026, 9, 14), date(2026, 10, 5), date(2026, 10, 12))
        _vakantie(db, date(2026, 9, 28), date(2026, 10, 5))  # alleen week 28-09
        # 12-10 +1, 05-10 +1, 28-09 neutraal, 21-09 leeg -> stop (14-09 telt niet)
        assert assignee_streaks(db, date(2026, 10, 14)) == {"laura": 2}

    def test_nul_dagen_vakantie_is_niet_neutraal(self, db):
        _gedaan(db, date(2026, 9, 21), date(2026, 10, 5))
        _vakantie(db, date(2026, 9, 30), date(2026, 9, 30))
        assert assignee_streaks(db, date(2026, 10, 7)) == {"laura": 1}


class TestLeesweergaven:
    def _arrange(self, db):
        # afwas loopt achter (sinds 01-09); bad is vandaag aan de beurt en
        # wordt vóór de vakantie nog gedaan; was is vandaag aan de beurt
        for chore_id in ("bad", "was"):
            save_chore(db, {"id": chore_id, "name": chore_id.capitalize(),
                            "schedule_type": "daily", "schedule_config": ELKE_DAG,
                            "next_due": START.isoformat()},
                       START, _tijd(START))
        complete_chore(db, "bad", "laura", START, _tijd(START, 1))

    def test_overview_voor_en_tijdens(self, db):
        self._arrange(db)
        nu = datetime.fromisoformat(_tijd(START, 2))
        voor = overview(db, START, nu, recent_done_seconds=600)
        assert voor["vacation"] is None
        assert (voor["open_today"], voor["due_today"], voor["overdue"]) == (2, 1, 1)
        assert {t["id"]: t["status"] for t in voor["tasks_today"]} == {
            "afwas": "overdue", "bad": "done", "was": "today"}

        start_vacation(db, START, "2026-10-10", _tijd(START, 3))
        tijdens = overview(db, START, nu, recent_done_seconds=600)
        assert tijdens["vacation"] == {
            "active": True, "start_date": "2026-10-03", "until": "2026-10-10"}
        assert (tijdens["open_today"], tijdens["due_today"], tijdens["overdue"]) == (0, 0, 0)
        assert tijdens["tasks_today"] == []
        # wat er gedaan is, blijft gewoon staan
        assert tijdens["completed_today"] == 1
        assert tijdens["persons"]["laura"]["tasks"] == 1
        assert [r["chore_id"] for r in tijdens["recent_completions"]] == ["bad"]
        assert tijdens["recent_skips"] == []
        assert tijdens["week_minutes_total"] == voor["week_minutes_total"]

    def test_notification_summary_leeg(self, db):
        self._arrange(db)
        assert notification_summary(db, START)["laura"]["overdue"]
        start_vacation(db, START, None, _tijd(START, 3))
        assert notification_summary(db, START) == {}
        end_vacation(db, START + timedelta(days=1), _tijd(START + timedelta(days=1)))
        assert notification_summary(db, START + timedelta(days=1)) != {}

    def test_build_state(self, db):
        self._arrange(db)
        assert build_state(db, START)["vacation"] is None
        start_vacation(db, START, None, _tijd(START, 3))
        state = build_state(db, START)
        assert state["vacation"] == {
            "active": True, "start_date": "2026-10-03", "until": None}
        # de taken houden hun echte velden: Alles toont de huidige datum
        afwas = next(c for c in state["chores"] if c["id"] == "afwas")
        assert afwas["next_due"] == "2026-09-01"
        assert afwas["urgency"] == "urgent"
