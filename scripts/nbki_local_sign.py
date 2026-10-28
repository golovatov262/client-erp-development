"""Sign one already validated NBKI XML locally with CryptoPro cryptcp.

This tool never sends the file, certificate, key or PIN to the CRM. The
resulting .p7s is only a detached signature; NBKI packaging/encryption is a
separate, channel-specific step and is intentionally not guessed here.
"""

from __future__ import annotations

import argparse
import hashlib
import re
import subprocess
from pathlib import Path

from nbki_validate_xml import validate


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('xml', type=Path, help='Уже проверенный XML ГУТДФ')
    parser.add_argument('--sha256', required=True, help='SHA-256 неизменяемого XML из CRM')
    parser.add_argument('--schema-zip', required=True, type=Path,
                        help='Официальный архив XSD 5.1 Банка России')
    parser.add_argument('--thumbprint', required=True, help='Отпечаток локального сертификата')
    parser.add_argument('--cryptcp', default='cryptcp', help='Путь к утилите cryptcp')
    args = parser.parse_args()
    if not re.fullmatch(r'[0-9a-fA-F]{64}', args.sha256):
        parser.error('Требуется полный SHA-256 (64 шестнадцатеричных символа)')
    thumbprint = re.sub(r'\s+', '', args.thumbprint)
    if not re.fullmatch(r'[0-9a-fA-F]{40}', thumbprint):
        parser.error('Неверный отпечаток сертификата SHA-1')
    xml = args.xml.resolve(strict=True)
    if not xml.is_file() or xml.suffix.lower() != '.xml':
        parser.error('Ожидается существующий XML-файл')
    content = xml.read_bytes()
    if not content or len(content) > 25 * 1024 * 1024:
        parser.error('Недопустимый размер XML')
    digest = hashlib.sha256(content).hexdigest()
    if digest.lower() != args.sha256.lower():
        parser.error('SHA-256 файла не совпадает с журналом CRM; подпись отменена')
    try:
        validate(xml, args.schema_zip)
    except ValueError as exc:
        parser.error(f'XML не прошел проверку XSD/структуры: {exc}')
    signature = xml.with_name(xml.name + '.p7s')
    if signature.exists():
        parser.error('Подпись уже существует; удалите или переместите ее вручную после проверки')
    subprocess.run([args.cryptcp, '-sign', '-detached', '-thumbprint', thumbprint,
                    '-askpin', '-fext', '.p7s', str(xml)], check=True)
    if not signature.is_file() or signature.stat().st_size == 0:
        raise RuntimeError('cryptcp не создал отсоединенную подпись')
    subprocess.run([args.cryptcp, '-verify', '-detached', '-verall', str(xml),
                    '-fext', '.p7s'], check=True)
    if hashlib.sha256(xml.read_bytes()).hexdigest() != digest:
        raise RuntimeError('Исходный XML изменился после подписания')
    print(f'Подпись проверена: {signature}')
    print(f'XML SHA-256: {digest}')
    print(f'Подпись SHA-256: {hashlib.sha256(signature.read_bytes()).hexdigest()}')
    print('Файл не отправлен в НБКИ и не зашифрован.')


if __name__ == '__main__':
    main()
