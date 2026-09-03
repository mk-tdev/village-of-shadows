"""Best-effort visitor country collection with no retained IP addresses."""

from __future__ import annotations

import ipaddress

import httpx
from fastapi import Request

from app.config import settings


def _country_code(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().upper()
    return normalized if len(normalized) == 2 and normalized.isalpha() else None


def _visitor_ip(request: Request) -> str | None:
    """Extract the address supplied by normal Azure/reverse-proxy ingress.

    This value is only used in memory for an explicitly configured lookup and
    is never passed into persistence or logs.
    """
    raw = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    if not raw:
        raw = request.headers.get("x-azure-clientip", "").strip()
    if not raw and request.client is not None:
        raw = request.client.host
    try:
        address = ipaddress.ip_address(raw)
    except ValueError:
        return None
    return None if address.is_private or address.is_loopback else str(address)


async def country_for_request(request: Request) -> str | None:
    """Resolve an ISO country code when a trusted proxy or opted-in endpoint can.

    Cloudflare's country header is useful when a deployment is intentionally
    fronted by Cloudflare. Azure Container Apps does not natively provide an
    equivalent country header, so operators can opt into a lookup endpoint via
    `VISITOR_COUNTRY_LOOKUP_URL`. If neither exists, the archive displays
    “Unknown” rather than making an unconsented third-party request.
    """
    proxy_country = _country_code(request.headers.get("cf-ipcountry"))
    if proxy_country:
        return proxy_country
    template = settings.visitor_country_lookup_url
    ip = _visitor_ip(request)
    if not template or not ip or "{ip}" not in template:
        return None
    try:
        url = template.replace("{ip}", ip)
        async with httpx.AsyncClient(timeout=1.5, follow_redirects=False) as client:
            response = await client.get(url)
        if not response.is_success:
            return None
        payload = response.json()
        return _country_code(payload.get("country_code"))
    except (httpx.HTTPError, ValueError, TypeError):
        # Analytics must never prevent someone from joining their game.
        return None
