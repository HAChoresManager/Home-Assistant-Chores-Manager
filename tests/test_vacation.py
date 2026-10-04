"""Vakantiemodus (v2.6, deel 2): aanzetten, wijzigen en beëindigen
(db/vacations.py) en de blokkades in de rest van de datalaag. De
leesweergaven en streaks staan in test_vacation_views.py, de pure
verschuiving per type in test_vacation_shift.py.

Vaste datums: 2026-10-03 is een zaterdag (START), 2026-10-18 een zondag
(TERUG). Elke voor/na-stap krijgt een eigen tijdstip (_tijd(dag, minuut)),
zodat voor en na nooit samenvallen.
"""
from datetime import date, datetime, timedelta
import sqlite3

import pytest

from chores_manager.db import vacations as vacations_module
from chores_manager.db.assignees import save_assignee
from chores_manager.db.chores import (
    get_chore,
    restore_chore,
    roll_all_forward,
    save_chore,
    snooze_chore,
)
from chores_manager.db.completions import complete_chore, revert_completion
from chores_manager.db.connection import get_connection
from chores_manager.db.errors import StoreError
from chores_manager.db.schema import create_database
from chores_manager.db.skips import revert_skip, skip_chore, skip_feed
from chores_manager.db.subtasks import list_subtasks, set_subtasks
from chores_manager.db.vacations import (
    VacationActiveError,
    end_due_vacation,
    end_vacation,
    get_active_vacation,
    start_vacation,
    update_vacation,
)

START = date(2026, 10, 3)   # zaterdag
TERUG = date(2026, 10, 18)  # zondag; vijftien dagen na START
ELKE_DAG = {"weekdays": [1, 2, 3, 4, 5, 6, 7]}
NU = "2026-10-01T09:00:00+02:00"  # aanmaken van taken, vóór elke stap


def _tijd(dag: date, minuut: int = 0) -> str:
    return f"{dag.isoformat()}T10:{minuut:02d}:00+02:00"


@pytest.fixture
def db(tmp_path):
    pad = str(tmp_path / "chores_v2.db")
    create_database(pad)
    save_assignee(pad, {"id": "laura", "name": "Laura", "color": "#83c44a"})
    save_assignee(pad, {"id": "martijn", "name": "Martijn", "color": "#4dd8ff"})
    return pad


def _taak(db, chore_id, schedule_type, config, next_due, dag=date(2026, 10, 1),
          tijd=NU, **extra):
    data = {"id": chore_id, "name": chore_id.capitalize(),
            "schedule_type": schedule_type, "schedule_config": config,
            "next_due": next_due.isoformat() if next_due else None}
    data.update(extra)
    return save_chore(db, data, dag, tijd)


def _due(db, chore_id):
    return get_chore(db, chore_id)["next_due"]


def _vacations(db):
    with get_connection(db) as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM vacations ORDER BY id")]


def _frozen(db):
    with get_connection(db) as conn:
        return {r["chore_id"]: r["next_due"] for r in conn.execute(
            "SELECT chore_id, next_due FROM vacation_frozen")}


class TestAanzetten:
    def test_zonder_einddatum(self, db):
        vorm = start_vacation(db, START, None, _tijd(START))
        assert vorm == {"active": True, "start_date": "2026-10-03", "until": None}
        assert get_active_vacation(db) == vorm

    def test_geen_vakantie_is_none(self, db):
        assert get_active_vacation(db) is None

    @pytest.mark.parametrize("until", [
        "2026-10-10", "20261010", " 2026-10-10 ", date(2026, 10, 10),
        datetime(2026, 10, 10, 23, 30),
    ])
    def test_einddatum_wordt_genormaliseerd(self, db, until):
        assert start_vacation(db, START, until, _tijd(START))["until"] == "2026-10-10"
        assert _vacations(db)[0]["until"] == "2026-10-10"

    @pytest.mark.parametrize("until", ["", "   "])
    def test_lege_einddatum_is_open_einde(self, db, until):
        assert start_vacation(db, START, until, _tijd(START))["until"] is None

    def test_einddatum_vandaag_mag(self, db):
        assert start_vacation(db, START, START, _tijd(START))["until"] == "2026-10-03"

    @pytest.mark.parametrize("until", ["2026-10-02", "morgen", "2026-13-01", 20261010])
    def test_ongeldige_of_verleden_einddatum_geweigerd(self, db, until):
        with pytest.raises(StoreError):
            start_vacation(db, START, until, _tijd(START))
        assert _vacations(db) == []

    def test_al_actief_geweigerd(self, db):
        start_vacation(db, START, None, _tijd(START))
        with pytest.raises(StoreError, match="staat al aan"):
            start_vacation(db, START, "2026-10-10", _tijd(START, 1))
        assert len(_vacations(db)) == 1

    def test_unieke_index_wordt_storeerror(self, db, monkeypatch):
        # gelijktijdig aanzetten: de controle ziet de andere vakantie (nog)
        # niet, de unieke index wel
        start_vacation(db, START, None, _tijd(START))
        monkeypatch.setattr(vacations_module, "_active_row", lambda conn: None)
        with pytest.raises(StoreError, match="staat al aan") as info:
            start_vacation(db, START, None, _tijd(START, 1))
        assert isinstance(info.value.__cause__, sqlite3.IntegrityError)
        assert len(_vacations(db)) == 1

    def test_momentopname_van_actieve_taken(self, db):
        _taak(db, "was", "daily", ELKE_DAG, date(2026, 10, 2))
        _taak(db, "oud", "interval", {"days": 7}, date(2026, 9, 1), active=0)
        start_vacation(db, START, None, _tijd(START))
        assert _frozen(db) == {"was": "2026-10-02"}
        assert _vacations(db)[0]["created_at"] == _tijd(START)


