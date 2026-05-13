from __future__ import annotations

from datetime import date, timedelta
from statistics import mean

import pandas as pd

from .constants import DAY_LABELS, DAY_TARGET_MINUTES, week_end_for, week_start_for
from .time_utils import compute_total_minutes, minutes_to_duration_hhmm, minutes_to_hhmm, minutes_to_human, parse_hhmm


def _rebalance_plan_minutes(plan_rows: list[dict], target_minutes: int) -> None:
    if not plan_rows:
        return

    target_minutes = max(target_minutes, 0)
    current_total = sum(int(row["minutes"]) for row in plan_rows)

    if current_total == target_minutes:
        return

    if current_total < target_minutes:
        remaining = target_minutes - current_total
        idx = 0
        while remaining > 0:
            plan_rows[idx % len(plan_rows)]["minutes"] += 1
            remaining -= 1
            idx += 1
        return

    over = current_total - target_minutes
    while over > 0:
        candidates = sorted(
            [row for row in plan_rows if row["minutes"] > 0],
            key=lambda item: item["minutes"],
            reverse=True,
        )
        if not candidates:
            break

        for row in candidates:
            if over == 0:
                break
            if row["minutes"] > 0:
                row["minutes"] -= 1
                over -= 1


def _holiday_dates(df: pd.DataFrame) -> set[date]:
    if df.empty or "is_holiday" not in df.columns:
        return set()

    work_dates = pd.to_datetime(df["work_date"], errors="coerce")
    flagged = df["is_holiday"].fillna(False).astype(bool)
    return set(work_dates[flagged].dt.date.dropna().tolist())


def _exclude_holidays(df: pd.DataFrame, holiday_dates: set[date]) -> pd.DataFrame:
    if df.empty or not holiday_dates:
        return df

    work_days = pd.to_datetime(df["work_date"], errors="coerce").dt.date
    return df.loc[~work_days.isin(holiday_dates)].copy()


def _week_target_minutes(
    start: date,
    end: date,
    day_target_minutes: int,
    holiday_dates: set[date],
) -> int:
    business_days = [d.date() for d in pd.bdate_range(start, end)]
    effective_days = [d for d in business_days if d not in holiday_dates]
    return len(effective_days) * max(int(day_target_minutes), 0)


def add_week_fields(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df

    copy = df.copy()
    copy["work_date"] = pd.to_datetime(copy["work_date"]) 
    copy["weekday"] = copy["work_date"].dt.day_name().str.lower()
    copy["day_label"] = copy["weekday"].map(DAY_LABELS)
    copy["week_start"] = copy["work_date"].dt.date.apply(week_start_for)
    copy["week_end"] = copy["work_date"].dt.date.apply(week_end_for)
    copy["week_key"] = copy["week_start"].astype(str)
    return copy


def current_week_summary(
    df: pd.DataFrame,
    today: date | None = None,
    day_target_minutes: int = DAY_TARGET_MINUTES,
) -> dict:
    today = today or date.today()
    start = week_start_for(today)
    end = week_end_for(today)

    holiday_dates = _holiday_dates(df)
    non_holiday_df = _exclude_holidays(df, holiday_dates)

    if non_holiday_df.empty:
        worked = 0
    else:
        in_week = (non_holiday_df["work_date"].dt.date >= start) & (
            non_holiday_df["work_date"].dt.date <= end
        )
        worked = int(non_holiday_df.loc[in_week, "total_minutes"].sum())

    target_minutes = _week_target_minutes(
        start, end, day_target_minutes, holiday_dates
    )
    remaining = max(target_minutes - worked, 0)
    if target_minutes > 0:
        pct = min(worked / target_minutes, 1.0)
    else:
        pct = 1.0

    return {
        "week_start": start,
        "week_end": end,
        "worked_minutes": worked,
        "remaining_minutes": remaining,
        "worked_human": minutes_to_human(worked),
        "remaining_human": minutes_to_human(remaining),
        "progress": pct,
    }


def weekly_summary(
    df: pd.DataFrame,
    day_target_minutes: int = DAY_TARGET_MINUTES,
) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=["Semana", "Período", "Horas", "Registros", "Status"])

    holiday_dates = _holiday_dates(df)
    non_holiday_df = _exclude_holidays(df, holiday_dates)

    if non_holiday_df.empty:
        return pd.DataFrame(columns=["Semana", "Período", "Horas", "Registros", "Status"])

    grouped = (
        non_holiday_df.groupby("week_key", as_index=False)
        .agg(
            week_start=("week_start", "first"),
            week_end=("week_end", "first"),
            total_minutes=("total_minutes", "sum"),
            records=("id", "count"),
        )
        .sort_values("week_start", ascending=False)
    )

    grouped["target_minutes"] = grouped.apply(
        lambda row: _week_target_minutes(
            row["week_start"],
            row["week_end"],
            day_target_minutes,
            holiday_dates,
        ),
        axis=1,
    )

    grouped["Semana"] = grouped["week_start"].astype(str)
    grouped["Período"] = grouped["week_start"].astype(str) + " a " + grouped["week_end"].astype(str)
    grouped["Horas"] = grouped["total_minutes"].apply(minutes_to_human)
    grouped["Registros"] = grouped["records"]
    grouped["Status"] = grouped.apply(
        lambda row: "Sem meta" if row["target_minutes"] == 0 else (
            "Meta batida"
            if row["total_minutes"] >= row["target_minutes"]
            else f"Faltam {minutes_to_human(int(row['target_minutes'] - row['total_minutes']))}"
        ),
        axis=1,
    )

    return grouped[["Semana", "Período", "Horas", "Registros", "Status"]]


