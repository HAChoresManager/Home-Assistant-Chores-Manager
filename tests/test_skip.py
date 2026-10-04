"""Overslaan (v2.5, deel 1): skip_chore en wat er in de rest van de datalaag
door verandert — instantiegrens, snooze 'skip', revert_completion met een
latere overslag, verwijderen. Terugdraaien en de leesweergaven staan in
test_skip_revert.py.

Vaste datums: 2026-07-28 is een dinsdag. Elke voor/na-stap krijgt een eigen
tijdstip (_tijd(1), _tijd(2), ...): bij gelijke tijdstippen gelden aparte
tie-regels, en die worden apart getest.
"""
from datetime import date, timedelta
import sqlite3

import pytest

from chores_manager.db import skips as skips_module
from chores_manager.db.assignees import (
    assignee_in_use,
    delete_assignee,
    save_assignee,
)
from chores_manager.db.chores import delete_chore, get_chore, save_chore, snooze_chore
from chores_manager.db.completions import (
    assignee_streaks,
    complete_chore,
    completed_today_count,
    feed,
    history_counts,
    instance_progress,
    leaderboard,
    revert_completion,
)
from chores_manager.db.errors import StoreError
from chores_manager.db.overview import build_state
from chores_manager.db.schema import create_database
from chores_manager.db.skips import revert_skip, skip_chore, skip_feed
from chores_manager.db.subtasks import list_subtasks, set_subtasks

VANDAAG = date(2026, 7, 28)
MORGEN = VANDAAG + timedelta(days=1)
NU = "2026-07-28T09:00:00+02:00"  # aanmaken van taken, vóór elke stap
ELKE_DAG = {"weekdays": [1, 2, 3, 4, 5, 6, 7]}


def _tijd(minuut: int, dag: date = VANDAAG) -> str:
    """Eigen tijdstip per stap, zodat voor en na nooit samenvallen."""
    return f"{dag.isoformat()}T10:{minuut:02d}:00+02:00"


@pytest.fixture
def db(tmp_path):
    pad = str(tmp_path / "chores_v2.db")
    create_database(pad)
    save_assignee(pad, {"id": "laura", "name": "Laura", "color": "#83c44a"})
    save_assignee(pad, {"id": "martijn", "name": "Martijn", "color": "#4dd8ff"})
    return pad


def _taak(db, **extra):
    data = {
        "id": "was", "name": "Was draaien", "schedule_type": "daily",
        "schedule_config": ELKE_DAG, "duration_minutes": 20,
    }
    data.update(extra)
    return save_chore(db, data, VANDAAG, NU)


def _skip_rijen(db):
    conn = sqlite3.connect(db)
    rijen = conn.execute(
        "SELECT chore_id, assignee_id, skipped_at, previous_next_due, new_next_due"
        " FROM skips ORDER BY id").fetchall()
    conn.close()
    return rijen


class TestOverslaanPerType:
    @pytest.mark.parametrize("schedule_type, config, next_due, verwacht", [
        ("daily", ELKE_DAG, VANDAAG, date(2026, 7, 29)),
        ("daily", {"weekdays": [3, 7]}, date(2026, 7, 22), date(2026, 7, 29)),
        ("weekly", {"weekday": 2}, VANDAAG, date(2026, 8, 4)),
        ("weekly", {"weekday": 3}, date(2026, 7, 22), date(2026, 7, 29)),
        ("monthly", {"monthday": 28}, VANDAAG, date(2026, 8, 28)),
        ("monthly", {"monthday": 31}, date(2026, 6, 30), date(2026, 7, 31)),
        ("interval", {"days": 10}, VANDAAG, date(2026, 8, 7)),
        ("interval", {"days": 10}, date(2026, 7, 20), date(2026, 8, 7)),
        ("yearly", {"month": 7, "day": 28}, VANDAAG, date(2027, 7, 28)),
        ("yearly", {"month": 2, "day": 29}, date(2026, 2, 28), date(2027, 2, 28)),
    ])
    def test_rolt_door_naar_de_volgende_keer(self, db, schedule_type, config,
                                              next_due, verwacht):
        _taak(db, schedule_type=schedule_type, schedule_config=config, next_due=next_due)
        result = skip_chore(db, "was", "laura", VANDAAG, _tijd(1))
        assert result == {
            "skip_id": result["skip_id"], "chore_id": "was",
            "previous_next_due": next_due.isoformat(),
            "new_next_due": verwacht.isoformat()}
        assert isinstance(result["skip_id"], int)
        chore = get_chore(db, "was")
        assert chore["next_due"] == verwacht.isoformat()
        assert chore["updated_at"] == _tijd(1)
        assert _skip_rijen(db) == [("was", "laura", _tijd(1), next_due.isoformat(),
                                    verwacht.isoformat())]