class TestEinddatumWijzigen:
    def test_wijzigen_en_wissen(self, db):
        start_vacation(db, START, "2026-10-10", _tijd(START))
        assert update_vacation(db, "20261012", date(2026, 10, 5))["until"] == "2026-10-12"
        assert update_vacation(db, None, date(2026, 10, 5))["until"] is None
        assert update_vacation(db, "2026-10-12", date(2026, 10, 5))["until"] == "2026-10-12"
        assert update_vacation(db, "", date(2026, 10, 5)) == {
            "active": True, "start_date": "2026-10-03", "until": None}

    def test_verleden_geweigerd(self, db):
        start_vacation(db, START, "2026-10-10", _tijd(START))
        with pytest.raises(StoreError):
            update_vacation(db, "2026-10-04", date(2026, 10, 5))
        assert get_active_vacation(db)["until"] == "2026-10-10"

    def test_zonder_vakantie_geweigerd(self, db):
        with pytest.raises(StoreError, match="geen vakantie"):
            update_vacation(db, "2026-10-10", START)


class TestEindePerType:
    def _arrange(self, db):
        _taak(db, "vriezer", "interval", {"days": 14}, date(2026, 10, 10))
        _taak(db, "filter", "interval", {"days": 14}, date(2026, 9, 30))   # 3 dagen te laat
        _taak(db, "bad", "weekly", {"weekday": 3}, date(2026, 10, 7))
        _taak(db, "planten", "weekly", {"weekday": 3}, date(2026, 9, 30))  # achterstand
        _taak(db, "afwas", "daily", ELKE_DAG, date(2026, 10, 2))
        _taak(db, "huur", "monthly", {"monthday": 31}, date(2026, 10, 31))
        _taak(db, "keuring", "yearly", {"month": 10, "day": 10}, date(2026, 10, 10))
        _taak(db, "later", "weekly", {"weekday": 3}, date(2026, 10, 28))

    def test_alle_types(self, db):
        self._arrange(db)
        start_vacation(db, START, None, _tijd(START))
        uitkomst = end_vacation(db, TERUG, _tijd(TERUG))
        assert uitkomst["start_date"] == "2026-10-03"
        assert uitkomst["until"] is None
        assert uitkomst["ended_on"] == "2026-10-18"
        assert uitkomst["days"] == 15
        verwacht = {
            "vriezer": "2026-10-25",
            "filter": "2026-10-15",   # achterstand blijft drie dagen
            "bad": "2026-10-21",
            "planten": "2026-10-21",  # kalenderachterstand vervalt
            "afwas": "2026-10-18",
            "huur": "2026-10-31",     # ligt al na resume: ongewijzigd
            "keuring": "2027-10-10",
            "later": "2026-10-28",
        }
        assert {cid: _due(db, cid) for cid in verwacht} == verwacht
        assert sorted(c[0] for c in uitkomst["changes"]) == [
            "afwas", "bad", "filter", "keuring", "planten", "vriezer"]
        assert ("vriezer", "2026-10-10", "2026-10-25") in uitkomst["changes"]
        assert get_chore(db, "vriezer")["updated_at"] == _tijd(TERUG)
        assert get_chore(db, "later")["updated_at"] == NU
        assert get_active_vacation(db) is None
        assert _vacations(db)[0]["ended_on"] == "2026-10-18"
        assert _frozen(db) == {}  # momentopname opgeruimd

    def test_monthly_over_een_maandgrens(self, db):
        _taak(db, "huur", "monthly", {"monthday": 31}, date(2026, 10, 31))
        start_vacation(db, date(2026, 10, 25), None, _tijd(date(2026, 10, 25)))
        end_vacation(db, date(2026, 11, 3), _tijd(date(2026, 11, 3)))
        assert _due(db, "huur") == "2026-11-30"  # afgekapt op 30

    def test_nul_dagen_verschuift_niets(self, db):
        self._arrange(db)
        voor = {c: _due(db, c) for c in ("vriezer", "filter", "planten", "afwas")}
        start_vacation(db, START, None, _tijd(START))
        uitkomst = end_vacation(db, START, _tijd(START, 1))
        assert uitkomst["days"] == 0 and uitkomst["changes"] == []
        assert {c: _due(db, c) for c in voor} == voor  # ook de achterstand blijft

    def test_resume_voor_start_wordt_start(self, db):
        start_vacation(db, START, None, _tijd(START))
        uitkomst = end_vacation(db, date(2026, 10, 1), _tijd(START, 1))
        assert uitkomst["ended_on"] == "2026-10-03" and uitkomst["days"] == 0

    def test_rotatie_blijft_staan(self, db):
        _taak(db, "vuilnis", "interval", {"days": 7}, date(2026, 10, 5),
              assignment_type="rotating", rotation=["laura", "martijn"],
              rotation_index=1)
        start_vacation(db, START, None, _tijd(START))
        end_vacation(db, TERUG, _tijd(TERUG))
        chore = get_chore(db, "vuilnis")
        assert chore["next_due"] == "2026-10-20"
        assert chore["rotation_index"] == 1

    def test_inactieve_taak_niet_verschoven(self, db):
        _taak(db, "oud", "interval", {"days": 7}, date(2026, 9, 1), active=0)
        _taak(db, "weg", "interval", {"days": 7}, date(2026, 10, 1))
        start_vacation(db, START, None, _tijd(START))
        # tijdens de vakantie gearchiveerd: ook niet verschoven
        _taak(db, "weg", "interval", {"days": 7}, date(2026, 10, 1),
              dag=date(2026, 10, 5), tijd=_tijd(date(2026, 10, 5)), active=0)
        uitkomst = end_vacation(db, TERUG, _tijd(TERUG))
        assert _due(db, "oud") == "2026-09-01"
        assert _due(db, "weg") == "2026-10-01"
        assert uitkomst["changes"] == []