def forecast_for_current_week(
    df: pd.DataFrame,
    today: date | None = None,
    today_plan_minutes: int | None = None,
    today_start_minutes: int | None = None,
    today_lunch_start_minutes: int | None = None,
    today_lunch_end_minutes: int | None = None,
    today_end_minutes: int | None = None,
    day_target_minutes: int = DAY_TARGET_MINUTES,
) -> tuple[pd.DataFrame, dict]:
    today = today or date.today()
    start = week_start_for(today)
    end = week_end_for(today)

    holiday_dates = _holiday_dates(df)

    if df.empty:
        week_target = _week_target_minutes(start, end, day_target_minutes, holiday_dates)
        return pd.DataFrame(), {
            "worked_current_week": 0,
            "missing_current_week": week_target,
            "previous_weeks_debt": 0,
            "target_to_plan": week_target,
            "projected_week_total": 0,
            "projected_week_total_human": minutes_to_human(0),
        }

    hist = _exclude_holidays(df, holiday_dates)
    if hist.empty:
        week_target = _week_target_minutes(start, end, day_target_minutes, holiday_dates)
        return pd.DataFrame(), {
            "worked_current_week": 0,
            "missing_current_week": week_target,
            "previous_weeks_debt": 0,
            "target_to_plan": week_target,
            "projected_week_total": 0,
            "projected_week_total_human": minutes_to_human(0),
        }

    hist["weekday"] = hist["work_date"].dt.day_name().str.lower()

    current = hist[(hist["work_date"].dt.date >= start) & (hist["work_date"].dt.date <= end)]
    current_done = set(current["work_date"].dt.date.tolist())

    remaining_days = [
        (start + timedelta(days=i))
        for i in range(5)
        if (start + timedelta(days=i)) >= today
        and (start + timedelta(days=i)) not in current_done
        and (start + timedelta(days=i)) not in holiday_dates
    ]

    weekly_totals = (
        hist.groupby("week_start", as_index=False)
        .agg(total_minutes=("total_minutes", "sum"))
        .sort_values("week_start")
    )

    previous_weeks = weekly_totals[weekly_totals["week_start"] < start]
    previous_weeks["target_minutes"] = previous_weeks.apply(
        lambda row: _week_target_minutes(
            row["week_start"],
            row["week_start"] + timedelta(days=6),
            day_target_minutes,
            holiday_dates,
        ),
        axis=1,
    )
    previous_weeks_debt = int(
        (previous_weeks["target_minutes"] - previous_weeks["total_minutes"]).clip(lower=0).sum()
    )

    avg_by_day = hist.groupby("weekday").agg(
        avg_minutes=("total_minutes", "mean"),
        avg_start=("start_time", "first"),
    )
    global_avg = int(round(hist["total_minutes"].mean()))

    worked = int(current["total_minutes"].sum())
    week_target = _week_target_minutes(start, end, day_target_minutes, holiday_dates)
    deficit = max(week_target - worked, 0)
    total_target_to_plan = deficit + previous_weeks_debt

    if not remaining_days:
        return pd.DataFrame(), {
            "worked_current_week": worked,
            "missing_current_week": deficit,
            "previous_weeks_debt": previous_weeks_debt,
            "target_to_plan": total_target_to_plan,
            "projected_week_total": worked,
            "projected_week_total_human": minutes_to_human(worked),
        }

    plan_rows = []
    for d in remaining_days:
        weekday = d.strftime("%A").lower()
        predicted = int(round(avg_by_day.loc[weekday, "avg_minutes"])) if weekday in avg_by_day.index else global_avg
        plan_rows.append({
            "Dia": DAY_LABELS.get(weekday, weekday),
            "Data": d.isoformat(),
            "Horas sugeridas": minutes_to_human(predicted),
            "minutes": predicted,
            "is_today": d == today,
        })

    if today_plan_minutes is None:
        _rebalance_plan_minutes(plan_rows, total_target_to_plan)
    else:
        locked_today_minutes = 0
        for row in plan_rows:
            if row["is_today"]:
                row["minutes"] = max(int(today_plan_minutes), 0)
                locked_today_minutes = row["minutes"]
                break

        unlocked_rows = [row for row in plan_rows if not row["is_today"]]
        if unlocked_rows:
            _rebalance_plan_minutes(unlocked_rows, max(total_target_to_plan - locked_today_minutes, 0))

    for row in plan_rows:
        row["Horas sugeridas"] = minutes_to_human(row["minutes"])
        if row["is_today"] and today_start_minutes is not None:
            row["Entrada sugerida"] = minutes_to_hhmm(today_start_minutes)
        else:
            row["Entrada sugerida"] = minutes_to_hhmm(9 * 60)

        if row["is_today"] and today_lunch_start_minutes is not None:
            row["Saída almoço sugerida"] = minutes_to_hhmm(today_lunch_start_minutes)
        else:
            row["Saída almoço sugerida"] = minutes_to_hhmm(12 * 60)

        if row["is_today"] and today_lunch_end_minutes is not None:
            row["Volta almoço sugerida"] = minutes_to_hhmm(today_lunch_end_minutes)
        else:
            row["Volta almoço sugerida"] = minutes_to_hhmm(13 * 60)

        if row["is_today"] and today_end_minutes is not None:
            row["Saída sugerida"] = minutes_to_hhmm(today_end_minutes)
        else:
            row["Saída sugerida"] = minutes_to_hhmm((9 * 60) + 60 + row["minutes"])

    out = pd.DataFrame(plan_rows)
    projected_week_total = worked + int(out["minutes"].sum())

    details = {
        "worked_current_week": worked,
        "missing_current_week": deficit,
        "previous_weeks_debt": previous_weeks_debt,
        "target_to_plan": total_target_to_plan,
        "projected_week_total": projected_week_total,
        "projected_week_total_human": minutes_to_human(projected_week_total),
    }

    return out[
        [
            "Dia",
            "Data",
            "Entrada sugerida",
            "Saída almoço sugerida",
            "Volta almoço sugerida",
            "Horas sugeridas",
            "Saída sugerida",
        ]
    ], details


