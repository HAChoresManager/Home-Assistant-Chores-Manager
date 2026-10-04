"""Overslaan terugdraaien (revert_skip, can_revert in skip_feed) en de
leesweergaven van v2.5: recent_skips op de sensor, skips en activity_since
in build_state.

revert_skip en can_revert delen één bewaking (_revert_blocker); daarom wordt
bij elke weigering ook gecontroleerd dat de feed geen knop belooft die
daarna faalt.

Vaste datums: 2026-07-28 is een dinsdag. Elke voor/na-stap krijgt een eigen
tijdstip, behalve waar juist de tie-regel getest wordt.
"""
from datetime import date, timedelta
import sqlite3

import pytest

from chores_manager.db.assignees import save_assignee
from chores_manager.db.chores import delete_chore, get_chore, save_chore, snooze_chore
from chores_manager.db.completions import complete_chore
from chores_manager.db.errors import StoreError
from chores_manager.db.overview import activity_since, build_state, overview
from chores_manager.db.schema import create_database
from chores_manager.db.skips import revert_skip, skip_chore, skip_feed
from chores_manager.db.subtasks import list_subtasks, set_subtasks

VANDAAG = date(2026, 7, 28)
MORGEN = VANDAAG + timedelta(days=1)
NU = "2026-07-28T09:00:00+02:00"  # aanmaken van taken, vóór elke stap
ELKE_DAG = {"weekdays": [1, 2, 3, 4, 5, 6, 7]}


def _tijd(minuut: int, dag: date = VANDAAG) -> str:
    return f"{dag.isoformat()}T10:{minuut:02d}:00+02:00"


@pytest.fixture
def db(tmp_path):
    pad = str(tmp_path / "chores_v2.db")
    create_database(pad)
    save_assignee(pad, {"id": "laura", "name": "Laura", "color": "#83c44a"})
    save_assignee(pad, {"id": "martijn", "name": "Martijn", "color": "#4dd8ff"})
    return pad


def _taak(db, chore_id="was", **extra):
    data = {
        "id": chore_id, "name": chore_id.capitalize(), "schedule_type": "daily",
        "schedule_config": ELKE_DAG, "duration_minutes": 20,
    }
    data.update(extra)
    return save_chore(db, data, VANDAAG, NU)


def _can_revert(db, skip_id):
    return next(r["can_revert"] for r in skip_feed(db) if r["id"] == skip_id)


def _geweigerd(db, skip_id, tekst):
    """revert_skip weigert met deze tekst, en de feed biedt hem ook niet aan."""
    voor = get_chore(db, "was")["next_due"]
    assert _can_revert(db, skip_id) is False
    with pytest.raises(StoreError, match=tekst):
        revert_skip(db, skip_id, _tijd(59))
    assert get_chore(db, "was")["next_due"] == voor
    assert any(r["id"] == skip_id for r in skip_feed(db))


