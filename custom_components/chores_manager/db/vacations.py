"""Vakantiemodus tegen het v2-schema (tabellen vacations en vacation_frozen).

Zolang een vakantie aanstaat, staan alle taken stil: er is niets aan de
beurt, niets loopt achter en er gaan geen meldingen uit. Afvinken, overslaan
en snoozen weigeren met VacationActiveError — die controle zit in de
schrijftransactie van complete_chore, skip_chore en snooze_chore zelf, zodat
elk pad (WS, service, "Klaar"-knop) hetzelfde gedrag krijgt. Bij het einde
schuiven de taken op met de vakantie (scheduling.shift_after_vacation); de
beurt blijft staan.

Bij het aanzetten komt er per actieve taak een momentopname van next_due in
vacation_frozen. Een intervaltaak die bij het einde nog op die datum staat,
schuift het aantal vakantiedagen op; een taak die tijdens de vakantie nieuw
is, een andere datum kreeg of uit het archief kwam, schuift niet dubbel
(max(next_due, resume)). Na het einde is de momentopname weg.

Puur sqlite plus scheduling; geen HA. Importeert binnen db/ alleen connection
en errors — completions.py, skips.py en absences.py importeren deze module,
chores.py doet dat lokaal — dus taken (en voor de streak ook afwezigheden)
worden hier met eigen SQL gelezen, niet via chores.py of absences.py.
Datums zijn 'YYYY-MM-DD'-strings (date.isoformat()), tijdstippen ISO-strings
met offset.

Aanzetten, wijzigen en beëindigen lezen en schrijven in één
schrijftransactie (BEGIN IMMEDIATE), net als afvinken en overslaan: een
afvinktik van een ander apparaat valt zo helemaal vóór of helemaal ná het
aanzetten, nooit ertussen.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import date, datetime, timedelta
from typing import Any, Optional

from ..scheduling.calculator import shift_after_vacation
from .connection import get_connection
from .errors import StoreError

VACATION_ACTIVE = ("Vakantiemodus staat aan; afvinken en overslaan kan weer na"
                   " de vakantie.")
ALREADY_ACTIVE = "Vakantiemodus staat al aan."
NOT_ACTIVE = "Er staat geen vakantie aan."
UNTIL_IN_PAST = "Kies als laatste vakantiedag vandaag of later."
INVALID_UNTIL = "Geef de laatste vakantiedag als datum (JJJJ-MM-DD)."


class VacationActiveError(StoreError):
    """Een actie die tijdens de vakantiemodus niet kan (afvinken, overslaan,
    snoozen, overslaan terugdraaien). Eigen klasse zodat de HA-laag er een
    eigen foutcode van kan maken ("vacation_active"); als StoreError vangt
    elke bestaande afhandeling hem gewoon mee."""

    def __init__(self, message: str = VACATION_ACTIVE) -> None:
        super().__init__(message)


def _active_row(conn: sqlite3.Connection) -> Optional[sqlite3.Row]:
    """De actieve vakantie (ended_on IS NULL), of None. De unieke index
    idx_vacations_one_active garandeert dat er hooguit één is."""
    return conn.execute(
        "SELECT * FROM vacations WHERE ended_on IS NULL"
        " ORDER BY id DESC LIMIT 1").fetchone()


def is_vacation_active(conn: sqlite3.Connection) -> bool:
    """Staat de vakantiemodus aan? Op een open verbinding, zodat aanroepers
    het binnen hun eigen transactie kunnen controleren."""
    return _active_row(conn) is not None


def raise_if_vacation(conn: sqlite3.Connection) -> None:
    """VacationActiveError als de vakantiemodus aanstaat. Voor de
    schrijffuncties die tijdens de vakantie geblokkeerd zijn; aanroepen
    binnen hun eigen BEGIN IMMEDIATE-transactie."""
    if is_vacation_active(conn):
        raise VacationActiveError()


def _public(row: sqlite3.Row) -> dict:
    """De publieke vorm van een actieve vakantie (state, sensor, switch)."""
    return {"active": True, "start_date": row["start_date"], "until": row["until"]}


def get_active_vacation(database_path: str) -> Optional[dict]:
    """{"active": True, "start_date", "until"} van de actieve vakantie, of
    None als de modus uitstaat. until is None bij een open einde."""
    with get_connection(database_path) as conn:
        row = _active_row(conn)
        return _public(row) if row else None


def parse_until(value: Any, invalid: str = INVALID_UNTIL) -> Optional[date]:
    """"Tot en met" uit elke aanroeper naar een date, of None (open einde).

    None en "" betekenen geen einddatum. Een date (ook een datetime: die
    telt als zijn dag) of een ISO-datumstring; Python 3.11+ accepteert ook
    de compacte vorm '20261010'. Opslaan gebeurt daarna altijd als
    date.isoformat(), zodat datums in de tabel als string vergelijkbaar
    blijven. Onleesbaar: een StoreError met de tekst `invalid` — ook
    gebruikt door absences.py, met een eigen tekst.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        # datetime is een subklasse van date; alleen de dag telt
        value = value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return date.fromisoformat(text)
        except ValueError as err:
            raise StoreError(invalid) from err
    raise StoreError(invalid)


