"""Randgevallen van overslaan (v2.5) die uit de review kwamen: gelijktijdige
apparaten, de wintertijdwissel, een taak die na het overslaan gewijzigd of
uit het archief teruggezet is, "Toch niet overslaan" na elkaar, en undo van
een voltooiing waarna (via het oude snooze 'skip') overgeslagen is.

De gelijktijdigheidstests draaien de tweede actie echt in een andere thread,
zoals HA's executor dat doet. Zonder de schrijfvergrendeling (BEGIN
IMMEDIATE in complete_chore, skip_chore en revert_skip) slaagt de tweede
actie midden in de eerste en belandt een stap dubbel in een ronde.
"""
from datetime import date, timedelta
import threading
import time

import pytest

from chores_manager.db import completions as completions_module
from chores_manager.db.assignees import save_assignee
from chores_manager.db.chores import (
    delete_chore,
    get_chore,
    restore_chore,
    save_chore,
    snooze_chore,
)
from chores_manager.db.completions import (
    complete_chore,
    instance_progress,
    undo_completion,
)
from chores_manager.db.errors import StoreError
from chores_manager.db.schema import create_database
from chores_manager.db.skips import revert_skip, skip_chore, skip_feed
from chores_manager.db.subtasks import list_subtasks, set_subtasks

MAANDAG = date(2026, 9, 28)
NU = "2026-09-28T09:00:00+02:00"
ELKE_DAG = {"weekdays": [1, 2, 3, 4, 5, 6, 7]}


def _tijd(minuut: int, dag: date = MAANDAG) -> str:
    return f"{dag.isoformat()}T10:{minuut:02d}:00+02:00"


@pytest.fixture
def db(tmp_path):
    pad = str(tmp_path / "chores_v2.db")
    create_database(pad)
    save_assignee(pad, {"id": "laura", "name": "Laura", "color": "#83c44a"})
    return pad


def _checklist(db, dag=MAANDAG, tijd=NU):
    save_chore(db, {
        "id": "bad", "name": "Bad", "schedule_type": "daily",
        "schedule_config": ELKE_DAG, "duration_minutes": 40,
        "subtask_mode": "checklist", "next_due": dag.isoformat(),
    }, dag, tijd)
    set_subtasks(db, "bad", ["wastafel", "douche"])
    return [s["id"] for s in list_subtasks(db, "bad")]


def _can_revert(db, skip_id):
    return next(r["can_revert"] for r in skip_feed(db) if r["id"] == skip_id)


def _tegelijk_met_instance_start(monkeypatch, actie):
    """Laat `actie` in een andere thread starten op het moment dat
    complete_chore de instantiegrens gelezen heeft, en wacht tot die thread
    echt bezig is. Geeft de thread en een dict met de uitkomst terug."""
    uitkomst = {}
    gestart = threading.Event()
    threads = []
    echte = completions_module._instance_start

    def tweede():
        gestart.set()
        try:
            uitkomst["waarde"] = actie()
        except StoreError as err:
            uitkomst["fout"] = str(err)

    def met_tweede(conn, chore_id):
        grens = echte(conn, chore_id)
        if not threads:
            thread = threading.Thread(target=tweede)
            threads.append(thread)
            thread.start()
            gestart.wait()
            time.sleep(0.2)  # de tweede actie staat nu bij zijn BEGIN IMMEDIATE
        return grens

    monkeypatch.setattr(completions_module, "_instance_start", met_tweede)
    return threads, uitkomst


