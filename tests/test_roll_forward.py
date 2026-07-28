"""De nachtelijke rol (§4.2) — de belangrijkste inhoudelijke fix van het project.

Achterstand loopt niet meer op: een dagelijkse taak die maanden bleef liggen
staat op vandaag, niet op honderden dagen te laat. Vaste datums: 2026-07-28 is
een dinsdag, 2026-07-31 een vrijdag.
"""
from datetime import date, timedelta

from chores_manager.scheduling.calculator import overdue_days, roll_forward

DINSDAG = date(2026, 7, 28)
VRIJDAG = date(2026, 7, 31)
ELKE_DAG = {"weekdays": [1, 2, 3, 4, 5, 6, 7]}


class TestDeBugWaarHetOmBegon:
    def test_dagelijkse_taak_281_dagen_blijven_liggen_staat_op_vandaag(self):
        # "Was draaien": dagelijks, 281 dagen niet gedaan. Oud gedrag: 281 dagen
        # te laat. Nieuw gedrag: de meest recente geplande keer is vandaag.
        next_due = DINSDAG - timedelta(days=281)  # 2025-10-20
        rolled = roll_forward("daily", ELKE_DAG, next_due, DINSDAG)
        assert rolled == DINSDAG
        assert overdue_days(rolled, DINSDAG) == 0

    def test_wekelijks_woensdag_op_vrijdag_is_2_dagen_te_laat(self):
        # §4.2 letterlijk: "Wekelijks op woensdag, vandaag is vrijdag -> 2 dagen te laat."
        next_due = date(2025, 1, 1)  # willekeurig ver verleden
        rolled = roll_forward("weekly", {"weekday": 3}, next_due, VRIJDAG)
        assert rolled == date(2026, 7, 29)  # afgelopen woensdag
        assert overdue_days(rolled, VRIJDAG) == 2

    def test_halfjaarlijks_100_dagen_te_laat_blijft_100_dagen_te_laat(self):
        # §4.2 letterlijk: "Halfjaarlijks, 100 dagen over tijd -> 100 dagen te laat."
        next_due = DINSDAG - timedelta(days=100)
        rolled = roll_forward("interval", {"days": 180}, next_due, DINSDAG)
        assert rolled == next_due
        assert overdue_days(rolled, DINSDAG) == 100


class TestKalendertypen:
    def test_niets_te_rollen_vandaag(self):
        assert roll_forward("daily", ELKE_DAG, DINSDAG, DINSDAG) == DINSDAG

    def test_niets_te_rollen_toekomst(self):
        toekomst = DINSDAG + timedelta(days=3)
        assert roll_forward("weekly", {"weekday": 3}, toekomst, DINSDAG) == toekomst

    def test_daily_beperkte_dagen(self):
        # wo+zo, lang blijven liggen, vandaag vrijdag -> afgelopen woensdag
        rolled = roll_forward("daily", {"weekdays": [3, 7]}, date(2026, 1, 1), VRIJDAG)
        assert rolled == date(2026, 7, 29)

    def test_weekly_exact_een_week_oud_blijft_staan(self):
        # next_due op de vorige woensdag; vandaag vrijdag: dat ís de meest
        # recente geplande keer, dus hij blijft (idempotent, geen dubbele rol)
        vorige_woensdag = date(2026, 7, 29)
        assert roll_forward("weekly", {"weekday": 3}, vorige_woensdag, VRIJDAG) == vorige_woensdag

    def test_monthly_over_maandgrens_met_afkapping(self):
        # maanddag 31, vandaag 28 juli: juli 31 is nog niet geweest -> 30 juni (afgekapt)
        rolled = roll_forward("monthly", {"monthday": 31}, date(2026, 1, 31), DINSDAG)
        assert rolled == date(2026, 6, 30)

    def test_monthly_net_over_de_maandgrens(self):
        # vandaag 1 augustus: de meest recente geplande keer is 31 juli
        rolled = roll_forward("monthly", {"monthday": 31}, date(2026, 1, 31), date(2026, 8, 1))
        assert rolled == date(2026, 7, 31)

    def test_yearly_over_jaargrens(self):
        rolled = roll_forward("yearly", {"month": 6, "day": 15}, date(2024, 6, 15), DINSDAG)
        assert rolled == date(2026, 6, 15)

    def test_yearly_schrikkeldag_rolt_naar_afgekapte_28e(self):
        # 29-februaritaak, next_due nog op schrikkeldag 2024; 2026 is geen
        # schrikkeljaar -> meest recente geplande keer is 28-02-2026
        rolled = roll_forward("yearly", {"month": 2, "day": 29}, date(2024, 2, 29), DINSDAG)
        assert rolled == date(2026, 2, 28)

    def test_rolt_nooit_terug(self):
        # handmatig gezette next_due buiten het rooster (donderdag) blijft staan
        # tot het rooster hem inhaalt; de rol maakt hem niet ouder
        donderdag = date(2026, 7, 30)
        assert roll_forward("weekly", {"weekday": 3}, donderdag, VRIJDAG) == donderdag


class TestInterval:
    def test_binnen_een_cyclus_verandert_niets(self):
        next_due = DINSDAG - timedelta(days=179)
        assert roll_forward("interval", {"days": 180}, next_due, DINSDAG) == next_due

    def test_hele_cycli_rollen_door(self):
        # 200 dagen te laat op een 180-dagentaak: één hele cyclus overgeslagen,
        # de meest recente geplande keer is 20 dagen geleden
        next_due = DINSDAG - timedelta(days=200)
        rolled = roll_forward("interval", {"days": 180}, next_due, DINSDAG)
        assert rolled == next_due + timedelta(days=180)
        assert overdue_days(rolled, DINSDAG) == 20

    def test_exact_een_cyclus_komt_op_vandaag(self):
        next_due = DINSDAG - timedelta(days=180)
        assert roll_forward("interval", {"days": 180}, next_due, DINSDAG) == DINSDAG

    def test_toekomst_blijft_staan(self):
        toekomst = DINSDAG + timedelta(days=80)
        assert roll_forward("interval", {"days": 180}, toekomst, DINSDAG) == toekomst


class TestOverdueDays:
    def test_toekomst_is_nul(self):
        assert overdue_days(DINSDAG + timedelta(days=5), DINSDAG) == 0

    def test_vandaag_is_nul(self):
        assert overdue_days(DINSDAG, DINSDAG) == 0

    def test_verleden_telt(self):
        assert overdue_days(DINSDAG - timedelta(days=4), DINSDAG) == 4
