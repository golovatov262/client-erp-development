import io
import unittest
import zipfile

from backend.nbki_import import parse_receipt_zip


def _zip_with(xml_bytes: bytes) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("receipt.xml", xml_bytes)
        archive.writestr("receipt.xml.sig", b"signature-placeholder")
    return buffer.getvalue()


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