class TestRevertSkip:
    def test_zet_datum_terug_en_haalt_de_regel_weg(self, db):
        _taak(db, assignment_type="rotating", rotation=["martijn", "laura"])
        skip = skip_chore(db, "was", "laura", VANDAAG, _tijd(1))
        assert _can_revert(db, skip["skip_id"]) is True

        assert revert_skip(db, skip["skip_id"], _tijd(2)) == {
            "chore_id": "was", "next_due": VANDAAG.isoformat()}

        chore = get_chore(db, "was")
        assert chore["next_due"] == VANDAAG.isoformat()
        assert chore["updated_at"] == _tijd(2)
        assert chore["rotation_index"] == 0
        assert skip_feed(db) == []

    def test_zonder_tijdstip_blijft_updated_at_staan(self, db):
        _taak(db)
        skip = skip_chore(db, "was", "laura", VANDAAG, _tijd(1))
        revert_skip(db, skip["skip_id"])
        assert get_chore(db, "was")["updated_at"] == _tijd(1)

    def test_onbekend_id_en_twee_keer(self, db):
        with pytest.raises(StoreError, match=r"bestaat niet \(meer\)"):
            revert_skip(db, 999, _tijd(1))
        _taak(db)
        skip = skip_chore(db, "was", "laura", VANDAAG, _tijd(1))
        revert_skip(db, skip["skip_id"], _tijd(2))
        with pytest.raises(StoreError, match=r"bestaat niet \(meer\)"):
            revert_skip(db, skip["skip_id"], _tijd(3))

    def test_geweigerd_na_volledige_voltooiing(self, db):
        _taak(db)
        skip = skip_chore(db, "was", "laura", VANDAAG, _tijd(1))
        complete_chore(db, "was", "martijn", MORGEN, _tijd(2, MORGEN))
        _geweigerd(db, skip["skip_id"], "al aan de taak gewerkt")

    def test_geweigerd_na_een_deelstap(self, db):
        # next_due staat nog op new_next_due — alleen de voltooiingsbewaking
        # vangt dit; samenvoegen zou de minuteninvariant breken
        _taak(db, subtask_mode="checklist")
        set_subtasks(db, "was", ["licht", "donker", "bont"])
        eerste = list_subtasks(db, "was")[0]["id"]
        skip = skip_chore(db, "was", "laura", VANDAAG, _tijd(1))
        complete_chore(db, "was", "laura", MORGEN, _tijd(2, MORGEN), subtask_id=eerste)
        assert get_chore(db, "was")["next_due"] == skip["new_next_due"]
        _geweigerd(db, skip["skip_id"], "al aan de taak gewerkt")

    def test_geweigerd_na_een_counter_tik(self, db):
        # de reproductie uit de review: 2 tikken, overslaan, 1 tik, terugdraaien
        _taak(db, subtask_mode="counter", subtask_target=3, duration_minutes=9)
        complete_chore(db, "was", "laura", VANDAAG, _tijd(1))
        complete_chore(db, "was", "laura", VANDAAG, _tijd(2))
        skip = skip_chore(db, "was", "laura", VANDAAG, _tijd(3))
        complete_chore(db, "was", "laura", MORGEN, _tijd(4, MORGEN))
        _geweigerd(db, skip["skip_id"], "al aan de taak gewerkt")

    def test_voltooiing_op_hetzelfde_tijdstip_telt_als_erna(self, db):
        _taak(db, subtask_mode="counter", subtask_target=3, duration_minutes=9)
        skip = skip_chore(db, "was", "laura", VANDAAG, _tijd(1))
        complete_chore(db, "was", "laura", MORGEN, _tijd(1))
        _geweigerd(db, skip["skip_id"], "al aan de taak gewerkt")

    def test_voltooiing_van_voor_de_overslag_blokkeert_niet(self, db):
        _taak(db, subtask_mode="counter", subtask_target=3, duration_minutes=9)
        complete_chore(db, "was", "laura", VANDAAG, _tijd(1))
        skip = skip_chore(db, "was", "laura", VANDAAG, _tijd(2))
        assert _can_revert(db, skip["skip_id"]) is True
        revert_skip(db, skip["skip_id"], _tijd(3))

    def test_alleen_de_laatste_van_twee_skips_eerst(self, db):
        _taak(db)
        eerste = skip_chore(db, "was", "laura", VANDAAG, _tijd(1))        # -> 29-07
        tweede = skip_chore(db, "was", "laura", MORGEN, _tijd(2, MORGEN))  # -> 30-07
        _geweigerd(db, eerste["skip_id"], "opnieuw overgeslagen")
        assert revert_skip(db, tweede["skip_id"], _tijd(3, MORGEN))["next_due"] == "2026-07-29"
        # nu is de eerste weer de nieuwste en klopt de datum: die mag terug
        assert _can_revert(db, eerste["skip_id"]) is True
        assert revert_skip(db, eerste["skip_id"], _tijd(4, MORGEN))["next_due"] == "2026-07-28"

    def test_latere_skip_op_hetzelfde_tijdstip_telt_via_het_id(self, db):
        _taak(db)
        eerste = skip_chore(db, "was", "laura", VANDAAG, _tijd(1))
        tweede = skip_chore(db, "was", "laura", VANDAAG, _tijd(1), allow_upcoming=True)
        assert tweede["skip_id"] > eerste["skip_id"]
        _geweigerd(db, eerste["skip_id"], "opnieuw overgeslagen")
        assert _can_revert(db, tweede["skip_id"]) is True

    def test_geweigerd_na_andere_datumwijziging(self, db):
        _taak(db, schedule_type="weekly", schedule_config={"weekday": 2})
        skip = skip_chore(db, "was", "laura", VANDAAG, _tijd(1))  # -> 04-08
        snooze_chore(db, "was", "tomorrow", VANDAAG, _tijd(2))     # -> 29-07
        _geweigerd(db, skip["skip_id"], "datum van de taak is sinds het overslaan gewijzigd")

    def test_geweigerd_op_gearchiveerde_taak(self, db):
        _taak(db)
        complete_chore(db, "was", "laura", VANDAAG - timedelta(days=1),
                       _tijd(1, VANDAAG - timedelta(days=1)))
        skip = skip_chore(db, "was", "laura", VANDAAG, _tijd(2))
        assert delete_chore(db, "was") == "deactivated"
        _geweigerd(db, skip["skip_id"], "gearchiveerd")


