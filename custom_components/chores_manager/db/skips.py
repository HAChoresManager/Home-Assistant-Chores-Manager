"""Overslaan en terugdraaien tegen het v2-schema (tabel skips).

Overslaan = deze keer doet niemand de taak. next_due rolt door naar de
eerstvolgende geplande keer (scheduling.next_due_after_skip), er komt geen
voltooiing (geen minuten, geen ranglijst, geen streak) en de beurt blijft
staan: rotation_index wordt hier nergens aangeraakt. Wel sluit een overslag de
lopende instantie af — completions._instance_start telt de laatste overslag
mee als grens, zodat half afgevinkte checklist- en counterrondes opnieuw
beginnen. De oude stappen blijven in feed en ranglijst staan.

Puur sqlite plus scheduling; geen HA. Importeert binnen db/ alleen connection
en errors (geen cycli: chores.py importeert deze module lokaal in
snooze_chore). Tijdstippen komen als ISO-string met offset binnen. Waar
voltooiingen en overslagen ten opzichte van elkaar geordend worden, gaat dat
als tijdstip (julianday), niet als string: in het teruggezette uur van de
wintertijdwissel sorteren de strings verkeerd om.

Bij gelijke tijdstippen kiezen de terugdraai-bewakingen de veilige kant: een
voltooiing óp het tijdstip van de overslag en een latere overslag met
hetzelfde tijdstip (hoger id) tellen als "erna", en blokkeren dus.

Overslaan en terugdraaien lezen en schrijven in één schrijftransactie
(BEGIN IMMEDIATE), net als complete_chore: zo kan geen tik of stap van een
ander apparaat tussen de controle en het schrijven door glippen.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import date
from typing import Optional

from ..scheduling.calculator import next_due_after_skip
from .connection import get_connection
from .errors import StoreError

NOT_DUE_YET = ("Alleen een taak die vandaag aan de beurt is of achterloopt"
               " kun je overslaan.")
CHANGED_MEANWHILE = "De taak is net gewijzigd; probeer het opnieuw."
UNKNOWN_SKIP = "Deze overslag bestaat niet (meer)."


def skip_chore(
    database_path: str,
    chore_id: str,
    assignee_id: Optional[str],
    today: date,
    now_iso: str,
    allow_upcoming: bool = False,
) -> dict:
    """Sla de huidige keer van een taak over en leg dat vast.

    assignee_id is wie oversloeg; None mag (automatisering, een kijker zonder
    gekoppelde persoon) en wordt NULL. Een opgegeven persoon moet bestaan en
    actief zijn, net als bij complete_chore.

    Standaard alleen voor een taak die vandaag aan de beurt is of achterloopt.
    allow_upcoming is er uitsluitend voor het oude snooze 'skip', dat ook een
    komende keer accepteerde (achterwaarts compatibel).

    Het doorschuiven is een compare-and-set op de net gelezen next_due: een
    dubbele tik of een tweede apparaat dat tegelijk overslaat, schuift de
    taak niet twee keer door maar krijgt een nette fout. Alles in één
    schrijftransactie — zonder datum geen logregel en omgekeerd, en geen
    afvinken dat tussen lezen en schrijven de ronde verandert. updated_at
    wordt now_iso, gelijk aan skipped_at: daaraan ziet _revert_blocker of de
    taak daarna nog gewijzigd is.

    Geeft {skip_id, chore_id, previous_next_due, new_next_due} terug.
    """
    with get_connection(database_path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT * FROM chores WHERE id = ?", (chore_id,)).fetchone()
        if row is None:
            raise StoreError(f"onbekende taak {chore_id!r}")
        if not row["active"]:
            raise StoreError(f"taak {chore_id!r} is niet actief")
        if assignee_id is not None:
            assignee = conn.execute(
                "SELECT id FROM assignees WHERE id = ? AND active = 1",
                (assignee_id,)).fetchone()
            if assignee is None:
                raise StoreError(f"onbekende of inactieve persoon {assignee_id!r}")

        previous = row["next_due"]
        due = date.fromisoformat(previous)
        if not allow_upcoming and due > today:
            raise StoreError(NOT_DUE_YET)
        new_due = next_due_after_skip(
            row["schedule_type"], json.loads(row["schedule_config"]), due, today
        ).isoformat()

        updated = conn.execute(
            "UPDATE chores SET next_due = ?, updated_at = ?"
            " WHERE id = ? AND next_due = ?",
            (new_due, now_iso, chore_id, previous))
        if updated.rowcount != 1:
            raise StoreError(CHANGED_MEANWHILE)
        cursor = conn.execute(
            "INSERT INTO skips (chore_id, assignee_id, skipped_at,"
            " previous_next_due, new_next_due) VALUES (?,?,?,?,?)",
            (chore_id, assignee_id, now_iso, previous, new_due))
        return {
            "skip_id": cursor.lastrowid,
            "chore_id": chore_id,
            "previous_next_due": previous,
            "new_next_due": new_due,
        }


def _revert_blocker(conn: sqlite3.Connection, skip: sqlite3.Row) -> Optional[str]:
    """Waarom deze overslag niet (meer) terug kan, of None als het kan.

    De ene plek waar de voorwaarden staan: revert_skip weigert met deze
    tekst, skip_feed zet can_revert op "geen tekst". `skip` heeft de kolommen
    van skips plus chore_active, chore_next_due en chore_updated_at van de
    taak.

    Terugdraaien mag alleen als er sinds het overslaan niets met de taak is
    gebeurd:
    - de taak is actief;
    - er is geen latere overslag van dezelfde taak (dus alleen de nieuwste
      per taak kan terug);
    - er is geen voltooiingsregel vanaf het overslaan — ook geen losse
      deelstap of tik: die hoort al bij de nieuwe ronde, en samenvoegen met
      de oude ronde zou de minuteninvariant van §3.4 breken (stappen dubbel,
      meer minuten dan duration);
    - next_due staat nog op wat de overslag ervan maakte, én de taak is
      sindsdien niet gewijzigd (updated_at niet later dan skipped_at): geen
      snooze, bewerking, handmatige datum of terugzetten uit het archief —
      ook niet als die toevallig op dezelfde datum uitkwam.
    De volgorde bepaalt alleen welke tekst je ziet: de meest verklarende eerst.
    """
    if not skip["chore_active"]:
        return "De taak is gearchiveerd; terugdraaien kan niet meer."
    later = conn.execute(
        "SELECT 1 FROM skips WHERE chore_id = ?"
        " AND (julianday(skipped_at) > julianday(?)"
        " OR (julianday(skipped_at) = julianday(?) AND id > ?)) LIMIT 1",
        (skip["chore_id"], skip["skipped_at"], skip["skipped_at"], skip["id"])
    ).fetchone()
    if later is not None:
        return ("De taak is daarna opnieuw overgeslagen; draai eerst die"
                " overslag terug.")
    worked = conn.execute(
        "SELECT 1 FROM completions WHERE chore_id = ?"
        " AND julianday(completed_at) >= julianday(?) LIMIT 1",
        (skip["chore_id"], skip["skipped_at"])).fetchone()
    if worked is not None:
        return ("Er is sinds het overslaan al aan de taak gewerkt; terugdraaien"
                " kan niet meer.")
    if skip["chore_next_due"] != skip["new_next_due"]:
        return ("De datum van de taak is sinds het overslaan gewijzigd;"
                " terugdraaien kan niet meer.")
    changed = conn.execute(
        "SELECT julianday(?) > julianday(?)",
        (skip["chore_updated_at"], skip["skipped_at"])).fetchone()[0]
    if changed:
        return ("De taak is sinds het overslaan gewijzigd; terugdraaien kan"
                " niet meer.")
    return None


# skips plus de drie taakvelden die _revert_blocker nodig heeft
_SKIP_WITH_CHORE = (
    "SELECT s.*, ch.active AS chore_active, ch.next_due AS chore_next_due,"
    " ch.updated_at AS chore_updated_at"
    " FROM skips s JOIN chores ch ON ch.id = s.chore_id")


def revert_skip(database_path: str, skip_id: int,
                now_iso: Optional[str] = None) -> dict:
    """"Toch niet overslaan": next_due terug naar previous_next_due en de
    logregel weg — alleen als _revert_blocker niets vindt, anders een
    StoreError met de reden.

    Controle en schrijven staan in één schrijftransactie (BEGIN IMMEDIATE);
    complete_chore en skip_chore vergrendelen net zo, dus een deelstap of
    tik van een ander apparaat valt helemaal vóór of helemaal ná deze
    controle. Het terugzetten is daarnaast, net als het overslaan, een
    compare-and-set (next_due moet nog op new_next_due staan).

    updated_at wordt het skipped_at van de nu nieuwste overgebleven overslag
    van deze taak: dan kan die op zijn beurt ook terug ("Toch niet
    overslaan" na elkaar). Is er geen overslag meer, dan now_iso, of zonder
    now_iso blijft updated_at staan (zoals bij undo_completion). De beurt is
    bij het overslaan niet aangeraakt en hoeft dus niet terug.

    Geeft {chore_id, next_due} terug.
    """
    with get_connection(database_path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        skip = conn.execute(_SKIP_WITH_CHORE + " WHERE s.id = ?", (skip_id,)).fetchone()
        if skip is None:
            raise StoreError(UNKNOWN_SKIP)
        blocker = _revert_blocker(conn, skip)
        if blocker:
            raise StoreError(blocker)
        previous_skip = conn.execute(
            "SELECT skipped_at FROM skips WHERE chore_id = ? AND id != ?"
            " ORDER BY julianday(skipped_at) DESC, id DESC LIMIT 1",
            (skip["chore_id"], skip_id)).fetchone()
        updated = conn.execute(
            "UPDATE chores SET next_due = ?, updated_at = COALESCE(?, ?, updated_at)"
            " WHERE id = ? AND next_due = ?",
            (skip["previous_next_due"],
             previous_skip[0] if previous_skip else None, now_iso,
             skip["chore_id"], skip["new_next_due"]))
        if updated.rowcount != 1:
            raise StoreError(CHANGED_MEANWHILE)
        deleted = conn.execute("DELETE FROM skips WHERE id = ?", (skip_id,))
        if deleted.rowcount != 1:
            # de exception rolt ook de datum hierboven terug
            raise StoreError(UNKNOWN_SKIP)
        return {"chore_id": skip["chore_id"], "next_due": skip["previous_next_due"]}


def skip_feed(database_path: str, limit: int = 100) -> list[dict]:
    """Overslaglog voor de activiteit, nieuwste eerst (skipped_at, bij gelijke
    tijd het hoogste id).

    Per regel: id, chore_id, chore_name, icon, assignee_id, assignee_name en
    color (beide None als niemand bekend is of de persoon verwijderd is),
    skipped_at, previous_next_due, new_next_due, en can_revert — exact de
    voorwaarden van revert_skip, dus hooguit één regel per taak.
    """
    with get_connection(database_path) as conn:
        rows = conn.execute(
            "SELECT s.*, ch.active AS chore_active, ch.next_due AS chore_next_due,"
            " ch.updated_at AS chore_updated_at, ch.name AS chore_name, ch.icon,"
            " a.name AS assignee_name, a.color"
            " FROM skips s JOIN chores ch ON ch.id = s.chore_id"
            " LEFT JOIN assignees a ON a.id = s.assignee_id"
            " ORDER BY s.skipped_at DESC, s.id DESC LIMIT ?", (limit,)).fetchall()
        return [
            {
                "id": row["id"],
                "chore_id": row["chore_id"],
                "chore_name": row["chore_name"],
                "icon": row["icon"],
                "assignee_id": row["assignee_id"],
                "assignee_name": row["assignee_name"],
                "color": row["color"],
                "skipped_at": row["skipped_at"],
                "previous_next_due": row["previous_next_due"],
                "new_next_due": row["new_next_due"],
                "can_revert": _revert_blocker(conn, row) is None,
            }
            for row in rows
        ]