class TestNietFrozen:
    """Een intervaltaak die tijdens de vakantie nieuw is, uit het archief
    kwam, teruggedraaid werd of een andere datum kreeg, schuift niet dubbel:
    max(next_due, resume)."""

    def test_nieuw_tijdens_vakantie(self, db):
        start_vacation(db, START, None, _tijd(START))
        dag = date(2026, 10, 5)
        _taak(db, "nieuw", "interval", {"days": 14}, None, dag=dag, tijd=_tijd(dag))
        assert _due(db, "nieuw") == "2026-10-05"  # initial_next_due: vandaag
        end_vacation(db, TERUG, _tijd(TERUG))
        assert _due(db, "nieuw") == "2026-10-18"  # niet 10-20

    def test_teruggezet_uit_archief(self, db):
        _taak(db, "oud", "interval", {"days": 14}, date(2026, 9, 1), active=0)
        start_vacation(db, START, None, _tijd(START))
        dag = date(2026, 10, 6)
        restore_chore(db, "oud", dag, _tijd(dag))
        end_vacation(db, TERUG, _tijd(TERUG))
        assert _due(db, "oud") == "2026-10-18"

    def test_voltooiing_teruggedraaid(self, db):
        _taak(db, "vriezer", "interval", {"days": 7}, date(2026, 10, 2))
        voltooiing = complete_chore(db, "vriezer", "laura", date(2026, 10, 2),
                                    _tijd(date(2026, 10, 2)))
        assert _due(db, "vriezer") == "2026-10-09"
        start_vacation(db, START, None, _tijd(START))
        dag = date(2026, 10, 5)
        revert_completion(db, voltooiing["row_id"], dag)  # mag tijdens vakantie
        assert _due(db, "vriezer") == "2026-10-05"
        end_vacation(db, TERUG, _tijd(TERUG))
        assert _due(db, "vriezer") == "2026-10-18"

    @pytest.mark.parametrize("nieuwe_datum, verwacht", [
        (date(2026, 10, 7), "2026-10-18"),
        (date(2026, 11, 1), "2026-11-01"),
    ])
    def test_datum_gewijzigd(self, db, nieuwe_datum, verwacht):
        _taak(db, "vriezer", "interval", {"days": 14}, date(2026, 10, 10))
        start_vacation(db, START, None, _tijd(START))
        dag = date(2026, 10, 6)
        _taak(db, "vriezer", "interval", {"days": 14}, nieuwe_datum, dag=dag,
              tijd=_tijd(dag))
        end_vacation(db, TERUG, _tijd(TERUG))
        assert _due(db, "vriezer") == verwacht

    def test_bewerkt_zonder_datumwijziging_blijft_frozen(self, db):
        _taak(db, "vriezer", "interval", {"days": 14}, date(2026, 10, 10))
        start_vacation(db, START, None, _tijd(START))
        dag = date(2026, 10, 6)
        _taak(db, "vriezer", "interval", {"days": 14}, date(2026, 10, 10), dag=dag,
              tijd=_tijd(dag), duration_minutes=45)
        end_vacation(db, TERUG, _tijd(TERUG))
        assert _due(db, "vriezer") == "2026-10-25"


