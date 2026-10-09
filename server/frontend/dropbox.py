"""Manual Dropbox backup uploads (user presses a button, no auto-sync).

Uses plain ``urllib`` so no extra dependency is needed. App key/secret
come from the workspace Settings (Profile), with env fallback (settings).
"""

import base64
import json
import urllib.parse
import urllib.request
from datetime import datetime

from django.conf import settings
from django.utils import timezone

TOKEN_URL = "https://api.dropbox.com/oauth2/token"
UPLOAD_URL = "https://content.dropboxapi.com/2/files/upload"
DOWNLOAD_URL = "https://content.dropboxapi.com/2/files/download"
LIST_URL = "https://api.dropboxapi.com/2/files/list_folder"
ACCOUNT_URL = "https://api.dropboxapi.com/2/users/get_current_account"

# Placeholders: fill with your own app values (env DROPBOX_APP_KEY/SECRET
# or per-workspace Settings). Keep empty until configured.
PLACEHOLDER_APP_KEY = "PASTE-YOUR-APP-KEY"
PLACEHOLDER_APP_SECRET = "PASTE-YOUR-APP-SECRET"
DROPBOX_FOLDER = "/AgroEcosystem"


class DropboxError(Exception):
    def __init__(self, en_message, el_message=None):
        super().__init__(en_message)
        self.en_message = en_message
        self.el_message = el_message or en_message


def credentials(profile=None) -> tuple[str, str]:
    """App key/secret: Profile Settings first, env settings as fallback."""
    key = (getattr(profile, "dropbox_app_key", "") or "").strip() if profile else ""
    secret = (getattr(profile, "dropbox_app_secret", "") or "").strip() if profile else ""
    if not key:
        key = (getattr(settings, "DROPBOX_APP_KEY", "") or "").strip()
    if not secret:
        secret = (getattr(settings, "DROPBOX_APP_SECRET", "") or "").strip()
    return key, secret


def is_configured(profile=None) -> bool:
    key, secret = credentials(profile)
    return bool(key and secret)


def authorize_url(redirect_uri: str, profile=None) -> str:
    key, _ = credentials(profile)
    params = urllib.parse.urlencode({
        "client_id": key,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "token_access_type": "offline",
    })
    return f"https://www.dropbox.com/oauth2/authorize?{params}"


def _basic_auth_header(profile=None) -> str:
    key, secret = credentials(profile)
    raw = f"{key}:{secret}".encode()
    return "Basic " + base64.b64encode(raw).decode()


def _post_form(url: str, data: dict, headers: dict | None = None) -> dict:
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=body, headers=headers or {}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except Exception as error:
        raise DropboxError(f"Dropbox request failed: {error}.",
                           f"Το αίτημα στο Dropbox απέτυχε: {error}.") from error


def exchange_code(code: str, redirect_uri: str, profile=None) -> dict:
    if not is_configured(profile):
        raise DropboxError("Dropbox is not configured (missing app key).",
                           "Το Dropbox δεν έχει ρυθμιστεί (λείπει το app key).")
    return _post_form(TOKEN_URL, {
        "code": code, "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,
    }, {"Authorization": _basic_auth_header(profile),
        "Content-Type": "application/x-www-form-urlencoded"})


def refresh_access_token(refresh_token: str, profile=None) -> str:
    data = _post_form(TOKEN_URL, {
        "grant_type": "refresh_token", "refresh_token": refresh_token,
    }, {"Authorization": _basic_auth_header(profile),
        "Content-Type": "application/x-www-form-urlencoded"})
    access = data.get("access_token")
    if not access:
        raise DropboxError("Could not refresh Dropbox access.",
                           "Δεν ήταν δυνατή η ανανέωση πρόσβασης στο Dropbox.")
    return access


