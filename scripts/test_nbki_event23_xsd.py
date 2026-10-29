"""Parity check against an operator-supplied, checksum-pinned CBR XSD archive."""

import hashlib
import os
import unittest
from pathlib import Path
from zipfile import ZipFile

from lxml import etree

from backend.nbki_event23_readiness import MONETARY_BLOCKS, XSD_ARCHIVE_SHA256


class Event23XsdTests(unittest.TestCase):
    def test_monetary_branch_matches_official_xsd(self):
        path = os.environ.get('NBKI_XSD_ZIP')
        if not path:
            self.skipTest('Set NBKI_XSD_ZIP to the official XSD 5.1 archive')
        raw = Path(path).read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), XSD_ARCHIVE_SHA256)
        with ZipFile(path) as archive:
            root = etree.fromstring(archive.read('Events.xsd'))
        ns = {'xs': 'http://www.w3.org/2001/XMLSchema'}
        event = root.xpath("//xs:complexType[@name='FL_Event_2_3_Type']", namespaces=ns)[0]
        sequence = event.xpath('./xs:complexContent/xs:extension/xs:sequence', namespaces=ns)[0]
        observed = []
        for child in sequence:
            if child.tag == '{http://www.w3.org/2001/XMLSchema}element':
                observed.append((child.get('name'), child.get('minOccurs', '1') != '0'))
            elif child.tag == '{http://www.w3.org/2001/XMLSchema}choice':
                money = child.xpath('./xs:sequence', namespaces=ns)[0]
                observed.extend((item.get('name'), item.get('minOccurs', '1') != '0')
                                for item in money.xpath('./xs:element', namespaces=ns))
        self.assertEqual(tuple(observed), MONETARY_BLOCKS)


if __name__ == '__main__':
    unittest.main()