class TestCanRevert:
    def test_alleen_de_nieuwste_per_taak(self, db):
        _taak(db)
        _taak(db, "plant")
        oud = skip_chore(db, "was", "laura", VANDAAG, _tijd(1))
        plant = skip_chore(db, "plant", "martijn", VANDAAG, _tijd(2))
        nieuw = skip_chore(db, "was", "laura", MORGEN, _tijd(3, MORGEN))
        assert [(r["id"], r["can_revert"]) for r in skip_feed(db)] == [
            (nieuw["skip_id"], True), (plant["skip_id"], True), (oud["skip_id"], False)]


class TestSkipFeed:
    def test_velden_en_volgorde(self, db):
        _taak(db, icon="🧺")
        _taak(db, "plant")
        skip_chore(db, "was", "laura", VANDAAG, _tijd(1))
        skip_chore(db, "plant", None, VANDAAG, _tijd(2))
        nieuwste, oudste = skip_feed(db)
        assert set(oudste) == {
            "id", "chore_id", "chore_name", "icon", "assignee_id", "assignee_name",
            "color", "skipped_at", "previous_next_due", "new_next_due", "can_revert"}
        assert nieuwste["chore_id"] == "plant"
        assert nieuwste["assignee_name"] is None
        assert oudste == {
            "id": oudste["id"], "chore_id": "was", "chore_name": "Was", "icon": "🧺",
            "assignee_id": "laura", "assignee_name": "Laura", "color": "#83c44a",
            "skipped_at": _tijd(1), "previous_next_due": "2026-07-28",
            "new_next_due": "2026-07-29", "can_revert": True}

    def test_gelijk_tijdstip_hoogste_id_eerst(self, db):
        _taak(db)
        _taak(db, "plant")
        a = skip_chore(db, "was", "laura", VANDAAG, _tijd(1))
        b = skip_chore(db, "plant", "laura", VANDAAG, _tijd(1))
        assert [r["id"] for r in skip_feed(db)] == [b["skip_id"], a["skip_id"]]

    def test_limiet(self, db):
        _taak(db)
        for minuut in range(5):
            skip_chore(db, "was", "laura", VANDAAG, _tijd(minuut), allow_upcoming=True)
        assert len(skip_feed(db, 3)) == 3


class TestRecentSkips:
    def test_exacte_velden(self, db):
        _taak(db, icon="🧺")
        skip = skip_chore(db, "was", "laura", VANDAAG, _tijd(1))
        (item,) = overview(db, VANDAAG)["recent_skips"]
        assert item == {
            "skip_id": skip["skip_id"], "chore_id": "was", "name": "Was",
            "icon": "🧺", "skipped_by": "Laura", "skipped_at": _tijd(1)}

    def test_zonder_persoon(self, db):
        _taak(db)
        skip_chore(db, "was", None, VANDAAG, _tijd(1))
        assert overview(db, VANDAAG)["recent_skips"][0]["skipped_by"] is None

    def test_maximaal_acht_nieuwste_eerst(self, db):
        _taak(db)
        ids = [skip_chore(db, "was", "laura", VANDAAG, _tijd(minuut),
                          allow_upcoming=True)["skip_id"] for minuut in range(10)]
        lijst = overview(db, VANDAAG)["recent_skips"]
        assert [i["skip_id"] for i in lijst] == ids[::-1][:8]

    def test_recent_completions_en_feed_zonder_skips(self, db):
        _taak(db)
        _taak(db, "plant")
        voltooiing = complete_chore(db, "was", "laura", VANDAAG, _tijd(1))
        skip_chore(db, "plant", "laura", VANDAAG, _tijd(2))
        assert [i["id"] for i in overview(db, VANDAAG)["recent_completions"]] == [
            voltooiing["row_id"]]
        state = build_state(db, VANDAAG)
        assert [r["id"] for r in state["feed"]] == [voltooiing["row_id"]]
        assert [r["chore_id"] for r in state["skips"]] == ["plant"]


