"""Import historical GUTDF files and receipt results into the CRM registry.

This module never changes loans or members. A UID is linked only after an exact,
unambiguous contract match and agreement of the available identity fields.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import re
from io import BytesIO
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path


SOURCE_ID = "QY01GG000001"
SOURCE_INN = "4307012081"
SCHEMA_VERSION = "5.1"


def _text(parent: ET.Element | None, tag: str) -> str | None:
    if parent is None:
        return None
    node = parent.find(tag)
    return (node.text or "").strip() or None if node is not None else None


def _date(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None


def _datetime(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def _amount(value: str | None) -> Decimal | None:
    if not value:
        return None
    try:
        return Decimal(value)
    except InvalidOperation as exc:
        raise ValueError("Некорректная сумма в XML") from exc


def _norm(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").replace("Ё", "Е").replace("ё", "е")).strip().upper()


@dataclass
class Deal:
    uid: str
    contract_no: str
    subject_type: str
    role: str
    subject_name: str | None
    subject_inn: str | None
    birth_date: date | None
    deal_date: date | None
    original_amount: Decimal | None
    currency: str | None
    deal_code: str | None
    kind_code: str | None
    purpose_code: str | None
    last_event_time: datetime | None
    event_count: int = 0

    def identity(self) -> tuple:
        return (self.contract_no, self.subject_type, self.role, _norm(self.subject_name),
                self.subject_inn, self.birth_date, self.deal_date, self.original_amount)


def parse_source_xml(raw: bytes) -> dict:
    if len(raw) > 25 * 1024 * 1024 or b"<!DOCTYPE" in raw.upper():
        raise ValueError("XML слишком большой или содержит DTD")
    root = ET.fromstring(raw)
    if root.tag != "Document":
        raise ValueError("Ожидается документ GUTDF")
    attrs = root.attrib
    if attrs.get("sourceID") != SOURCE_ID or attrs.get("inn") != SOURCE_INN:
        raise ValueError("Документ относится к другому источнику")
    if attrs.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError("Неподдерживаемая версия схемы")
    reg_number = attrs.get("regNumberDoc", "")
    if not re.fullmatch(r"QY01GG000001_\d{8}_\d{6}", reg_number):
        raise ValueError("Неверный регистрационный номер документа")

    deals: dict[str, Deal] = {}
    events: list[dict] = []
    event_count = 0
    subjects = list(root.findall("./Data/Subject_FL")) + list(root.findall("./Data/Subject_UL"))
    for subject in subjects:
        is_fl = subject.tag == "Subject_FL"
        title = subject.find("Title")
        if is_fl:
            name_block = title.find(".//FL_1_Name") if title is not None else None
            name = " ".join(filter(None, (_text(name_block, "lastName"),
                                           _text(name_block, "firstName"),
                                           _text(name_block, "middleName")))) or None
            birth = _date(_text(title.find("FL_3_Birth") if title is not None else None, "birthDate"))
            tax = title.find(".//FL_6_Tax/taxNum") if title is not None else None
            if tax is None and title is not None:
                tax = title.find(".//FL_6_Tax//taxNum")
            inn = (tax.text or "").strip() or None if tax is not None else None
        else:
            name_block = title.find("UL_1_Name") if title is not None else None
            name = _text(name_block, "fullName") or _text(name_block, "shortName")
            birth = None
            tax = title.find(".//UL_4_Tax//taxNum") if title is not None else None
            inn = (tax.text or "").strip() or None if tax is not None else None
        for event in subject.findall("./Events/*"):
            event_count += 1
            uid_block = event.find("FL_17_DealUid" if is_fl else "UL_10_DealUid")
            events.append({"order_num": int(event.attrib["orderNum"]),
                           "uid": _text(uid_block, "uid"), "event_name": event.tag,
                           "event_time": _datetime(event.attrib.get("eventDateTime")),
                           "operation_code": event.attrib.get("operationCode")})
            if uid_block is None:
                continue
            uid, number = _text(uid_block, "uid"), _text(uid_block, "num")
            if not uid or not number:
                raise ValueError("В событии договора отсутствует УИД или номер")
            deal_block = event.find("FL_18_Deal" if is_fl else "UL_11_Deal")
            role_code = _text(deal_block, "role")
            if role_code not in ('1', '2'):
                raise ValueError('Неизвестная роль участника сделки в XML')
            role = 'borrower' if role_code == '1' else 'guarantor'
            amount_block = event.find("FL_19_Amount" if is_fl else "UL_12_Amount")
            when = _datetime(event.attrib.get("eventDateTime"))
            current = Deal(uid, number, "FL" if is_fl else "UL", role, name, inn, birth,
                           _date(_text(uid_block, "openDate")), _amount(_text(amount_block, "sum")),
                           _text(amount_block, "currency"), _text(deal_block, "code"),
                           _text(deal_block, "kindCode"), _text(deal_block, "purposeCode"), when, 1)
            previous = deals.get(uid)
            if previous:
                if previous.identity() != current.identity():
                    raise ValueError("В одном файле разные реквизиты сделки с одинаковым УИД")
                previous.event_count += 1
                if when and (previous.last_event_time is None or when > previous.last_event_time):
                    previous.last_event_time = when
            else:
                deals[uid] = current
    if len(subjects) != int(attrs.get("subjectsCount", -1)) or event_count != int(attrs.get("groupBlocksCount", -1)):
        raise ValueError("Количество субъектов или событий не совпадает с заголовком")
    if len({item["order_num"] for item in events}) != len(events):
        raise ValueError("Порядковые номера событий в файле повторяются")
    by_number = defaultdict(set)
    for deal in deals.values():
        by_number[deal.contract_no].add(deal.uid)
    if any(len(uids) > 1 for uids in by_number.values()):
        raise ValueError("В файле один номер договора связан с несколькими УИД")
    return {"reg_number": reg_number, "document_time": _datetime(attrs.get("dateTimeDoc")),
            "schema_version": attrs["schemaVersion"], "subjects_count": len(subjects),
            "events_count": event_count, "xml_sha256": hashlib.sha256(raw).hexdigest(),
            "xml_gzip": gzip.compress(raw), "deals": deals, "events": events}


def parse_receipt_zip(payload: bytes | Path) -> dict:
    source = payload if isinstance(payload, Path) else BytesIO(payload)
    with zipfile.ZipFile(source) as archive:
        names = archive.namelist()
        xml_names = [name for name in names if name.lower().endswith(".xml")]
        if len(xml_names) != 1 or xml_names[0] + ".sig" not in names:
            raise ValueError("В квитанции должны быть XML и подпись")
        if archive.getinfo(xml_names[0]).file_size > 2 * 1024 * 1024:
            raise ValueError("Квитанция слишком большая")
        root = ET.fromstring(archive.read(xml_names[0]))
    if root.tag == "NotificationOfReceipt":
        reg_number = _text(root, "outgoingDocNumber")
        status = "received" if root.find("acceptanceStatusOK") is not None else "rejected"
        return {"reg_number": reg_number, "kind": 1, "status": status,
                "receipt_time": _datetime(_text(root, "docDateTime"))}
    if root.tag == "NotificationOfAcceptance":
        info = root.find("DocInfo")
        status_code = _text(info, "dataReceivedStatus")
        accepted = int(_text(info, "eventsAccepted") or 0)
        rejected = int(_text(info, "eventsRejected") or 0)
        status = "accepted" if status_code == "ACCEPTED" and rejected == 0 else (
            "partial" if accepted else "rejected")
        return {"reg_number": _text(info, "outgoingDocNumber"), "kind": 2,
                "status": status, "accepted": accepted, "rejected": rejected,
                "events_received": int(_text(info, "eventsReceived") or 0),
                "receipt_time": _datetime(_text(info, "docDateTime"))}
    raise ValueError("Неизвестный формат квитанции")


def _match_loan(cur, org_id: int, deal: Deal) -> tuple[int | None, str, str | None]:
    if deal.role == 'guarantor':
        return None, 'guarantor', 'УИД поручителя: договор поручительства не является займом CRM'
    cur.execute("""SELECT l.id, l.amount, l.start_date, m.member_type, m.inn,
                          m.birth_date, m.last_name, m.first_name, m.middle_name, m.company_name
                   FROM loans l JOIN members m ON m.id=l.member_id
                   WHERE l.org_id=%s AND l.contract_no=%s""", (org_id, deal.contract_no))
    rows = cur.fetchall()
    if not rows:
        return None, "not_in_crm", "Номер договора отсутствует в CRM"
    if len(rows) != 1:
        return None, "review", "Номер договора неоднозначен"
    row = rows[0]
    loan_id, amount, start_date, kind, inn, birth, last, first, middle, company = row
    problems = []
    if kind != deal.subject_type:
        problems.append("тип заемщика")
    if deal.subject_inn and inn and deal.subject_inn != inn:
        problems.append("ИНН")
    crm_name = " ".join(filter(None, (last, first, middle))) if kind == "FL" else company
    if deal.subject_name and crm_name and _norm(deal.subject_name) != _norm(crm_name):
        problems.append("имя заемщика")
    if deal.birth_date and birth and deal.birth_date != birth:
        problems.append("дата рождения")
    if deal.original_amount is not None and amount is not None and abs(deal.original_amount - amount) > Decimal("0.01"):
        problems.append("сумма договора")
    if deal.deal_date and start_date and deal.deal_date != start_date:
        problems.append("дата договора")
    if not deal.subject_name or not crm_name or deal.original_amount is None or amount is None:
        problems.append("недостаточно данных для проверки")
    if problems:
        return None, "review", "Расхождение: " + ", ".join(problems)
    return loan_id, "matched", None


def resolve_source_org_id(cur) -> int:
    """Resolve the source to its sole organization with loans if INN is duplicated."""
    cur.execute("""SELECT o.id, COUNT(l.id) AS loan_count
                   FROM organizations o LEFT JOIN loans l ON l.org_id=o.id
                   WHERE o.inn=%s GROUP BY o.id""", (SOURCE_INN,))
    orgs = cur.fetchall()
    active_orgs = [org_id for org_id, loan_count in orgs if loan_count > 0]
    if len(orgs) == 1:
        return orgs[0][0]
    if len(active_orgs) == 1:
        return active_orgs[0]
    raise ValueError("Нельзя однозначно определить организацию источника по ИНН и договорам")


def import_payloads(conn, xml_payloads: list[bytes], receipt_payloads: list[bytes]) -> dict:
    files = sorted((parse_source_xml(raw) for raw in xml_payloads),
                   key=lambda item: item["document_time"])
    receipts = {}
    for receipt_payload in receipt_payloads:
        item = parse_receipt_zip(receipt_payload)
        if item["reg_number"] not in {source["reg_number"] for source in files}:
            raise ValueError("Квитанция относится к другому XML")
        previous = receipts.get(item["reg_number"])
        if previous is None or item["kind"] > previous["kind"]:
            receipts[item["reg_number"]] = item
    seen_uid: dict[str, Deal] = {}
    seen_number: dict[str, str] = {}
    for source in files:
        for uid, deal in source["deals"].items():
            old = seen_uid.get(uid)
            if old and old.identity() != deal.identity():
                raise ValueError("Разные реквизиты сделки с одним УИД между файлами")
            if deal.contract_no in seen_number and seen_number[deal.contract_no] != uid:
                raise ValueError("Один номер договора связан с разными УИД между файлами")
            seen_uid[uid] = deal
            seen_number[deal.contract_no] = uid

    statuses: dict[str, str] = {}
    with conn.cursor() as cur:
        org_id = resolve_source_org_id(cur)
        for source in files:
            reg = source["reg_number"]
            receipt = receipts.get(reg)
            if receipt and receipt["kind"] == 2 and receipt["events_received"] != source["events_count"]:
                raise ValueError("Число событий в квитанции не совпадает с исходным XML")
            cur.execute("SELECT id, xml_sha256 FROM nbki_source_files WHERE reg_number=%s", (reg,))
            previous_file = cur.fetchone()
            if previous_file and previous_file[1] != source["xml_sha256"]:
                raise ValueError("Регистрационный номер уже используется для другого XML")
            cur.execute("""INSERT INTO nbki_source_files
                (org_id, source_id, reg_number, schema_version, document_time, xml_sha256, xml_gzip,
                 subjects_count, events_count, receipt_status, events_accepted, events_rejected, receipt_time)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (reg_number) DO UPDATE SET
                    receipt_status=CASE
                        WHEN nbki_source_files.receipt_status IN ('accepted', 'partial')
                            THEN nbki_source_files.receipt_status
                        WHEN EXCLUDED.receipt_status='unknown' THEN nbki_source_files.receipt_status
                        ELSE EXCLUDED.receipt_status END,
                    events_accepted=COALESCE(EXCLUDED.events_accepted, nbki_source_files.events_accepted),
                    events_rejected=COALESCE(EXCLUDED.events_rejected, nbki_source_files.events_rejected),
                    receipt_time=COALESCE(EXCLUDED.receipt_time, nbki_source_files.receipt_time)
                RETURNING id""", (org_id, SOURCE_ID, reg, source["schema_version"],
                    source["document_time"], source["xml_sha256"], source["xml_gzip"], source["subjects_count"],
                    source["events_count"], receipt["status"] if receipt else "unknown",
                    receipt.get("accepted") if receipt else None,
                    receipt.get("rejected") if receipt else None,
                    receipt.get("receipt_time") if receipt else None))
            file_id = cur.fetchone()[0]
            deal_ids: dict[str, int] = {}
            for deal in source["deals"].values():
                loan_id, status, reason = _match_loan(cur, org_id, deal)
                statuses[deal.uid] = status
                cur.execute("SELECT id, contract_no, loan_id FROM nbki_deals WHERE org_id=%s AND uid=%s",
                            (org_id, deal.uid))
                existing = cur.fetchone()
                if existing and existing[1] != deal.contract_no:
                    raise ValueError("УИД уже связан с другим номером договора")
                if existing and existing[2] and loan_id and existing[2] != loan_id:
                    raise ValueError("УИД уже связан с другим договором CRM")
                cur.execute("""INSERT INTO nbki_deals
                    (org_id, uid, contract_no, subject_type, deal_role, subject_name, subject_inn, birth_date,
                     deal_date, original_amount, currency, deal_code, kind_code, purpose_code,
                     last_event_time, last_source_file_id, loan_id, match_status, match_reason,
                     reported_accepted, accepted_file_id)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (org_id, uid) DO UPDATE SET
                     last_event_time=CASE WHEN nbki_deals.last_event_time IS NULL
                         OR EXCLUDED.last_event_time > nbki_deals.last_event_time
                         THEN EXCLUDED.last_event_time ELSE nbki_deals.last_event_time END,
                     last_source_file_id=CASE WHEN nbki_deals.last_event_time IS NULL
                         OR EXCLUDED.last_event_time >= nbki_deals.last_event_time
                         THEN EXCLUDED.last_source_file_id ELSE nbki_deals.last_source_file_id END,
                     loan_id=COALESCE(nbki_deals.loan_id, EXCLUDED.loan_id),
                     deal_role=EXCLUDED.deal_role,
                     match_status=EXCLUDED.match_status, match_reason=EXCLUDED.match_reason,
                     reported_accepted=nbki_deals.reported_accepted OR EXCLUDED.reported_accepted,
                     accepted_file_id=CASE WHEN EXCLUDED.reported_accepted
                         AND (nbki_deals.accepted_file_id IS NULL OR
                              (SELECT document_time FROM nbki_source_files WHERE id=nbki_deals.accepted_file_id)
                              <= (SELECT document_time FROM nbki_source_files WHERE id=EXCLUDED.accepted_file_id))
                         THEN EXCLUDED.accepted_file_id ELSE nbki_deals.accepted_file_id END,
                     updated_at=NOW()
                    RETURNING id""", (org_id, deal.uid, deal.contract_no, deal.subject_type, deal.role,
                        deal.subject_name, deal.subject_inn, deal.birth_date, deal.deal_date,
                        deal.original_amount, deal.currency, deal.deal_code, deal.kind_code,
                        deal.purpose_code, deal.last_event_time, file_id, loan_id, status, reason,
                        bool(receipt and receipt["kind"] == 2 and receipt["status"] == "accepted"),
                        file_id if receipt and receipt["kind"] == 2 and receipt["status"] == "accepted" else None))
                deal_id = cur.fetchone()[0]
                deal_ids[deal.uid] = deal_id
                cur.execute("""INSERT INTO nbki_file_deals(source_file_id, deal_id, event_count, last_event_time)
                    VALUES(%s,%s,%s,%s) ON CONFLICT(source_file_id, deal_id) DO NOTHING""",
                            (file_id, deal_id, deal.event_count, deal.last_event_time))
            for event in source["events"]:
                cur.execute("""INSERT INTO nbki_file_events
                    (source_file_id, order_num, deal_id, event_name, event_time,
                     operation_code, reported_accepted)
                    VALUES (%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (source_file_id, order_num) DO UPDATE SET
                        reported_accepted=nbki_file_events.reported_accepted OR EXCLUDED.reported_accepted""",
                    (file_id, event["order_num"], deal_ids.get(event["uid"]),
                     event["event_name"], event["event_time"], event["operation_code"],
                     bool(receipt and receipt["kind"] == 2 and receipt["status"] == "accepted")))
    counts = Counter(statuses.values())
    return {"files": len(files), "unique_deals": len(seen_uid),
            "matched": counts["matched"], "review": counts["review"],
            "not_in_crm": counts["not_in_crm"], "guarantors": counts["guarantor"],
            "reported_accepted_deals": len({uid for f in files if receipts.get(f["reg_number"], {}).get("kind") == 2
                                            and receipts[f["reg_number"]]["status"] == "accepted"
                                            for uid in f["deals"]})}


def import_documents(conn, xml_paths: list[Path], receipt_paths: list[Path]) -> dict:
    return import_payloads(conn, [path.read_bytes() for path in xml_paths],
                           [path.read_bytes() for path in receipt_paths])


def main() -> None:
    parser = argparse.ArgumentParser(description="Сверка исторических XML НБКИ с CRM")
    parser.add_argument("--xml", action="append", required=True, type=Path)
    parser.add_argument("--receipt", action="append", default=[], type=Path)
    parser.add_argument("--apply", action="store_true", help="сохранить результат; без флага транзакция откатывается")
    args = parser.parse_args()
    import psycopg2
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        result = import_documents(conn, args.xml, args.receipt)
        if args.apply:
            conn.commit()
        else:
            conn.rollback()
        print(json.dumps({"applied": args.apply, **result}, ensure_ascii=False))
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
