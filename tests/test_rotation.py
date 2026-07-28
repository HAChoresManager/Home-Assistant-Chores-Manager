"""Rotatie-index bij assignment_type = rotating (§4.4)."""
from scheduling.calculator import advance_rotation, current_assignee


class TestTweePersonen:
    ROTATIE = ["martijn", "laura"]

    def test_volledige_ronde(self):
        index = 0
        assert current_assignee(self.ROTATIE, index) == "martijn"
        index = advance_rotation(self.ROTATIE, index)
        assert index == 1
        assert current_assignee(self.ROTATIE, index) == "laura"
        index = advance_rotation(self.ROTATIE, index)
        assert index == 0  # wrap
        assert current_assignee(self.ROTATIE, index) == "martijn"


class TestDriePersonen:
    ROTATIE = ["martijn", "laura", "noud"]

    def test_volledige_ronde_met_wrap(self):
        volgorde = []
        index = 0
        for _ in range(6):  # twee volledige rondes
            volgorde.append(current_assignee(self.ROTATIE, index))
            index = advance_rotation(self.ROTATIE, index)
        assert volgorde == ["martijn", "laura", "noud", "martijn", "laura", "noud"]
        assert index == 0


class TestRandgevallen:
    def test_verouderde_index_vouwt_terug(self):
        # rotatie ingekort van 5 naar 3 personen terwijl de index op 4 stond:
        # niet crashen maar modulo terugvouwen
        rotatie = ["martijn", "laura", "noud"]
        assert current_assignee(rotatie, 4) == "laura"
        assert advance_rotation(rotatie, 4) == 2

    def test_lege_rotatie(self):
        assert current_assignee([], 0) is None
        assert advance_rotation([], 3) == 0

    def test_een_persoon(self):
        rotatie = ["martijn"]
        assert current_assignee(rotatie, 0) == "martijn"
        assert advance_rotation(rotatie, 0) == 0
