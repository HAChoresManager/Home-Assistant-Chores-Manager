"""De v2-datalaag (fase 2b).

Tussentoestand: de oude app draait nog op het oude db/-pakket, dus deze laag
kan die naam nog niet innemen. In fase 3, zodra het oude db/ leeg is, neemt
store/ met een git mv de plaats van db/ in. Zie REFACTOR_PLAN.md §7.

Alles hier is puur sqlite plus de scheduling-package — geen Home
Assistant-imports, zodat de rooktests zonder HA-installatie draaien.
"""
from .connection import get_connection
from .schema import apply_schema, create_database

__all__ = ["get_connection", "apply_schema", "create_database"]