class TestGelijktijdig:
    def test_terugdraaien_tijdens_afvinken_komt_er_niet_tussen(self, db, monkeypatch):
        wastafel, _douche = _checklist(db)
        complete_chore(db, "bad", "laura", MAANDAG, _tijd(1), subtask_id=wastafel)
        skip = skip_chore(db, "bad", None, MAANDAG, _tijd(2))

        threads, uitkomst = _tegelijk_met_instance_start(
            monkeypatch, lambda: revert_skip(db, skip["skip_id"], _tijd(3)))
        complete_chore(db, "bad", "laura", MAANDAG, _tijd(4), subtask_id=wastafel)
        threads[0].join()

        # het terugdraaien wachtte tot het afvinken klaar was, en weigerde toen
        assert "al aan de taak gewerkt" in uitkomst["fout"]
        assert instance_progress(db, "bad") == {
            "done_subtask_ids": [wastafel], "ticks": 1, "minutes_credited": 20}

    def test_overslaan_tijdens_afvinken_komt_er_niet_tussen(self, db, monkeypatch):
        wastafel, douche = _checklist(db)
        complete_chore(db, "bad", "laura", MAANDAG, _tijd(1), subtask_id=wastafel)

        threads, uitkomst = _tegelijk_met_instance_start(
            monkeypatch, lambda: skip_chore(db, "bad", None, MAANDAG, _tijd(2)))
        undo = complete_chore(db, "bad", "laura", MAANDAG, _tijd(3), subtask_id=douche)
        threads[0].join()

        # de ronde is eerst netjes afgerond (20 + 20 = 40); de overslag kwam
        # daarna en vond een taak die niet meer aan de beurt is
        assert undo["was_full"] is True
        assert "vandaag aan de beurt" in uitkomst["fout"]
        assert skip_feed(db) == []


class TestWintertijd:
    def test_tik_na_de_overslag_in_het_teruggezette_uur(self, db):
        # 25-10-2026: om 03:00 zomertijd wordt het 02:00 wintertijd. Een
        # overslag om 02:50+02:00 en twintig minuten later een stap om
        # 02:10+01:00: als string staat de stap vóór de overslag.
        dag = date(2026, 10, 25)
        wastafel, douche = _checklist(db, dag, "2026-10-25T00:00:00+02:00")
        complete_chore(db, "bad", "laura", dag, "2026-10-25T02:40:00+02:00",
                       subtask_id=wastafel)
        skip = skip_chore(db, "bad", None, dag, "2026-10-25T02:50:00+02:00")
        complete_chore(db, "bad", "laura", dag, "2026-10-25T02:10:00+01:00",
                       subtask_id=douche)

        # de stap hoort bij de nieuwe ronde, en blokkeert het terugdraaien
        assert instance_progress(db, "bad") == {
            "done_subtask_ids": [douche], "ticks": 1, "minutes_credited": 20}
        assert _can_revert(db, skip["skip_id"]) is False
        with pytest.raises(StoreError, match="al aan de taak gewerkt"):
            revert_skip(db, skip["skip_id"], "2026-10-25T02:20:00+01:00")


