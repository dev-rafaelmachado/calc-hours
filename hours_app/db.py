from __future__ import annotations

import sqlite3
from pathlib import Path

import pandas as pd

SCHEMA = """
CREATE TABLE IF NOT EXISTS time_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    lunch_start_time TEXT NOT NULL,
    lunch_end_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    total_minutes INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_time_entries_work_date ON time_entries(work_date);
"""


def connect(db_path: str | Path) -> sqlite3.Connection:
    return sqlite3.connect(str(db_path), check_same_thread=False)


def init_db(db_path: str | Path) -> None:
    with connect(db_path) as conn:
        conn.executescript(SCHEMA)


def insert_entry(
    db_path: str | Path,
    work_date: str,
    start_time: str,
    lunch_start_time: str,
    lunch_end_time: str,
    end_time: str,
    total_minutes: int,
    source: str = "manual",
) -> None:
    sql = """
    INSERT INTO time_entries (
        work_date,
        start_time,
        lunch_start_time,
        lunch_end_time,
        end_time,
        total_minutes,
        source
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    """
    with connect(db_path) as conn:
        conn.execute(
            sql,
            (
                work_date,
                start_time,
                lunch_start_time,
                lunch_end_time,
                end_time,
                total_minutes,
                source,
            ),
        )


def insert_many(db_path: str | Path, records: list[dict]) -> int:
    if not records:
        return 0

    sql = """
    INSERT INTO time_entries (
        work_date,
        start_time,
        lunch_start_time,
        lunch_end_time,
        end_time,
        total_minutes,
        source
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    """

    values = [
        (
            rec["work_date"],
            rec["start_time"],
            rec["lunch_start_time"],
            rec["lunch_end_time"],
            rec["end_time"],
            rec["total_minutes"],
            rec.get("source", "csv"),
        )
        for rec in records
    ]

    with connect(db_path) as conn:
        conn.executemany(sql, values)
    return len(values)


def update_entry(
    db_path: str | Path,
    entry_id: int,
    work_date: str,
    start_time: str,
    lunch_start_time: str,
    lunch_end_time: str,
    end_time: str,
    total_minutes: int,
) -> int:
    sql = """
    UPDATE time_entries
    SET
        work_date = ?,
        start_time = ?,
        lunch_start_time = ?,
        lunch_end_time = ?,
        end_time = ?,
        total_minutes = ?
    WHERE id = ?
    """

    with connect(db_path) as conn:
        cursor = conn.execute(
            sql,
            (
                work_date,
                start_time,
                lunch_start_time,
                lunch_end_time,
                end_time,
                total_minutes,
                entry_id,
            ),
        )
        return int(cursor.rowcount)


def delete_entry(db_path: str | Path, entry_id: int) -> int:
    sql = "DELETE FROM time_entries WHERE id = ?"

    with connect(db_path) as conn:
        cursor = conn.execute(sql, (entry_id,))
        return int(cursor.rowcount)


def fetch_entries(db_path: str | Path, start_date: str | None = None, end_date: str | None = None) -> pd.DataFrame:
    clauses = []
    params: list[str] = []

    if start_date:
        clauses.append("work_date >= ?")
        params.append(start_date)
    if end_date:
        clauses.append("work_date <= ?")
        params.append(end_date)

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    query = f"""
    SELECT
        id,
        work_date,
        start_time,
        lunch_start_time,
        lunch_end_time,
        end_time,
        total_minutes,
        source,
        created_at
    FROM time_entries
    {where_sql}
    ORDER BY work_date, start_time
    """

    with connect(db_path) as conn:
        df = pd.read_sql_query(query, conn, params=params)

    if not df.empty:
        df["work_date"] = pd.to_datetime(df["work_date"]).dt.date

    return df
