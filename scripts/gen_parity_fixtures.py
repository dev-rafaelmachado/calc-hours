"""Generates web/lib/domain/__fixtures__/parity.json from the legacy rules.

Runs the Python functions in hours_app/services.py over synthetic entries and
stores inputs and outputs, so the TypeScript port can be checked against the
original behaviour. Uses no real data.

Usage: PYTHONPATH=. python scripts/gen_parity_fixtures.py
"""

from __future__ import annotations

import json
import random
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

from hours_app.services import (
    add_week_fields,
    current_week_summary,
    forecast_for_current_week,
    month_metrics,
    remuneration_breakdown,
    weekly_summary,
)
from hours_app.time_utils import compute_total_minutes, minutes_to_hhmm

OUTPUT = Path(__file__).resolve().parents[1] / "web/lib/domain/__fixtures__/parity.json"

FIRST_DAY = date(2026, 3, 2)
LAST_DAY = date(2026, 4, 14)
SKIPPED_DAYS = {date(2026, 3, 20), date(2026, 4, 8)}
EXTRA_WEEKEND_DAYS = {date(2026, 3, 14)}
HOLIDAYS = {date(2026, 4, 3), date(2026, 4, 17)}
CONFIG = {
    "valor_base": 5000.0,
    "valor_hora": 42.5,
    "valor_bonus": 300.0,
    "valor_aux_transporte": 18.0,
}


def synthetic_entries() -> list[dict]:
    rng = random.Random(42)
    entries: list[dict] = []
    entry_id = 1
    day = FIRST_DAY
    while day <= max(LAST_DAY, *HOLIDAYS):
        is_workday = day.weekday() < 5 or day in EXTRA_WEEKEND_DAYS
        if day in HOLIDAYS:
            entries.append(
                {
                    "id": entry_id,
                    "work_date": day.isoformat(),
                    "start_time": "00:00",
                    "lunch_start_time": "00:00",
                    "lunch_end_time": "00:00",
                    "end_time": "00:00",
                    "total_minutes": 0,
                    "is_holiday": True,
                    "work_mode": None,
                }
            )
            entry_id += 1
        elif is_workday and day not in SKIPPED_DAYS and day <= LAST_DAY:
            start = rng.randint(7 * 60 + 45, 9 * 60 + 30)
            lunch_start = rng.randint(11 * 60 + 45, 13 * 60 + 15)
            lunch_end = lunch_start + rng.randint(40, 90)
            end = lunch_end + rng.randint(3 * 60, 5 * 60 + 30)
            times = [minutes_to_hhmm(m) for m in (start, lunch_start, lunch_end, end)]
            entries.append(
                {
                    "id": entry_id,
                    "work_date": day.isoformat(),
                    "start_time": times[0],
                    "lunch_start_time": times[1],
                    "lunch_end_time": times[2],
                    "end_time": times[3],
                    "total_minutes": compute_total_minutes(*times),
                    "is_holiday": False,
                    "work_mode": rng.choice(["Presencial", "Home office"]),
                }
            )
            entry_id += 1
        day += timedelta(days=1)
    return entries


def to_enriched(entries: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(entries)
    df["work_date"] = pd.to_datetime(df["work_date"]).dt.date
    df["source"] = "parity"
    df["created_at"] = pd.Timestamp("2026-01-01")
    return add_week_fields(df)


def forecast_case(df: pd.DataFrame, today: date, target: int, lock: int | None) -> dict:
    plan, details = forecast_for_current_week(
        df, today=today, today_plan_minutes=lock, day_target_minutes=target
    )
    return {
        "today": today.isoformat(),
        "dayTarget": target,
        "todayPlanMinutes": lock,
        "plan": [
            {"date": row["Data"], "hours": row["Horas sugeridas"]}
            for _, row in plan.iterrows()
        ],
        "details": {k: v for k, v in details.items() if not k.endswith("_human")},
    }


def main() -> None:
    entries = synthetic_entries()
    df = to_enriched(entries)
    today = date(2026, 4, 15)
    before_monday = df[df["work_date"].dt.date < date(2026, 4, 13)].copy()

    fixtures = {
        "entries": entries,
        "currentWeek": [
            {"today": today.isoformat(), "dayTarget": t, **{
                k: (v.isoformat() if isinstance(v, date) else v)
                for k, v in current_week_summary(df, today=today, day_target_minutes=t).items()
                if not k.endswith("_human")
            }}
            for t in (480, 450)
        ],
        "weeklySummary": [
            {"dayTarget": t, "rows": weekly_summary(df, day_target_minutes=t).to_dict("records")}
            for t in (480, 450)
        ],
        "forecast": [
            forecast_case(df, today, 480, None),
            forecast_case(df, today, 480, 300),
            forecast_case(df, today, 450, None),
            forecast_case(before_monday, date(2026, 4, 13), 480, None),
            forecast_case(before_monday, date(2026, 4, 13), 480, 600),
        ],
        "monthMetrics": [],
        "remuneration": [],
    }

    for month in (date(2026, 3, 1), date(2026, 4, 1)):
        for t in (480, 450):
            metrics, weeks = month_metrics(df, month, day_target_minutes=t)
            fixtures["monthMetrics"].append(
                {
                    "month": month.isoformat(),
                    "dayTarget": t,
                    "metrics": {k: v for k, v in metrics.items() if not k.endswith("_hhmm")},
                    "weeks": weeks.to_dict("records"),
                }
            )
        for bonus in (False, True):
            fixtures["remuneration"].append(
                {
                    "month": month.isoformat(),
                    "dayTarget": 480,
                    "config": CONFIG,
                    "bonusApplied": bonus,
                    "result": remuneration_breakdown(
                        df, month, CONFIG, day_target_minutes=480, bonus_applied=bonus
                    ),
                }
            )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(fixtures, indent=2, ensure_ascii=False, default=int) + "\n")
    print(f"wrote {OUTPUT.relative_to(Path.cwd())}")


if __name__ == "__main__":
    main()