def _safe_parse_hhmm(value: str | None) -> int | None:
    text = (value or "").strip()
    if not text:
        return None
    try:
        return parse_hhmm(text)
    except Exception:
        return None


def _historical_day_profile(df: pd.DataFrame, weekday: str) -> tuple[int, int, int]:
    if df.empty:
        return 9 * 60, 3 * 60, 60

    candidates = df[df["work_date"].dt.day_name().str.lower() == weekday].copy()
    if candidates.empty:
        candidates = df.copy()

    starts: list[int] = []
    first_blocks: list[int] = []
    lunch_breaks: list[int] = []

    for _, row in candidates.iterrows():
        try:
            start_m = parse_hhmm(str(row["start_time"]))
            lunch_start_m = parse_hhmm(str(row["lunch_start_time"]))
            lunch_end_m = parse_hhmm(str(row["lunch_end_time"]))
        except Exception:
            continue

        first_block = lunch_start_m - start_m
        lunch_break = lunch_end_m - lunch_start_m
        if first_block > 0:
            first_blocks.append(first_block)
        if lunch_break > 0:
            lunch_breaks.append(lunch_break)
        starts.append(start_m)

    avg_start = int(round(mean(starts))) if starts else 9 * 60
    avg_first_block = int(round(mean(first_blocks))) if first_blocks else 3 * 60
    avg_lunch_break = int(round(mean(lunch_breaks))) if lunch_breaks else 60
    return avg_start, avg_first_block, avg_lunch_break


