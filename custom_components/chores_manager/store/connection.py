"""Verbindingslaag voor het v2-schema (fase 2a).

Staat bewust naast db/base.py: base.py bedient het oude schema en wordt in
fase 2b ontmanteld. Vanaf dan is dit de enige plek waar verbindingen vandaan
komen. Tot die tijd importeert niets in de draaiende integratie deze module.
"""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from typing import Iterator


@contextmanager
def get_connection(database_path: str) -> Iterator[sqlite3.Connection]:
    """Open een verbinding met rijen als sqlite3.Row en foreign keys aan.

    Commit bij normaal verlaten van het with-blok, rollback bij een exception.
    SQLite dwingt foreign keys alleen af als de pragma per verbinding aanstaat;
    vergeet je dat, dan slikt hij verwijzingen naar niet-bestaande rijen.
    """
    conn = sqlite3.connect(database_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
