"""shift_after_vacation (v2.6, vakantiemodus): next_due bij het einde van een
vakantie, per type (scheduling/calculator.py).

Vaste datums, nooit date.today(): 2026-10-03 is een zaterdag (START),
2026-10-18 een zondag (TERUG), 2026-10-21 een woensdag. Een vakantie van
START tot TERUG duurt vijftien dagen.
"""
from datetime import date

import pytest

from chores_manager.scheduling import shift_after_vacation as geexporteerd
from chores_manager.scheduling.calculator import shift_after_vacation

START = date(2026, 10, 3)   # zaterdag: de modus gaat aan
TERUG = date(2026, 10, 18)  # zondag: de modus gaat uit (resume)
WEEK = {"weekday": 3}       # woensdag


def test_geexporteerd_uit_het_pakket():
    assert geexporteerd is shift_after_vacation


class TestInterval:
    """Frozen: precies zoveel dagen op als de vakantie duurde. Niet frozen
    (nieuw, gewijzigd of teruggezet tijdens de vakantie): de laatste van
    next_due en resume."""

    def test_frozen_zonder_achterstand(self):
        assert shift_after_vacation(
            "interval", {"days": 14}, date(2026, 10, 10), START, TERUG) == date(2026, 10, 25)

    def test_frozen_achterstand_blijft_gelijk(self):
        # drie dagen te laat bij vertrek -> drie dagen te laat bij terugkomst
        nieuw = shift_after_vacation(
            "interval", {"days": 14}, date(2026, 9, 30), START, TERUG)
        assert nieuw == date(2026, 10, 15)
        assert (TERUG - nieuw).days == (START - date(2026, 9, 30)).days

    def test_frozen_ook_na_resume(self):
        # ook een datum die na de vakantie lag, schuift mee
        assert shift_after_vacation(
            "interval", {"days": 60}, date(2026, 11, 1), START, TERUG) == date(2026, 11, 16)

    def test_niet_frozen_wordt_resume(self):
        # tijdens de vakantie aangemaakt of teruggezet: "nu" werd "bij terugkomst"
        assert shift_after_vacation(
            "interval", {"days": 14}, date(2026, 10, 10), START, TERUG,
            frozen=False) == TERUG

    def test_niet_frozen_latere_datum_blijft(self):
        # een bewust gekozen datum na de vakantie schuift niet op
        assert shift_after_vacation(
            "interval", {"days": 14}, date(2026, 11, 1), START, TERUG,
            frozen=False) == date(2026, 11, 1)

    def test_een_dag(self):
        assert shift_after_vacation(
            "interval", {"days": 7}, date(2026, 10, 3), START, date(2026, 10, 4)) == date(2026, 10, 4)


class TestKalendertypen:
    """next_due vóór resume -> de eerste geplande keer op of na resume;
    anders ongewijzigd. Frozen of niet maakt niet uit."""

    @pytest.mark.parametrize("frozen", [True, False])
    def test_weekly_naar_eerste_keer_na_terugkomst(self, frozen):
        assert shift_after_vacation(
            "weekly", WEEK, date(2026, 10, 7), START, TERUG, frozen) == date(2026, 10, 21)

    def test_weekly_achterstand_van_voor_de_vakantie_vervalt(self):
        assert shift_after_vacation(
            "weekly", WEEK, date(2026, 9, 30), START, TERUG) == date(2026, 10, 21)

    def test_weekly_resume_op_de_dag_zelf_telt_mee(self):
        assert shift_after_vacation(
            "weekly", WEEK, date(2026, 10, 7), START, date(2026, 10, 21)) == date(2026, 10, 21)

    def test_weekly_al_na_resume_blijft(self):
        assert shift_after_vacation(
            "weekly", WEEK, date(2026, 10, 28), START, TERUG) == date(2026, 10, 28)

    def test_daily_weekdagen_resume_op_een_geplande_dag(self):
        # wo+zo; terug op zondag -> zondag zelf
        assert shift_after_vacation(
            "daily", {"weekdays": [3, 7]}, date(2026, 10, 4), START, TERUG) == TERUG

    def test_daily_weekdagen_resume_ertussen(self):
        # wo+zo; terug op maandag -> woensdag
        assert shift_after_vacation(
            "daily", {"weekdays": [3, 7]}, date(2026, 10, 4), START,
            date(2026, 10, 19)) == date(2026, 10, 21)

    def test_monthly_over_een_maandgrens(self):
        assert shift_after_vacation(
            "monthly", {"monthday": 15}, date(2026, 10, 15), date(2026, 10, 10),
            date(2026, 11, 2)) == date(2026, 11, 15)

    def test_monthly_31_kapt_af_op_30(self):
        assert shift_after_vacation(
            "monthly", {"monthday": 31}, date(2026, 10, 31), date(2026, 10, 25),
            date(2026, 11, 3)) == date(2026, 11, 30)

    def test_monthly_31_kapt_af_op_28_februari(self):
        assert shift_after_vacation(
            "monthly", {"monthday": 31}, date(2027, 1, 31), date(2027, 1, 25),
            date(2027, 2, 2)) == date(2027, 2, 28)

    def test_monthly_al_na_resume_blijft(self):
        assert shift_after_vacation(
            "monthly", {"monthday": 15}, date(2026, 11, 15), START, TERUG) == date(2026, 11, 15)

    def test_yearly_naar_volgend_jaar(self):
        assert shift_after_vacation(
            "yearly", {"month": 10, "day": 10}, date(2026, 10, 10), START,
            TERUG) == date(2027, 10, 10)

    def test_yearly_29_februari_naar_schrikkeljaar(self):
        # de afgekapte 28-02-2027 viel in de vakantie -> 29-02-2028
        assert shift_after_vacation(
            "yearly", {"month": 2, "day": 29}, date(2027, 2, 28), date(2027, 2, 20),
            date(2027, 3, 1)) == date(2028, 2, 29)

    def test_yearly_29_februari_naar_gewoon_jaar(self):
        assert shift_after_vacation(
            "yearly", {"month": 2, "day": 29}, date(2028, 2, 29), date(2028, 2, 25),
            date(2028, 3, 2)) == date(2029, 2, 28)


class TestNulDagen:
    """Aan en uit op dezelfde dag (of resume vóór start): niets stilgezet,
    dus niets verschoven — ook een achterstand blijft."""

    @pytest.mark.parametrize("schedule_type, config", [
        ("interval", {"days": 14}),
        ("weekly", WEEK),
        ("daily", {"weekdays": [1, 2, 3, 4, 5, 6, 7]}),
        ("monthly", {"monthday": 1}),
        ("yearly", {"month": 9, "day": 1}),
    ])
    @pytest.mark.parametrize("frozen", [True, False])
    def test_achterstand_blijft(self, schedule_type, config, frozen):
        achter = date(2026, 9, 1)
        assert shift_after_vacation(schedule_type, config, achter, START, START,
                                    frozen) == achter

    def test_resume_voor_start(self):
        assert shift_after_vacation(
            "interval", {"days": 14}, date(2026, 9, 30), START, date(2026, 10, 1)) == date(2026, 9, 30)
