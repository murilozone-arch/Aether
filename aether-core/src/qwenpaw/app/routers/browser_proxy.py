# -*- coding: utf-8 -*-
"""Browser reverse proxy — strips X-Frame-Options / CSP so any site
can be embedded in an iframe inside the Aether Canvas.

Routes
------
GET  /api/browser-proxy/fetch   ?url=https://...   HTML proxy (rewrites links)
GET  /api/browser-proxy/resource?url=https://...   Asset proxy (CSS/JS/images)
POST /api/browser-proxy/ping    ?url=https://...   Detects if site allows iframe

Security notes
--------------
* Requests are made from the server — the user's browser cookies are NOT sent
  to the target site (unless explicitly tunnelled, which we don't do).
* The proxy is only available to authenticated users (AuthMiddleware applies).
* URL validation rejects private/loopback ranges to prevent SSRF.
"""
from __future__ import annotations

import ipaddress
import logging
import re
import socket
from urllib.parse import urljoin, urlparse, urlunparse

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response, JSONResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/browser-proxy", tags=["browser-proxy"])

# ---------------------------------------------------------------------------
# Security: block SSRF to private/loopback addresses
# ---------------------------------------------------------------------------
_PRIVATE_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]

# Headers we strip from the TARGET response before forwarding to browser
_STRIP_RESPONSE_HEADERS = {
    "x-frame-options",
    "content-security-policy",
    "content-security-policy-report-only",
    "cross-origin-opener-policy",
    "cross-origin-embedder-policy",
    "cross-origin-resource-policy",
    # We manage encoding ourselves
    "transfer-encoding",
    "content-encoding",
}

# Headers we forward from the USER request to the target (pass-through)
_FORWARD_REQUEST_HEADERS = {
    "accept",
    "accept-language",
    "cache-control",
    "user-agent",
}

_DEFAULT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/125.0.0.0 Safari/537.36"
)

_MAX_BODY_BYTES = 10 * 1024 * 1024  # 10 MB


def _validate_url(url: str) -> str:
    """Raise HTTPException if the URL is unsafe, return cleaned URL."""
    if not url:
        raise HTTPException(status_code=400, detail="url parameter is required")

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Only http/https URLs are allowed")

    hostname = parsed.hostname or ""
    if not hostname:
        raise HTTPException(status_code=400, detail="Invalid URL: missing hostname")

    # Resolve hostname → IPs and block private ranges
    try:
        addrs = socket.getaddrinfo(hostname, None)
        for addr_info in addrs:
            ip = ipaddress.ip_address(addr_info[4][0])
            for net in _PRIVATE_NETWORKS:
                if ip in net:
                    raise HTTPException(
                        status_code=403,
                        detail=f"Access to private/loopback addresses is not allowed",
                    )
    except HTTPException:
        raise
    except Exception:
        pass  # DNS failure — let httpx handle it

    return url


def _build_proxy_url(request: Request, target_url: str, endpoint: str = "fetch") -> str:
    """Build a proxy URL for a resource, rooted at our own server."""
    base = str(request.base_url).rstrip("/")
    from urllib.parse import quote
    return f"{base}/api/browser-proxy/{endpoint}?url={quote(target_url, safe='')}"


