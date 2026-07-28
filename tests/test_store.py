"""Rooktests voor de v2-datalaag (store/), conform de verruimde testregel in
CLAUDE.md: geen uitputtende dekking, wel elk pad één keer echt doorlopen —
afvinken in alle drie de vormen, undo, ranglijst, feed, streaks, snooze,
verwijderen en de nachtelijke rol.

Vaste datums: 2026-07-28 is een dinsdag; de week begint dus op maandag
2026-07-27.
"""
from datetime import date, timedelta

import pytest

from chores_manager.db.assignees import delete_assignee, list_assignees, save_assignee
from chores_manager.db.chores import (
    StoreError,
    delete_chore,
    get_chore,
    roll_all_forward,
    save_chore,
    snooze_chore,
)
from chores_manager.db.completions import (
    week_history,
    assignee_streaks,
    complete_chore,
    completed_today_count,
    feed,
    leaderboard,
    undo_completion,
    week_start,
)
from chores_manager.db.overview import build_state, overview
from chores_manager.db.schema import create_database
from chores_manager.db.subtasks import list_subtasks, set_subtasks

VANDAAG = date(2026, 7, 28)
NU = "2026-07-28T10:00:00+02:00"


def _tijd(offset_min: int = 0, dag: date = VANDAAG) -> str:
    """ISO-tijdstip op `dag`, met minutenoffset zodat volgorde vastligt."""
    return f"{dag.isoformat()}T10:{offset_min:02d}:00+02:00"


@pytest.fixture
def db(tmp_path):
    pad = str(tmp_path / "chores_v2.db")
    create_database(pad)
    save_assignee(pad, {"id": "laura", "name": "Laura", "color": "#83c44a"})
    save_assignee(pad, {"id": "martijn", "name": "Martijn", "color": "#4dd8ff"})
    return pad


def _gewone_taak(db, **extra):
    data = {
        "id": "was", "name": "Was draaien", "schedule_type": "daily",
        "schedule_config": {"weekdays": [1, 2, 3, 4, 5, 6, 7]},
        "duration_minutes": 20, "assignment_type": "fixed", "assigned_to": "laura",
    }
    data.update(extra)
    return save_chore(db, data, VANDAAG, NU)


class TestChores:
    def test_save_berekent_next_due(self, db):
        chore = _gewone_taak(db)
        assert chore["next_due"] == VANDAAG.isoformat()
        assert chore["schedule_config"] == {"weekdays": [1, 2, 3, 4, 5, 6, 7]}

    def test_update_behoudt_created_at_en_rotation_index(self, db):
        _gewone_taak(db)
        eerste = get_chore(db, "was")
        bijgewerkt = save_chore(db, {
            "id": "was", "name": "Was draaien 2", "schedule_type": "daily",
            "schedule_config": {"weekdays": [1, 2, 3, 4, 5, 6, 7]},
        }, VANDAAG, "2026-07-28T11:00:00+02:00")
        assert bijgewerkt["name"] == "Was draaien 2"
        assert bijgewerkt["created_at"] == eerste["created_at"]
        assert bijgewerkt["rotation_index"] == eerste["rotation_index"]

    def test_validatie_wijst_onzin_af(self, db):
        with pytest.raises(StoreError):
            _gewone_taak(db, priority="spoed")
        with pytest.raises(StoreError):
            _gewone_taak(db, assignment_type="fixed", assigned_to=None)
        with pytest.raises(StoreError):
            _gewone_taak(db, assignment_type="rotating", rotation=["laura"])

    def test_delete_zonder_historie_is_echt_weg(self, db):
        _gewone_taak(db)
        assert delete_chore(db, "was") == "deleted"
        assert get_chore(db, "was") is None

    def test_delete_met_historie_deactiveert(self, db):
        _gewone_taak(db)
        complete_chore(db, "was", "laura", VANDAAG, NU)
        assert delete_chore(db, "was") == "deactivated"
        assert get_chore(db, "was")["active"] == 0

    def test_snooze_tomorrow_en_skip(self, db):
        save_chore(db, {
            "id": "bood", "name": "Boodschappen", "schedule_type": "weekly",
            "schedule_config": {"weekday": 3},  # woensdag; morgen is 29-07 (wo)
        }, VANDAAG, NU)
        assert snooze_chore(db, "bood", "tomorrow", VANDAAG, NU) == date(2026, 7, 29)
        # skip vanaf next_due 29-07 (wo) -> volgende woensdag
        assert snooze_chore(db, "bood", "skip", VANDAAG, NU) == date(2026, 8, 5)