class TestGeenVoltooiing:
    def test_geen_regel_minuten_ranglijst_of_streak(self, db):
        _taak(db)
        vorige_week = VANDAAG - timedelta(days=7)
        complete_chore(db, "was", "laura", vorige_week, _tijd(1, vorige_week))
        # het afvinken van vorige week zette next_due op 22-07: achterstand
        streaks_voor = assignee_streaks(db, VANDAAG)
        skip_chore(db, "was", "laura", VANDAAG, _tijd(2))
        skip_chore(db, "was", "martijn", MORGEN, _tijd(3, MORGEN))
        assert len(feed(db, 10)) == 1  # alleen de voltooiing van vorige week
        assert history_counts(db) == {"was": 1}
        assert completed_today_count(db, VANDAAG) == 0
        assert completed_today_count(db, MORGEN) == 0
        board = leaderboard(db, VANDAAG)
        assert board["total_minutes"] == 0
        assert all(p["minutes"] == 0 and p["tasks"] == 0 for p in board["persons"])
        assert assignee_streaks(db, VANDAAG) == streaks_voor == {"laura": 1}
        assert "martijn" not in assignee_streaks(db, MORGEN)
        assert build_state(db, VANDAAG)["feed"] == feed(db, 100)


class TestRotatie:
    def test_beurt_blijft_staan(self, db):
        _taak(db, assignment_type="rotating", rotation=["martijn", "laura"])
        # laura slaat over terwijl martijn aan de beurt is: niets verschuift
        skip_chore(db, "was", "laura", VANDAAG, _tijd(1))
        assert get_chore(db, "was")["rotation_index"] == 0
        (was,) = build_state(db, MORGEN)["chores"]
        assert was["current_assignee"] == "martijn"
        complete_chore(db, "was", "martijn", MORGEN, _tijd(2, MORGEN))
        assert get_chore(db, "was")["rotation_index"] == 1
        dag3 = MORGEN + timedelta(days=1)
        skip_chore(db, "was", "martijn", dag3, _tijd(3, dag3))
        assert get_chore(db, "was")["rotation_index"] == 1
        (was,) = build_state(db, dag3)["chores"]
        assert was["current_assignee"] == "laura"