class TestGewijzigdNaOverslaan:
    def _wekelijks(self, db):
        save_chore(db, {
            "id": "was", "name": "Was", "schedule_type": "weekly",
            "schedule_config": {"weekday": 1}, "duration_minutes": 20,
            "next_due": MAANDAG.isoformat(),
        }, MAANDAG, NU)

    def test_terugzetten_uit_archief_op_dezelfde_datum_blokkeert(self, db):
        # Overslaan zet maandag op de maandag erna; archiveren en terugzetten
        # geeft toevallig diezelfde verse datum. Terugdraaien zou de net
        # teruggezette taak meteen drie dagen te laat maken.
        self._wekelijks(db)
        complete_chore(db, "was", "laura", MAANDAG - timedelta(days=7),
                       _tijd(0, MAANDAG - timedelta(days=7)))
        save_chore(db, {"id": "was", "name": "Was", "schedule_type": "weekly",
                        "schedule_config": {"weekday": 1}, "duration_minutes": 20,
                        "next_due": MAANDAG.isoformat()}, MAANDAG, NU)
        skip = skip_chore(db, "was", None, MAANDAG, _tijd(1))
        assert delete_chore(db, "was") == "deactivated"
        donderdag = MAANDAG + timedelta(days=3)
        restore_chore(db, "was", donderdag, _tijd(0, donderdag))
        assert get_chore(db, "was")["next_due"] == skip["new_next_due"]

        assert _can_revert(db, skip["skip_id"]) is False
        with pytest.raises(StoreError, match="sinds het overslaan gewijzigd"):
            revert_skip(db, skip["skip_id"], _tijd(1, donderdag))

    def test_bewerken_blokkeert(self, db):
        self._wekelijks(db)
        skip = skip_chore(db, "was", None, MAANDAG, _tijd(1))
        save_chore(db, {"id": "was", "name": "Was draaien", "schedule_type": "weekly",
                        "schedule_config": {"weekday": 1}, "duration_minutes": 20,
                        "next_due": skip["new_next_due"]}, MAANDAG, _tijd(2))
        assert _can_revert(db, skip["skip_id"]) is False

    def test_twee_keer_toch_niet_overslaan_na_elkaar(self, db):
        # dagelijks: maandag overslaan (→ di), dinsdag overslaan (→ wo); de
        # tweede terugdraaien maakt de eerste weer de nieuwste — en die moet
        # dan ook terug kunnen
        save_chore(db, {"id": "was", "name": "Was", "schedule_type": "daily",
                        "schedule_config": ELKE_DAG, "next_due": MAANDAG.isoformat()},
                   MAANDAG, NU)
        dinsdag = MAANDAG + timedelta(days=1)
        eerste = skip_chore(db, "was", None, MAANDAG, _tijd(1))
        tweede = skip_chore(db, "was", None, dinsdag, _tijd(1, dinsdag))
        assert _can_revert(db, eerste["skip_id"]) is False

        revert_skip(db, tweede["skip_id"], _tijd(2, dinsdag))
        assert _can_revert(db, eerste["skip_id"]) is True
        revert_skip(db, eerste["skip_id"], _tijd(3, dinsdag))
        assert get_chore(db, "was")["next_due"] == MAANDAG.isoformat()


class TestUndoNaSnoozeSkip:
    def test_undo_van_voltooiing_weigert_na_latere_overslag(self, db):
        # Counter 2/3, de derde tik rondt af (undo in de buffer); daarna een
        # snooze 'skip' (vult de buffer niet). Undo van de voltooiing zou de
        # datum van de overslag overschrijven en een overslag achterlaten die
        # de herstelde ronde leegmaakt — dus weigeren, zonder iets te raken.
        save_chore(db, {"id": "tel", "name": "Tel", "schedule_type": "weekly",
                        "schedule_config": {"weekday": 1}, "duration_minutes": 30,
                        "subtask_mode": "counter", "subtask_target": 3,
                        "next_due": MAANDAG.isoformat()}, MAANDAG, NU)
        complete_chore(db, "tel", "laura", MAANDAG, _tijd(1))
        complete_chore(db, "tel", "laura", MAANDAG, _tijd(2))
        undo = complete_chore(db, "tel", "laura", MAANDAG, _tijd(3))
        assert undo["was_full"] is True
        snooze_chore(db, "tel", "skip", MAANDAG, _tijd(4))
        voor = get_chore(db, "tel")["next_due"]

        with pytest.raises(StoreError, match="daarna overgeslagen"):
            undo_completion(db, undo)
        assert get_chore(db, "tel")["next_due"] == voor

    def test_undo_zonder_overslag_werkt_zoals_altijd(self, db):
        save_chore(db, {"id": "tel", "name": "Tel", "schedule_type": "daily",
                        "schedule_config": ELKE_DAG, "next_due": MAANDAG.isoformat()},
                   MAANDAG, NU)
        undo = complete_chore(db, "tel", "laura", MAANDAG, _tijd(1))
        undo_completion(db, undo)
        assert get_chore(db, "tel")["next_due"] == MAANDAG.isoformat()
