from __future__ import annotations

import csv
import re
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OLD_DIR = ROOT / "static"
OUT_DIR = OLD_DIR / "ready_import"

FILENAME_PATTERN = re.compile(r"hours_(\d+)_(\d{2})\.csv$")
WEEKDAY_INDEX = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}


def find_first_monday_of_month(year: int, month: int, first_record_day: int) -> date:
    first_record = date(year, month, first_record_day)
    return first_record - timedelta(days=first_record.weekday())


def normalize_row(row: dict) -> dict:
    return {
        "day": str(row.get("day", "")).strip().lower(),
        "start": str(row.get("start", "")).strip(),
        "lunchStart": str(row.get("lunchStart", row.get("lunch_start", ""))).strip(),
        "lunchEnd": str(row.get("lunchEnd", row.get("lunch_end", ""))).strip(),
        "end": str(row.get("end", "")).strip(),
    }


def build_output_rows(rows: list[dict], year: int, month: int, week_index: int, first_record_day: int) -> list[dict]:
    base_monday = find_first_monday_of_month(year, month, first_record_day)
    week_monday = base_monday + timedelta(days=(week_index - 1) * 7)

    output: list[dict] = []
    for row in rows:
        normalized = normalize_row(row)
        weekday = normalized["day"]
        if weekday not in WEEKDAY_INDEX:
            continue

        work_date = week_monday + timedelta(days=WEEKDAY_INDEX[weekday])
        output.append(
            {
                "date": work_date.isoformat(),
                "day": normalized["day"],
                "start": normalized["start"],
                "lunchStart": normalized["lunchStart"],
                "lunchEnd": normalized["lunchEnd"],
                "end": normalized["end"],
            }
        )

    return output


def process_file(path: Path, year: int, first_record_day: int) -> Path | None:
    match = FILENAME_PATTERN.match(path.name)
    if not match:
        return None

    week_index = int(match.group(1))
    month = int(match.group(2))

    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    output_rows = build_output_rows(rows, year, month, week_index, first_record_day)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"hours_{week_index}_{month:02d}_{year}.csv"
    with out_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["date", "day", "start", "lunchStart", "lunchEnd", "end"])
        writer.writeheader()
        writer.writerows(output_rows)

    return out_path


def main() -> None:
    year = 2026
    first_record_day = 2

    created: list[Path] = []
    for file_path in sorted(OLD_DIR.glob("hours_*_??.csv")):
        out = process_file(file_path, year=year, first_record_day=first_record_day)
        if out is not None:
            created.append(out)

    print(f"Arquivos gerados: {len(created)}")
    for path in created:
        print(path.relative_to(ROOT))


if __name__ == "__main__":
    main()