class TestWeigeringen:
    def test_komende_keer(self, db):
        _taak(db, schedule_type="weekly", schedule_config={"weekday": 3})  # morgen
        with pytest.raises(StoreError, match="vandaag aan de beurt is of achterloopt"):
            skip_chore(db, "was", "laura", VANDAAG, _tijd(1))
        assert get_chore(db, "was")["next_due"] == MORGEN.isoformat()
        assert _skip_rijen(db) == []

    def test_onbekende_taak(self, db):
        with pytest.raises(StoreError, match="onbekende taak"):
            skip_chore(db, "bestaat-niet", "laura", VANDAAG, _tijd(1))

    def test_gearchiveerde_taak(self, db):
        _taak(db)
        complete_chore(db, "was", "laura", VANDAAG, _tijd(1))
        assert delete_chore(db, "was") == "deactivated"
        with pytest.raises(StoreError, match="niet actief"):
            skip_chore(db, "was", "laura", MORGEN, _tijd(2, MORGEN))
        assert _skip_rijen(db) == []

    @pytest.mark.parametrize("persoon", ["gast", "bestaat-niet"])
    def test_inactieve_of_onbekende_persoon(self, db, persoon):
        save_assignee(db, {"id": "gast", "name": "Gast", "color": "#000000", "active": 0})
        _taak(db)
        with pytest.raises(StoreError, match="inactieve persoon"):
            skip_chore(db, "was", persoon, VANDAAG, _tijd(1))
        assert get_chore(db, "was")["next_due"] == VANDAAG.isoformat()
        assert _skip_rijen(db) == []

    def test_gelijktijdige_schrijver_wacht_tot_de_overslag_klaar_is(self, db, monkeypatch):
        # Een tweede apparaat wil de taak verzetten terwijl skip_chore tussen
        # lezen en schrijven zit. skip_chore houdt de schrijfvergrendeling
        # (BEGIN IMMEDIATE), dus dat apparaat komt er niet tussen: de
        # overslag gaat in één keer door, de ander moet wachten.
        _taak(db)
        echte = skips_module.next_due_after_skip
        geweigerd = []

        def met_tussenkomst(*args):
            ander = sqlite3.connect(db, timeout=0)
            try:
                ander.execute("UPDATE chores SET next_due = '2026-08-01' WHERE id = 'was'")
            except sqlite3.OperationalError as err:
                geweigerd.append(str(err))
            finally:
                ander.close()
            return echte(*args)

        monkeypatch.setattr(skips_module, "next_due_after_skip", met_tussenkomst)
        result = skip_chore(db, "was", "laura", VANDAAG, _tijd(1))
        assert geweigerd and "locked" in geweigerd[0]
        assert get_chore(db, "was")["next_due"] == result["new_next_due"] == MORGEN.isoformat()
        assert len(_skip_rijen(db)) == 1

    def test_dubbele_tik_schuift_niet_twee_keer(self, db):
        _taak(db)
        skip_chore(db, "was", "laura", VANDAAG, _tijd(1))
        with pytest.raises(StoreError, match="vandaag aan de beurt"):
            skip_chore(db, "was", "laura", VANDAAG, _tijd(2))
        assert get_chore(db, "was")["next_due"] == MORGEN.isoformat()
        assert len(_skip_rijen(db)) == 1


class TestZonderPersoon:
    def test_assignee_none_wordt_null(self, db):
        _taak(db)
        skip_chore(db, "was", None, VANDAAG, _tijd(1))
        assert _skip_rijen(db)[0][1] is None
        (rij,) = skip_feed(db)
        assert rij["assignee_id"] is None
        assert rij["assignee_name"] is None
        assert rij["color"] is None


