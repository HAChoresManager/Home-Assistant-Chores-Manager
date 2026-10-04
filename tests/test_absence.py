"""Afwezigheid per persoon (v2.7), deel 1: de opslag (db/absences.py) —
aanzetten, einddatum wijzigen, beëindigen, het automatische einde en wat
archiveren en verwijderen van een persoon ermee doen; plus het schema. De
leesweergaven, meldingen, streaks en de samenloop met de vakantiemodus
staan in test_absence_views.py, de pure toewijzing in
test_absence_assignee.py.

Vaste datums: 2026-10-07 is een woensdag (VANDAAG).
"""
from datetime import date, timedelta
import sqlite3

import pytest

from chores_manager.db.absences import (
    AlreadyAbsentError,
    NotAbsentError,
    end_absence,
    end_due_absences,
    get_absent_ids,
    get_active_absence,
    list_absences,
    start_absence,
    update_absence,
)
from chores_manager.db.assignees import delete_assignee, save_assignee
from chores_manager.db.chores import save_chore
from chores_manager.db.completions import complete_chore
from chores_manager.db.connection import get_connection
from chores_manager.db.errors import StoreError
from chores_manager.db.schema import create_database

VANDAAG = date(2026, 10, 7)  # woensdag
MORGEN = VANDAAG + timedelta(days=1)
GISTEREN = VANDAAG - timedelta(days=1)


def _tijd(dag: date, minuut: int = 0) -> str:
    return f"{dag.isoformat()}T10:{minuut:02d}:00+02:00"


@pytest.fixture
def db(tmp_path):
    pad = str(tmp_path / "chores_v2.db")
    create_database(pad)
    save_assignee(pad, {"id": "laura", "name": "Laura", "color": "#83c44a"})
    save_assignee(pad, {"id": "martijn", "name": "Martijn", "color": "#4dd8ff",
                        "sort_order": 1})
    return pad


def _rijen(db):
    with get_connection(db) as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM absences ORDER BY id")]


def _start(db, who="laura", until=None, dag=VANDAAG):
    return start_absence(db, who, dag, until, _tijd(dag))


class TestAanzetten:
    def test_zonder_einddatum(self, db):
        assert _start(db) == {
            "assignee_id": "laura", "start_date": "2026-10-07", "until": None}
        (rij,) = _rijen(db)
        assert rij["ended_on"] is None
        assert rij["created_at"] == _tijd(VANDAAG)
        assert get_absent_ids(db) == {"laura"}

    def test_met_einddatum_als_string_of_date(self, db):
        assert _start(db, until="2026-10-12")["until"] == "2026-10-12"
        assert _start(db, "martijn", until=date(2026, 10, 7))["until"] == "2026-10-07"

    def test_lege_tekst_is_geen_einddatum(self, db):
        assert _start(db, until="  ")["until"] is None

    def test_einddatum_in_het_verleden_weigert(self, db):
        with pytest.raises(StoreError, match="vandaag of later"):
            _start(db, until=GISTEREN)
        assert _rijen(db) == []

    def test_onleesbare_datum_weigert(self, db):
        with pytest.raises(StoreError, match="JJJJ-MM-DD"):
            _start(db, until="volgende week")

    def test_al_afwezig_weigert(self, db):
        _start(db)
        with pytest.raises(AlreadyAbsentError, match="Laura is al afwezig"):
            _start(db, until=MORGEN)
        assert len(_rijen(db)) == 1

    def test_per_persoon_los(self, db):
        _start(db)
        _start(db, "martijn")
        assert get_absent_ids(db) == {"laura", "martijn"}
        assert [a["assignee_id"] for a in list_absences(db)] == ["laura", "martijn"]

    def test_onbekende_of_gearchiveerde_persoon_weigert(self, db):
        with pytest.raises(StoreError, match="onbekende of inactieve persoon"):
            _start(db, "niemand")
        save_assignee(db, {"id": "gast", "name": "Gast", "color": "#000000",
                           "active": 0}, VANDAAG)
        with pytest.raises(StoreError, match="onbekende of inactieve persoon"):
            _start(db, "gast")

    def test_opnieuw_na_een_einde(self, db):
        _start(db, dag=GISTEREN)
        end_absence(db, "laura", VANDAAG)
        assert _start(db)["start_date"] == "2026-10-07"
        assert len(_rijen(db)) == 2


