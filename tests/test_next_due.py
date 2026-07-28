"""next_due bij aanmaken en na afvinken, voor elk van de vijf types (§4.1, §4.2).

Vaste datums, nooit date.today(): 2026-07-28 is een dinsdag, 2026-07-29 een
woensdag, 2026-07-31 een vrijdag (geverifieerd met isoweekday).
"""
from datetime import date

from scheduling.calculator import initial_next_due, next_due_after_completion

DINSDAG = date(2026, 7, 28)
WOENSDAG = date(2026, 7, 29)
VRIJDAG = date(2026, 7, 31)


class TestInitialNextDue:
    """Bij aanmaken: eerste geplande keer op of na vandaag; interval: vandaag."""

    def test_daily_elke_dag_is_vandaag(self):
        cfg = {"weekdays": [1, 2, 3, 4, 5, 6, 7]}
        assert initial_next_due("daily", cfg, DINSDAG) == DINSDAG

    def test_daily_beperkte_dagen(self):
        # wo+zo, aangemaakt op dinsdag -> morgen (woensdag)
        assert initial_next_due("daily", {"weekdays": [3, 7]}, DINSDAG) == WOENSDAG

    def test_daily_vandaag_telt_mee(self):
        # wo+zo, aangemaakt op woensdag -> vandaag, niet pas zondag
        assert initial_next_due("daily", {"weekdays": [3, 7]}, WOENSDAG) == WOENSDAG

    def test_weekly_vandaag_telt_mee(self):
        assert initial_next_due("weekly", {"weekday": 3}, WOENSDAG) == WOENSDAG

    def test_weekly_na_de_dag(self):
        # woensdagtaak, aangemaakt op vrijdag -> volgende week woensdag
        assert initial_next_due("weekly", {"weekday": 3}, VRIJDAG) == date(2026, 8, 5)

    def test_monthly_eerder_in_de_maand(self):
        assert initial_next_due("monthly", {"monthday": 15}, date(2026, 7, 10)) == date(2026, 7, 15)

    def test_monthly_vandaag_telt_mee(self):
        assert initial_next_due("monthly", {"monthday": 15}, date(2026, 7, 15)) == date(2026, 7, 15)

    def test_monthly_al_geweest(self):
        assert initial_next_due("monthly", {"monthday": 15}, date(2026, 7, 16)) == date(2026, 8, 15)

    def test_interval_is_meteen_aan_de_beurt(self):
        assert initial_next_due("interval", {"days": 180}, DINSDAG) == DINSDAG

    def test_yearly_later_dit_jaar(self):
        assert initial_next_due("yearly", {"month": 6, "day": 15}, date(2026, 5, 1)) == date(2026, 6, 15)

    def test_yearly_al_geweest(self):
        assert initial_next_due("yearly", {"month": 6, "day": 15}, date(2026, 7, 1)) == date(2027, 6, 15)


class TestNextDueAfterCompletion:
    """Bij afvinken: eerstvolgende geplande keer strikt ná de voltooiingsdag."""

    def test_daily_elke_dag(self):
        cfg = {"weekdays": [1, 2, 3, 4, 5, 6, 7]}
        assert next_due_after_completion("daily", cfg, DINSDAG) == WOENSDAG

    def test_daily_beperkt_op_de_dag_zelf(self):
        # wo+zo, afgevinkt op woensdag -> zondag, niet weer woensdag
        assert next_due_after_completion("daily", {"weekdays": [3, 7]}, WOENSDAG) == date(2026, 8, 2)

    def test_weekly_op_de_dag_zelf(self):
        assert next_due_after_completion("weekly", {"weekday": 3}, WOENSDAG) == date(2026, 8, 5)

    def test_weekly_over_jaargrens(self):
        # donderdagtaak, afgevinkt op donderdag 31-12 -> donderdag 07-01
        assert next_due_after_completion("weekly", {"weekday": 4}, date(2026, 12, 31)) == date(2027, 1, 7)

    def test_monthly_op_de_dag_zelf(self):
        assert next_due_after_completion("monthly", {"monthday": 15}, date(2026, 7, 15)) == date(2026, 8, 15)

    def test_monthly_eerder_voltooid_dan_gepland(self):
        # op de 10e al gedaan -> de 15e van dezelfde maand blijft de volgende
        assert next_due_after_completion("monthly", {"monthday": 15}, date(2026, 7, 10)) == date(2026, 7, 15)

    def test_monthly_over_jaargrens(self):
        assert next_due_after_completion("monthly", {"monthday": 15}, date(2026, 12, 20)) == date(2027, 1, 15)

    def test_monthly_31_kapt_af_op_kort_maandeinde(self):
        # 31 januari gedaan -> februari heeft geen 31e -> 28 februari (2026 geen schrikkeljaar)
        assert next_due_after_completion("monthly", {"monthday": 31}, date(2026, 1, 31)) == date(2026, 2, 28)

    def test_monthly_31_kapt_af_op_29_in_schrikkeljaar(self):
        assert next_due_after_completion("monthly", {"monthday": 31}, date(2024, 1, 31)) == date(2024, 2, 29)

    def test_monthly_31_na_afgekapte_maand_terug_naar_31(self):
        # de afgekapte 28 februari telt als de februarikeer; daarna gewoon 31 maart
        assert next_due_after_completion("monthly", {"monthday": 31}, date(2026, 2, 28)) == date(2026, 3, 31)

    def test_interval(self):
        assert next_due_after_completion("interval", {"days": 180}, date(2026, 1, 1)) == date(2026, 6, 30)

    def test_interval_over_schrikkeldag(self):
        # 365 dagen vanaf 29-02-2028 loopt dwars door een schrikkeljaargrens
        assert next_due_after_completion("interval", {"days": 365}, date(2028, 2, 29)) == date(2029, 2, 28)

    def test_yearly_op_de_dag_zelf(self):
        assert next_due_after_completion("yearly", {"month": 6, "day": 15}, date(2026, 6, 15)) == date(2027, 6, 15)

    def test_yearly_schrikkeldag_kapt_af_in_gewoon_jaar(self):
        # 29-februaritaak, afgevinkt in maart 2026 -> 2027 is geen schrikkeljaar -> 28 februari
        assert next_due_after_completion("yearly", {"month": 2, "day": 29}, date(2026, 3, 5)) == date(2027, 2, 28)

    def test_yearly_schrikkeldag_in_schrikkeljaar(self):
        assert next_due_after_completion("yearly", {"month": 2, "day": 29}, date(2027, 3, 1)) == date(2028, 2, 29)