class TestAutomatischEinde:
    def test_niet_voor_de_dag_na_until(self, db):
        start_vacation(db, START, "2026-10-10", _tijd(START))
        assert end_due_vacation(db, date(2026, 10, 10), _tijd(date(2026, 10, 10))) is None
        assert get_active_vacation(db) is not None

    def test_zonder_until_of_zonder_vakantie(self, db):
        assert end_due_vacation(db, TERUG, _tijd(TERUG)) is None
        start_vacation(db, START, None, _tijd(START))
        assert end_due_vacation(db, TERUG, _tijd(TERUG)) is None
        assert get_active_vacation(db) is not None

    def test_ha_dagen_uit_daarna_rol(self, db):
        _taak(db, "afwas", "daily", ELKE_DAG, date(2026, 10, 3))
        _taak(db, "vriezer", "interval", {"days": 7}, date(2026, 10, 5))
        start_vacation(db, START, "2026-10-10", _tijd(START))
        # HA stond uit; pas op woensdag 14-10 draait het opstarten
        vandaag = date(2026, 10, 14)
        uitkomst = end_due_vacation(db, vandaag, _tijd(vandaag))
        assert uitkomst["ended_on"] == "2026-10-11"  # until + 1, niet vandaag
        assert uitkomst["days"] == 8
        assert _due(db, "afwas") == "2026-10-11"
        assert _due(db, "vriezer") == "2026-10-13"
        assert get_active_vacation(db) is None
        # de rol daarna zet de dagtaak op vandaag; de intervaltaak blijft
        # binnen zijn cyclus staan
        wijzigingen = roll_all_forward(db, vandaag, _tijd(vandaag, 1))
        assert ("afwas", "2026-10-11", "2026-10-14") in wijzigingen
        assert _due(db, "afwas") == "2026-10-14"
        assert _due(db, "vriezer") == "2026-10-13"


class TestDubbelEinde:
    def test_tweede_einde_geweigerd_zonder_extra_verschuiving(self, db):
        _taak(db, "vriezer", "interval", {"days": 14}, date(2026, 10, 10))
        start_vacation(db, START, None, _tijd(START))
        end_vacation(db, TERUG, _tijd(TERUG))
        with pytest.raises(StoreError, match="geen vakantie"):
            end_vacation(db, TERUG, _tijd(TERUG, 1))
        assert _due(db, "vriezer") == "2026-10-25"

    def test_bewaking_vangt_een_verouderde_vakantierij(self, db):
        # twee aanroepen die allebei de actieve rij lazen: de tweede strandt
        # op de bewaakte UPDATE en schuift niets op
        _taak(db, "vriezer", "interval", {"days": 14}, date(2026, 10, 10))
        start_vacation(db, START, None, _tijd(START))
        with get_connection(db) as conn:
            verouderd = vacations_module._active_row(conn)
        end_vacation(db, TERUG, _tijd(TERUG))
        with pytest.raises(StoreError, match="geen vakantie"):
            with get_connection(db) as conn:
                conn.execute("BEGIN IMMEDIATE")
                vacations_module._end(conn, verouderd, TERUG, _tijd(TERUG, 1))
        assert _due(db, "vriezer") == "2026-10-25"

    def test_nieuwe_vakantie_na_einde_mag(self, db):
        start_vacation(db, START, None, _tijd(START))
        end_vacation(db, TERUG, _tijd(TERUG))
        assert start_vacation(db, TERUG, None, _tijd(TERUG, 1))["start_date"] == "2026-10-18"
        assert len(_vacations(db)) == 2