class TestEinddatumWijzigen:
    def test_zetten_en_wissen(self, db):
        _start(db)
        assert update_absence(db, "laura", "2026-10-12", VANDAAG)["until"] == "2026-10-12"
        assert update_absence(db, "laura", None, VANDAAG)["until"] is None
        assert update_absence(db, "laura", "", VANDAAG)["until"] is None

    def test_niet_voor_vandaag_of_de_startdag(self, db):
        _start(db, dag=GISTEREN)
        with pytest.raises(StoreError, match="vandaag of later"):
            update_absence(db, "laura", GISTEREN, VANDAAG)
        assert get_active_absence(db, "laura")["until"] is None

    def test_zonder_lopende_afwezigheid(self, db):
        with pytest.raises(NotAbsentError, match="Laura is niet afwezig"):
            update_absence(db, "laura", MORGEN, VANDAAG)


class TestBeeindigen:
    def test_vandaag_is_de_dag_van_terugkomst(self, db):
        _start(db, until="2026-10-12", dag=date(2026, 10, 2))
        assert end_absence(db, "laura", VANDAAG) == {
            "assignee_id": "laura", "start_date": "2026-10-02",
            "until": "2026-10-12", "ended_on": "2026-10-07", "days": 5}
        assert get_absent_ids(db) == set()
        assert get_active_absence(db, "laura") is None
        # de historie blijft: de streak heeft hem nodig
        assert _rijen(db)[0]["ended_on"] == "2026-10-07"

    def test_aan_en_uit_op_dezelfde_dag(self, db):
        _start(db)
        assert end_absence(db, "laura", VANDAAG)["days"] == 0

    def test_tweede_einde_weigert(self, db):
        _start(db)
        end_absence(db, "laura", VANDAAG)
        with pytest.raises(NotAbsentError, match="niet afwezig"):
            end_absence(db, "laura", VANDAAG)

    def test_onbekende_persoon(self, db):
        with pytest.raises(StoreError, match="onbekende of inactieve persoon"):
            end_absence(db, "niemand", VANDAAG)


class TestAutomatischEinde:
    def test_until_voor_vandaag_eindigt_de_dag_erna(self, db):
        _start(db, until="2026-10-05", dag=date(2026, 10, 1))
        _start(db, "martijn", until="2026-10-07", dag=date(2026, 10, 1))
        ended = end_due_absences(db, VANDAAG)
        assert ended == [{
            "assignee_id": "laura", "start_date": "2026-10-01",
            "until": "2026-10-05", "ended_on": "2026-10-06", "days": 5}]
        # until vandaag: vandaag is nog een afwezige dag
        assert get_absent_ids(db) == {"martijn"}

    def test_ook_als_ha_dagen_uit_stond(self, db):
        _start(db, until="2026-10-03", dag=date(2026, 10, 1))
        (ended,) = end_due_absences(db, VANDAAG)
        assert ended["ended_on"] == "2026-10-04"

    def test_open_einde_en_niets_te_doen(self, db):
        assert end_due_absences(db, VANDAAG) == []
        _start(db)
        assert end_due_absences(db, VANDAAG + timedelta(days=30)) == []
        assert get_absent_ids(db) == {"laura"}

    def test_tweede_keer_doet_niets(self, db):
        _start(db, until="2026-10-05", dag=date(2026, 10, 1))
        assert len(end_due_absences(db, VANDAAG)) == 1
        assert end_due_absences(db, VANDAAG) == []


