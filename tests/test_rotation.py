"""Rotatie (§4.4): de beurt schuift door vanaf wie de taak écht deed.

Drie gevallen, telkens over 2 en over 3 personen: de persoon die aan de beurt
is doet het zelf, iemand anders uit de lijst doet het, en iemand van buiten de
lijst doet het (dan blijft de beurt staan).
"""
from chores_manager.scheduling.calculator import advance_rotation, current_assignee


class TestTweePersonen:
    ROTATIE = ["martijn", "laura"]

    def test_wie_aan_de_beurt_is_doet_het_zelf(self):
        # martijn aan de beurt, doet het zelf -> laura
        index = advance_rotation(self.ROTATIE, 0, "martijn")
        assert current_assignee(self.ROTATIE, index) == "laura"
        # laura doet het zelf -> weer martijn (wrap)
        index = advance_rotation(self.ROTATIE, index, "laura")
        assert current_assignee(self.ROTATIE, index) == "martijn"

    def test_de_ander_doet_het(self):
        # §4.4 letterlijk: martijn aan de beurt, laura doet het -> martijn
        # opnieuw aan de beurt, niet laura (die zou twee keer moeten)
        index = advance_rotation(self.ROTATIE, 0, "laura")
        assert current_assignee(self.ROTATIE, index) == "martijn"

    def test_buitenstaander_laat_de_beurt_staan(self):
        index = advance_rotation(self.ROTATIE, 0, "noud")
        assert index == 0
        assert current_assignee(self.ROTATIE, index) == "martijn"


class TestDriePersonen:
    ROTATIE = ["martijn", "laura", "noud"]

    def test_wie_aan_de_beurt_is_doet_het_zelf(self):
        volgorde = []
        index = 0
        for _ in range(4):
            doener = current_assignee(self.ROTATIE, index)
            volgorde.append(doener)
            index = advance_rotation(self.ROTATIE, index, doener)
        assert volgorde == ["martijn", "laura", "noud", "martijn"]

    def test_iemand_anders_uit_de_lijst_doet_het(self):
        # martijn aan de beurt, laura doet het -> de beurt schuift door vanaf
        # laura: noud is aan de beurt (martijns beurt vervalt)
        index = advance_rotation(self.ROTATIE, 0, "laura")
        assert current_assignee(self.ROTATIE, index) == "noud"
        # noud aan de beurt, martijn doet het -> na martijn komt laura
        index = advance_rotation(self.ROTATIE, index, "martijn")
        assert current_assignee(self.ROTATIE, index) == "laura"

    def test_buitenstaander_laat_de_beurt_staan(self):
        index = advance_rotation(self.ROTATIE, 1, "opa")
        assert index == 1
        assert current_assignee(self.ROTATIE, index) == "laura"


class TestRandgevallen:
    def test_zonder_doener_schuift_gewoon_door(self):
        # het oude gedrag blijft beschikbaar voor aanroepen zonder doener
        assert advance_rotation(["a", "b"], 0) == 1
        assert advance_rotation(["a", "b"], 1) == 0

    def test_verouderde_index_vouwt_terug_bij_lezen(self):
        rotatie = ["martijn", "laura", "noud"]
        assert current_assignee(rotatie, 4) == "laura"

    def test_lege_rotatie(self):
        assert current_assignee([], 0) is None
        assert advance_rotation([], 3, "wie dan ook") == 0

    def test_een_persoon(self):
        rotatie = ["martijn"]
        assert advance_rotation(rotatie, 0, "martijn") == 0
        assert advance_rotation(rotatie, 0, "laura") == 0  # buitenstaander