def build_live_today_projection(
    df: pd.DataFrame,
    start_time: str | None = None,
    lunch_start_time: str | None = None,
    lunch_end_time: str | None = None,
    end_time: str | None = None,
    today: date | None = None,
    day_target_minutes: int = DAY_TARGET_MINUTES,
) -> dict:
    today = today or date.today()
    weekday = today.strftime("%A").lower()

    holiday_dates = _holiday_dates(df)
    today_is_holiday = today in holiday_dates

    if df.empty:
        planning_df = df
    else:
        planning_df = df[df["work_date"].dt.date != today].copy()

    base_forecast, _ = forecast_for_current_week(
        planning_df, today=today, day_target_minutes=day_target_minutes
    )
    suggested_today_minutes = 0 if today_is_holiday else max(int(day_target_minutes), 0)
    if not base_forecast.empty:
        today_mask = base_forecast["Data"] == today.isoformat()
        if today_mask.any():
            text = str(base_forecast.loc[today_mask, "Horas sugeridas"].iloc[0])
            hours, mins = text.replace("h", "").replace("m", "").split()
            suggested_today_minutes = int(hours) * 60 + int(mins)

    avg_start, avg_first_block, avg_lunch_break = _historical_day_profile(planning_df, weekday)

    start_m = _safe_parse_hhmm(start_time)
    lunch_start_m = _safe_parse_hhmm(lunch_start_time)
    lunch_end_m = _safe_parse_hhmm(lunch_end_time)
    end_m = _safe_parse_hhmm(end_time)

    if today_is_holiday:
        start_m = 0
        lunch_start_m = 0
        lunch_end_m = 0
        end_m = 0
    elif start_m is None:
        start_m = avg_start
    if lunch_start_m is None:
        lunch_start_m = start_m + avg_first_block
    if lunch_end_m is None:
        lunch_end_m = lunch_start_m + avg_lunch_break

    if end_m is None:
        worked_before_lunch = max(lunch_start_m - start_m, 0)
        worked_after_lunch = max(suggested_today_minutes - worked_before_lunch, 0)
        end_m = lunch_end_m + worked_after_lunch

    all_filled = all(
        _safe_parse_hhmm(value) is not None
        for value in [start_time, lunch_start_time, lunch_end_time, end_time]
    )

    if all_filled and not today_is_holiday:
        today_minutes = compute_total_minutes(
            str(start_time),
            str(lunch_start_time),
            str(lunch_end_time),
            str(end_time),
        )
    else:
        today_minutes = max((lunch_start_m - start_m) + (end_m - lunch_end_m), 0)
        if today_is_holiday:
            today_minutes = 0

    recalculated_forecast, details = forecast_for_current_week(
        planning_df,
        today=today,
        today_plan_minutes=today_minutes,
        today_start_minutes=start_m,
        today_lunch_start_minutes=lunch_start_m,
        today_lunch_end_minutes=lunch_end_m,
        today_end_minutes=end_m,
        day_target_minutes=day_target_minutes,
    )

    return {
        "start_time": minutes_to_hhmm(start_m),
        "lunch_start_time": minutes_to_hhmm(lunch_start_m),
        "lunch_end_time": minutes_to_hhmm(lunch_end_m),
        "end_time": minutes_to_hhmm(end_m),
        "today_minutes": today_minutes,
        "today_minutes_human": minutes_to_human(today_minutes),
        "forecast": recalculated_forecast,
        "details": details,
    }


