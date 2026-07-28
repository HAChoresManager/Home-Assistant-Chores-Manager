"""Config flow: één instantie, niets in te stellen.

De oude flow vroeg om een databasepad en een notificatietijd en had een
optie om het dashboardtoken te verversen. Dat is alle drie vervallen in
fase 3c: het databasepad ligt vast (const.DB_FILENAME), tokens bestaan niet
meer (alles loopt via hass.connection), en de notificatietijd komt in fase 4
terug zodra de meldingen (§6) gebouwd worden.
"""
from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries

from .const import DOMAIN


class ChoresManagerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Eén instantie; toevoegen is bevestigen."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        if user_input is not None:
            return self.async_create_entry(title="Chores Manager", data={})

        return self.async_show_form(step_id="user", data_schema=vol.Schema({}))