def _api_json(url: str, access_token: str, payload: dict | None = None) -> dict:
    body = json.dumps(payload or {}).encode()
    req = urllib.request.Request(url, data=body, headers={
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else {}
    except Exception as error:
        raise DropboxError(f"Dropbox API call failed: {error}.",
                           f"Η κλήση στο Dropbox απέτυχε: {error}.") from error


def get_account_name(access_token: str) -> str:
    try:
        info = _api_json(ACCOUNT_URL, access_token, {})
        name = (info.get("name") or {}).get("display_name", "")
        email = info.get("email", "")
        return f"{name} ({email})".strip() if email else name
    except DropboxError:
        return ""


def upload_backup(profile, payload: dict, filename: str | None = None) -> str:
    """Upload backup JSON to /AgroEcosystem/ in Dropbox. Returns the Dropbox path."""
    from . import backup as workspace_backup  # noqa: F401 (kept for symmetry)

    if not profile.dropbox_refresh_token:
        raise DropboxError("Connect Dropbox first.", "Συνδέστε πρώτα το Dropbox.")
    access = refresh_access_token(profile.dropbox_refresh_token, profile)
    if filename is None:
        stamp = timezone.localdate().isoformat()
        filename = f"agro-backup-{stamp}.json"
    path = f"{DROPBOX_FOLDER}/{filename}"
    body = json.dumps(payload, indent=2).encode("utf-8")
    arg = json.dumps({"path": path, "mode": "overwrite",
                      "autorename": False, "mute": True})
    req = urllib.request.Request(UPLOAD_URL, data=body, headers={
        "Authorization": f"Bearer {access}",
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": arg,
    }, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            json.loads(resp.read().decode() or "{}")
    except Exception as error:
        raise DropboxError(f"Dropbox upload failed: {error}.",
                           f"Το ανέβασμα στο Dropbox απέτυχε: {error}.") from error
    profile.dropbox_last_sync = timezone.now()
    profile.save(update_fields=["dropbox_last_sync", "updated_at"])
    return path


def list_backups(profile) -> list[dict]:
    """List JSON backups in the Dropbox folder (manual download picker)."""
    if not profile.dropbox_refresh_token:
        raise DropboxError("Connect Dropbox first.", "Συνδέστε πρώτα το Dropbox.")
    access = refresh_access_token(profile.dropbox_refresh_token, profile)
    entries = _api_json(LIST_URL, access, {"path": DROPBOX_FOLDER, "recursive": False}).get("entries", [])
    files = [
        {"name": e.get("name", ""), "path": e.get("path_lower", ""),
         "size": e.get("size", 0), "modified": e.get("server_modified", "")}
        for e in entries
        if e.get(".tag") == "file" and str(e.get("name", "")).endswith(".json")
    ]
    files.sort(key=lambda f: f["name"], reverse=True)
    return files


def download_backup(profile, path: str) -> dict:
    """Download and parse a backup JSON file from Dropbox."""
    from .backup import MAX_UPLOAD_BYTES, describe_payload

    if not profile.dropbox_refresh_token:
        raise DropboxError("Connect Dropbox first.", "Συνδέστε πρώτα το Dropbox.")
    if not (path or "").strip():
        raise DropboxError("Pick a Dropbox file first.", "Διαλέξτε πρώτα αρχείο Dropbox.")
    access = refresh_access_token(profile.dropbox_refresh_token, profile)
    req = urllib.request.Request(DOWNLOAD_URL, data=b"", headers={
        "Authorization": f"Bearer {access}",
        "Dropbox-API-Arg": json.dumps({"path": path.strip()}),
    }, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
    except Exception as error:
        raise DropboxError(f"Dropbox download failed: {error}.",
                           f"Το κατέβασμα από το Dropbox απέτυχε: {error}.") from error
    if len(raw.encode("utf-8")) > MAX_UPLOAD_BYTES:
        raise DropboxError("This file is too large (5 MB limit).",
                           "Το αρχείο είναι πολύ μεγάλο (όριο 5 MB).")
    try:
        payload = json.loads(raw)
    except ValueError as error:
        raise DropboxError(f"This file is not a valid backup: {error}.",
                           f"Αυτό το αρχείο δεν είναι έγκυρο αντίγραφο: {error}.") from error
    describe_payload(payload)  # validate shape now, restore later
    return payload
