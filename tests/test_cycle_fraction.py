"""Cyclusfractie (§4.3, volgorde): achterstand gedeeld door cycluslengte.

De aanleiding uit 3a: de vriezer (115/180) stond in Achterstand boven de
boodschappenlijst (6/7), terwijl die tweede proportioneel veel dringender is.
De urgentiedrempels blijven op dagen; dit stuurt alleen de sortering.
"""
from datetime import date, timedelta

import pytest

from chores_manager.scheduling.calculator import cycle_fraction

VANDAAG = date(2026, 7, 28)  # dinsdag


class TestDeAanleiding:
    def test_boodschappen_dringender_dan_vriezer(self):
        # weektaak 6 dagen te laat (6/7) versus halfjaartaak 115 dagen (115/180)
        boodschappen = cycle_fraction(
            "weekly", {"weekday": 3}, VANDAAG - timedelta(days=6), VANDAAG)
        vriezer = cycle_fraction(
            "interval", {"days": 180}, VANDAAG - timedelta(days=115), VANDAAG)
        assert boodschappen == pytest.approx(6 / 7)
        assert vriezer == pytest.approx(115 / 180)
        assert boodschappen > vriezer


class TestPerType:
    def test_niet_te_laat_is_nul(self):
        assert cycle_fraction("weekly", {"weekday": 3}, VANDAAG, VANDAAG) == 0.0
        assert cycle_fraction(
            "interval", {"days": 30}, VANDAAG + timedelta(days=5), VANDAAG) == 0.0

    def test_dagelijkse_taak_telt_in_hele_cycli(self):
        # elke dag, 2 dagen te laat: 2/1 — een gemiste dagtaak weegt zwaar
        cfg = {"weekdays": [1, 2, 3, 4, 5, 6, 7]}
        assert cycle_fraction(
            "daily", cfg, VANDAAG - timedelta(days=2), VANDAAG) == pytest.approx(2.0)

    def test_daily_beperkte_dagen_gebruikt_de_echte_afstand(self):
        # wo+zo: next_due was zondag (26e), vandaag dinsdag -> 2 dagen te laat
        # op een gat van 3 dagen (zo -> wo): 2/3
        assert cycle_fraction(
            "daily", {"weekdays": [3, 7]}, date(2026, 7, 26), VANDAAG
        ) == pytest.approx(2 / 3)

    def test_maandtaak(self):
        # maanddag 15, next_due 15 juli, vandaag 28 juli: 13 dagen te laat op
        # een cyclus van 31 dagen (15 jul -> 15 aug)
        assert cycle_fraction(
            "monthly", {"monthday": 15}, date(2026, 7, 15), VANDAAG
        ) == pytest.approx(13 / 31)

    def test_interval_gebruikt_de_intervallengte(self):
        assert cycle_fraction(
            "interval", {"days": 180}, VANDAAG - timedelta(days=90), VANDAAG
        ) == pytest.approx(0.5)
