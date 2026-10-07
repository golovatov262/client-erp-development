"""ASGI adapter for the poehali.dev Lambda-style handlers."""
import base64
import importlib.util
import json
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import Response

ROOT = Path(__file__).resolve().parent
ROUTES = {
    "/api": "api",
    "/public-application": "public-application",
    "/credit-check": "credit-check",
    "/jobs/accrue": "cron-accrue",
    "/jobs/notify": "cron-notify",
    "/jobs/sber": "cron-sber",
}

def load_handler(name: str):
    path = ROOT / name / "index.py"
    spec = importlib.util.spec_from_file_location("crm_" + name.replace("-", "_"), path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.handler

HANDLERS = {path: load_handler(name) for path, name in ROUTES.items()}
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.api_route("/{route:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
async def dispatch(route: str, request: Request):
    path = "/" + route.rstrip("/")
    handler = HANDLERS.get(path)
    if not handler:
        return Response("Not found", status_code=404)
    raw = await request.body()
    event = {
        "httpMethod": request.method,
        "headers": dict(request.headers),
        "queryStringParameters": dict(request.query_params),
        "body": raw.decode("utf-8") if raw else None,
        "requestContext": {"identity": {"sourceIp": request.headers.get("x-real-ip") or (request.client.host if request.client else "")}},
    }
    result = handler(event, None)
    status = int(result.get("statusCode", 200))
    headers = result.get("headers") or {}
    body = result.get("body", "")
    if result.get("isBase64Encoded"):
        body = base64.b64decode(body)
    elif not isinstance(body, (str, bytes)):
        body = json.dumps(body, ensure_ascii=False, default=str)
    return Response(content=body, status_code=status, headers=headers)
