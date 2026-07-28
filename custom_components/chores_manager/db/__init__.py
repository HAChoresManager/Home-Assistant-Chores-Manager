"""De datalaag: alle databasetoegang loopt door deze map.

Tot fase 3c heette dit pakket store/, omdat de oude app het oude db/-pakket
nog bezette; op 28-07-2026 heeft het met een git mv de naam db/ overgenomen
(REFACTOR_PLAN.md §7). Nieuwe DDL hoort alleen in schema.py.

Alles hier is puur sqlite plus de scheduling-package — geen Home
Assistant-imports, zodat de rooktests zonder HA-installatie draaien.
"""
from .connection import get_connection
from .errors import StoreError
from .schema import apply_schema, create_database

__all__ = ["get_connection", "apply_schema", "create_database", "StoreError"]
