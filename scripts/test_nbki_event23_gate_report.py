import unittest
from unittest.mock import MagicMock, patch

from backend.nbki_event23_xml import (assess_event_generation,
                                      generation_readiness, event_readiness_report)
from backend.nbki_outbox import readiness_report
from scripts.nbki_event23_gate_report import report


class GateReportTest(unittest.TestCase):
    def test_schema_exception_does_not_claim_strict_validity_or_send_readiness(self):
        result = generation_readiness({'xsd_valid': False,
            'xsd_status': 'accepted_deviations', 'xsd_errors': ['expected sizeCode']})
        self.assertTrue(result['can_generate_xml'])
        self.assertFalse(result['xsd_valid'])
        self.assertFalse(result['ready_to_send'])

    def test_assessment_returns_exporter_result_and_blocker(self):
        expected = generation_readiness({'xsd_valid': True, 'xsd_status': 'valid', 'xsd_errors': []})
        with patch('backend.nbki_event23_xml.build_event23_xml', return_value={'readiness': expected}):
            self.assertEqual(assess_event_generation(None, 2, 70), expected)
        with patch('backend.nbki_event23_xml.build_event23_xml', side_effect=ValueError('Нет времени')):
            result = assess_event_generation(None, 2, 70)
            self.assertFalse(result['can_generate_xml'])
            self.assertEqual(result['blockers'], ['Нет времени'])
            self.assertEqual(result['xsd_status'], 'not_validated')

    def test_report_has_no_historical_cutoff_or_pagination(self):
        cur = MagicMock()
        cur.fetchall.return_value = [(i, 1, 'contract', i) for i in range(1, 502)]
        ready = generation_readiness({'xsd_valid': True, 'xsd_status': 'valid', 'xsd_errors': []})
        with patch('backend.nbki_event23_xml.assess_event_generation', return_value=ready):
            result = report(cur, 2)
        self.assertEqual(result['candidate_count'], 501)
        self.assertEqual(result['can_generate_count'], 501)
        query = cur.execute.call_args.args[0]
        self.assertNotIn('LIMIT', query)
        self.assertNotIn('nbki_1c', query)

    def test_loan_report_aggregates_mixed_events_and_no_events(self):
        cur = MagicMock(); cur.fetchall.return_value = [(1,), (2,)]
        events = {'candidate_count': 2, 'can_generate_count': 1, 'rows': [
            {'loan_id': 1, 'can_generate_xml': True, 'blockers': []},
            {'loan_id': 1, 'can_generate_xml': False, 'blockers': ['Нет времени']}]}
        inspection = {'contract_no': 'contract', 'uid': 'uid',
                      'snapshot': {'loan': {'status': 'active'}}, 'checks': {'crm_issues': []}}
        with patch('backend.nbki_event23_xml.event_readiness_report', return_value=events), \
             patch('backend.nbki_outbox.inspect_loan', return_value=inspection):
            result = readiness_report(cur, 2)
        self.assertEqual(result['xml_ready'], 1)
        self.assertEqual(result['ready_event_count'], 1)
        self.assertEqual(result['rows'][0]['missing_fields'], ['Нет времени'])
        self.assertFalse(result['rows'][1]['xml_ready'])
        self.assertEqual(result['rows'][1]['missing_fields'], ['Нет событий в очереди CRM'])

class StrictXsdStatusTests(unittest.TestCase):
    def test_valid_xml_passes_and_all_schema_errors_fail(self):
        from tempfile import TemporaryDirectory
        from pathlib import Path
        from backend.nbki_event23_xml import _validate_xsd, XsdValidationError
        schema = '''<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
          <xs:element name="Document"><xs:complexType><xs:sequence>
            <xs:element name="sizeCode" type="xs:string"/>
            <xs:element name="payCurrency" type="xs:integer"/>
          </xs:sequence></xs:complexType></xs:element></xs:schema>'''
        with TemporaryDirectory() as folder:
            path = Path(folder); (path / 'Main.xsd').write_text(schema)
            with patch('backend.nbki_event23_xml.XSD_DIR', path):
                valid = _validate_xsd(b'<Document><sizeCode>-</sizeCode><payCurrency>1</payCurrency></Document>')
                self.assertTrue(valid['xsd_valid'])
                with self.assertRaises(XsdValidationError):
                    _validate_xsd(b'<Document><payCurrency>1</payCurrency></Document>')
                with self.assertRaises(XsdValidationError):
                    _validate_xsd(b'<Document><sizeCode>-</sizeCode><payCurrency>invalid</payCurrency></Document>')


if __name__ == '__main__':
    unittest.main()