def month_metrics(
    df: pd.DataFrame,
    month_date: date,
    day_target_minutes: int = DAY_TARGET_MINUTES,
) -> tuple[dict, pd.DataFrame]:
    first_day = month_date.replace(day=1)
    next_month = (first_day.replace(day=28) + timedelta(days=4)).replace(day=1)
    last_day = next_month - timedelta(days=1)

    if df.empty:
        empty_weeks = pd.DataFrame(columns=["Semana", "Período", "Horas", "Extra", "Faltou"])
        return {
            "month_label": first_day.strftime("%m/%Y"),
            "total_minutes": 0,
            "target_minutes": 0,
            "remaining_minutes": 0,
            "extra_minutes": 0,
            "weekly_overtime_minutes": 0,
            "weekly_debt_minutes": 0,
            "weeks_count": 0,
            "total_hhmm": minutes_to_duration_hhmm(0),
            "remaining_hhmm": minutes_to_duration_hhmm(0),
            "target_hhmm": minutes_to_duration_hhmm(0),
            "extra_hhmm": minutes_to_duration_hhmm(0),
            "weekly_overtime_hhmm": minutes_to_duration_hhmm(0),
            "weekly_debt_hhmm": minutes_to_duration_hhmm(0),
        }, empty_weeks

    month_mask = (df["work_date"].dt.date >= first_day) & (df["work_date"].dt.date <= last_day)
    month_df = df.loc[month_mask].copy()

    holiday_dates = _holiday_dates(month_df)
    month_df = _exclude_holidays(month_df, holiday_dates)

    total_minutes = int(month_df["total_minutes"].sum()) if not month_df.empty else 0
    business_days = [d.date() for d in pd.bdate_range(first_day, last_day)]
    effective_days = [d for d in business_days if d not in holiday_dates]
    target_minutes = len(effective_days) * max(int(day_target_minutes), 0)
    remaining_minutes = max(target_minutes - total_minutes, 0)
    extra_minutes = max(total_minutes - target_minutes, 0)

    if month_df.empty:
        week_details = pd.DataFrame(columns=["Semana", "Período", "Horas", "Extra", "Faltou"])
        weekly_overtime_minutes = 0
        weekly_debt_minutes = 0
    else:
        week_details = (
            month_df.groupby("week_start", as_index=False)
            .agg(week_end=("week_end", "first"), total_minutes=("total_minutes", "sum"))
            .sort_values("week_start")
        )
        week_details["target_minutes"] = week_details.apply(
            lambda row: _week_target_minutes(
                row["week_start"],
                row["week_end"],
                day_target_minutes,
                holiday_dates,
            ),
            axis=1,
        )
        week_details["extra_minutes"] = (week_details["total_minutes"] - week_details["target_minutes"]).clip(lower=0)
        week_details["debt_minutes"] = (week_details["target_minutes"] - week_details["total_minutes"]).clip(lower=0)
        weekly_overtime_minutes = int(week_details["extra_minutes"].sum())
        weekly_debt_minutes = int(week_details["debt_minutes"].sum())

        week_details["Semana"] = week_details["week_start"].astype(str)
        week_details["Período"] = week_details["week_start"].astype(str) + " a " + week_details["week_end"].astype(str)
        week_details["Horas"] = week_details["total_minutes"].apply(minutes_to_duration_hhmm)
        week_details["Extra"] = week_details["extra_minutes"].apply(minutes_to_duration_hhmm)
        week_details["Faltou"] = week_details["debt_minutes"].apply(minutes_to_duration_hhmm)
        week_details = week_details[["Semana", "Período", "Horas", "Extra", "Faltou"]]

    metrics = {
        "month_label": first_day.strftime("%m/%Y"),
        "total_minutes": total_minutes,
        "target_minutes": target_minutes,
        "remaining_minutes": remaining_minutes,
        "extra_minutes": extra_minutes,
        "weekly_overtime_minutes": weekly_overtime_minutes,
        "weekly_debt_minutes": weekly_debt_minutes,
        "weeks_count": len(week_details),
        "total_hhmm": minutes_to_duration_hhmm(total_minutes),
        "remaining_hhmm": minutes_to_duration_hhmm(remaining_minutes),
        "target_hhmm": minutes_to_duration_hhmm(target_minutes),
        "extra_hhmm": minutes_to_duration_hhmm(extra_minutes),
        "weekly_overtime_hhmm": minutes_to_duration_hhmm(weekly_overtime_minutes),
        "weekly_debt_hhmm": minutes_to_duration_hhmm(weekly_debt_minutes),
    }

    return metrics, week_details


