"""Afwezigheid per persoon (v2.7) tegen het v2-schema (tabel absences).

Eén persoon is een tijd weg (Laura een week op reis); het huishouden draait
door, alleen haar aandeel gaat tijdelijk naar de anderen. Zolang iemand
afwezig is:

- worden diens vaste taken "wie kan" en slaat de rotatie hem of haar over
  (scheduling.effective_assignee; overview.py past dat toe);
- krijgt die persoon geen ochtendmelding en geen weeksamenvatting;
- zijn weken die (deels) in de afwezigheid vallen voor diens streak
  neutraal (vacations.vacation_weeks met assignee_id).

Puur een berekening: hier wordt niets aan taken of beurten geschreven, dus
bij het einde valt er niets op te schuiven of in te halen — wie terugkomt,
sluit weer aan op zijn plek in de rotatie. Afvinken blijft voor iedereen
kunnen, ook voor wie weg is. De vakantiemodus wint: staat die aan, dan doet
een lopende afwezigheid niets extra's (overview.py negeert hem dan in de
toewijzing); starten en beëindigen mag gewoon tijdens een vakantie.

Dezelfde opzet als vacations.py: aanzetten (start_date = vandaag, until
optioneel, tot en met), einddatum wijzigen, beëindigen (ended_on = de dag
van terugkomst, handmatig vandaag) en het automatische einde (until vóór
vandaag → ended_on = until + 1) om 03:00 en bij het opstarten. Hooguit één
lopende afwezigheid per persoon (unieke index). Elke schrijfactie leest en
schrijft in één transactie (BEGIN IMMEDIATE), en het einde begint met een
bewaakte schrijfactie (ended_on alleen zetten als hij nog leeg is).

Een persoon archiveren beëindigt een lopende afwezigheid (end_on_archive,
aangeroepen vanuit assignees.py); echt verwijderen neemt de rijen mee (ON
DELETE CASCADE).

Puur sqlite; geen HA. Importeert binnen db/ alleen connection, errors en
vacations (parse_until). Datums zijn 'YYYY-MM-DD'-strings, tijdstippen
ISO-strings met offset.
"""
from __future__ import annotations

import sqlite3
from datetime import date, timedelta
from typing import Any, Optional

from .connection import get_connection
from .errors import StoreError
from .vacations import parse_until

ALREADY_ABSENT = "{name} is al afwezig."
NOT_ABSENT = "{name} is niet afwezig."
ALREADY_ENDED = "Deze afwezigheid is al beëindigd."
UNTIL_IN_PAST = "Kies als laatste dag van de afwezigheid vandaag of later."
INVALID_UNTIL = "Geef de laatste dag van de afwezigheid als datum (JJJJ-MM-DD)."
ARCHIVE_NEEDS_DATE = ("Archiveren met een lopende afwezigheid heeft de datum"
                      " van vandaag nodig.")


class AlreadyAbsentError(StoreError):
    """Er loopt al een afwezigheid voor deze persoon. Eigen klasse zodat de
    idempotente aanroepers (services, schakelaar) precies deze weigering
    kunnen herkennen en de rest gewoon laten opborrelen."""


class NotAbsentError(StoreError):
    """Er loopt geen afwezigheid (meer) voor deze persoon; zie hierboven."""


def _public(row: sqlite3.Row) -> dict:
    """De publieke vorm van een lopende afwezigheid (state, sensor)."""
    return {"assignee_id": row["assignee_id"], "start_date": row["start_date"],
            "until": row["until"]}


def _person(conn: sqlite3.Connection, assignee_id: str,
            active_only: bool = True) -> sqlite3.Row:
    """De persoon, of een StoreError als die niet bestaat (of, met
    active_only, gearchiveerd is) — dezelfde tekst als bij afvinken."""
    row = conn.execute("SELECT id, name, active FROM assignees WHERE id = ?",
                       (assignee_id,)).fetchone()
    if row is None or (active_only and not row["active"]):
        raise StoreError(f"onbekende of inactieve persoon {assignee_id!r}")
    return row


