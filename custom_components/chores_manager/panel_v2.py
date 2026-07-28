"""Registratie van het nieuwe panel op /taken (fase 3a).

Het panel wordt rechtstreeks uit custom_components geserveerd via een eigen
statisch pad — bewust géén /local: /local serveert de kopie die
_setup_web_assets maakt, en die kopieerstap is precies de valkuil uit
CLAUDE.md (HA-herstart nodig om een wijziging te zien). Hier bestaat die
valkuil niet: wat op schijf staat, wordt geserveerd.

Versiediscipline: PANEL_VERSION hieronder is de bron. Elke import in
www/chores-panel/ draagt dezelfde letterlijke ?v=-parameter — een querystring
op het entrypoint werkt niet door naar zijn imports, en twee verschillende
versies voor hetzelfde bestand betekenen twee module-instanties. Ophogen is
één sed over panel_v2.py en www/chores-panel/ samen, daarna HA herstarten.
"""
from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

PANEL_VERSION = "2.1.1-20260728-fase3b"
FRONTEND_URL_PATH = "taken"
STATIC_URL = "/chores_manager-panel"
_DATA_STATIC_REGISTERED = "v2_panel_static_registered"


async def async_setup_panel_v2(hass: HomeAssistant) -> None:
    """Serveer www/chores-panel/ en registreer <chores-panel> op /taken."""
    domain_data = hass.data[DOMAIN]

    # Statische paden kunnen niet weg of opnieuw; één keer per HA-run.
    if not domain_data.get(_DATA_STATIC_REGISTERED):
        panel_dir = Path(__file__).parent / "www" / "chores-panel"
        # cache_headers=False: de browser revalideert bij de server in plaats
        # van 31 dagen te cachen zoals bij /local. Cloudflare cachet .js
        # alsnog op extensie; daarvoor is de ?v=-discipline.
        await hass.http.async_register_static_paths(
            [StaticPathConfig(STATIC_URL, str(panel_dir), False)])
        domain_data[_DATA_STATIC_REGISTERED] = True

    # Bij herladen van de config entry staat het panel er nog; eerst weg.
    async_remove_panel_v2(hass)

    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="chores-panel",
        frontend_url_path=FRONTEND_URL_PATH,
        module_url=f"{STATIC_URL}/chores-panel.js?v={PANEL_VERSION}",
        sidebar_title="Huishoudelijke Taken",
        sidebar_icon="mdi:broom",
        require_admin=False,
        embed_iframe=False,
    )
    _LOGGER.info("Chores v2: panel geregistreerd op /%s (v%s)",
                 FRONTEND_URL_PATH, PANEL_VERSION)


@callback
def async_remove_panel_v2(hass: HomeAssistant) -> None:
    """Haal het panel van /taken; stil als het er niet staat."""
    if FRONTEND_URL_PATH in hass.data.get(frontend.DATA_PANELS, {}):
        frontend.async_remove_panel(hass, FRONTEND_URL_PATH)
