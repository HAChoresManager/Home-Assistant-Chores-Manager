"""Net-afgevinkte taken blijven twee minuten in tasks_today staan, als
status "done" — zodat een taak op het dashboard niet verdwijnt op het moment
dat je hem aantikt, en tikken hem nog kan terugdraaien.

Het venster komt in HA uit const.RECENT_DONE_SECONDS; const.py importeert
HA en is hier niet te laden, dus de tests geven 120 zelf mee.
"""
from datetime import date, datetime, timedelta

import pytest

from chores_manager.db.assignees import save_assignee
from chores_manager.db.chores import save_chore
from chores_manager.db.completions import complete_chore, undo_completion
from chores_manager.db.overview import overview
from chores_manager.db.schema import create_database

VANDAAG = date(2026, 7, 29)
NU = "2026-07-29T10:00:00+02:00"
AFGEVINKT = datetime.fromisoformat(NU)
VENSTER = 120


@pytest.fixture
def db(tmp_path):
    pad = str(tmp_path / "chores_v2.db")
    create_database(pad)
    save_assignee(pad, {"id": "laura", "name": "Laura", "color": "#83c44a"})
    save_assignee(pad, {"id": "martijn", "name": "Martijn", "color": "#4dd8ff"})
    for chore_id, naam, prioriteit in (
            ("aanrecht", "Aanrecht", "normal"),
            ("bad", "Bad", "normal"),
            ("stof", "Stofzuigen", "normal"),
            ("zolder", "Zolder", "high")):
        save_chore(pad, {
            "id": chore_id, "name": naam, "priority": prioriteit,
            "schedule_type": "daily",
            "schedule_config": {"weekdays": [1, 2, 3, 4, 5, 6, 7]},
            "duration_minutes": 10, "assignment_type": "fixed",
            "assigned_to": "martijn",
        }, VANDAAG, NU)
    return pad


def _stand(db, seconden_later):
    return overview(db, VANDAAG, AFGEVINKT + timedelta(seconds=seconden_later),
                    VENSTER)


class TestDoneRijen:
    def test_afgevinkt_blijft_op_zijn_plek_als_done(self, db):
        undo = complete_chore(db, "bad", "laura", VANDAAG, NU)
        lijst = _stand(db, 30)["tasks_today"]
        # prioriteit, dan naam — Bad verspringt niet
        assert [(t["id"], t["status"]) for t in lijst] == [
            ("zolder", "today"), ("aanrecht", "today"),
            ("bad", "done"), ("stof", "today")]
        bad = lijst[2]
        assert bad["completion_id"] == undo["row_id"]
        assert bad["completed_at"] == NU
        assert bad["done_by"] == "Laura"
        assert bad["done_by_color"] == "#83c44a"

    def test_veldenset_van_een_done_rij(self, db):
        complete_chore(db, "bad", "laura", VANDAAG, NU)
        bad = next(t for t in _stand(db, 30)["tasks_today"] if t["id"] == "bad")
        assert set(bad) == {
            "id", "name", "icon", "status",
            "assignee_id", "assignee_name", "assignee_color",
            "completion_id", "completed_at", "done_by", "done_by_color"}
        # de gewone rijen houden hun compacte veldenset
        aanrecht = next(t for t in _stand(db, 30)["tasks_today"]
                        if t["id"] == "aanrecht")
        assert set(aanrecht) == {
            "id", "name", "icon", "status",
            "assignee_id", "assignee_name", "assignee_color"}

    def test_na_het_venster_weg(self, db):
        complete_chore(db, "bad", "laura", VANDAAG, NU)
        assert any(t["id"] == "bad" for t in _stand(db, VENSTER)["tasks_today"])
        assert all(t["id"] != "bad"
                   for t in _stand(db, VENSTER + 1)["tasks_today"])

    def test_done_telt_niet_als_open(self, db):
        assert _stand(db, 0)["open_today"] == 4
        complete_chore(db, "bad", "laura", VANDAAG, NU)
        stand = _stand(db, 30)
        assert stand["open_today"] == 3
        assert stand["due_today"] == 3

    def test_na_undo_weer_gewoon_vandaag(self, db):
        undo = complete_chore(db, "bad", "laura", VANDAAG, NU)
        undo_completion(db, undo)
        bad = next(t for t in _stand(db, 30)["tasks_today"] if t["id"] == "bad")
        assert bad["status"] == "today"
        assert "completion_id" not in bad

    def test_zonder_now_geen_done_rijen(self, db):
        complete_chore(db, "bad", "laura", VANDAAG, NU)
        assert all(t["id"] != "bad"
                   for t in overview(db, VANDAAG)["tasks_today"])

    def test_limiet_van_acht_inclusief_done(self, db):
        for i in range(8):
            save_chore(db, {
                "id": f"t{i}", "name": f"Taak {i}", "schedule_type": "daily",
                "schedule_config": {"weekdays": [1, 2, 3, 4, 5, 6, 7]},
                "duration_minutes": 5, "assignment_type": "anyone",
            }, VANDAAG, NU)
        complete_chore(db, "aanrecht", "laura", VANDAAG, NU)
        lijst = _stand(db, 30)["tasks_today"]
        assert len(lijst) == 8
        assert ("aanrecht", "done") in [(t["id"], t["status"]) for t in lijst]
