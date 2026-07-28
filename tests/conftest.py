"""Testconfiguratie: de integratiemodules importeerbaar maken zonder HA.

De integratie draait bij Home Assistant als het pakket
``custom_components.chores_manager``; submodules gebruiken daarom relatieve
imports (bv. ``from ..scheduling.calculator import ...`` in ``db/``). Die
moeten in de tests exact zo werken, anders testen we een andere importvorm dan
er draait.

Rechtstreeks ``import custom_components.chores_manager`` kan hier niet: het
``__init__.py`` van de integratie importeert ``homeassistant``, en die is in
de testomgeving niet geïnstalleerd. Daarom planten we een lege oudermodule
``chores_manager`` waarvan alleen het zoekpad is ingevuld. Subpakketten
(``chores_manager.scheduling``, ``chores_manager.db``) worden dan gewoon
vanaf schijf geladen — mét werkende relatieve imports — terwijl het echte
``__init__.py`` nooit wordt uitgevoerd.
"""
import sys
import types
from pathlib import Path

COMPONENT_ROOT = Path(__file__).resolve().parents[1] / "custom_components" / "chores_manager"

_parent = types.ModuleType("chores_manager")
_parent.__path__ = [str(COMPONENT_ROOT)]
sys.modules["chores_manager"] = _parent
