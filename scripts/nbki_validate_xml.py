"""Validate an outgoing NBKI XML against the pinned official schema 5.1.

Passing XSD does not mean the event is economically or legally correct. This
tool also checks the source header, UID consistency and declared counts.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
import tempfile
import zipfile
from pathlib import Path

from lxml import etree

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from nbki_import import parse_source_xml  # noqa: E402


OFFICIAL_SCHEMA_SHA256 = 'f1d82275ffc4df9ade469e5ce365639cd83b0398429999d2b9d738ba9b8dc36e'
SCHEMA_FILES = {'Main.xsd', 'Events.xsd', 'Blocks.xsd', 'BlocksCur.xsd',
                'ReferencesTypes.xsd', 'BKIApiCommonTypes.xsd',
                'NotificationOfAcceptance.xsd', 'NotificationOfReceipt.xsd'}


def validate(xml_path: Path, schema_zip: Path) -> dict:
    raw = xml_path.read_bytes()
    if not raw or len(raw) > 25 * 1024 * 1024:
        raise ValueError('XML пустой или превышает 25 МБ')
    parsed = parse_source_xml(raw)
    archive_bytes = schema_zip.read_bytes()
    if hashlib.sha256(archive_bytes).hexdigest() != OFFICIAL_SCHEMA_SHA256:
        raise ValueError('Контрольная сумма официального архива XSD 5.1 не совпадает')
    with tempfile.TemporaryDirectory(prefix='nbki-xsd-') as temp:
        schema_dir = Path(temp)
        with zipfile.ZipFile(schema_zip) as archive:
            if set(archive.namelist()) != SCHEMA_FILES:
                raise ValueError('Неожиданный состав архива XSD')
            for name in SCHEMA_FILES:
                item = archive.getinfo(name)
                if item.file_size > 1024 * 1024:
                    raise ValueError('Слишком большой файл XSD')
                (schema_dir / name).write_bytes(archive.read(name))
        parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False)
        schema_doc = etree.parse(str(schema_dir / 'Main.xsd'), parser)
        schema = etree.XMLSchema(schema_doc)
        document = etree.fromstring(raw, parser)
        if not schema.validate(document):
            error = schema.error_log.last_error
            raise ValueError(f'XSD: строка {error.line}: {error.message}')
    return {'reg_number': parsed['reg_number'], 'sha256': parsed['xml_sha256'],
            'subjects': parsed['subjects_count'], 'events': parsed['events_count'],
            'xsd_valid': True, 'business_rules_valid': False}


def main() -> None:
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('xml', type=Path)
    cli.add_argument('--schema-zip', type=Path, required=True,
                     help='Официальный tech_5_1_19112025.zip Банка России')
    args = cli.parse_args()
    try:
        result = validate(args.xml, args.schema_zip)
    except (ValueError, OSError, zipfile.BadZipFile, etree.XMLSyntaxError,
            etree.XMLSchemaParseError) as exc:
        cli.exit(1, f'Проверка не пройдена: {exc}\n')
    print(f"XSD 5.1 и структурные проверки пройдены: {result['reg_number']}")
    print(f"Субъектов: {result['subjects']}; событий: {result['events']}")
    print(f"SHA-256: {result['sha256']}")
    print('Содержательные правила НБКИ этим тестом НЕ подтверждены.')


if __name__ == '__main__':
    main()