class TestBlokkades:
    """Afvinken, overslaan, snoozen en overslaan terugdraaien weigeren met
    VacationActiveError; er verandert niets."""

    def test_foutklasse_en_tekst(self):
        fout = VacationActiveError()
        assert isinstance(fout, StoreError) and isinstance(fout, ValueError)
        assert str(fout) == ("Vakantiemodus staat aan; afvinken en overslaan kan"
                             " weer na de vakantie.")

    def test_rol_slaat_over(self, db):
        _taak(db, "afwas", "daily", ELKE_DAG, date(2026, 10, 1))
        start_vacation(db, START, None, _tijd(START))
        assert roll_all_forward(db, date(2026, 10, 5), _tijd(date(2026, 10, 5))) == []
        assert _due(db, "afwas") == "2026-10-01"

    def test_afvinken(self, db):
        _taak(db, "afwas", "daily", ELKE_DAG, START)
        start_vacation(db, START, None, _tijd(START))
        with pytest.raises(VacationActiveError):
            complete_chore(db, "afwas", "laura", START, _tijd(START, 1))
        with get_connection(db) as conn:
            assert conn.execute("SELECT COUNT(*) FROM completions").fetchone()[0] == 0
        assert _due(db, "afwas") == "2026-10-03"

    def test_deelstap_afvinken(self, db):
        _taak(db, "bad", "daily", ELKE_DAG, START, subtask_mode="checklist")
        set_subtasks(db, "bad", ["wastafel", "douche"])
        stap = list_subtasks(db, "bad")[0]["id"]
        start_vacation(db, START, None, _tijd(START))
        with pytest.raises(VacationActiveError):
            complete_chore(db, "bad", "laura", START, _tijd(START, 1), subtask_id=stap)

    def test_overslaan(self, db):
        _taak(db, "afwas", "daily", ELKE_DAG, START)
        start_vacation(db, START, None, _tijd(START))
        with pytest.raises(VacationActiveError):
            skip_chore(db, "afwas", "laura", START, _tijd(START, 1))
        assert skip_feed(db) == []
        assert _due(db, "afwas") == "2026-10-03"

    @pytest.mark.parametrize("modus", ["tomorrow", "skip"])
    def test_snoozen(self, db, modus):
        _taak(db, "afwas", "daily", ELKE_DAG, START)
        start_vacation(db, START, None, _tijd(START))
        with pytest.raises(VacationActiveError):
            snooze_chore(db, "afwas", modus, START, _tijd(START, 1))
        assert _due(db, "afwas") == "2026-10-03"
        assert get_chore(db, "afwas")["updated_at"] == NU

    def test_na_de_vakantie_kan_alles_weer(self, db):
        _taak(db, "afwas", "daily", ELKE_DAG, START)
        start_vacation(db, START, None, _tijd(START))
        end_vacation(db, TERUG, _tijd(TERUG))
        complete_chore(db, "afwas", "laura", TERUG, _tijd(TERUG, 1))
        snooze_chore(db, "afwas", "tomorrow", TERUG, _tijd(TERUG, 2))
        assert _due(db, "afwas") == "2026-10-19"


