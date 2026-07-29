"""Fase 5: tasks_today voor Lovelace, gearchiveerde taken terugzetten,
deeltaken bewerken mét historie, en de completions-migratie naar
ON DELETE SET NULL — expliciet getest op een database mét voltooiingen,
want daar draait hij straks op echte data.
"""
from datetime import date, timedelta
import sqlite3

import pytest

from chores_manager.db.assignees import save_assignee
from chores_manager.db.chores import delete_chore, get_chore, restore_chore, save_chore
from chores_manager.db.completions import complete_chore, leaderboard
from chores_manager.db.overview import build_state, overview
from chores_manager.db.schema import create_database
from chores_manager.db.subtasks import list_subtasks, set_subtasks

VANDAAG = date(2026, 7, 29)
NU = "2026-07-29T10:00:00+02:00"


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
        "schedule_config": {"weekdays": [1, 2, 3, 4, 5, 6, 7]},
        "duration_minutes": 20, "assignment_type": "fixed", "assigned_to": "laura",
    }
    data.update(extra)
    return save_chore(db, data, VANDAAG, NU)


def _completions(db):
    """(aantal, som minuten) — de invariant van de migratie."""
    conn = sqlite3.connect(db)
    aantal, minuten = conn.execute(
        "SELECT COUNT(*), COALESCE(SUM(minutes), 0) FROM completions").fetchone()
    conn.close()
    return aantal, minuten


class TestTasksToday:
    def test_velden_zijn_puur_weergave(self, db):
        _taak(db)
        (item,) = overview(db, VANDAAG)["tasks_today"]
        assert set(item) == {
            "name", "icon", "status", "assignee_name", "assignee_color"}
        assert item["name"] == "Was draaien"
        assert item["status"] == "today"
        assert item["assignee_name"] == "Laura"
        assert item["assignee_color"] == "#83c44a"

    def test_anyone_en_rotating(self, db):
        _taak(db, id="afwas", name="Afwassen",
              assignment_type="anyone", assigned_to=None)
        _taak(db, id="vuilnis", name="Vuilnis", assignment_type="rotating",
              assigned_to=None, rotation=["martijn", "laura"])
        per_naam = {t["name"]: t for t in overview(db, VANDAAG)["tasks_today"]}
        assert per_naam["Afwassen"]["assignee_name"] == "wie kan"
        assert per_naam["Afwassen"]["assignee_color"] is None
        assert per_naam["Vuilnis"]["assignee_name"] == "Martijn"

    def test_eerst_vandaag_dan_achterstand_op_cyclusfractie(self, db):
        _taak(db, id="dagelijks", name="Dagelijks",
              next_due=VANDAAG - timedelta(days=3))
        _taak(db, id="maandelijks", name="Maandelijks",
              schedule_type="interval", schedule_config={"days": 30},
              next_due=VANDAAG - timedelta(days=5))
        _taak(db, id="vandaag", name="Vandaag")
        lijst = overview(db, VANDAAG)["tasks_today"]
        assert [t["name"] for t in lijst] == ["Vandaag", "Dagelijks", "Maandelijks"]
        assert [t["status"] for t in lijst] == ["today", "overdue", "overdue"]

    def test_maximaal_acht(self, db):
        for i in range(10):
            _taak(db, id=f"t{i}", name=f"Taak {i}")
        assert len(overview(db, VANDAAG)["tasks_today"]) == 8

    def test_persons_dragen_kleur(self, db):
        _taak(db)
        complete_chore(db, "was", "laura", VANDAAG, NU)
        persoon = overview(db, VANDAAG)["persons"]["laura"]
        assert persoon["color"] == "#83c44a"


