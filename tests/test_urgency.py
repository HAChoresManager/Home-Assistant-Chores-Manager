"""Urgentie per prioriteit, precies op de grens van de coulance (§4.3).

De coulancetabel: low 7, normal 3, high 1, critical 0. Interpretatie zoals in
de calculator vastgelegd: neutraal vóór de vervaldatum, DUE op de dag zelf,
GRACE zolang overdue_days <= coulance, URGENT daarboven. Bij critical bestaat
GRACE dus niet: één dag over tijd is meteen URGENT ("dringend zodra hij
verloopt").
"""
from datetime import date, timedelta

import pytest

from chores_manager.scheduling.calculator import DUE, GRACE, UPCOMING, URGENT, urgency
from chores_manager.scheduling.types import ScheduleError

VANDAAG = date(2026, 7, 28)


def _op(dagen_te_laat: int) -> date:
    """next_due die vandaag precies `dagen_te_laat` dagen over tijd is."""
    return VANDAAG - timedelta(days=dagen_te_laat)


@pytest.mark.parametrize("priority", ["low", "normal", "high", "critical"])
class TestOnafhankelijkVanPrioriteit:
    def test_morgen_is_upcoming(self, priority):
        assert urgency(_op(-1), priority, VANDAAG) == UPCOMING

    def test_vandaag_is_due(self, priority):
        assert urgency(_op(0), priority, VANDAAG) == DUE


class TestGrensPerPrioriteit:
    """Per prioriteit: de laatste coulancedag is GRACE, één dag later URGENT."""

    @pytest.mark.parametrize("priority,coulance", [
        ("low", 7), ("normal", 3), ("high", 1),
    ])
    def test_laatste_coulancedag_is_grace(self, priority, coulance):
        assert urgency(_op(coulance), priority, VANDAAG) == GRACE

    @pytest.mark.parametrize("priority,coulance", [
        ("low", 7), ("normal", 3), ("high", 1),
    ])
    def test_dag_na_de_coulance_is_urgent(self, priority, coulance):
        assert urgency(_op(coulance + 1), priority, VANDAAG) == URGENT

    def test_eerste_dag_over_tijd_is_grace_behalve_critical(self):
        assert urgency(_op(1), "low", VANDAAG) == GRACE
        assert urgency(_op(1), "normal", VANDAAG) == GRACE
        assert urgency(_op(1), "high", VANDAAG) == GRACE

    def test_critical_kent_geen_grace(self):
        # coulance 0: dringend zodra hij verloopt
        assert urgency(_op(1), "critical", VANDAAG) == URGENT

    def test_ver_over_tijd_altijd_urgent(self):
        for priority in ("low", "normal", "high", "critical"):
            assert urgency(_op(30), priority, VANDAAG) == URGENT


def test_onbekende_prioriteit_is_een_fout():
    with pytest.raises(ScheduleError):
        urgency(VANDAAG, "spoed", VANDAAG)