class TestInstantiegrens:
    def test_checklist_begint_opnieuw_en_terugdraaien_herstelt(self, db):
        _taak(db, subtask_mode="checklist")
        set_subtasks(db, "was", ["licht", "donker", "bont", "wol"])
        ids = [s["id"] for s in list_subtasks(db, "was")]
        complete_chore(db, "was", "laura", VANDAAG, _tijd(1), subtask_id=ids[0])
        complete_chore(db, "was", "laura", VANDAAG, _tijd(2), subtask_id=ids[1])
        assert instance_progress(db, "was")["done_subtask_ids"] == ids[:2]

        skip = skip_chore(db, "was", "martijn", VANDAAG, _tijd(3))
        assert instance_progress(db, "was") == {
            "done_subtask_ids": [], "ticks": 0, "minutes_credited": 0}
        (was,) = build_state(db, VANDAAG)["chores"]
        assert was["subtasks_done"] == []
        # de twee stappen blijven historie: feed en ranglijst houden ze
        assert len(feed(db, 10)) == 2
        assert leaderboard(db, VANDAAG)["total_minutes"] == 10

        revert_skip(db, skip["skip_id"], _tijd(4))
        assert instance_progress(db, "was")["done_subtask_ids"] == ids[:2]
        complete_chore(db, "was", "laura", VANDAAG, _tijd(5), subtask_id=ids[2])
        laatste = complete_chore(db, "was", "laura", VANDAAG, _tijd(6), subtask_id=ids[3])
        assert laatste["was_full"] is True
        # som over de instantie = duration (§3.4): 5 + 5 + 5 + 5
        assert sum(r["minutes"] for r in feed(db, 10)) == 20

    def test_checklist_na_overslaan_dezelfde_stap_opnieuw(self, db):
        _taak(db, subtask_mode="checklist")
        set_subtasks(db, "was", ["licht", "donker"])
        eerste = list_subtasks(db, "was")[0]["id"]
        complete_chore(db, "was", "laura", VANDAAG, _tijd(1), subtask_id=eerste)
        skip_chore(db, "was", "laura", VANDAAG, _tijd(2))
        # nieuwe ronde: dezelfde stap mag weer, met het gewone aandeel
        undo = complete_chore(db, "was", "laura", MORGEN, _tijd(3, MORGEN),
                              subtask_id=eerste)
        assert undo["was_full"] is False
        assert instance_progress(db, "was") == {
            "done_subtask_ids": [eerste], "ticks": 1, "minutes_credited": 10}

    def test_counter_begint_opnieuw_en_terugdraaien_herstelt(self, db):
        _taak(db, subtask_mode="counter", subtask_target=8, duration_minutes=16)
        for minuut in (1, 2, 3):
            complete_chore(db, "was", "laura", VANDAAG, _tijd(minuut))
        assert instance_progress(db, "was")["ticks"] == 3

        skip = skip_chore(db, "was", "laura", VANDAAG, _tijd(4))
        assert instance_progress(db, "was")["ticks"] == 0
        (was,) = build_state(db, VANDAAG)["chores"]
        assert was["counter_ticks"] == 0

        revert_skip(db, skip["skip_id"], _tijd(5))
        assert instance_progress(db, "was") == {
            "done_subtask_ids": [], "ticks": 3, "minutes_credited": 6}
        for minuut in (6, 7, 8, 9, 10):
            laatste = complete_chore(db, "was", "laura", VANDAAG, _tijd(minuut))
        assert laatste["was_full"] is True
        # 8 tikken: zeven keer 16 // 8 = 2, de doeltik de rest (2) -> 16
        assert sum(r["minutes"] for r in feed(db, 20)) == 16

    def test_counter_tik_na_overslaan_hoort_bij_de_nieuwe_ronde(self, db):
        _taak(db, subtask_mode="counter", subtask_target=4, duration_minutes=16)
        complete_chore(db, "was", "laura", VANDAAG, _tijd(1))
        complete_chore(db, "was", "laura", VANDAAG, _tijd(2))
        skip_chore(db, "was", "laura", VANDAAG, _tijd(3))
        complete_chore(db, "was", "laura", MORGEN, _tijd(4, MORGEN))
        assert instance_progress(db, "was") == {
            "done_subtask_ids": [], "ticks": 1, "minutes_credited": 4}

    def test_regel_op_het_tijdstip_van_de_overslag_hoort_bij_de_oude_ronde(self, db):
        # tie-regel: de grens is MAX(volledig, overslag), "erna" is strikt >
        _taak(db, subtask_mode="counter", subtask_target=4, duration_minutes=16)
        complete_chore(db, "was", "laura", VANDAAG, _tijd(1))
        skip_chore(db, "was", "laura", VANDAAG, _tijd(1))
        assert instance_progress(db, "was")["ticks"] == 0


class TestSnoozeSkip:
    def test_wordt_gelogd_zonder_persoon(self, db):
        _taak(db, schedule_type="weekly", schedule_config={"weekday": 3})  # morgen
        # komende keer: snooze accepteerde dat altijd en blijft dat doen
        assert snooze_chore(db, "was", "skip", VANDAAG, _tijd(1)) == date(2026, 8, 5)
        assert _skip_rijen(db) == [("was", None, _tijd(1), "2026-07-29", "2026-08-05")]
        assert get_chore(db, "was")["next_due"] == "2026-08-05"

    def test_tomorrow_logt_niets(self, db):
        _taak(db)
        assert snooze_chore(db, "was", "tomorrow", VANDAAG, _tijd(1)) == MORGEN
        assert _skip_rijen(db) == []

    def test_onbekende_taak_en_modus(self, db):
        with pytest.raises(StoreError, match="onbekende taak"):
            snooze_chore(db, "bestaat-niet", "skip", VANDAAG, _tijd(1))
        _taak(db)
        with pytest.raises(StoreError, match="snooze-modus"):
            snooze_chore(db, "was", "ooit", VANDAAG, _tijd(1))

    def test_sluit_ook_de_ronde_van_een_komende_checklist(self, db):
        # Bekend gevolg van allow_upcoming: wie een komende checklist via
        # snooze overslaat, begint de volgende keer met een lege lijst.
        _taak(db, schedule_type="weekly", schedule_config={"weekday": 3},
              subtask_mode="checklist")
        set_subtasks(db, "was", ["licht", "donker"])
        eerste = list_subtasks(db, "was")[0]["id"]
        complete_chore(db, "was", "laura", VANDAAG, _tijd(1), subtask_id=eerste)
        snooze_chore(db, "was", "skip", VANDAAG, _tijd(2))
        assert instance_progress(db, "was")["done_subtask_ids"] == []