class TestRestore:
    def test_terugzetten_activeert_met_verse_datum(self, db):
        # taak mét historie archiveren; de oude next_due ligt ver terug
        _taak(db, next_due=VANDAAG - timedelta(days=40))
        complete_chore(db, "was", "laura", VANDAAG - timedelta(days=40),
                       "2026-06-19T10:00:00+02:00")
        # complete rolt door; datum terug in het verleden zetten en archiveren
        _taak(db, next_due=VANDAAG - timedelta(days=40))
        assert delete_chore(db, "was") == "deactivated"

        staat = build_state(db, VANDAAG)
        assert [c["id"] for c in staat["archived_chores"]] == ["was"]
        assert all(c["id"] != "was" for c in staat["chores"])

        chore = restore_chore(db, "was", VANDAAG, NU)
        assert chore["active"] == 1
        # dagelijkse taak: roll_forward brengt hem naar vandaag, niet naar
        # 40 dagen achterstand
        assert chore["next_due"] == VANDAAG.isoformat()

        staat = build_state(db, VANDAAG)
        assert staat["archived_chores"] == []
        assert any(c["id"] == "was" for c in staat["chores"])

    def test_intervaltaak_komt_vers_terug_niet_in_de_achterstand(self, db):
        # roll_forward zou binnen-cyclus-achterstand laten staan (116 dagen
        # op een 180-dagentaak); terugzetten is een nieuwe start: vandaag.
        _taak(db, id="vriezer", name="Vriezer", schedule_type="interval",
              schedule_config={"days": 180},
              next_due=VANDAAG - timedelta(days=116))
        save_chore(db, {**get_chore(db, "vriezer"), "active": 0}, VANDAAG, NU)
        chore = restore_chore(db, "vriezer", VANDAAG, NU)
        assert chore["next_due"] == VANDAAG.isoformat()

    def test_weektaak_komt_terug_op_de_eerstvolgende_geplande_dag(self, db):
        # VANDAAG is een woensdag; taak gepland op maandag (1) -> volgende
        # maandag, niet de gemiste van deze week.
        _taak(db, id="stof", name="Stofzuigen", schedule_type="weekly",
              schedule_config={"weekday": 1},
              next_due=VANDAAG - timedelta(days=30))
        save_chore(db, {**get_chore(db, "stof"), "active": 0}, VANDAAG, NU)
        chore = restore_chore(db, "stof", VANDAAG, NU)
        assert chore["next_due"] == (VANDAAG + timedelta(days=5)).isoformat()

    def test_onbekende_taak_geeft_nette_fout(self, db):
        with pytest.raises(ValueError):
            restore_chore(db, "bestaat-niet", VANDAAG, NU)


class TestSubtasksMetHistorie:
    def _checklist(self, db):
        _taak(db, id="kap", name="Afzuigkap", subtask_mode="checklist")
        set_subtasks(db, "kap", ["Filter", "Rooster", "Behuizing"])
        return {s["name"]: s["id"] for s in list_subtasks(db, "kap")}

    def test_bewerken_met_historie_behoudt_minuten(self, db):
        stappen = self._checklist(db)
        complete_chore(db, "kap", "laura", VANDAAG, NU, stappen["Filter"])
        complete_chore(db, "kap", "martijn", VANDAAG, NU, stappen["Rooster"])
        voor = _completions(db)
        week_voor = leaderboard(db, VANDAAG)["total_minutes"]

        # Rooster (mét historie) eruit, Lampje erbij, Filter blijft
        set_subtasks(db, "kap", ["Filter", "Behuizing", "Lampje"])

        assert [s["name"] for s in list_subtasks(db, "kap")] == [
            "Filter", "Behuizing", "Lampje"]
        assert _completions(db) == voor
        assert leaderboard(db, VANDAAG)["total_minutes"] == week_voor
        # de voltooiing van de geschrapte stap staat los (subtask_id NULL)
        conn = sqlite3.connect(db)
        assert conn.execute(
            "SELECT COUNT(*) FROM completions WHERE subtask_id IS NULL"
        ).fetchone()[0] == 1
        conn.close()

    def test_gelijkgebleven_stap_behoudt_rij_en_vinkje(self, db):
        stappen = self._checklist(db)
        complete_chore(db, "kap", "laura", VANDAAG, NU, stappen["Filter"])
        set_subtasks(db, "kap", ["Filter", "Behuizing"])
        nieuwe = {s["name"]: s["id"] for s in list_subtasks(db, "kap")}
        assert nieuwe["Filter"] == stappen["Filter"]
        # het vinkje van de lopende ronde staat er nog
        staat = build_state(db, VANDAAG)
        kap = next(c for c in staat["chores"] if c["id"] == "kap")
        assert kap["subtasks_done"] == [stappen["Filter"]]

    def test_dubbele_namen_geweigerd(self, db):
        self._checklist(db)
        with pytest.raises(ValueError):
            set_subtasks(db, "kap", ["Filter", "Filter"])


