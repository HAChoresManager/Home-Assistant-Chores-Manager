"""Validatie van de vijf planningstypen (§4.1)."""
import pytest

from chores_manager.scheduling.types import ScheduleError, parse_schedule_config, validate_schedule


class TestGeldigeConfigs:
    def test_daily_alle_dagen(self):
        assert validate_schedule("daily", {"weekdays": [1, 2, 3, 4, 5, 6, 7]}) == {
            "weekdays": [1, 2, 3, 4, 5, 6, 7]}

    def test_daily_normaliseert_volgorde(self):
        # "planten water geven": woensdag en zondag, in willekeurige volgorde
        assert validate_schedule("daily", {"weekdays": [7, 3]}) == {"weekdays": [3, 7]}

    def test_weekly(self):
        assert validate_schedule("weekly", {"weekday": 3}) == {"weekday": 3}

    def test_monthly(self):
        assert validate_schedule("monthly", {"monthday": 15}) == {"monthday": 15}

    def test_interval(self):
        assert validate_schedule("interval", {"days": 180}) == {"days": 180}

    def test_yearly(self):
        assert validate_schedule("yearly", {"month": 6, "day": 15}) == {"month": 6, "day": 15}

    def test_yearly_schrikkeldag_is_geldig(self):
        assert validate_schedule("yearly", {"month": 2, "day": 29}) == {"month": 2, "day": 29}


class TestOngeldigeConfigs:
    def test_onbekend_type(self):
        with pytest.raises(ScheduleError):
            validate_schedule("fortnightly", {})

    def test_onbekende_sleutels_geweigerd(self):
        # precies de oude zes-kolommenziekte die niet terug mag komen
        with pytest.raises(ScheduleError, match="onbekende sleutels"):
            validate_schedule("weekly", {"weekday": 3, "frequency_days": 7})

    def test_config_geen_dict(self):
        with pytest.raises(ScheduleError):
            validate_schedule("weekly", [3])

    @pytest.mark.parametrize("weekdays", [[], [0], [8], [1, 1], ["3"], [True]])
    def test_daily_ongeldige_weekdagen(self, weekdays):
        with pytest.raises(ScheduleError):
            validate_schedule("daily", {"weekdays": weekdays})

    @pytest.mark.parametrize("weekday", [0, 8, None, "3", True])
    def test_weekly_ongeldige_weekdag(self, weekday):
        with pytest.raises(ScheduleError):
            validate_schedule("weekly", {"weekday": weekday})

    @pytest.mark.parametrize("monthday", [0, 32, None])
    def test_monthly_ongeldige_maanddag(self, monthday):
        with pytest.raises(ScheduleError):
            validate_schedule("monthly", {"monthday": monthday})

    @pytest.mark.parametrize("days", [0, -1, None, "180"])
    def test_interval_ongeldige_dagen(self, days):
        with pytest.raises(ScheduleError):
            validate_schedule("interval", {"days": days})

    @pytest.mark.parametrize("config", [
        {"month": 0, "day": 1},
        {"month": 13, "day": 1},
        {"month": 2, "day": 30},   # 30 februari bestaat nooit
        {"month": 4, "day": 31},   # april heeft er 30
        {"month": 6},              # dag ontbreekt
    ])
    def test_yearly_ongeldig(self, config):
        with pytest.raises(ScheduleError):
            validate_schedule("yearly", config)


class TestParseConfig:
    def test_geldige_json(self):
        assert parse_schedule_config('{"weekday": 3}') == {"weekday": 3}

    @pytest.mark.parametrize("text", ["", "niet json", "[3]", "3", None])
    def test_ongeldige_json(self, text):
        with pytest.raises(ScheduleError):
            parse_schedule_config(text)