class TestCompleteEnUndo:
    def test_gewone_taak(self, db):
        _gewone_taak(db)
        undo = complete_chore(db, "was", "laura", VANDAAG, NU)
        assert undo["was_full"] is True
        chore = get_chore(db, "was")
        assert chore["next_due"] == "2026-07-29"
        assert completed_today_count(db, VANDAAG) == 1
        undo_completion(db, undo)
        assert get_chore(db, "was")["next_due"] == VANDAAG.isoformat()
        assert completed_today_count(db, VANDAAG) == 0

    def test_rotatie_schuift_alleen_bij_vol(self, db):
        save_chore(db, {
            "id": "bood", "name": "Boodschappen", "schedule_type": "weekly",
            "schedule_config": {"weekday": 3}, "assignment_type": "rotating",
            "rotation": ["martijn", "laura"],
        }, VANDAAG, NU)
        undo = complete_chore(db, "bood", "martijn", VANDAAG, NU)
        assert get_chore(db, "bood")["rotation_index"] == 1
        undo_completion(db, undo)
        assert get_chore(db, "bood")["rotation_index"] == 0

    def test_rotatie_schuift_vanaf_de_doener(self, db):
        # §4.4: martijn aan de beurt, laura doet het -> martijn blijft aan de
        # beurt; een doener buiten de lijst laat de beurt helemaal staan
        save_assignee(db, {"id": "noud", "name": "Noud", "color": "#f06292"})
        save_chore(db, {
            "id": "bood", "name": "Boodschappen", "schedule_type": "weekly",
            "schedule_config": {"weekday": 3}, "assignment_type": "rotating",
            "rotation": ["martijn", "laura"],
        }, VANDAAG, NU)
        complete_chore(db, "bood", "laura", VANDAAG, _tijd(1))
        assert get_chore(db, "bood")["rotation_index"] == 0  # martijn opnieuw
        complete_chore(db, "bood", "noud", VANDAAG, _tijd(2))
        assert get_chore(db, "bood")["rotation_index"] == 0  # beurt blijft staan

    def test_checklist_minuten_sommeren_naar_duration(self, db):
        _gewone_taak(db, id="kap", name="Afzuigkap", duration_minutes=15,
                     subtask_mode="checklist")
        set_subtasks(db, "kap", ["stap 1", "stap 2", "stap 3", "stap 4"])
        ids = [s["id"] for s in list_subtasks(db, "kap")]
        minuten = []
        for volgnr, sid in enumerate(ids):
            undo = complete_chore(db, "kap", "martijn", VANDAAG,
                                  _tijd(volgnr + 1), subtask_id=sid)
            minuten.append(undo)
        # 15 // 4 = 3 per stap, de laatste krijgt de rest: 3+3+3+6 = 15
        regels = [r for r in feed(db, 10) if r["chore_id"] == "kap"]
        assert sorted(r["minutes"] for r in regels) == [3, 3, 3, 6]
        assert sum(r["minutes"] for r in regels) == 15
        assert [r["is_full_completion"] for r in regels][0] == 1  # nieuwste = laatste stap
        assert get_chore(db, "kap")["next_due"] != VANDAAG.isoformat()

    def test_checklist_zelfde_stap_twee_keer_geweigerd(self, db):
        _gewone_taak(db, id="kap", name="Afzuigkap", subtask_mode="checklist")
        set_subtasks(db, "kap", ["a", "b"])
        sid = list_subtasks(db, "kap")[0]["id"]
        complete_chore(db, "kap", "martijn", VANDAAG, _tijd(1), subtask_id=sid)
        with pytest.raises(StoreError, match="al afgevinkt"):
            complete_chore(db, "kap", "martijn", VANDAAG, _tijd(2), subtask_id=sid)

    def test_counter_haalt_doel(self, db):
        _gewone_taak(db, id="wasjes", name="Wasjes", duration_minutes=20,
                     subtask_mode="counter", subtask_target=3)
        for volgnr in range(3):
            undo = complete_chore(db, "wasjes", "laura", VANDAAG, _tijd(volgnr + 1))
        assert undo["was_full"] is True
        regels = [r for r in feed(db, 10) if r["chore_id"] == "wasjes"]
        assert sorted(r["minutes"] for r in regels) == [6, 6, 8]  # som = 20
        # de doeltik sloot de ronde; de volgende tik begint een nieuwe ronde
        nieuwe_ronde = complete_chore(db, "wasjes", "laura", VANDAAG, _tijd(9))
        assert nieuwe_ronde["was_full"] is False

    def test_checklist_in_een_keer_afronden_krijgt_de_rest(self, db):
        _gewone_taak(db, id="kap", name="Afzuigkap", duration_minutes=15,
                     subtask_mode="checklist")
        set_subtasks(db, "kap", ["a", "b", "c"])
        sid = list_subtasks(db, "kap")[0]["id"]
        complete_chore(db, "kap", "martijn", VANDAAG, _tijd(1), subtask_id=sid)  # 5 min
        undo = complete_chore(db, "kap", "martijn", VANDAAG, _tijd(2))  # rest in één keer
        assert undo["was_full"] is True
        regels = [r for r in feed(db, 10) if r["chore_id"] == "kap"]
        assert sum(r["minutes"] for r in regels) == 15