class TestRevertCompletionMetLatereSkip:
    def _rotatietaak(self, db):
        _taak(db, assignment_type="rotating", rotation=["martijn", "laura"])

    def test_datum_blijft_staan_beurt_gaat_terug(self, db):
        self._rotatietaak(db)
        voltooiing = complete_chore(db, "was", "martijn", VANDAAG, _tijd(1))
        assert get_chore(db, "was")["rotation_index"] == 1  # laura
        skip_chore(db, "was", "laura", MORGEN, _tijd(2, MORGEN))  # 29-07 -> 30-07

        revert_completion(db, voltooiing["row_id"], MORGEN)

        chore = get_chore(db, "was")
        # de datum komt van de overslag; 29-07 was bewust overgeslagen
        assert chore["next_due"] == "2026-07-30"
        # een overslag raakt de rotatie niet: martijn staat weer aan de beurt
        assert chore["rotation_index"] == 0

    def test_zonder_latere_skip_komt_de_taak_vandaag_terug(self, db):
        # controle: dezelfde opzet zonder overslag gedraagt zich als vanouds
        self._rotatietaak(db)
        voltooiing = complete_chore(db, "was", "martijn", VANDAAG, _tijd(1))
        revert_completion(db, voltooiing["row_id"], VANDAAG)
        assert get_chore(db, "was")["next_due"] == VANDAAG.isoformat()
        assert get_chore(db, "was")["rotation_index"] == 0

    def test_skip_van_voor_de_voltooiing_telt_niet(self, db):
        self._rotatietaak(db)
        skip_chore(db, "was", "laura", VANDAAG, _tijd(1))  # 28-07 -> 29-07
        voltooiing = complete_chore(db, "was", "martijn", MORGEN, _tijd(2, MORGEN))
        revert_completion(db, voltooiing["row_id"], MORGEN)
        assert get_chore(db, "was")["next_due"] == MORGEN.isoformat()


class TestVerwijderen:
    def test_taak_met_alleen_skips_gaat_echt_weg(self, db):
        _taak(db)
        skip_chore(db, "was", "laura", VANDAAG, _tijd(1))
        assert delete_chore(db, "was") == "deleted"
        assert get_chore(db, "was") is None
        assert _skip_rijen(db) == []

    def test_taak_met_voltooiingen_wordt_gearchiveerd_skips_blijven(self, db):
        _taak(db)
        complete_chore(db, "was", "laura", VANDAAG, _tijd(1))
        skip_chore(db, "was", "laura", MORGEN, _tijd(2, MORGEN))
        assert delete_chore(db, "was") == "deactivated"
        assert len(_skip_rijen(db)) == 1

    def test_persoon_met_alleen_skips_gaat_echt_weg(self, db):
        save_assignee(db, {"id": "gast", "name": "Gast", "color": "#000000"})
        _taak(db)
        skip_chore(db, "was", "gast", VANDAAG, _tijd(1))
        # een overslag maakt iemand niet "in gebruik"
        assert assignee_in_use(db, "gast") is False
        assert delete_assignee(db, "gast") == "deleted"
        assert _skip_rijen(db)[0][1] is None
        (rij,) = skip_feed(db)
        assert rij["assignee_name"] is None