def _voltooiingen(*tijden):
    return [{"completed_at": t} for t in tijden]


def _overslagen(*tijden):
    return [{"skipped_at": t} for t in tijden]


class TestActivitySince:
    """Regel: de oudste regel van elke lijst die zijn limiet haalde; daarvan
    de jongste; None als geen van beide vol is."""

    def test_geen_lijst_vol(self):
        assert activity_since(_voltooiingen(_tijd(2), _tijd(1)), 3,
                              _overslagen(_tijd(3)), 2) is None

    def test_alleen_voltooiingen_vol(self):
        assert activity_since(_voltooiingen(_tijd(5), _tijd(1)), 2,
                              _overslagen(_tijd(3)), 2) == _tijd(1)

    def test_alleen_overslagen_vol(self):
        assert activity_since(_voltooiingen(_tijd(5)), 2,
                              _overslagen(_tijd(4), _tijd(3)), 2) == _tijd(3)

    def test_beide_vol_de_jongste_grens(self):
        assert activity_since(_voltooiingen(_tijd(9), _tijd(6)), 2,
                              _overslagen(_tijd(8), _tijd(2)), 2) == _tijd(6)

    def test_vergelijkt_als_tijdstip_niet_als_string(self):
        # zomertijdwissel 25-10-2026: 02:30+02:00 (00:30 UTC) ligt vóór
        # 02:10+01:00 (01:10 UTC), al sorteert de string andersom
        zomer, winter = "2026-10-25T02:30:00+02:00", "2026-10-25T02:10:00+01:00"
        assert activity_since(_voltooiingen(zomer), 1, _overslagen(winter), 1) == winter

    def test_tijdstip_zonder_offset_breekt_niets(self):
        # oude regels kunnen zonder offset zijn opgeslagen; dan als string
        oud, nieuw = "2026-07-28T10:05:00", "2026-07-28T10:01:00+02:00"
        assert activity_since(_voltooiingen(oud), 1, _overslagen(nieuw), 1) == oud

    def test_in_build_state(self, db):
        _taak(db)
        _taak(db, "plant")
        complete_chore(db, "was", "laura", VANDAAG, _tijd(1))
        complete_chore(db, "was", "laura", MORGEN, _tijd(2, MORGEN))
        complete_chore(db, "plant", "laura", VANDAAG, _tijd(3))
        assert build_state(db, VANDAAG)["activity_since"] is None
        # feed vol bij limiet 2: de oudste getoonde voltooiing is de grens
        assert build_state(db, VANDAAG, feed_limit=2)["activity_since"] == _tijd(3)

    def test_in_build_state_met_honderd_overslagen(self, db):
        _taak(db)
        conn = sqlite3.connect(db)
        conn.executemany(
            "INSERT INTO skips (chore_id, assignee_id, skipped_at, previous_next_due,"
            " new_next_due) VALUES ('was', NULL, ?, '2026-07-01', '2026-07-02')",
            [(f"2026-07-{dag:02d}T{uur:02d}:00:00+02:00",)
             for dag in range(1, 21) for uur in range(10, 15)])  # 100 regels
        conn.commit()
        conn.close()
        state = build_state(db, VANDAAG)
        assert len(state["skips"]) == 100
        assert state["activity_since"] == "2026-07-01T10:00:00+02:00"
        # één overslag meer: de oudste valt buiten de lijst, de grens schuift
        skip_chore(db, "was", None, VANDAAG, _tijd(1))
        assert build_state(db, VANDAAG)["activity_since"] == "2026-07-01T11:00:00+02:00"