def _active_row(conn: sqlite3.Connection, assignee_id: str) -> Optional[sqlite3.Row]:
    """De lopende afwezigheid van deze persoon, of None. De unieke index
    idx_absences_one_active garandeert dat er hooguit één is."""
    return conn.execute(
        "SELECT * FROM absences WHERE assignee_id = ? AND ended_on IS NULL"
        " ORDER BY id DESC LIMIT 1", (assignee_id,)).fetchone()


def absent_ids(conn: sqlite3.Connection) -> set:
    """Ids van iedereen met een lopende afwezigheid, op een open verbinding."""
    return {row[0] for row in conn.execute(
        "SELECT assignee_id FROM absences WHERE ended_on IS NULL")}


def get_absent_ids(database_path: str) -> set:
    """Ids van iedereen met een lopende afwezigheid."""
    with get_connection(database_path) as conn:
        return absent_ids(conn)


def list_absences(database_path: str) -> list[dict]:
    """De lopende afwezigheden in publieke vorm {assignee_id, start_date,
    until}, in de volgorde van de personen (sort_order, naam). until is None
    bij een open einde."""
    with get_connection(database_path) as conn:
        return [_public(row) for row in conn.execute(
            "SELECT ab.* FROM absences ab JOIN assignees a ON a.id = ab.assignee_id"
            " WHERE ab.ended_on IS NULL ORDER BY a.sort_order, a.name")]


def get_active_absence(database_path: str, assignee_id: str) -> Optional[dict]:
    """De lopende afwezigheid van deze persoon in publieke vorm, of None."""
    with get_connection(database_path) as conn:
        row = _active_row(conn, assignee_id)
        return _public(row) if row else None


