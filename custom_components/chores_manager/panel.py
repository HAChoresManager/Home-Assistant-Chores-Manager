"""Registratie van het panel op /taken.

Het panel wordt rechtstreeks uit custom_components geserveerd — bewust géén
/local: wat op schijf staat, wordt geserveerd, zonder kopieerstap.

Versiediscipline (sinds 3c): de versie zit in het statische pad,
/chores_manager-panel-<versie>/. Relatieve imports erven dat pad vanzelf,
dus de 26 ?v=-literals per bestand zijn vervallen; PANEL_VERSION hieronder
is de enige bron. Ophogen = deze constante ophogen en HA herstarten. Het
geversioneerde pad mag agressief gecachet worden (dezelfde versie serveert
nooit andere inhoud); daarom staat cache_headers daar aan.

Daarnaast is dezelfde map bereikbaar op /chores_manager-panel (zonder
versie, zonder cache-headers). Dat pad bestaat uitsluitend als stabiele
resource-URL voor kaartgebruik in Lovelace — een resource-URL mag niet bij
elke versie breken. Het panel zelf gebruikt altijd het geversioneerde pad.
"""
from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

PANEL_VERSION = "2.3.0-20260728-fase4"
FRONTEND_URL_PATH = "taken"
STATIC_URL = "/chores_manager-panel"
_DATA_STATIC_REGISTERED = "panel_static_registered"


async def async_setup_panel(hass: HomeAssistant) -> None:
    """Serveer www/chores-panel/ en registreer <chores-panel> op /taken."""
    domain_data = hass.data[DOMAIN]

    # Statische paden kunnen niet weg of opnieuw; één keer per HA-run.
    if not domain_data.get(_DATA_STATIC_REGISTERED):
        panel_dir = str(Path(__file__).parent / "www" / "chores-panel")
        await hass.http.async_register_static_paths([
            # het panel: versie in het pad, dus lang cachen mag
            StaticPathConfig(f"{STATIC_URL}-{PANEL_VERSION}", panel_dir, True),
            # kaartresource: stabiele URL, browser revalideert bij de server
            StaticPathConfig(STATIC_URL, panel_dir, False),
        ])
        domain_data[_DATA_STATIC_REGISTERED] = True

    # Bij herladen van de config entry staat het panel er nog; eerst weg.
    async_remove_panel(hass)

    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="chores-panel",
        frontend_url_path=FRONTEND_URL_PATH,
        module_url=f"{STATIC_URL}-{PANEL_VERSION}/chores-panel.js",
        sidebar_title="Huishoudelijke Taken",
        sidebar_icon="mdi:broom",
        require_admin=False,
        embed_iframe=False,
    )
    _LOGGER.info("Chores Manager: panel geregistreerd op /%s (v%s)",
                 FRONTEND_URL_PATH, PANEL_VERSION)


@callback
def async_remove_panel(hass: HomeAssistant) -> None:
    """Haal het panel van /taken; stil als het er niet staat."""
    if FRONTEND_URL_PATH in hass.data.get(frontend.DATA_PANELS, {}):
        frontend.async_remove_panel(hass, FRONTEND_URL_PATH)
