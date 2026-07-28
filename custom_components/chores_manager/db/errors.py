"""Gedeelde fouten voor de v2-datalaag.

Eén klasse voor alle store-modules, zodat aanroepers (websocket, services,
tests) op één type kunnen vangen in plaats van per module een eigen variant.
"""


class StoreError(ValueError):
    """Ongeldige invoer voor de opslaglaag."""