def month_calendar(df: pd.DataFrame, month_date: date) -> tuple[pd.DataFrame, pd.DataFrame]:
    first_day = month_date.replace(day=1)
    next_month = (first_day.replace(day=28) + timedelta(days=4)).replace(day=1)
    last_day = next_month - timedelta(days=1)

    all_days = pd.date_range(first_day, last_day, freq="D")
    calendar_df = pd.DataFrame({"work_date": all_days})

    if df.empty:
        calendar_df["total_minutes"] = 0
        calendar_df["is_holiday"] = False
        calendar_df["work_mode"] = None
    else:
        work = df.copy()
        work["date"] = work["work_date"].dt.normalize()
        work["is_holiday"] = work.get("is_holiday", False)
        work["work_mode"] = work.get("work_mode")
        work = work.groupby("date", as_index=False).agg(
            total_minutes=("total_minutes", "sum"),
            is_holiday=("is_holiday", "max"),
            work_mode=("work_mode", "first"),
        )
        calendar_df = calendar_df.merge(work, left_on="work_date", right_on="date", how="left")
        calendar_df["total_minutes"] = calendar_df["total_minutes"].fillna(0).astype(int)
        calendar_df["is_holiday"] = calendar_df["is_holiday"].fillna(False).astype(bool)
        calendar_df["work_mode"] = calendar_df["work_mode"].where(
            pd.notna(calendar_df["work_mode"]), None
        )

    holiday_mask = calendar_df["is_holiday"].fillna(False)
    calendar_df.loc[holiday_mask, "total_minutes"] = 0

    calendar_df["day_number"] = calendar_df["work_date"].dt.day
    calendar_df["weekday_idx"] = calendar_df["work_date"].dt.weekday
    calendar_df["week_in_month"] = ((calendar_df["work_date"].dt.day - 1 + first_day.weekday()) // 7) + 1
    calendar_df["hours_text"] = calendar_df["total_minutes"].apply(minutes_to_human)

    pivot = calendar_df.pivot(index="week_in_month", columns="weekday_idx", values="total_minutes").fillna(0)
    labels = calendar_df.pivot(index="week_in_month", columns="weekday_idx", values="day_number")

    return pivot, labels


def remuneration_breakdown(
    df: pd.DataFrame,
    month_date: date,
    config: dict,
    day_target_minutes: int = DAY_TARGET_MINUTES,
    bonus_applied: bool = False,
) -> dict:
    metrics, _ = month_metrics(df, month_date, day_target_minutes=day_target_minutes)
    total_minutes = int(metrics.get("total_minutes", 0))
    target_minutes = int(metrics.get("target_minutes", 0))

    worked_hours = total_minutes / 60
    target_hours = target_minutes / 60

    valor_base = float(config.get("valor_base", 0))
    valor_hora = float(config.get("valor_hora", 0))
    valor_bonus = float(config.get("valor_bonus", 0))
    valor_aux_transporte = float(config.get("valor_aux_transporte", 0))

    if total_minutes >= target_minutes:
        horas_excedentes = (total_minutes - target_minutes) / 60
        horas_faltantes = 0
        ajuste_horas = valor_hora * horas_excedentes
    else:
        horas_excedentes = 0
        horas_faltantes = (target_minutes - total_minutes) / 60
        ajuste_horas = -valor_hora * horas_faltantes

    month_start = month_date.replace(day=1)
    month_end = (pd.Timestamp(month_start) + pd.offsets.MonthEnd(0)).date()

    presencial_days = 0
    if not df.empty:
        month_mask = (df["work_date"].dt.date >= month_start) & (
            df["work_date"].dt.date <= month_end
        )
        month_df = df.loc[month_mask].copy()
        if "is_holiday" in month_df.columns:
            month_df = month_df[~month_df["is_holiday"].fillna(False).astype(bool)]
        if "work_mode" in month_df.columns:
            presencial = month_df[month_df["work_mode"] == "Presencial"]
            presencial_days = presencial["work_date"].dt.date.nunique()

    aux_transporte_total = presencial_days * valor_aux_transporte
    bonus_total = valor_bonus if bonus_applied else 0
    total_remuneracao = valor_base + ajuste_horas + bonus_total + aux_transporte_total

    return {
        "valor_base": valor_base,
        "valor_hora": valor_hora,
        "valor_bonus": valor_bonus,
        "valor_aux_transporte": valor_aux_transporte,
        "worked_hours": worked_hours,
        "target_hours": target_hours,
        "horas_excedentes": horas_excedentes,
        "horas_faltantes": horas_faltantes,
        "ajuste_horas": ajuste_horas,
        "presencial_days": presencial_days,
        "aux_transporte_total": aux_transporte_total,
        "bonus_total": bonus_total,
        "total_remuneracao": total_remuneracao,
    }