def _rewrite_html(html: str, base_url: str, request: Request) -> str:
    """
    Inject <base href> and an Aether interaction bridge script into the HTML.
    This makes relative links work and allows the iframe to report navigation
    events back to the parent window.
    """
    bridge_script = """
<script>
(function() {
  // Report current URL to parent frame (Aether Canvas)
  function reportNav(url) {
    try {
      window.parent.postMessage({ type: 'aether_browser_nav', url: url, title: document.title }, '*');
    } catch(e) {}
  }

  // Report immediately on load
  window.addEventListener('load', function() { reportNav(window.location.href); });

  // Watch for SPA navigations via History API
  var _push = history.pushState.bind(history);
  var _replace = history.replaceState.bind(history);
  history.pushState = function() { _push.apply(history, arguments); reportNav(window.location.href); };
  history.replaceState = function() { _replace.apply(history, arguments); reportNav(window.location.href); };
  window.addEventListener('popstate', function() { reportNav(window.location.href); });
})();
</script>
"""

    # Inject <base href> to resolve relative URLs against the target origin
    parsed = urlparse(base_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    base_tag = f'<base href="{origin}/" target="_self">'

    # Insert after <head> or before first tag
    if "<head>" in html.lower():
        html = re.sub(r"(<head[^>]*>)", r"\1" + base_tag + bridge_script, html, count=1, flags=re.IGNORECASE)
    elif "<html" in html.lower():
        html = re.sub(r"(<html[^>]*>)", r"\1<head>" + base_tag + bridge_script + "</head>", html, count=1, flags=re.IGNORECASE)
    else:
        html = base_tag + bridge_script + html

    return html


def _build_request_headers(request: Request) -> dict:
    """Build headers to forward to the target site."""
    headers = {
        "User-Agent": request.headers.get("user-agent", _DEFAULT_UA),
        "Accept": request.headers.get("accept", "text/html,application/xhtml+xml,*/*;q=0.8"),
        "Accept-Language": request.headers.get("accept-language", "pt-BR,pt;q=0.9,en;q=0.8"),
    }
    return headers


@router.get("/fetch")
async def proxy_fetch(
    url: str = Query(..., description="Full URL to proxy"),
    request: Request = None,
) -> Response:
    """
    Fetch a URL and return it with X-Frame-Options removed.
    For HTML pages, injects <base href> and a navigation bridge script.
    """
    url = _validate_url(url)
    headers = _build_request_headers(request)

    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=httpx.Timeout(20.0),
            verify=False,  # Allow self-signed certs on intranet
            limits=httpx.Limits(max_response_bytes=_MAX_BODY_BYTES),
        ) as client:
            resp = await client.get(url, headers=headers)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Target URL timed out")
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Failed to reach target: {exc}")

    content_type = resp.headers.get("content-type", "text/html")
    is_html = "html" in content_type

    # Build safe response headers
    safe_headers = {}
    for k, v in resp.headers.items():
        if k.lower() not in _STRIP_RESPONSE_HEADERS:
            safe_headers[k] = v

    # Always allow embedding
    safe_headers["X-Frame-Options"] = "ALLOWALL"
    safe_headers["Access-Control-Allow-Origin"] = "*"

    body = resp.content
    if is_html:
        try:
            text = body.decode(resp.encoding or "utf-8", errors="replace")
            text = _rewrite_html(text, url, request)
            body = text.encode("utf-8")
            safe_headers["content-type"] = "text/html; charset=utf-8"
        except Exception as exc:
            logger.warning("HTML rewrite failed for %s: %s", url, exc)

    # Remove content-length — body may have changed size
    safe_headers.pop("content-length", None)
    safe_headers.pop("Content-Length", None)

    return Response(
        content=body,
        status_code=resp.status_code,
        headers=safe_headers,
        media_type=content_type,
    )


@router.get("/resource")
async def proxy_resource(
    url: str = Query(..., description="Full URL of asset to proxy"),
    request: Request = None,
) -> Response:
    """Proxy non-HTML resources (CSS, JS, images) without rewriting."""
    url = _validate_url(url)
    headers = _build_request_headers(request)

    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=httpx.Timeout(15.0),
            verify=False,
            limits=httpx.Limits(max_response_bytes=_MAX_BODY_BYTES),
        ) as client:
            resp = await client.get(url, headers=headers)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    safe_headers = {
        k: v for k, v in resp.headers.items()
        if k.lower() not in _STRIP_RESPONSE_HEADERS
    }
    safe_headers["Access-Control-Allow-Origin"] = "*"
    safe_headers.pop("content-length", None)

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=safe_headers,
        media_type=resp.headers.get("content-type", "application/octet-stream"),
    )


@router.post("/ping")
async def ping_url(
    url: str = Query(..., description="URL to check for iframe compatibility"),
) -> JSONResponse:
    """
    HEAD request to the target URL. Returns whether the site allows iframes
    (i.e., lacks X-Frame-Options / frame-ancestors CSP).
    """
    url = _validate_url(url)
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=httpx.Timeout(8.0),
            verify=False,
        ) as client:
            resp = await client.head(url)
    except Exception as exc:
        return JSONResponse({"allows_iframe": False, "error": str(exc)})

    xfo = resp.headers.get("x-frame-options", "").lower()
    csp = resp.headers.get("content-security-policy", "").lower()
    blocks_iframe = bool(xfo) or "frame-ancestors" in csp

    return JSONResponse({
        "allows_iframe": not blocks_iframe,
        "x_frame_options": xfo or None,
        "has_csp_frame_ancestors": "frame-ancestors" in csp,
        "status_code": resp.status_code,
    })