class TestMigratieSetNull:
    """De E2-migratie, expliciet op een database mét voltooiingen."""

    def _downgrade_completions(self, pad):
        """Zet completions terug naar de pre-fase-5-vorm (zonder SET NULL)."""
        conn = sqlite3.connect(pad)
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.executescript("""
            CREATE TABLE completions_oud (
                id                 INTEGER PRIMARY KEY AUTOINCREMENT,
                chore_id           TEXT NOT NULL REFERENCES chores(id),
                subtask_id         INTEGER REFERENCES subtasks(id),
                is_full_completion INTEGER NOT NULL DEFAULT 1,
                assignee_id        TEXT NOT NULL REFERENCES assignees(id),
                completed_at       TIMESTAMP NOT NULL,
                minutes            INTEGER NOT NULL,
                note               TEXT);
            INSERT INTO completions_oud
                SELECT id, chore_id, subtask_id, is_full_completion,
                       assignee_id, completed_at, minutes, note
                FROM completions;
            DROP TABLE completions;
            ALTER TABLE completions_oud RENAME TO completions;
        """)
        conn.commit()
        conn.close()

    def _on_delete(self, pad):
        conn = sqlite3.connect(pad)
        conn.row_factory = sqlite3.Row
        regel = next(r for r in conn.execute(
            "PRAGMA foreign_key_list(completions)") if r["table"] == "subtasks")
        conn.close()
        return regel["on_delete"]

    def test_rebuild_behoudt_aantallen_en_minuten(self, db):
        _taak(db, id="kap", name="Afzuigkap", subtask_mode="checklist")
        set_subtasks(db, "kap", ["Filter", "Rooster"])
        stappen = {s["name"]: s["id"] for s in list_subtasks(db, "kap")}
        complete_chore(db, "kap", "laura", VANDAAG, NU, stappen["Filter"])
        _taak(db)
        complete_chore(db, "was", "martijn", VANDAAG, NU)

        self._downgrade_completions(db)
        assert self._on_delete(db) == "NO ACTION"
        voor = _completions(db)
        assert voor[0] == 2 and voor[1] > 0

        create_database(db)  # legt schema aan én draait de migratie

        assert self._on_delete(db) == "SET NULL"
        assert _completions(db) == voor
        # en de nieuwe FK doet wat hij belooft: stap weg -> koppeling NULL,
        # rij en minuten blijven
        set_subtasks(db, "kap", ["Rooster"])
        assert _completions(db) == voor

    def test_verse_database_heeft_meteen_set_null(self, db):
        assert self._on_delete(db) == "SET NULL"

    def test_achtergebleven_tussentabel_blokkeert_de_migratie_niet(self, db):
        # Een eerder afgebroken poging liet completions_nieuw achter (DDL
        # committe destijds buiten de transactie). De migratie moet daar
        # zelfherstellend overheen: geen "table already exists", data intact.
        _taak(db)
        complete_chore(db, "was", "laura", VANDAAG, NU)
        self._downgrade_completions(db)
        conn = sqlite3.connect(db)
        conn.execute("CREATE TABLE completions_nieuw (id INTEGER PRIMARY KEY)")
        conn.commit()
        conn.close()
        voor = _completions(db)

        create_database(db)  # mag niet stikken in de achtergebleven tabel

        assert self._on_delete(db) == "SET NULL"
        assert _completions(db) == voor
