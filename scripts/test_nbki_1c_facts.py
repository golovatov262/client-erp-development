"""Tests for the separate, provenance-preserving 1C fact projection."""

import unittest

from backend.nbki_1c_facts import select_indicators


class OneCFactsTests(unittest.TestCase):
    def test_preserves_code_and_literal_value(self):
        result = select_indicators(
            {'7': 'uid', '13': 'Договор займа', '56': '31,801', '57': ''},
            {7: 'ФЛ_17.1', 13: 'ФЛ_18.3', 56: 'ФЛ_22.1', 57: 'ФЛ_22.2'},
        )
        self.assertEqual(result, {
            '13': {'code': 'ФЛ_18.3', 'value': 'Договор займа'},
            '56': {'code': 'ФЛ_22.1', 'value': '31,801'},
        })


if __name__ == '__main__':
    unittest.main()