class TestRanglijstFeedStreak:
    def test_ranglijst_telt_alleen_deze_week(self, db):
        _gewone_taak(db)
        vorige_week = VANDAAG - timedelta(days=7)
        complete_chore(db, "was", "laura", vorige_week, _tijd(1, vorige_week))
        complete_chore(db, "was", "laura", VANDAAG, _tijd(2))
        board = leaderboard(db, VANDAAG)
        laura = next(p for p in board["persons"] if p["id"] == "laura")
        assert laura["minutes"] == 20
        assert laura["tasks"] == 1
        assert board["total_minutes"] == 20
        assert board["week_start"] == "2026-07-27"

    def test_feed_nieuwste_eerst(self, db):
        _gewone_taak(db)
        _gewone_taak(db, id="plant", name="Planten", assigned_to="martijn")
        complete_chore(db, "was", "laura", VANDAAG, _tijd(1))
        complete_chore(db, "plant", "martijn", VANDAAG, _tijd(2))
        regels = feed(db, 10)
        assert [r["chore_id"] for r in regels] == ["plant", "was"]
        assert regels[0]["assignee_name"] == "Martijn"

    def test_streak_telt_aaneengesloten_weken(self, db):
        _gewone_taak(db)
        for weken_terug in (1, 2, 3):
            dag = VANDAAG - timedelta(days=7 * weken_terug)
            complete_chore(db, "was", "laura", dag, _tijd(weken_terug, dag))
        # gat op 4 weken terug; daarvóór nog één (telt niet mee)
        ver = VANDAAG - timedelta(days=7 * 5)
        complete_chore(db, "was", "laura", ver, _tijd(9, ver))
        # huidige week leeg -> tellen begint bij vorige week -> 3
        assert assignee_streaks(db, VANDAAG)["laura"] == 3
        # voltooiing in de huidige week -> 4
        complete_chore(db, "was", "laura", VANDAAG, _tijd(10))
        assert assignee_streaks(db, VANDAAG)["laura"] == 4

    def test_week_start_is_maandag(self):
        assert week_start(date(2026, 7, 28)) == date(2026, 7, 27)  # di -> ma
        assert week_start(date(2026, 7, 27)) == date(2026, 7, 27)  # ma -> ma
        assert week_start(date(2026, 8, 2)) == date(2026, 7, 27)   # zo -> ma

    def test_weekhistorie_alleen_afgesloten_weken(self, db):
        _gewone_taak(db)
        # deze week (telt niet mee), vorige week, en drie weken terug
        complete_chore(db, "was", "laura", VANDAAG, _tijd(1))
        vorige = VANDAAG - timedelta(days=7)
        complete_chore(db, "was", "laura", vorige, _tijd(2, vorige))
        complete_chore(db, "was", "martijn", vorige, _tijd(3, vorige))
        ver = VANDAAG - timedelta(days=21)
        complete_chore(db, "was", "martijn", ver, _tijd(4, ver))
        historie = week_history(db, VANDAAG)
        assert [w["week_start"] for w in historie] == ["2026-07-20", "2026-07-06"]
        vorige_week = historie[0]
        assert vorige_week["total_minutes"] == 40
        # eindstand per persoon, minuten aflopend; gelijkspel -> volgorde vrij
        assert {p["id"]: p["minutes"] for p in vorige_week["persons"]} == {
            "laura": 20, "martijn": 20}
        # de lege week van 13 juli verschijnt niet — alleen weken met werk


