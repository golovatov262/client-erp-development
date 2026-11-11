import io
import unittest
import zipfile
from unittest.mock import MagicMock, patch

from backend.nbki_import import import_payloads, parse_receipt_zip


def _zip_with(xml_bytes: bytes) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("receipt.xml", xml_bytes)
        archive.writestr("receipt.xml.sig", b"signature-placeholder")
    return buffer.getvalue()


class ReceiptReplacementTests(unittest.TestCase):
    def test_receipt_replaces_only_its_own_errors_even_when_empty(self):
        for kind in (1, 2):
            for errors in ([], [{'error_code': 'E001'}]):
                with self.subTest(kind=kind, errors=errors):
                    self.check_import(kind, errors)

    def test_import_without_receipt_preserves_errors(self):
        self.check_import(None, [])

    def check_import(self, kind, errors):
        source = dict(reg_number='REG1', document_time='2026-11-01',
                      schema_version='5.1', xml_sha256='hash', xml_gzip=b'xml',
                      subjects_count=0, events_count=0, deals={}, events=[],
                      collateral_events=[])
        receipt = dict(reg_number='REG1', kind=kind, status='accepted',
                       events_received=0, accepted=0, rejected=0, errors=errors)
        conn = MagicMock()
        cur = conn.cursor.return_value.__enter__.return_value
        cur.fetchone.side_effect = [(17, 'hash'), (17,)]
        with patch('backend.nbki_import.parse_source_xml', return_value=source), \
             patch('backend.nbki_import.parse_receipt_zip', return_value=receipt), \
             patch('backend.nbki_import.resolve_source_org_id', return_value=1):
            import_payloads(conn, [b'xml'], [b'receipt'] if kind else [])
        deletes = [call.args for call in cur.execute.call_args_list
                   if 'DELETE FROM nbki_receipt_errors' in call.args[0]]
        inserts = [call.args for call in cur.execute.call_args_list
                   if 'INSERT INTO nbki_receipt_errors' in call.args[0]]
        self.assertEqual(len(deletes), 1 if kind else 0)
        if kind:
            self.assertEqual(deletes[0][1], (17, kind))
        self.assertEqual(len(inserts), len(errors) if kind else 0)


class ReceiptParsingTests(unittest.TestCase):
    def test_ticket1_rejection_extracts_envelope_errors(self):
        xml = """<?xml version="1.0" encoding="utf-8"?>
        <NotificationOfReceipt>
          <schemaVersion>5.1</schemaVersion>
          <sourceId>QY01GG000001</sourceId>
          <outgoingDocDateTime>2026-11-01T10:00:00+03:00</outgoingDocDateTime>
          <outgoingDocNumber>QY01GG000001_20261101_100000</outgoingDocNumber>
          <acceptanceStatusFail/>
          <Errors><errorCode>E001</errorCode><errorMessage>Неверная подпись</errorMessage></Errors>
          <Errors><errorCode>E002</errorCode></Errors>
          <fileName>file.xml</fileName>
          <fileHash>abc</fileHash>
          <docDateTime>2026-11-01T10:05:00+03:00</docDateTime>
          <sendingDateTime>2026-11-01T10:06:00+03:00</sendingDateTime>
        </NotificationOfReceipt>"""
        result = parse_receipt_zip(_zip_with(xml.encode("utf-8")))
        self.assertEqual(result["kind"], 1)
        self.assertEqual(result["status"], "rejected")
        self.assertEqual(len(result["errors"]), 2)
        self.assertEqual(result["errors"][0], {"error_code": "E001", "error_message": "Неверная подпись"})
        self.assertEqual(result["errors"][1], {"error_code": "E002", "error_message": None})

    def test_ticket2_partial_extracts_per_event_errors(self):
        xml = """<?xml version="1.0" encoding="utf-8"?>
        <NotificationOfAcceptance>
          <schemaVersion>5.1</schemaVersion>
          <DocInfo>
            <sourceId>QY01GG000001</sourceId>
            <dataReceivedStatus>PARTIAL</dataReceivedStatus>
            <outgoingDocDateTime>2026-11-01T10:00:00+03:00</outgoingDocDateTime>
            <outgoingDocNumber>QY01GG000001_20261101_100000</outgoingDocNumber>
            <incomingDocDateTime>2026-11-01T11:00:00+03:00</incomingDocDateTime>
            <incomingDocNumber>IN123</incomingDocNumber>
            <docDateTime>2026-11-01T11:05:00+03:00</docDateTime>
            <fileName>file.xml</fileName>
            <fileHash>abc</fileHash>
            <subjectsReceived>10</subjectsReceived>
            <eventsReceived>10</eventsReceived>
            <eventsAccepted>9</eventsAccepted>
            <eventsRejected>1</eventsRejected>
          </DocInfo>
          <Errors>
            <Error errorNum="1">
              <eventDateTime>2026-10-27T10:45:12+03:00</eventDateTime>
              <errorCode>FORMAT_ERROR</errorCode>
              <errorMessage>Неверный формат поля</errorMessage>
              <uid>6938d6de-78aa-11ee-8ca6-18c04d93e059-0</uid>
              <orderNum>5</orderNum>
              <blockName>FL_25_26_27_28_Group</blockName>
              <fieldName>debtSum</fieldName>
              <fieldValue>-100.00</fieldValue>
            </Error>
          </Errors>
          <sendingDateTime>2026-11-01T11:06:00+03:00</sendingDateTime>
        </NotificationOfAcceptance>"""
        result = parse_receipt_zip(_zip_with(xml.encode("utf-8")))
        self.assertEqual(result["kind"], 2)
        self.assertEqual(result["status"], "partial")
        self.assertEqual(len(result["errors"]), 1)
        error = result["errors"][0]
        self.assertEqual(error["error_num"], 1)
        self.assertEqual(error["error_code"], "FORMAT_ERROR")
        self.assertEqual(error["uid"], "6938d6de-78aa-11ee-8ca6-18c04d93e059-0")
        self.assertEqual(error["block_name"], "FL_25_26_27_28_Group")
        self.assertEqual(error["field_name"], "debtSum")
        self.assertEqual(error["field_value"], "-100.00")

    def test_ticket2_accepted_has_no_errors(self):
        xml = """<?xml version="1.0" encoding="utf-8"?>
        <NotificationOfAcceptance>
          <schemaVersion>5.1</schemaVersion>
          <DocInfo>
            <sourceId>QY01GG000001</sourceId>
            <dataReceivedStatus>ACCEPTED</dataReceivedStatus>
            <outgoingDocDateTime>2026-11-01T10:00:00+03:00</outgoingDocDateTime>
            <outgoingDocNumber>QY01GG000001_20261101_100000</outgoingDocNumber>
            <incomingDocDateTime>2026-11-01T11:00:00+03:00</incomingDocDateTime>
            <incomingDocNumber>IN123</incomingDocNumber>
            <docDateTime>2026-11-01T11:05:00+03:00</docDateTime>
            <fileName>file.xml</fileName>
            <fileHash>abc</fileHash>
            <subjectsReceived>10</subjectsReceived>
            <eventsReceived>10</eventsReceived>
            <eventsAccepted>10</eventsAccepted>
            <eventsRejected>0</eventsRejected>
          </DocInfo>
          <sendingDateTime>2026-11-01T11:06:00+03:00</sendingDateTime>
        </NotificationOfAcceptance>"""
        result = parse_receipt_zip(_zip_with(xml.encode("utf-8")))
        self.assertEqual(result["status"], "accepted")
        self.assertEqual(result["errors"], [])


if __name__ == "__main__":
    unittest.main()