def start_vacation(database_path: str, today: date, until: Any,
                   now_iso: str) -> dict:
    """Zet de vakantiemodus aan met start_date = today.

    until (laatste vakantiedag, t/m) is optioneel en moet op of na vandaag
    liggen. Staat de modus al aan, dan een StoreError — ook als twee
    aanroepen tegelijk aanzetten: de tweede strandt op de controle hieronder
    of, mocht die er toch langs komen, op de unieke index. Bij het aanzetten
    komt de momentopname van next_due van alle actieve taken in
    vacation_frozen. Geeft de publieke vorm terug.
    """
    until_date = parse_until(until)
    if until_date is not None and until_date < today:
        raise StoreError(UNTIL_IN_PAST)
    with get_connection(database_path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        if _active_row(conn) is not None:
            raise StoreError(ALREADY_ACTIVE)
        try:
            cursor = conn.execute(
                "INSERT INTO vacations (start_date, until, ended_on, created_at)"
                " VALUES (?, ?, NULL, ?)",
                (today.isoformat(),
                 until_date.isoformat() if until_date else None, now_iso))
        except sqlite3.IntegrityError as err:
            raise StoreError(ALREADY_ACTIVE) from err
        conn.execute(
            "INSERT INTO vacation_frozen (vacation_id, chore_id, next_due)"
            " SELECT ?, id, next_due FROM chores WHERE active = 1",
            (cursor.lastrowid,))
        return _public(conn.execute(
            "SELECT * FROM vacations WHERE id = ?", (cursor.lastrowid,)).fetchone())


def update_vacation(database_path: str, until: Any, today: date) -> dict:
    """Wijzig of wis de laatste vakantiedag van de actieve vakantie.

    None of "" wist hem (open einde). Een datum moet op of na vandaag én op
    of na de eerste vakantiedag liggen. Staat er geen vakantie aan, dan een
    StoreError. Geeft de publieke vorm terug.
    """
    until_date = parse_until(until)
    with get_connection(database_path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = _active_row(conn)
        if row is None:
            raise StoreError(NOT_ACTIVE)
        start = date.fromisoformat(row["start_date"])
        if until_date is not None and until_date < max(today, start):
            raise StoreError(UNTIL_IN_PAST)
        conn.execute(
            "UPDATE vacations SET until = ? WHERE id = ?",
            (until_date.isoformat() if until_date else None, row["id"]))
        return _public(conn.execute(
            "SELECT * FROM vacations WHERE id = ?", (row["id"],)).fetchone())


def _end(conn: sqlite3.Connection, vacation: sqlite3.Row, resume: date,
         now_iso: str) -> dict:
    """Beëindig `vacation` op een verbinding die al in BEGIN IMMEDIATE staat.

    De eerste schrijfactie is de bewaking: ended_on zetten mag alleen als
    hij nog leeg is (rowcount 1). Een tweede einde — dubbele tik, switch en
    panel tegelijk, de nachtjob ernaast — krijgt zo een StoreError en
    schuift de taken niet nog eens op.

    resume vóór de startdag wordt de startdag (nul dagen, niets
    verschoven). Per actieve taak: frozen als de momentopname bestaat en nog
    gelijk is aan next_due; nieuwe datum via shift_after_vacation, alleen
    geschreven bij een wijziging. rotation_index blijft staan. De
    momentopname gaat daarna weg.
    """
    start = date.fromisoformat(vacation["start_date"])
    resume = max(resume, start)
    guarded = conn.execute(
        "UPDATE vacations SET ended_on = ? WHERE id = ? AND ended_on IS NULL",
        (resume.isoformat(), vacation["id"]))
    if guarded.rowcount != 1:
        raise StoreError(NOT_ACTIVE)

    snapshot = {row["chore_id"]: row["next_due"] for row in conn.execute(
        "SELECT chore_id, next_due FROM vacation_frozen WHERE vacation_id = ?",
        (vacation["id"],))}
    changes = []
    for chore in conn.execute(
            "SELECT id, schedule_type, schedule_config, next_due FROM chores"
            " WHERE active = 1 ORDER BY next_due, name").fetchall():
        old = date.fromisoformat(chore["next_due"])
        new = shift_after_vacation(
            chore["schedule_type"], json.loads(chore["schedule_config"]), old,
            start, resume, frozen=snapshot.get(chore["id"]) == chore["next_due"])
        if new != old:
            conn.execute(
                "UPDATE chores SET next_due = ?, updated_at = ? WHERE id = ?",
                (new.isoformat(), now_iso, chore["id"]))
            changes.append((chore["id"], old.isoformat(), new.isoformat()))
    conn.execute("DELETE FROM vacation_frozen WHERE vacation_id = ?", (vacation["id"],))
    return {
        "start_date": vacation["start_date"],
        "until": vacation["until"],
        "ended_on": resume.isoformat(),
        "days": (resume - start).days,
        "changes": changes,
    }


def end_vacation(database_path: str, resume: date, now_iso: str) -> dict:
    """Zet de vakantiemodus uit; resume is de dag waarop het weer gewoon
    loopt (handmatig: vandaag). Staat er geen vakantie aan, dan een
    StoreError. Alles in één transactie.

    Geeft {start_date, until, ended_on, days, changes} terug; changes is een
    lijst (taak-id, oude next_due, nieuwe next_due) zoals bij de nachtelijke
    rol.
    """
    with get_connection(database_path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        vacation = _active_row(conn)
        if vacation is None:
            raise StoreError(NOT_ACTIVE)
        return _end(conn, vacation, resume, now_iso)


def end_due_vacation(database_path: str, today: date, now_iso: str) -> Optional[dict]:
    """Beëindig een verlopen vakantie: actief, met een laatste dag die vóór
    vandaag ligt. resume is dan de dag ná until — ook als HA dagen uit
    stond: wat na de geplande vakantie lag, was gewone tijd, en de rol die
    hierna draait haalt de achterstand van die dagen in.

    Voor de nachtjob en het opstarten. Geeft hetzelfde als end_vacation, of
    None als er niets te beëindigen viel. Controle en einde in één
    transactie, zodat een gelijktijdig handmatig einde niet tot een fout of
    een dubbele verschuiving leidt.
    """
    with get_connection(database_path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        vacation = _active_row(conn)
        if vacation is None or vacation["until"] is None:
            return None
        until = date.fromisoformat(vacation["until"])
        if until >= today:
            return None
        return _end(conn, vacation, until + timedelta(days=1), now_iso)


def _monday(day: date) -> date:
    """Maandag van de week van `day` — hetzelfde als completions.week_start,
    hier apart omdat completions.py deze module importeert."""
    return day - timedelta(days=day.isoweekday() - 1)


def span_weeks(start_date: str, until: Optional[str], ended_on: Optional[str],
               today: date) -> set:
    """Maandagen van de weken die een vakantie of afwezigheid (deels) beslaat.

    Een beëindigde beslaat [start_date, ended_on − 1]: de dag van terugkomst
    is weer een gewone dag. Een lopende beslaat [start_date, min(vandaag,
    until)], zonder until tot en met vandaag. Een leeg bereik (aan en uit op
    dezelfde dag) levert niets op: die zette niets stil.
    """
    first = date.fromisoformat(start_date)
    if ended_on is not None:
        last = date.fromisoformat(ended_on) - timedelta(days=1)
    elif until is not None:
        last = min(today, date.fromisoformat(until))
    else:
        last = today
    weeks = set()
    if last < first:
        return weeks
    cursor = _monday(first)
    while cursor <= last:
        weeks.add(cursor)
        cursor += timedelta(days=7)
    return weeks


def vacation_weeks(conn: sqlite3.Connection, today: date,
                   assignee_id: Optional[str] = None) -> set:
    """Maandagen van de neutrale weken van de streak (§5.3): weken die
    (deels) in een vakantie vallen, en met assignee_id ook de weken die
    (deels) in een afwezigheid van die persoon vallen (tabel absences,
    v2.7). Een vakantie geldt voor iedereen, een afwezigheid alleen voor
    wie weg was. Het bereik per vakantie of afwezigheid: zie span_weeks.

    De afwezigheden worden hier met eigen SQL gelezen, zoals de taken in
    deze module: completions.py importeert deze module, en absences.py
    importeert hem ook (parse_until) — andersom zou een kring worden.
    """
    rows = conn.execute("SELECT start_date, until, ended_on FROM vacations").fetchall()
    if assignee_id is not None:
        rows += conn.execute(
            "SELECT start_date, until, ended_on FROM absences WHERE assignee_id = ?",
            (assignee_id,)).fetchall()
    weeks = set()
    for row in rows:
        weeks |= span_weeks(row["start_date"], row["until"], row["ended_on"], today)
    return weeks
