import unittest
from unittest.mock import MagicMock, patch

from backend.api.index import handle_nbki


class NbkiSummaryTests(unittest.TestCase):
    def test_counts_survive_file_listing(self):
        error = {'receipt_kind': 2, 'error_code': 'FORMAT_ERROR'}
        for files in ([], [
            ('REG1', '5.1', None, 2, 3, 'partial', 2, 1, False, [error]),
            ('REG2', '5.1', None, 1, 1, 'accepted', 1, 0, True, None),
        ]):
            with self.subTest(file_count=len(files)):
                cur = MagicMock()
                cur.fetchone.side_effect = [(10, 6, 2, 2, 5, 4, 1),
                                            (20, 18, 2, 12, 4, 2), (30, 3)]
                cur.fetchall.return_value = files
                with patch('backend.api.index.resolve_source_org_id', return_value=1):
                    result = handle_nbki('GET', {'action': 'summary'}, {},
                                         {'role': 'admin'}, cur, MagicMock())
                self.assertEqual([result[key] for key in (
                    'total', 'matched', 'review', 'not_in_crm',
                    'reported_accepted', 'accepted_and_matched', 'guarantors')],
                    [10, 6, 2, 2, 5, 4, 1])
                self.assertEqual(result['event_rows'], 30)
                self.assertEqual(len(result['files']), len(files))
                if files:
                    self.assertEqual(result['files'][0]['errors'], [error])
                    self.assertEqual(result['files'][1]['errors'], [])


if __name__ == '__main__':
    unittest.main()
