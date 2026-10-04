"""Randgevallen van de vakantiemodus (v2.6) die uit de review kwamen: een
vakantie die precies tijdens de nachtelijke rol aangaat, een taak die
tijdens de vakantie op precies zijn oude momentopname wordt teruggezet, en
een undo van een voltooiing die nog liep toen de vakantie aanging.

De gelijktijdigheidstest draait het aanzetten echt in een andere thread,
zoals HA's executor dat doet. Zonder één schrijftransactie in
roll_all_forward komt de vakantie midden in de rol en gaat de achterstand
die de vakantie hoort te overleven verloren.
"""
from datetime import date, timedelta
import threading
import time

import pytest

from chores_manager.db.assignees import save_assignee
from chores_manager.db.chores import (
    delete_chore,
    get_chore,
    restore_chore,
    roll_all_forward,
    save_chore,
)
from chores_manager.db.completions import complete_chore, undo_completion
from chores_manager.db.schema import create_database
from chores_manager.db.vacations import (
    VacationActiveError,
    end_vacation,
    start_vacation,
)
from chores_manager.scheduling import calculator

START = date(2026, 10, 3)   # zaterdag
TERUG = date(2026, 10, 18)  # vijftien dagen later
NU = "2026-09-01T09:00:00+02:00"


def _tijd(dag: date, minuut: int = 0) -> str:
    return f"{dag.isoformat()}T10:{minuut:02d}:00+02:00"


@pytest.fixture
def db(tmp_path):
    pad = str(tmp_path / "chores_v2.db")
    create_database(pad)
    save_assignee(pad, {"id": "laura", "name": "Laura", "color": "#83c44a"})
    return pad


def _interval(db, chore_id, days, next_due):
    save_chore(db, {"id": chore_id, "name": chore_id.capitalize(),
                    "schedule_type": "interval", "schedule_config": {"days": days},
                    "next_due": next_due.isoformat()}, date(2026, 9, 1), NU)


class TestVakantieTijdensDeRol:
    def test_vakantie_wacht_tot_de_rol_klaar_is(self, db, monkeypatch):
        # Intervaltaak van 7 dagen, 10 dagen achter: de rol van 03:00 zet
        # hem op 09-30 (3 dagen achter). Precies tijdens de rol gaat de
        # vakantie aan. Die moet de gerolde datum als momentopname nemen,
        # zodat de 3 dagen achterstand de vakantie overleven.
        _interval(db, "vriezer", 7, date(2026, 9, 23))
        echte = calculator.roll_forward
        uitkomst = {}
        gestart = threading.Event()
        threads = []

        def aanzetten():
            gestart.set()
            uitkomst["vakantie"] = start_vacation(db, START, None, _tijd(START, 1))

        def met_vakantie(*args):
            if not threads:
                thread = threading.Thread(target=aanzetten)
                threads.append(thread)
                thread.start()
                gestart.wait()
                time.sleep(0.2)  # het aanzetten staat nu bij zijn BEGIN IMMEDIATE
            return echte(*args)

        monkeypatch.setattr(calculator, "roll_forward", met_vakantie)
        changes = roll_all_forward(db, START, _tijd(START))
        threads[0].join()

        assert changes == [("vriezer", "2026-09-23", "2026-09-30")]
        assert uitkomst["vakantie"]["start_date"] == START.isoformat()
        end_vacation(db, TERUG, _tijd(TERUG))
        # stilgezet op 09-30, vijftien dagen erbij: nog steeds 3 dagen achter
        assert get_chore(db, "vriezer")["next_due"] == "2026-10-15"

    def test_rol_tijdens_vakantie_doet_niets(self, db):
        _interval(db, "vriezer", 7, date(2026, 9, 23))
        start_vacation(db, START, None, _tijd(START))
        assert roll_all_forward(db, START + timedelta(days=1), _tijd(START, 5)) == []
        assert get_chore(db, "vriezer")["next_due"] == "2026-09-23"


class TestTerugzettenOpDeMomentopname:
    def test_terugzetten_op_dezelfde_datum_schuift_niet_dubbel(self, db):
        # Interval van 30 dagen, gepland op 10-10; de vakantie begint 10-03
        # (momentopname 10-10). Tijdens de vakantie gearchiveerd en op 10-10
        # teruggezet: de verse datum is toevallig weer 10-10. Dat is een
        # nieuwe start, geen stilgezette datum: bij terugkomst op 10-18 is
        # hij aan de beurt, niet pas op 10-25.
        _interval(db, "ramen", 30, date(2026, 10, 10))
        complete_chore(db, "ramen", "laura", date(2026, 9, 10), _tijd(date(2026, 9, 10)))
        save_chore(db, {"id": "ramen", "name": "Ramen", "schedule_type": "interval",
                        "schedule_config": {"days": 30}, "next_due": "2026-10-10"},
                   date(2026, 9, 10), _tijd(date(2026, 9, 10), 1))
        start_vacation(db, START, None, _tijd(START))
        assert delete_chore(db, "ramen") == "deactivated"
        dag = date(2026, 10, 10)
        restore_chore(db, "ramen", dag, _tijd(dag))
        assert get_chore(db, "ramen")["next_due"] == "2026-10-10"

        end_vacation(db, TERUG, _tijd(TERUG))
        assert get_chore(db, "ramen")["next_due"] == TERUG.isoformat()


class TestUndoTijdensVakantie:
    def test_undo_van_voltooiing_geweigerd(self, db):
        # De HA-laag leegt de undo-buffer bij het aanzetten, maar een undo
        # die op dat moment al liep, mag de datum niet alsnog terugzetten.
        _interval(db, "vriezer", 10, START - timedelta(days=3))
        undo = complete_chore(db, "vriezer", "laura", START, _tijd(START))
        start_vacation(db, START, None, _tijd(START, 1))
        with pytest.raises(VacationActiveError):
            undo_completion(db, undo)
        assert get_chore(db, "vriezer")["next_due"] == undo["new_next_due"]
