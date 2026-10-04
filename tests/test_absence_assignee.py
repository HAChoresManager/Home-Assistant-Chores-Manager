"""Afwezigheid per persoon (v2.7): de pure effectieve toewijzing
(scheduling.effective_assignee). Wie heeft een taak nú op zijn naam, en voor
wie is hij overgenomen? Geen database, geen datums.
"""
from chores_manager.scheduling.calculator import advance_rotation, effective_assignee


def _vast(owner="laura"):
    return {"assignment_type": "fixed", "assigned_to": owner,
            "rotation": [], "rotation_index": 0}


def _rotatie(rotation, index=0):
    return {"assignment_type": "rotating", "assigned_to": None,
            "rotation": list(rotation), "rotation_index": index}


WIE_KAN = {"assignment_type": "anyone", "assigned_to": None,
           "rotation": [], "rotation_index": 0}


class TestVast:
    def test_zonder_afwezigheid_de_eigenaar(self):
        assert effective_assignee(_vast()) == ("laura", None)
        assert effective_assignee(_vast(), {"martijn"}) == ("laura", None)

    def test_afwezige_eigenaar_wordt_wie_kan(self):
        assert effective_assignee(_vast(), {"laura"}) == (None, "laura")


class TestWieKan:
    def test_blijft_wie_kan(self):
        assert effective_assignee(WIE_KAN) == (None, None)
        assert effective_assignee(WIE_KAN, {"laura", "martijn"}) == (None, None)


class TestRotatie:
    def test_zonder_afwezigheid_wie_aan_de_beurt_is(self):
        assert effective_assignee(_rotatie(["laura", "martijn"], 1)) == ("martijn", None)

    def test_rotatie_van_twee_slaat_de_afwezige_over(self):
        chore = _rotatie(["laura", "martijn"], 0)
        assert effective_assignee(chore, {"laura"}) == ("martijn", "laura")
        # wie niet aan de beurt is mag weg zijn zonder dat er iets verandert
        assert effective_assignee(chore, {"martijn"}) == ("laura", None)

    def test_rotatie_van_drie_neemt_de_eerstvolgende(self):
        chore = _rotatie(["laura", "martijn", "noud"], 0)
        assert effective_assignee(chore, {"laura"}) == ("martijn", "laura")
        assert effective_assignee(chore, {"laura", "martijn"}) == ("noud", "laura")
        # vanaf het eind van de lijst vouwt hij terug naar het begin
        chore = _rotatie(["laura", "martijn", "noud"], 2)
        assert effective_assignee(chore, {"noud"}) == ("laura", "noud")
        assert effective_assignee(chore, {"noud", "laura"}) == ("martijn", "noud")

    def test_iedereen_afwezig_wordt_wie_kan(self):
        chore = _rotatie(["laura", "martijn"], 1)
        assert effective_assignee(chore, {"laura", "martijn"}) == (None, "martijn")

    def test_index_buiten_de_lijst_vouwt_terug(self):
        # zoals current_assignee: een ingekorte rotatie crasht niet
        chore = _rotatie(["laura", "martijn"], 5)
        assert effective_assignee(chore) == ("martijn", None)
        assert effective_assignee(chore, {"martijn"}) == ("laura", "martijn")

    def test_lege_rotatie(self):
        assert effective_assignee(_rotatie([])) == (None, None)

    def test_rotation_index_blijft_ongemoeid(self):
        chore = _rotatie(["laura", "martijn", "noud"], 0)
        effective_assignee(chore, {"laura"})
        assert chore["rotation_index"] == 0
        assert chore["rotation"] == ["laura", "martijn", "noud"]

    def test_geen_inhaal_na_terugkomst(self):
        # Laura weg: Martijn vervangt en doet het; de beurt schuift door vanaf
        # de doener (§4.4) naar Noud. Na terugkomst is Laura weer gewoon op
        # haar plek, ná Noud — ze haalt haar gemiste beurt niet in.
        rotation = ["laura", "martijn", "noud"]
        assert effective_assignee(_rotatie(rotation, 0), {"laura"}) == ("martijn", "laura")
        index = advance_rotation(rotation, 0, "martijn")
        assert effective_assignee(_rotatie(rotation, index), {"laura"}) == ("noud", None)
        index = advance_rotation(rotation, index, "noud")
        assert effective_assignee(_rotatie(rotation, index)) == ("laura", None)
