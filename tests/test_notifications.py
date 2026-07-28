"""Fase 4: de meldingsdata (notification_summary, pick_notify_action), de
nieuwe notifications_enabled-kolom en de schemamigratie voor databases van
vóór die kolom. De meldingsteksten zelf leven in notify.py (HA-laag) en
vallen buiten pytest — dit dekt alles waarop die teksten bouwen.
"""
from datetime import date, timedelta
import sqlite3

import pytest

from chores_manager.db.assignees import get_assignee, save_assignee
from chores_manager.db.chores import save_chore
from chores_manager.db.overview import notification_summary, pick_notify_action
from chores_manager.db.schema import create_database

VANDAAG = date(2026, 7, 28)
NU = "2026-07-28T10:00:00+02:00"


@pytest.fixture
def db(tmp_path):
    pad = str(tmp_path / "chores_v2.db")
    create_database(pad)
    save_assignee(pad, {"id": "laura", "name": "Laura", "color": "#83c44a",
                        "notify_service": "notify.mobile_app_laura"})
    save_assignee(pad, {"id": "martijn", "name": "Martijn", "color": "#4dd8ff"})
    return pad


def _taak(db, **extra):
    data = {
        "id": "was", "name": "Was draaien", "schedule_type": "daily",
        "schedule_config": {"weekdays": [1, 2, 3, 4, 5, 6, 7]},
        "duration_minutes": 20, "assignment_type": "fixed", "assigned_to": "laura",
    }
    data.update(extra)
    return save_chore(db, data, VANDAAG, NU)


class TestNotificationSummary:
    def test_fixed_telt_alleen_bij_de_eigenaar(self, db):
        _taak(db)  # fixed, laura, vandaag
        summary = notification_summary(db, VANDAAG)
        assert [c["id"] for c in summary["laura"]["due"]] == ["was"]
        assert summary["martijn"]["due"] == []
        assert summary["martijn"]["overdue"] == []

    def test_anyone_telt_voor_iedereen(self, db):
        _taak(db, id="afwas", name="Afwassen",
              assignment_type="anyone", assigned_to=None)
        summary = notification_summary(db, VANDAAG)
        assert [c["id"] for c in summary["laura"]["due"]] == ["afwas"]
        assert [c["id"] for c in summary["martijn"]["due"]] == ["afwas"]

    def test_rotating_telt_alleen_bij_wie_aan_de_beurt_is(self, db):
        _taak(db, id="vuilnis", name="Vuilnis", assignment_type="rotating",
              assigned_to=None, rotation=["martijn", "laura"])
        summary = notification_summary(db, VANDAAG)
        assert [c["id"] for c in summary["martijn"]["due"]] == ["vuilnis"]
        assert summary["laura"]["due"] == []

    def test_upcoming_hoort_niet_in_de_ochtendmelding(self, db):
        _taak(db, next_due=VANDAAG + timedelta(days=1))
        summary = notification_summary(db, VANDAAG)
        assert summary["laura"]["due"] == []
        assert summary["laura"]["overdue"] == []

    def test_achterstand_gesorteerd_op_cyclusfractie(self, db):
        # dagtaak 3 dagen te laat (fractie 3,0) staat vóór een 30-dagentaak
        # die 5 dagen te laat is (fractie 0,17) — absolute dagen zouden
        # verkeerd sorteren (§4.3).
        _taak(db, id="dagelijks", name="Dagelijks",
              next_due=VANDAAG - timedelta(days=3))
        _taak(db, id="maandelijks", name="Maandelijks",
              schedule_type="interval", schedule_config={"days": 30},
              next_due=VANDAAG - timedelta(days=5))
        summary = notification_summary(db, VANDAAG)
        assert [c["id"] for c in summary["laura"]["overdue"]] == [
            "dagelijks", "maandelijks"]

    def test_vandaag_gesorteerd_op_prioriteit_dan_duur(self, db):
        _taak(db, id="lang", name="Lang", priority="normal", duration_minutes=45)
        _taak(db, id="belangrijk", name="Belangrijk", priority="high",
              duration_minutes=60)
        _taak(db, id="kort", name="Kort", priority="normal", duration_minutes=5)
        summary = notification_summary(db, VANDAAG)
        assert [c["id"] for c in summary["laura"]["due"]] == [
            "belangrijk", "kort", "lang"]


class TestPickNotifyAction:
    def test_achterstand_wint_van_vandaag(self, db):
        _taak(db, id="vandaag-taak", name="Vandaag")
        _taak(db, id="te-laat", name="Te laat",
              next_due=VANDAAG - timedelta(days=2))
        entry = notification_summary(db, VANDAAG)["laura"]
        assert pick_notify_action(entry["due"], entry["overdue"])["id"] == "te-laat"

    def test_zonder_achterstand_de_belangrijkste_van_vandaag(self, db):
        _taak(db, id="a", name="A", priority="normal", duration_minutes=30)
        _taak(db, id="b", name="B", priority="high", duration_minutes=30)
        entry = notification_summary(db, VANDAAG)["laura"]
        assert pick_notify_action(entry["due"], entry["overdue"])["id"] == "b"

    def test_niets_te_doen_geeft_none(self, db):
        assert pick_notify_action([], []) is None


class TestNotificationsEnabled:
    def test_standaard_aan_en_koppelvelden_bewaard(self, db):
        persoon = get_assignee(db, "laura")
        assert persoon["notifications_enabled"] == 1
        assert persoon["notify_service"] == "notify.mobile_app_laura"

        save_assignee(db, {"id": "laura", "name": "Laura", "color": "#83c44a",
                           "ha_user_id": "abc123",
                           "notify_service": "notify.mobile_app_laura",
                           "notifications_enabled": 0})
        persoon = get_assignee(db, "laura")
        assert persoon["notifications_enabled"] == 0
        assert persoon["ha_user_id"] == "abc123"

    def test_migratie_zet_de_kolom_bij_op_een_oude_database(self, tmp_path):
        # Een database van vóór fase 4: assignees zonder notifications_enabled.
        pad = str(tmp_path / "oud.db")
        conn = sqlite3.connect(pad)
        conn.execute("""
            CREATE TABLE assignees (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL,
                ha_user_id TEXT, notify_service TEXT,
                active INTEGER NOT NULL DEFAULT 1,
                include_in_leaderboard INTEGER NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 0)""")
        conn.execute("INSERT INTO assignees (id, name, color)"
                     " VALUES ('laura', 'Laura', '#83c44a')")
        conn.commit()
        conn.close()

        create_database(pad)  # legt schema aan én draait de migratie

        persoon = get_assignee(pad, "laura")
        assert persoon["notifications_enabled"] == 1