class TestOverslaanTerugdraaien:
    def test_tijdens_vakantie_geweigerd(self, db):
        _taak(db, "afwas", "daily", ELKE_DAG, START)
        skip = skip_chore(db, "afwas", "laura", START, _tijd(START, 1))
        assert skip_feed(db)[0]["can_revert"] is True
        start_vacation(db, START, None, _tijd(START, 2))
        assert skip_feed(db)[0]["can_revert"] is False
        with pytest.raises(VacationActiveError):
            revert_skip(db, skip["skip_id"], _tijd(START, 3))
        assert _due(db, "afwas") == skip["new_next_due"]

    def test_na_een_latere_vakantie_geweigerd(self, db):
        # een vakantie van één dag die deze dagelijkse taak niet verschuift
        # (next_due ligt al op de terugkomdag) en updated_at laat staan:
        # alleen de vakantie-voorwaarde blokkeert hier
        _taak(db, "afwas", "daily", ELKE_DAG, START)
        skip = skip_chore(db, "afwas", "laura", START, _tijd(START, 1))
        start_vacation(db, START, None, _tijd(START, 2))
        morgen = START + timedelta(days=1)
        assert end_vacation(db, morgen, _tijd(morgen, 3))["changes"] == []
        assert skip_feed(db)[0]["can_revert"] is False
        with pytest.raises(StoreError, match="vakantie") as info:
            revert_skip(db, skip["skip_id"], _tijd(morgen, 4))
        assert not isinstance(info.value, VacationActiveError)
        assert _due(db, "afwas") == skip["new_next_due"]

    def test_vakantie_van_nul_dagen_blokkeert_niet(self, db):
        # per ongeluk aan en meteen weer uit: er is niets stilgezet of
        # verschoven, dus "Toch niet overslaan" blijft gewoon mogelijk
        _taak(db, "afwas", "daily", ELKE_DAG, START)
        skip = skip_chore(db, "afwas", "laura", START, _tijd(START, 1))
        start_vacation(db, START, None, _tijd(START, 2))
        end_vacation(db, START, _tijd(START, 3))
        assert skip_feed(db)[0]["can_revert"] is True
        assert revert_skip(db, skip["skip_id"], _tijd(START, 4))["next_due"] == START.isoformat()

    def test_vakantie_op_hetzelfde_tijdstip_telt_als_erna(self, db):
        _taak(db, "afwas", "daily", ELKE_DAG, START)
        skip = skip_chore(db, "afwas", "laura", START, _tijd(START, 1))
        start_vacation(db, START, None, _tijd(START, 1))
        morgen = START + timedelta(days=1)
        end_vacation(db, morgen, _tijd(morgen, 2))
        with pytest.raises(StoreError, match="vakantie"):
            revert_skip(db, skip["skip_id"], _tijd(morgen, 3))

    def test_overslag_na_een_vakantie_kan_terug(self, db):
        _taak(db, "afwas", "daily", ELKE_DAG, TERUG)
        start_vacation(db, START, None, _tijd(START))
        end_vacation(db, TERUG, _tijd(TERUG))
        skip = skip_chore(db, "afwas", "laura", TERUG, _tijd(TERUG, 1))
        assert skip_feed(db)[0]["can_revert"] is True
        assert revert_skip(db, skip["skip_id"], _tijd(TERUG, 2))["next_due"] == "2026-10-18"

    def test_wintertijd_vakantie_vergeleken_als_tijdstip(self, db):
        # 25-10-2026 03:00 CEST -> 02:00 CET. Overslag om 02:50+02:00, vakantie
        # om 02:10+01:00 (= 03:10+02:00, dus later), terwijl de strings
        # andersom sorteren
        dag = date(2026, 10, 25)
        _taak(db, "afwas", "daily", ELKE_DAG, dag)
        skip = skip_chore(db, "afwas", "laura", dag, "2026-10-25T02:50:00+02:00")
        start_vacation(db, dag, None, "2026-10-25T02:10:00+01:00")
        maandag = dag + timedelta(days=1)
        end_vacation(db, maandag, "2026-10-26T09:00:00+01:00")
        with pytest.raises(StoreError, match="vakantie"):
            revert_skip(db, skip["skip_id"], "2026-10-26T09:10:00+01:00")


def test_skip_feed_can_revert_volgt_revert_skip(db):
    """can_revert en revert_skip delen _revert_blocker: tijdens en na de
    vakantie zeggen ze hetzelfde."""
    _taak(db, "afwas", "daily", ELKE_DAG, START)
    _taak(db, "bad", "daily", ELKE_DAG, START)
    eerste = skip_chore(db, "afwas", None, START, _tijd(START, 1))
    start_vacation(db, START, None, _tijd(START, 2))
    end_vacation(db, START + timedelta(days=1), _tijd(START + timedelta(days=1)))
    dag = START + timedelta(days=1)
    tweede = skip_chore(db, "bad", None, dag, _tijd(dag, 1))
    kan = {r["id"]: r["can_revert"] for r in skip_feed(db)}
    assert kan == {eerste["skip_id"]: False, tweede["skip_id"]: True}
