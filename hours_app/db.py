from __future__ import annotations

import base64
import hashlib
import hmac
import os
from datetime import date
from pathlib import Path
from typing import Any

import pandas as pd
from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()
SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY
SUPABASE_TABLE = os.getenv("SUPABASE_TABLE", "time_entries").strip() or "time_entries"
SUPABASE_USERS_TABLE = os.getenv("SUPABASE_USERS_TABLE", "users").strip() or "users"

_client: Client | None = None


def _require_env() -> None:
    if SUPABASE_URL and SUPABASE_KEY:
        return
    raise RuntimeError(
        "Supabase não configurado. Defina SUPABASE_URL e uma chave "
        "(SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_ANON_KEY) no .env."
    )


def connect(db_path: str | Path | None = None) -> Client:
    global _client
    _require_env()
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client


def init_db(db_path: str | Path | None = None) -> None:
    connect(db_path)


def _normalize_record(rec: dict[str, Any]) -> dict[str, Any]:
    work_date = rec.get("work_date")
    if isinstance(work_date, date):
        work_date = work_date.isoformat()

    return {
        "work_date": str(work_date),
        "start_time": str(rec.get("start_time", "")),
        "lunch_start_time": str(rec.get("lunch_start_time", "")),
        "lunch_end_time": str(rec.get("lunch_end_time", "")),
        "end_time": str(rec.get("end_time", "")),
        "total_minutes": int(rec.get("total_minutes", 0)),
        "source": str(rec.get("source", "manual")),
    }


def _normalize_login(login: str) -> str:
    return login.strip().lower()


def build_password_hash(password: str, iterations: int = 310_000) -> str:
    password_value = password.strip()
    if not password_value:
        raise ValueError("Senha não pode ser vazia.")

    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password_value.encode("utf-8"),
        salt,
        iterations,
    )
    salt_b64 = base64.b64encode(salt).decode("utf-8")
    digest_b64 = base64.b64encode(digest).decode("utf-8")
    return f"pbkdf2_sha256${iterations}${salt_b64}${digest_b64}"


def verify_password_hash(password: str, password_hash: str) -> bool:
    try:
        algorithm, iteration_text, salt_b64, stored_digest_b64 = password_hash.split(
            "$", 3
        )
        if algorithm != "pbkdf2_sha256":
            return False

        iterations = int(iteration_text)
        salt = base64.b64decode(salt_b64.encode("utf-8"))
        stored_digest = base64.b64decode(stored_digest_b64.encode("utf-8"))
    except Exception:
        return False

    candidate_digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations,
    )
    return hmac.compare_digest(candidate_digest, stored_digest)


def get_user_by_login(db_path: str | Path | None, login: str) -> dict[str, Any] | None:
    normalized_login = _normalize_login(login)
    if not normalized_login:
        return None

    response = (
        connect(db_path)
        .table(SUPABASE_USERS_TABLE)
        .select("id,login,password_hash,is_active")
        .eq("login", normalized_login)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def authenticate_user(db_path: str | Path | None, login: str, password: str) -> bool:
    user = get_user_by_login(db_path, login)
    if not user:
        return False

    if not bool(user.get("is_active", True)):
        return False

    stored_password_hash = str(user.get("password_hash", ""))
    if not stored_password_hash:
        return False

    return verify_password_hash(password, stored_password_hash)


def insert_entry(
    db_path: str | Path | None,
    work_date: str,
    start_time: str,
    lunch_start_time: str,
    lunch_end_time: str,
    end_time: str,
    total_minutes: int,
    source: str = "manual",
) -> None:
    payload = _normalize_record(
        {
            "work_date": work_date,
            "start_time": start_time,
            "lunch_start_time": lunch_start_time,
            "lunch_end_time": lunch_end_time,
            "end_time": end_time,
            "total_minutes": total_minutes,
            "source": source,
        }
    )
    connect(db_path).table(SUPABASE_TABLE).insert(payload).execute()


def insert_many(db_path: str | Path | None, records: list[dict]) -> int:
    if not records:
        return 0

    payload = [
        _normalize_record(
            {
                "work_date": rec["work_date"],
                "start_time": rec["start_time"],
                "lunch_start_time": rec["lunch_start_time"],
                "lunch_end_time": rec["lunch_end_time"],
                "end_time": rec["end_time"],
                "total_minutes": rec["total_minutes"],
                "source": rec.get("source", "csv"),
            }
        )
        for rec in records
    ]

    connect(db_path).table(SUPABASE_TABLE).insert(payload).execute()
    return len(payload)


def update_entry(
    db_path: str | Path | None,
    entry_id: int,
    work_date: str,
    start_time: str,
    lunch_start_time: str,
    lunch_end_time: str,
    end_time: str,
    total_minutes: int,
) -> int:
    payload = _normalize_record(
        {
            "work_date": work_date,
            "start_time": start_time,
            "lunch_start_time": lunch_start_time,
            "lunch_end_time": lunch_end_time,
            "end_time": end_time,
            "total_minutes": total_minutes,
        }
    )
    payload.pop("source", None)

    response = (
        connect(db_path)
        .table(SUPABASE_TABLE)
        .update(payload)
        .eq("id", entry_id)
        .execute()
    )
    return len(response.data or [])


def delete_entry(db_path: str | Path | None, entry_id: int) -> int:
    response = (
        connect(db_path).table(SUPABASE_TABLE).delete().eq("id", entry_id).execute()
    )
    return len(response.data or [])


def fetch_entries(
    db_path: str | Path | None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> pd.DataFrame:
    query = (
        connect(db_path)
        .table(SUPABASE_TABLE)
        .select(
            "id,work_date,start_time,lunch_start_time,"
            "lunch_end_time,end_time,total_minutes,source,created_at"
        )
        .order("work_date")
        .order("start_time")
    )

    if start_date:
        query = query.gte("work_date", start_date)
    if end_date:
        query = query.lte("work_date", end_date)

    response = query.execute()
    df = pd.DataFrame(response.data or [])

    if not df.empty:
        df["work_date"] = pd.to_datetime(df["work_date"]).dt.date
    else:
        df = pd.DataFrame(
            columns=[
                "id",
                "work_date",
                "start_time",
                "lunch_start_time",
                "lunch_end_time",
                "end_time",
                "total_minutes",
                "source",
                "created_at",
            ]
        )

    return df


def reset_entries(db_path: str | Path | None = None) -> int:
    response = connect(db_path).table(SUPABASE_TABLE).delete().neq("id", 0).execute()
    return len(response.data or [])