def start_absence(database_path: str, assignee_id: str, today: date,
                  until: Any, now_iso: str) -> dict:
    """Zet een afwezigheid aan met start_date = today.

    until (laatste dag, t/m) is optioneel en moet op of na vandaag liggen;
    None of "" = open einde. De persoon moet bestaan en actief zijn. Loopt er
    al een afwezigheid, dan een AlreadyAbsentError — ook als twee aanroepen
    tegelijk aanzetten (de controle hieronder, of anders de unieke index).
    Geeft de publieke vorm terug.
    """
    until_date = parse_until(until, INVALID_UNTIL)
    if until_date is not None and until_date < today:
        raise StoreError(UNTIL_IN_PAST)
    with get_connection(database_path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        person = _person(conn, assignee_id)
        if _active_row(conn, assignee_id) is not None:
            raise AlreadyAbsentError(ALREADY_ABSENT.format(name=person["name"]))
        try:
            cursor = conn.execute(
                "INSERT INTO absences (assignee_id, start_date, until, ended_on,"
                " created_at) VALUES (?, ?, ?, NULL, ?)",
                (assignee_id, today.isoformat(),
                 until_date.isoformat() if until_date else None, now_iso))
        except sqlite3.IntegrityError as err:
            raise AlreadyAbsentError(
                ALREADY_ABSENT.format(name=person["name"])) from err
        return _public(conn.execute(
            "SELECT * FROM absences WHERE id = ?", (cursor.lastrowid,)).fetchone())


def update_absence(database_path: str, assignee_id: str, until: Any,
                   today: date) -> dict:
    """Wijzig of wis (None, "") de laatste dag van een lopende afwezigheid.

    Een datum moet op of na vandaag én op of na de eerste dag liggen. Loopt
    er geen afwezigheid, dan een NotAbsentError. Geeft de publieke vorm.
    """
    until_date = parse_until(until, INVALID_UNTIL)
    with get_connection(database_path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        person = _person(conn, assignee_id, active_only=False)
        row = _active_row(conn, assignee_id)
        if row is None:
            raise NotAbsentError(NOT_ABSENT.format(name=person["name"]))
        start = date.fromisoformat(row["start_date"])
        if until_date is not None and until_date < max(today, start):
            raise StoreError(UNTIL_IN_PAST)
        conn.execute("UPDATE absences SET until = ? WHERE id = ?",
                     (until_date.isoformat() if until_date else None, row["id"]))
        return _public(conn.execute(
            "SELECT * FROM absences WHERE id = ?", (row["id"],)).fetchone())


def _end(conn: sqlite3.Connection, row: sqlite3.Row, ended_on: date) -> dict:
    """Beëindig de afwezigheid `row` op een verbinding die al in een
    schrijftransactie staat. ended_on is de dag van terugkomst (weer een
    gewone dag); vóór de startdag wordt het de startdag (nul dagen, geen
    neutrale week).

    De eerste schrijfactie is de bewaking: ended_on alleen zetten als hij
    nog leeg is. Een tweede einde — dubbele tik, schakelaar en panel
    tegelijk, de nachtjob ernaast — krijgt zo een NotAbsentError.
    """
    start = date.fromisoformat(row["start_date"])
    ended_on = max(ended_on, start)
    guarded = conn.execute(
        "UPDATE absences SET ended_on = ? WHERE id = ? AND ended_on IS NULL",
        (ended_on.isoformat(), row["id"]))
    if guarded.rowcount != 1:
        raise NotAbsentError(ALREADY_ENDED)
    return {
        "assignee_id": row["assignee_id"],
        "start_date": row["start_date"],
        "until": row["until"],
        "ended_on": ended_on.isoformat(),
        "days": (ended_on - start).days,
    }


def end_absence(database_path: str, assignee_id: str, today: date) -> dict:
    """Beëindig de lopende afwezigheid van deze persoon; vandaag is de dag
    van terugkomst. Loopt er geen, dan een NotAbsentError. Geeft
    {assignee_id, start_date, until, ended_on, days} terug."""
    with get_connection(database_path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        person = _person(conn, assignee_id, active_only=False)
        row = _active_row(conn, assignee_id)
        if row is None:
            raise NotAbsentError(NOT_ABSENT.format(name=person["name"]))
        return _end(conn, row, today)


def end_due_absences(database_path: str, today: date) -> list[dict]:
    """Beëindig elke lopende afwezigheid waarvan de laatste dag vóór vandaag
    ligt, met ended_on = until + 1 — ook als HA dagen uit stond: wat na de
    geplande afwezigheid lag, was gewone tijd.

    Voor de nachtjob (03:00, vóór de rol) en het opstarten. Geeft per
    beëindigde afwezigheid hetzelfde als end_absence, of [] als er niets
    te beëindigen viel. Controle en einde in één transactie, zodat een
    gelijktijdig handmatig einde niets dubbel doet.
    """
    with get_connection(database_path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        due = conn.execute(
            "SELECT * FROM absences WHERE ended_on IS NULL AND until IS NOT NULL"
            " AND until < ? ORDER BY id", (today.isoformat(),)).fetchall()
        return [_end(conn, row, date.fromisoformat(row["until"]) + timedelta(days=1))
                for row in due]


def end_on_archive(conn: sqlite3.Connection, assignee_id: str,
                   today: Optional[date]) -> Optional[dict]:
    """Beëindig een lopende afwezigheid omdat de persoon gearchiveerd wordt,
    op de open verbinding (en dus in de transactie) van het archiveren.
    Geeft het einde terug, of None als er niets liep.

    today is de dag van terugkomst. Zonder today kan een lopende
    afwezigheid niet eerlijk afgesloten worden; dat is een fout van de
    aanroeper (de HA-laag geeft hem altijd mee) en geeft een StoreError,
    zodat het archiveren in zijn geheel niet doorgaat.
    """
    row = _active_row(conn, assignee_id)
    if row is None:
        return None
    if today is None:
        raise StoreError(ARCHIVE_NEEDS_DATE)
    return _end(conn, row, today)
