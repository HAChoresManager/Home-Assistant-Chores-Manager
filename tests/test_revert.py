"""Terugdraaien vanaf het dashboard: revert_completion (buiten het
undo-venster) en recent_completions op de sensor.

De serviceschil (undo_last, revert_completion in __init__.py) draait op HA
en valt buiten de unit tests; wat hier getest wordt is de db-functie erachter
en de attributenlijst die een kaart het id levert.
"""
from datetime import date, timedelta

import pytest

from chores_manager.db.assignees import save_assignee
from chores_manager.db.chores import get_chore, save_chore
from chores_manager.db.completions import complete_chore, leaderboard, revert_completion
from chores_manager.db.errors import StoreError
from chores_manager.db.overview import overview
from chores_manager.db.schema import create_database

VANDAAG = date(2026, 7, 29)
NU = "2026-07-29T10:00:00+02:00"


@pytest.fixture
def db(tmp_path):
    pad = str(tmp_path / "chores_v2.db")
    create_database(pad)
    save_assignee(pad, {"id": "laura", "name": "Laura", "color": "#83c44a"})
    save_assignee(pad, {"id": "martijn", "name": "Martijn", "color": "#4dd8ff"})
    return pad


def _vuilnis(db):
    """Roterende weektaak, vandaag aan de beurt voor martijn (index 0)."""
    return save_chore(db, {
        "id": "vuilnis", "name": "Vuilnis", "schedule_type": "interval",
        "schedule_config": {"days": 7}, "duration_minutes": 15,
        "assignment_type": "rotating", "rotation": ["martijn", "laura"],
    }, VANDAAG, NU)


def _minuten(db, persoon):
    board = leaderboard(db, VANDAAG)
    return next(p["minutes"] for p in board["persons"] if p["id"] == persoon)


class TestRevertCompletion:
    def test_afvinken_en_terugdraaien(self, db):
        _vuilnis(db)
        assert get_chore(db, "vuilnis")["rotation_index"] == 0
        undo = complete_chore(db, "vuilnis", "martijn", VANDAAG, NU)
        na = get_chore(db, "vuilnis")
        assert na["next_due"] == (VANDAAG + timedelta(days=7)).isoformat()
        assert na["rotation_index"] == 1
        assert _minuten(db, "martijn") == 15
        (item,) = overview(db, VANDAAG)["recent_completions"]
        assert item["id"] == undo["row_id"]

        result = revert_completion(db, undo["row_id"], VANDAAG)

        assert result == {"chore_id": "vuilnis", "was_full": True}
        assert overview(db, VANDAAG)["recent_completions"] == []
        terug = get_chore(db, "vuilnis")
        assert terug["next_due"] == VANDAAG.isoformat()
        assert terug["rotation_index"] == 0
        assert _minuten(db, "martijn") == 0

    def test_opnieuw_vervallen_taak_schuift_niet_naar_achteren(self, db):
        _vuilnis(db)
        undo = complete_chore(db, "vuilnis", "martijn",
                              VANDAAG - timedelta(days=10),
                              "2026-07-19T10:00:00+02:00")
        # afgevinkt op 19-07 -> next_due 26-07, dus inmiddels weer vervallen
        revert_completion(db, undo["row_id"], VANDAAG)
        assert get_chore(db, "vuilnis")["next_due"] == (
            VANDAAG - timedelta(days=3)).isoformat()

    def test_onbekend_id_geeft_storeerror(self, db):
        with pytest.raises(StoreError):
            revert_completion(db, 999, VANDAAG)


class TestRecentCompletions:
    def test_velden_en_volgorde(self, db):
        _vuilnis(db)
        complete_chore(db, "vuilnis", "martijn", VANDAAG,
                       "2026-07-29T09:00:00+02:00")
        complete_chore(db, "vuilnis", "laura", VANDAAG, NU)
        lijst = overview(db, VANDAAG)["recent_completions"]
        assert [i["assignee_id"] for i in lijst] == ["laura", "martijn"]
        item = lijst[0]
        assert set(item) == {
            "id", "chore_id", "chore_name", "icon", "assignee_id",
            "assignee_name", "assignee_color", "completed_at", "minutes",
            "is_full", "subtask_name"}
        assert item["chore_name"] == "Vuilnis"
        assert item["assignee_name"] == "Laura"
        assert item["assignee_color"] == "#83c44a"
        assert item["completed_at"] == NU
        assert item["minutes"] == 15
        assert item["is_full"] is True
        assert item["subtask_name"] is None

    def test_maximaal_acht(self, db):
        _vuilnis(db)
        for i in range(10):
            complete_chore(db, "vuilnis", "laura", VANDAAG,
                           f"2026-07-29T10:{i:02d}:00+02:00")
        assert len(overview(db, VANDAAG)["recent_completions"]) == 8
