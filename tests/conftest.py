"""Testconfiguratie: maakt de integratiemodules importeerbaar zonder HA.

De integratie is geen geïnstalleerd pakket; HA laadt hem op pad. Voor de tests
zetten we custom_components/chores_manager vooraan op sys.path, zodat
`from scheduling import ...` en `from db import ...` werken — dezelfde
padconstructie als de find_spec-controle in CLAUDE.md.
"""
import sys
from pathlib import Path

COMPONENT_ROOT = Path(__file__).resolve().parents[1] / "custom_components" / "chores_manager"
sys.path.insert(0, str(COMPONENT_ROOT))