class TestAssignees:
    def test_delete_zonder_verwijzingen_is_echt_weg(self, db):
        save_assignee(db, {"id": "gast", "name": "Gast", "color": "#000000"})
        assert delete_assignee(db, "gast") == "deleted"

    def test_delete_met_historie_deactiveert(self, db):
        _gewone_taak(db)
        complete_chore(db, "was", "laura", VANDAAG, NU)
        assert delete_assignee(db, "laura") == "deactivated"
        assert all(a["id"] != "laura" for a in list_assignees(db))
        assert any(a["id"] == "laura" for a in list_assignees(db, include_inactive=True))


class TestNachtelijkeRolEnOverzicht:
    def test_roll_all_forward(self, db):
        _gewone_taak(db, next_due=VANDAAG - timedelta(days=281))
        _gewone_taak(db, id="ok", name="Al goed", assigned_to="martijn")
        changes = roll_all_forward(db, VANDAAG, NU)
        assert changes == [("was", "2025-10-20", "2026-07-28")]
        assert get_chore(db, "was")["next_due"] == VANDAAG.isoformat()

    def test_overview_telt_kloppend(self, db):
        _gewone_taak(db)                                    # vandaag
        save_chore(db, {                                    # 2 dagen te laat
            "id": "plant", "name": "Planten", "schedule_type": "daily",
            "schedule_config": {"weekdays": [3, 7]},
            "next_due": VANDAAG - timedelta(days=2),
        }, VANDAAG, NU)
        save_chore(db, {                                    # toekomst
            "id": "verjaardag", "name": "Kaartje", "schedule_type": "yearly",
            "schedule_config": {"month": 12, "day": 1},
        }, VANDAAG, NU)
        complete_chore(db, "was", "laura", VANDAAG, _tijd(1))
        data = overview(db, VANDAAG)
        # "was" is afgevinkt en rolde naar morgen; alleen "plant" staat nog open
        assert data["due_today"] == 0
        assert data["overdue"] == 1
        assert data["open_today"] == 1
        assert data["completed_today"] == 1
        assert data["week_minutes_total"] == 20
        # in_leaderboard zit er sinds 3c bij (C3): de sensor toont iedereen,
        # filteren op de ranglijstvlag is aan de afnemer.
        assert data["persons"]["laura"] == {
            "name": "Laura", "minutes": 20, "tasks": 1, "streak": 1,
            "in_leaderboard": True}

    def test_build_state_structuur(self, db):
        _gewone_taak(db, subtask_mode="checklist")
        set_subtasks(db, "was", ["licht", "donker"])
        save_chore(db, {
            "id": "bood", "name": "Boodschappen", "schedule_type": "weekly",
            "schedule_config": {"weekday": 3}, "assignment_type": "rotating",
            "rotation": ["martijn", "laura"],
        }, VANDAAG, NU)
        state = build_state(db, VANDAAG)
        assert state["today"] == VANDAAG.isoformat()
        assert {c["id"] for c in state["chores"]} == {"was", "bood"}
        was = next(c for c in state["chores"] if c["id"] == "was")
        assert was["urgency"] == "due"
        assert [s["name"] for s in was["subtasks"]] == ["licht", "donker"]
        bood = next(c for c in state["chores"] if c["id"] == "bood")
        assert bood["current_assignee"] == "martijn"
        assert {p["id"] for p in state["leaderboard"]["persons"]} == {"laura", "martijn"}
