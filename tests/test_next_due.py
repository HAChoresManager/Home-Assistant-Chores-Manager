"""next_due bij aanmaken, na afvinken en na overslaan, voor elk van de vijf
types (§4.1, §4.2).

Vaste datums, nooit date.today(): 2026-07-28 is een dinsdag, 2026-07-29 een
woensdag, 2026-07-31 een vrijdag (geverifieerd met isoweekday).
"""
from datetime import date

from chores_manager.scheduling.calculator import (
    initial_next_due,
    next_due_after_completion,
    next_due_after_skip,
)

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


class TestNextDueAfterSkip:
    """Overslaan: de eerstvolgende geplande keer ná max(next_due, vandaag).
    Vanaf vandaag (de taak is nu aan de beurt) en vanuit achterstand (de
    gemiste keer én alles tot en met vandaag vervalt in één keer)."""

    def test_daily_weekdagen_vanaf_vandaag(self):
        # wo+zo, woensdag aan de beurt en overgeslagen -> zondag
        assert next_due_after_skip("daily", {"weekdays": [3, 7]}, WOENSDAG, WOENSDAG) == date(2026, 8, 2)

    def test_daily_weekdagen_vanuit_achterstand(self):
        # wo+zo, sinds woensdag 22-07 blijven liggen, overgeslagen op dinsdag
        # 28-07 -> woensdag 29-07, niet zondag 26-07 (die is ook voorbij)
        assert next_due_after_skip("daily", {"weekdays": [3, 7]}, date(2026, 7, 22), DINSDAG) == WOENSDAG

    def test_weekly_vanaf_vandaag(self):
        assert next_due_after_skip("weekly", {"weekday": 3}, WOENSDAG, WOENSDAG) == date(2026, 8, 5)

    def test_weekly_vanuit_achterstand(self):
        assert next_due_after_skip("weekly", {"weekday": 3}, date(2026, 7, 22), VRIJDAG) == date(2026, 8, 5)

    def test_weekly_komende_keer_schuift_een_keer_door(self):
        # alleen via het oude snooze 'skip': woensdag is morgen -> de week erna
        assert next_due_after_skip("weekly", {"weekday": 3}, WOENSDAG, DINSDAG) == date(2026, 8, 5)

    def test_monthly_over_maandgrens(self):
        assert next_due_after_skip("monthly", {"monthday": 15}, date(2026, 7, 15), date(2026, 7, 15)) == date(2026, 8, 15)

    def test_monthly_vanuit_achterstand(self):
        # de 15e gemist, overgeslagen op de 28e -> 15 augustus
        assert next_due_after_skip("monthly", {"monthday": 15}, date(2026, 7, 15), DINSDAG) == date(2026, 8, 15)

    def test_monthly_31_kapt_af_op_30(self):
        assert next_due_after_skip("monthly", {"monthday": 31}, date(2026, 8, 31), date(2026, 8, 31)) == date(2026, 9, 30)

    def test_monthly_31_kapt_af_op_28_februari(self):
        assert next_due_after_skip("monthly", {"monthday": 31}, date(2027, 1, 31), date(2027, 1, 31)) == date(2027, 2, 28)

    def test_interval_vanaf_vandaag(self):
        assert next_due_after_skip("interval", {"days": 7}, DINSDAG, DINSDAG) == date(2026, 8, 4)

    def test_interval_vanuit_achterstand_telt_vanaf_vandaag(self):
        # vijf dagen te laat: de nieuwe cyclus begint vandaag, niet bij next_due
        assert next_due_after_skip("interval", {"days": 7}, date(2026, 7, 23), DINSDAG) == date(2026, 8, 4)

    def test_yearly_vanaf_vandaag(self):
        assert next_due_after_skip("yearly", {"month": 7, "day": 28}, DINSDAG, DINSDAG) == date(2027, 7, 28)

    def test_yearly_vanuit_achterstand(self):
        assert next_due_after_skip("yearly", {"month": 12, "day": 1}, date(2025, 12, 1), DINSDAG) == date(2026, 12, 1)

    def test_yearly_29_februari_in_schrikkeljaar_naar_gewoon_jaar(self):
        assert next_due_after_skip("yearly", {"month": 2, "day": 29}, date(2028, 2, 29), date(2028, 2, 29)) == date(2029, 2, 28)

    def test_yearly_afgekapte_28_februari_naar_schrikkeljaar(self):
        assert next_due_after_skip("yearly", {"month": 2, "day": 29}, date(2027, 2, 28), date(2027, 2, 28)) == date(2028, 2, 29)