class TestArchiverenEnVerwijderen:
    def _historie(self, db, who="laura"):
        save_chore(db, {"id": "was", "name": "Was", "schedule_type": "daily",
                        "schedule_config": {"weekdays": [1, 2, 3, 4, 5, 6, 7]}},
                   VANDAAG, _tijd(VANDAAG))
        complete_chore(db, "was", who, VANDAAG, _tijd(VANDAAG, 1))

    def test_archiveren_beeindigt_de_afwezigheid(self, db):
        self._historie(db)
        _start(db, dag=GISTEREN)
        assert delete_assignee(db, "laura", VANDAAG) == "deactivated"
        assert get_absent_ids(db) == set()
        assert _rijen(db)[0]["ended_on"] == "2026-10-07"

    def test_archiveren_via_opslaan_beeindigt_ook(self, db):
        _start(db, dag=GISTEREN)
        save_assignee(db, {"id": "laura", "name": "Laura", "color": "#83c44a",
                           "active": 0}, VANDAAG)
        assert get_absent_ids(db) == set()

    def test_gewoon_opslaan_laat_de_afwezigheid_staan(self, db):
        _start(db)
        save_assignee(db, {"id": "laura", "name": "Laura B.", "color": "#83c44a"})
        assert get_absent_ids(db) == {"laura"}

    def test_archiveren_zonder_datum_weigert_in_zijn_geheel(self, db):
        self._historie(db)
        _start(db)
        with pytest.raises(StoreError, match="datum"):
            delete_assignee(db, "laura")
        with get_connection(db) as conn:
            assert conn.execute(
                "SELECT active FROM assignees WHERE id = 'laura'").fetchone()[0] == 1
        assert get_absent_ids(db) == {"laura"}

    def test_archiveren_zonder_afwezigheid_heeft_geen_datum_nodig(self, db):
        self._historie(db)
        assert delete_assignee(db, "laura") == "deactivated"

    def test_echt_verwijderen_neemt_de_afwezigheden_mee(self, db):
        # zonder historie gaat een persoon echt weg; een afwezigheid telt niet
        # als historie
        _start(db, dag=GISTEREN)
        end_absence(db, "laura", VANDAAG)
        _start(db)
        assert delete_assignee(db, "laura", VANDAAG) == "deleted"
        assert _rijen(db) == []


class TestSchema:
    def test_hooguit_een_lopende_per_persoon(self, db):
        with get_connection(db) as conn:
            conn.execute("INSERT INTO absences (assignee_id, start_date, created_at)"
                         " VALUES ('laura', '2026-10-01', '2026-10-01T09:00:00+02:00')")
            conn.execute("INSERT INTO absences (assignee_id, start_date, created_at)"
                         " VALUES ('martijn', '2026-10-01', '2026-10-01T09:00:00+02:00')")
            with pytest.raises(sqlite3.IntegrityError):
                conn.execute("INSERT INTO absences (assignee_id, start_date, created_at)"
                             " VALUES ('laura', '2026-10-02', '2026-10-02T09:00:00+02:00')")
            # beëindigde mogen ernaast
            conn.execute("INSERT INTO absences (assignee_id, start_date, ended_on,"
                         " created_at) VALUES ('laura', '2026-09-01', '2026-09-05',"
                         " '2026-09-01T09:00:00+02:00')")

    def test_vereist_bestaande_persoon(self, db):
        with get_connection(db) as conn, pytest.raises(sqlite3.IntegrityError):
            conn.execute("INSERT INTO absences (assignee_id, start_date, created_at)"
                         " VALUES ('niemand', '2026-10-01', '2026-10-01T09:00:00+02:00')")

    def test_bestaande_database_krijgt_de_tabel(self, tmp_path):
        pad = str(tmp_path / "chores.db")
        create_database(pad)
        save_assignee(pad, {"id": "laura", "name": "Laura", "color": "#83c44a"})
        # terug naar de toestand van v2.6: zonder absences
        with get_connection(pad) as conn:
            conn.execute("DROP TABLE absences")
        create_database(pad)  # wat bij elke start van de integratie draait
        with get_connection(pad) as conn:
            kolommen = [r["name"] for r in conn.execute("PRAGMA table_info(absences)")]
            assert kolommen == ["id", "assignee_id", "start_date", "until",
                                "ended_on", "created_at"]
            assert conn.execute("SELECT COUNT(*) FROM assignees").fetchone()[0] == 1
        assert _start(pad)["assignee_id"] == "laura"
