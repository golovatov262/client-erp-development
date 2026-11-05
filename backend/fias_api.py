"""Minimal client for the official FIAS address service used to obtain OKATO."""

from __future__ import annotations

import json
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request


BASE_URL = 'https://fias-public-service.nalog.ru/api/spas/v2.0/'
_REQUEST_LOCK = threading.Lock()
_LAST_REQUEST = 0.0


def _normalized(value: str) -> str:
    return re.sub(r'[^0-9a-zа-яё]+', ' ', (value or '').casefold()).strip()


def _get(path: str, query: dict, token: str) -> dict:
    global _LAST_REQUEST
    with _REQUEST_LOCK:
        wait = 0.65 - (time.monotonic() - _LAST_REQUEST)
        if wait > 0:
            time.sleep(wait)
        _LAST_REQUEST = time.monotonic()
    url = BASE_URL + path + '?' + urllib.parse.urlencode(query)
    request = urllib.request.Request(url, headers={'master-token': token, 'Accept': 'application/json'})
    with urllib.request.urlopen(request, timeout=8) as response:
        return json.loads(response.read().decode('utf-8'))


def resolve_okato(address: str, token: str, *, exact_only: bool = False) -> list[dict]:
    """Return official address candidates and their 11-digit OKATO, if assigned.

    The API's FIAS GUID is only returned as a reference for the UI. GUTDF's
    collateral location field itself requires the 11-digit OKATO code.
    """
    hints = _get('GetAddressHint', {'search_string': address, 'address_type': 1}, token).get('hints', [])[:5]
    if exact_only:
        hints = [hint for hint in hints
                 if _normalized(hint.get('full_name') or '') == _normalized(address)]
    result = []
    seen = set()
    for hint in hints:
        object_id = hint.get('object_id')
        if not object_id:
            continue
        addresses = _get('GetAddressItemById', {'object_id': object_id, 'address_type': 1}, token).get('addresses', [])
        if not addresses:
            continue
        item = addresses[0]
        details = item.get('address_details') or {}
        okato = str(details.get('okato') or '')
        full_name = item.get('full_name') or hint.get('full_name') or ''
        key = (full_name, okato)
        if key in seen:
            continue
        seen.add(key)
        result.append({
            'address': full_name,
            'okato': okato if re.fullmatch(r'\d{11}', okato) else None,
            'fias_guid': item.get('object_guid'),
            'exact_match': bool(full_name) and _normalized(full_name) == _normalized(address),
        })
    return result


__all__ = ['resolve_okato']
