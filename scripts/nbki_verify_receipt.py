"""Verify one NBKI receipt ZIP locally with CryptoPro before using its status.

The ZIP, certificate store, and signature are processed only on this machine.
The CRM must not mark a receipt signature as verified merely because a ZIP was
uploaded or because this command's text output was copied to the server.
"""

from __future__ import annotations

import argparse
import hashlib
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from nbki_import import parse_receipt_zip  # noqa: E402


def verify_receipt(archive_path: Path, cryptcp: str = 'cryptcp') -> dict:
    if archive_path.stat().st_size > 2 * 1024 * 1024:
        raise ValueError('Квитанция превышает 2 МБ')
    with zipfile.ZipFile(archive_path) as archive:
        names = archive.namelist()
        xml_names = [name for name in names if name.lower().endswith('.xml')]
        if len(xml_names) != 1 or xml_names[0] + '.sig' not in names:
            raise ValueError('Ожидаются XML квитанции и его .sig')
        xml_name = xml_names[0]
        if (archive.getinfo(xml_name).file_size > 1024 * 1024 or
                archive.getinfo(xml_name + '.sig').file_size > 1024 * 1024):
            raise ValueError('XML или подпись квитанции имеют недопустимый размер')
        xml_bytes = archive.read(xml_name)
        sig_bytes = archive.read(xml_name + '.sig')
        if not xml_bytes or not sig_bytes or len(xml_bytes) > 1024 * 1024 or len(sig_bytes) > 1024 * 1024:
            raise ValueError('XML или подпись квитанции имеют недопустимый размер')
    parsed = parse_receipt_zip(archive_path)
    with tempfile.TemporaryDirectory(prefix='nbki-receipt-') as temporary:
        # Deliberately ignore ZIP paths; no archive member is extracted by name.
        xml = Path(temporary) / 'receipt.xml'
        sig = Path(temporary) / 'receipt.xml.sig'
        xml.write_bytes(xml_bytes)
        sig.write_bytes(sig_bytes)
        subprocess.run([cryptcp, '-verify', '-detached', '-verall',
                        str(xml), '-fext', '.sig'], check=True)
    return {'reg_number': parsed['reg_number'], 'kind': parsed['kind'],
            'status': parsed['status'], 'receipt_sha256': hashlib.sha256(archive_path.read_bytes()).hexdigest(),
            'signature_verified_locally': True}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('receipt_zip', type=Path)
    parser.add_argument('--expected-reg-number', required=True,
                        help='Регистрационный номер исходящего XML из журнала CRM')
    parser.add_argument('--cryptcp', default='cryptcp')
    args = parser.parse_args()
    try:
        result = verify_receipt(args.receipt_zip, args.cryptcp)
    except (ValueError, OSError, zipfile.BadZipFile, subprocess.CalledProcessError) as exc:
        parser.exit(1, f'Проверка квитанции не пройдена: {exc}\n')
    if result['reg_number'] != args.expected_reg_number:
        parser.exit(1, 'Номер исходящего документа в квитанции не совпадает\n')
    print(f"Подпись квитанции проверена локально: {result['reg_number']}")
    print(f"Тип квитанции: {result['kind']}; статус: {result['status']}")
    print(f"SHA-256 ZIP: {result['receipt_sha256']}")
    print('Проверьте, что сертификат подписанта принадлежит НБКИ; файл не отправлялся в CRM.')


if __name__ == '__main__':
    main()
