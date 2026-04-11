from __future__ import annotations

from datetime import date, datetime
from io import StringIO
from pathlib import Path

import pandas as pd
import streamlit as st

from hours_app.constants import (
    DAY_LABELS,
    WEEK_TARGET_MINUTES,
    week_start_for,
)
from hours_app.db import (
    delete_entry,
    fetch_entries,
    init_db,
    insert_entry,
    insert_many,
    update_entry,
)
from hours_app.services import (
    add_week_fields,
    build_live_today_projection,
    current_week_summary,
    forecast_for_current_week,
    month_metrics,
    weekly_summary,
)
from hours_app.time_utils import (
    compute_total_minutes,
    minutes_to_duration_hhmm,
    minutes_to_human,
    parse_hhmm,
)

DB_PATH = Path("data/hours.db")


def bootstrap_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    init_db(DB_PATH)


def render_db_controls() -> None:
    st.subheader("🗄️ Banco")
    st.caption("Use para resetar o banco SQLite quando quiser começar do zero.")

    confirm_reset = st.checkbox(
        "Confirmar reset total (apaga todos os registros)", value=False
    )
    if st.button("Resetar banco", type="primary"):
        if not confirm_reset:
            st.warning("Marque a confirmação antes de resetar.")
            return

        if DB_PATH.exists():
            DB_PATH.unlink()

        bootstrap_db()
        st.success("Banco resetado com sucesso.")
        st.rerun()


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    aliases = {
        "day": "day",
        "date": "date",
        "start": "start",
        "lunchstart": "lunchStart",
        "lunch_start": "lunchStart",
        "lunchend": "lunchEnd",
        "lunch_end": "lunchEnd",
        "end": "end",
    }

    renamed = {}
    for col in df.columns:
        key = col.strip().replace(" ", "").lower()
        renamed[col] = aliases.get(key, key)

    return df.rename(columns=renamed)


def parse_csv_to_records(uploaded_file, reference_monday: date) -> list[dict]:
    df = pd.read_csv(StringIO(uploaded_file.getvalue().decode("utf-8")))
    df = normalize_columns(df)

    records: list[dict] = []

    for _, row in df.iterrows():
        row = row.fillna("")
        start = str(row.get("start", "")).strip()
        lunch_start = str(row.get("lunchStart", "")).strip()
        lunch_end = str(row.get("lunchEnd", "")).strip()
        end = str(row.get("end", "")).strip()

        try:
            total = compute_total_minutes(start, lunch_start, lunch_end, end)
        except Exception:
            continue

        if "date" in df.columns and str(row.get("date", "")).strip():
            try:
                work_date = pd.to_datetime(row["date"]).date()
            except Exception:
                continue
        else:
            day_name = str(row.get("day", "")).strip().lower()
            if day_name not in DAY_LABELS:
                continue
            offset = [
                "monday",
                "tuesday",
                "wednesday",
                "thursday",
                "friday",
                "saturday",
                "sunday",
            ].index(day_name)
            work_date = reference_monday + pd.Timedelta(days=offset)
            work_date = pd.to_datetime(work_date).date()

        records.append(
            {
                "work_date": work_date.isoformat(),
                "start_time": start,
                "lunch_start_time": lunch_start,
                "lunch_end_time": lunch_end,
                "end_time": end,
                "total_minutes": total,
                "source": uploaded_file.name,
            }
        )

    return records


def render_manual_entry() -> None:
    st.subheader("✍️ Inserir horário")
    with st.form("manual_entry", clear_on_submit=True):
        col1, col2 = st.columns(2)
        work_date = col1.date_input("Data", value=date.today())
        start_time = col2.time_input(
            "Entrada", value=datetime.strptime("09:00", "%H:%M").time()
        )

        col3, col4, col5 = st.columns(3)
        lunch_start = col3.time_input(
            "Saída almoço", value=datetime.strptime("12:00", "%H:%M").time()
        )
        lunch_end = col4.time_input(
            "Volta almoço", value=datetime.strptime("13:00", "%H:%M").time()
        )
        end_time = col5.time_input(
            "Saída", value=datetime.strptime("18:00", "%H:%M").time()
        )

        save = st.form_submit_button("Salvar no banco")

        if save:
            start = start_time.strftime("%H:%M")
            lunch_s = lunch_start.strftime("%H:%M")
            lunch_e = lunch_end.strftime("%H:%M")
            end = end_time.strftime("%H:%M")
            total = compute_total_minutes(start, lunch_s, lunch_e, end)

            insert_entry(
                DB_PATH,
                work_date=work_date.isoformat(),
                start_time=start,
                lunch_start_time=lunch_s,
                lunch_end_time=lunch_e,
                end_time=end,
                total_minutes=total,
                source="manual",
            )
            st.success("Horário salvo no SQLite.")


def render_edit_past_entries(entries: pd.DataFrame) -> None:
    st.subheader("🛠️ Editar ou deletar registros passados")

    if entries.empty:
        st.info("Sem registros para editar.")
        return

    today = date.today()
    past_entries = (
        entries[entries["work_date"] < today]
        .copy()
        .sort_values("work_date", ascending=False)
    )

    if past_entries.empty:
        st.info("Ainda não há registros anteriores a hoje.")
        return

    options = past_entries["id"].tolist()
    labels = {
        int(
            row["id"]
        ): f"#{int(row['id'])} • {row['work_date']} • {row['start_time']} - {row['end_time']}"
        for _, row in past_entries.iterrows()
    }
    selected_id = st.selectbox(
        "Selecione o registro",
        options=options,
        format_func=lambda item: labels.get(int(item), str(item)),
    )

    row = past_entries[past_entries["id"] == selected_id].iloc[0]

    with st.form(f"edit_entry_{selected_id}"):
        col1, col2 = st.columns(2)
        work_date = col1.date_input(
            "Data", value=row["work_date"], key=f"edit_date_{selected_id}"
        )
        start_time = col2.time_input(
            "Entrada",
            value=datetime.strptime(str(row["start_time"]), "%H:%M").time(),
            key=f"edit_start_{selected_id}",
        )

        col3, col4, col5 = st.columns(3)
        lunch_start = col3.time_input(
            "Saída almoço",
            value=datetime.strptime(str(row["lunch_start_time"]), "%H:%M").time(),
            key=f"edit_lunch_start_{selected_id}",
        )
        lunch_end = col4.time_input(
            "Volta almoço",
            value=datetime.strptime(str(row["lunch_end_time"]), "%H:%M").time(),
            key=f"edit_lunch_end_{selected_id}",
        )
        end_time = col5.time_input(
            "Saída",
            value=datetime.strptime(str(row["end_time"]), "%H:%M").time(),
            key=f"edit_end_{selected_id}",
        )

        confirm_delete = st.checkbox(
            "Confirmar exclusão deste registro",
            value=False,
            key=f"delete_{selected_id}",
        )

        b1, b2 = st.columns(2)
        save_clicked = b1.form_submit_button("Salvar alterações", type="primary")
        delete_clicked = b2.form_submit_button("Deletar registro")

        if save_clicked:
            start = start_time.strftime("%H:%M")
            lunch_s = lunch_start.strftime("%H:%M")
            lunch_e = lunch_end.strftime("%H:%M")
            end = end_time.strftime("%H:%M")
            total = compute_total_minutes(start, lunch_s, lunch_e, end)

            changed = update_entry(
                DB_PATH,
                entry_id=int(selected_id),
                work_date=work_date.isoformat(),
                start_time=start,
                lunch_start_time=lunch_s,
                lunch_end_time=lunch_e,
                end_time=end,
                total_minutes=total,
            )
            if changed:
                st.success("Registro atualizado.")
                st.rerun()
            st.warning("Nenhum registro foi atualizado.")

        if delete_clicked:
            if not confirm_delete:
                st.warning("Marque a confirmação para deletar.")
            else:
                changed = delete_entry(DB_PATH, entry_id=int(selected_id))
                if changed:
                    st.success("Registro deletado.")
                    st.rerun()
                st.warning("Nenhum registro foi deletado.")


def render_live_today_session(entries: pd.DataFrame, enriched: pd.DataFrame) -> None:
    st.subheader("🟢 Dia atual em andamento")
    st.caption(
        "Você preenche aos poucos. A cada novo horário, a previsão do dia e dos próximos dias da semana é recalculada."
    )

    today = date.today()
    today_saved = (
        entries[entries["work_date"] == today].copy()
        if not entries.empty
        else pd.DataFrame()
    )

    start_value = st.text_input("Entrada (HH:MM)", value="", key="live_today_start")
    lunch_start_value = st.text_input(
        "Saída almoço (HH:MM)", value="", key="live_today_lunch_start"
    )
    lunch_end_value = st.text_input(
        "Volta almoço (HH:MM)", value="", key="live_today_lunch_end"
    )
    end_value = st.text_input("Saída (HH:MM)", value="", key="live_today_end")

    invalid_fields = []
    for label, value in [
        ("Entrada", start_value),
        ("Saída almoço", lunch_start_value),
        ("Volta almoço", lunch_end_value),
        ("Saída", end_value),
    ]:
        if value.strip():
            try:
                parse_hhmm(value)
            except Exception:
                invalid_fields.append(label)

    if invalid_fields:
        st.warning(f"Formato inválido em: {', '.join(invalid_fields)}. Use HH:MM.")

    projection = build_live_today_projection(
        enriched,
        start_time=start_value,
        lunch_start_time=lunch_start_value,
        lunch_end_time=lunch_end_value,
        end_time=end_value,
        today=today,
    )

    worked_dynamic_minutes = int(projection["details"]["worked_current_week"]) + int(
        projection["today_minutes"]
    )
    missing_dynamic_minutes = max(
        int(projection["details"]["target_to_plan"]) - int(projection["today_minutes"]),
        0,
    )

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Carga prevista para hoje", projection["today_minutes_human"])
    c2.metric(
        "Projeção total da semana", projection["details"]["projected_week_total_human"]
    )
    c3.metric("Trabalhado", minutes_to_human(worked_dynamic_minutes))
    c4.metric("Falta p/ 40h", minutes_to_human(missing_dynamic_minutes))

    st.markdown("**Previsão dinâmica para hoje**")
    p1, p2, p3, p4 = st.columns(4)
    p1.metric("Entrada", projection["start_time"])
    p2.metric("Saída almoço", projection["lunch_start_time"])
    p3.metric("Volta almoço", projection["lunch_end_time"])
    p4.metric("Saída", projection["end_time"])

    st.markdown("**Recalculo da previsão consolidada (hoje + próximos dias)**")
    if projection["forecast"].empty:
        st.info("Sem dias pendentes para planejar nesta semana.")
    else:
        st.dataframe(projection["forecast"], width="stretch", hide_index=True)

    st.markdown("**Horas por dia da semana para fechar meta (40h + compensação)**")
    week_start = week_start_for(today)
    week_dates = [week_start + pd.Timedelta(days=i) for i in range(5)]

    actual_by_date: dict[str, int] = {}
    if not enriched.empty:
        in_week = (enriched["work_date"].dt.date >= week_start) & (
            enriched["work_date"].dt.date <= week_start + pd.Timedelta(days=4)
        )
        week_rows = enriched.loc[in_week].copy()
        if not week_rows.empty:
            week_rows["work_day"] = week_rows["work_date"].dt.date
            grouped_actual = week_rows.groupby("work_day", as_index=False)[
                "total_minutes"
            ].sum()
            actual_by_date = {
                row["work_day"].isoformat(): int(row["total_minutes"])
                for _, row in grouped_actual.iterrows()
            }

    forecast_by_date: dict[str, str] = {}
    if not projection["forecast"].empty:
        forecast_by_date = {
            str(row["Data"]): str(row["Horas sugeridas"])
            for _, row in projection["forecast"].iterrows()
        }

    week_plan_rows = []
    for d in week_dates:
        d_date = pd.to_datetime(d).date()
        d_iso = d_date.isoformat()
        weekday_key = d_date.strftime("%A").lower()

        if d_date < today:
            minutes = actual_by_date.get(d_iso, 0)
            value_text = minutes_to_human(minutes)
            status = "Realizado"
        elif d_date == today:
            value_text = projection["today_minutes_human"]
            status = "Hoje (dinâmico)"
        else:
            value_text = forecast_by_date.get(d_iso, "0h 00m")
            status = "Planejado"

        week_plan_rows.append(
            {
                "Dia": DAY_LABELS.get(weekday_key, weekday_key),
                "Data": d_iso,
                "Horas": value_text,
                "Tipo": status,
            }
        )

    st.dataframe(pd.DataFrame(week_plan_rows), width="stretch", hide_index=True)

    if st.button("Salvar registro do dia atual", type="primary"):
        if invalid_fields:
            st.error("Corrija os horários com formato inválido antes de salvar.")
            return

        filled = [
            start_value.strip(),
            lunch_start_value.strip(),
            lunch_end_value.strip(),
            end_value.strip(),
        ]
        if not all(filled):
            st.error("Para salvar, preencha os 4 horários.")
            return

        total = compute_total_minutes(*filled)

        if not today_saved.empty:
            entry_id = int(today_saved.sort_values("created_at").iloc[0]["id"])
            update_entry(
                DB_PATH,
                entry_id=entry_id,
                work_date=today.isoformat(),
                start_time=filled[0],
                lunch_start_time=filled[1],
                lunch_end_time=filled[2],
                end_time=filled[3],
                total_minutes=total,
            )
            st.success("Registro de hoje atualizado.")
        else:
            insert_entry(
                DB_PATH,
                work_date=today.isoformat(),
                start_time=filled[0],
                lunch_start_time=filled[1],
                lunch_end_time=filled[2],
                end_time=filled[3],
                total_minutes=total,
                source="manual_live",
            )
            st.success("Registro de hoje salvo.")

        st.rerun()


def render_csv_import() -> None:
    st.subheader("📥 Importar CSV")
    st.caption(
        "Se o CSV não tiver coluna date, ele usa o dia da semana + segunda de referência."
    )

    default_monday = week_start_for(date.today())
    reference_monday = st.date_input(
        "Segunda da semana de referência", value=default_monday
    )
    files = st.file_uploader("CSV(s)", type=["csv"], accept_multiple_files=True)

    import_clicked = st.button("Importar", width="stretch")

    if import_clicked and files:
        total_rows = 0
        for uploaded in files:
            records = parse_csv_to_records(uploaded, reference_monday)
            total_rows += insert_many(DB_PATH, records)

        st.success(f"{total_rows} registro(s) importado(s) para o SQLite.")


def render_simulacao_livre(df: pd.DataFrame) -> None:
    st.subheader("🧪 simulação livre")
    st.caption("Visão interativa da semana atual. As edições não são salvas no banco.")

    today = date.today()
    week_start = week_start_for(today)
    week_dates = [week_start + pd.Timedelta(days=i) for i in range(5)]

    forecast, details = forecast_for_current_week(df, today=today)
    forecast_map = {}
    if not forecast.empty:
        forecast_map = {
            str(row["Data"]): {
                "Entrada sugerida": str(row["Entrada sugerida"]),
                "Saída almoço sugerida": str(row["Saída almoço sugerida"]),
                "Volta almoço sugerida": str(row["Volta almoço sugerida"]),
                "Saída sugerida": str(row["Saída sugerida"]),
            }
            for _, row in forecast.iterrows()
        }

    week_entries = pd.DataFrame()
    if not df.empty:
        in_week = (df["work_date"].dt.date >= week_start) & (
            df["work_date"].dt.date <= week_start + pd.Timedelta(days=4)
        )
        week_entries = (
            df.loc[in_week].copy().sort_values(["work_date", "created_at"])
        )  # mantém o último do dia

    existing_by_day: dict[str, dict] = {}
    if not week_entries.empty:
        week_entries["work_day"] = week_entries["work_date"].dt.date.astype(str)
        last_per_day = week_entries.groupby("work_day", as_index=False).tail(1)
        existing_by_day = {
            str(row["work_day"]): {
                "Entrada": str(row["start_time"]),
                "Saída almoço": str(row["lunch_start_time"]),
                "Volta almoço": str(row["lunch_end_time"]),
                "Saída": str(row["end_time"]),
            }
            for _, row in last_per_day.iterrows()
        }

    seed_rows = []
    for d in week_dates:
        d_date = pd.to_datetime(d).date()
        d_iso = d_date.isoformat()
        weekday_key = d_date.strftime("%A").lower()

        if d_iso in existing_by_day:
            times = existing_by_day[d_iso]
        else:
            suggestion = forecast_map.get(d_iso, {})
            times = {
                "Entrada": suggestion.get("Entrada sugerida", "09:00"),
                "Saída almoço": suggestion.get("Saída almoço sugerida", "12:00"),
                "Volta almoço": suggestion.get("Volta almoço sugerida", "13:00"),
                "Saída": suggestion.get("Saída sugerida", "18:00"),
            }

        seed_rows.append(
            {
                "Dia": DAY_LABELS.get(weekday_key, weekday_key),
                "Data": d_iso,
                "Entrada": times["Entrada"],
                "Saída almoço": times["Saída almoço"],
                "Volta almoço": times["Volta almoço"],
                "Saída": times["Saída"],
            }
        )

    editor_df = pd.DataFrame(seed_rows)
    edited_df = st.data_editor(
        editor_df,
        width="stretch",
        hide_index=True,
        num_rows="fixed",
        key="simulacao_livre_editor",
    )

    week_total_minutes = 0
    worked_until_today_minutes = 0
    invalid_rows = []

    for idx, row in edited_df.iterrows():
        try:
            row_date = pd.to_datetime(str(row["Data"])).date()
            start = str(row["Entrada"]).strip()
            lunch_start = str(row["Saída almoço"]).strip()
            lunch_end = str(row["Volta almoço"]).strip()
            end = str(row["Saída"]).strip()
            row_minutes = compute_total_minutes(start, lunch_start, lunch_end, end)
        except Exception:
            invalid_rows.append(idx + 1)
            continue

        week_total_minutes += row_minutes
        if row_date <= today:
            worked_until_today_minutes += row_minutes

    if invalid_rows:
        st.warning(
            f"Linhas inválidas na simulação: {invalid_rows}. Use data válida e horários HH:MM."
        )

    previous_weeks_debt = int(details.get("previous_weeks_debt", 0))
    missing_40h = max(WEEK_TARGET_MINUTES - week_total_minutes, 0)
    overtime_vs_40h = max(week_total_minutes - WEEK_TARGET_MINUTES, 0)
    compensation_remaining = max(previous_weeks_debt - overtime_vs_40h, 0)
    plus_hours = max(
        week_total_minutes - (WEEK_TARGET_MINUTES + previous_weeks_debt), 0
    )

    st.markdown("**Resultados da simulação**")
    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Projeção total da semana", minutes_to_human(week_total_minutes))
    c2.metric("Trabalhado", minutes_to_human(worked_until_today_minutes))
    c3.metric("Falta p/ 40h", minutes_to_human(missing_40h))
    c4.metric("Compensação restante faltante", minutes_to_human(compensation_remaining))
    c5.metric("Quantidade de horas a+ feitas", minutes_to_human(plus_hours))


def render_current_week(df: pd.DataFrame) -> None:
    st.subheader("📅 Controle da semana atual")
    summary = current_week_summary(df)

    m1, m2, m3 = st.columns(3)
    m1.metric("Semana", f"{summary['week_start']} a {summary['week_end']}")
    m2.metric("Trabalhado", summary["worked_human"])
    m3.metric("Falta p/ 40h", summary["remaining_human"])

    st.progress(
        summary["progress"],
        text=f"Progresso da semana: {summary['progress'] * 100:.1f}%",
    )

    start = summary["week_start"]
    end = summary["week_end"]
    in_week = (df["work_date"].dt.date >= start) & (df["work_date"].dt.date <= end)
    current_week_rows = df.loc[in_week].copy()

    if current_week_rows.empty:
        st.info("Ainda não há registros nesta semana.")
    else:
        view = current_week_rows[
            [
                "work_date",
                "day_label",
                "start_time",
                "lunch_start_time",
                "lunch_end_time",
                "end_time",
                "total_minutes",
                "source",
            ]
        ].copy()
        view["hours_hhmm"] = view["total_minutes"].apply(minutes_to_duration_hhmm)
        view = view.drop(columns=["total_minutes"])
        view.columns = [
            "Data",
            "Dia",
            "Entrada",
            "Saída almoço",
            "Volta almoço",
            "Saída",
            "Origem",
            "Horas (HH:MM)",
        ]
        st.dataframe(view, width="stretch", hide_index=True)

    forecast, details = forecast_for_current_week(df)
    if not forecast.empty:
        st.markdown("**Sugestão para fechar a semana**")
        st.dataframe(forecast, width="stretch", hide_index=True)

    st.markdown("**Previsão consolidada da semana**")
    c1, c2, c3 = st.columns(3)
    c1.metric(
        "Déficit desta semana",
        minutes_to_duration_hhmm(details["missing_current_week"]),
    )
    c2.metric(
        "Compensação semanas anteriores",
        minutes_to_duration_hhmm(details["previous_weeks_debt"]),
    )
    c3.metric("Projeção total da semana", details["projected_week_total_human"])


def render_monthly_metrics(df: pd.DataFrame) -> None:
    st.subheader("📊 Métricas do mês")
    selected_month = st.date_input(
        "Mês para métricas",
        value=date.today().replace(day=1),
        key="month_metrics_picker",
    )
    selected_month = selected_month.replace(day=1)

    metrics, week_details = month_metrics(df, selected_month)

    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Horas no mês", metrics["total_hhmm"])
    m2.metric("Meta do mês", metrics["target_hhmm"])
    m3.metric("Falta para fechar mês", metrics["remaining_hhmm"])
    m4.metric("Extra no mês", metrics["extra_hhmm"])

    m5, m6 = st.columns(2)
    m5.metric("Horas extras por semana (soma)", metrics["weekly_overtime_hhmm"])
    m6.metric("Horas faltantes de semanas", metrics["weekly_debt_hhmm"])

    st.markdown("**Detalhe semanal no mês**")
    st.dataframe(week_details, width="stretch", hide_index=True)


def render_weekly_summary(df: pd.DataFrame) -> None:
    st.subheader("🧾 Resumo por semana")
    summary_df = weekly_summary(df)
    st.dataframe(summary_df, width="stretch", hide_index=True)


def render_calendar(df: pd.DataFrame) -> None:
    st.subheader("🗓️ Calendário")

    base_month = date.today().replace(day=1)
    selected_month = st.date_input("Mês", value=base_month).replace(day=1)

    try:
        from streamlit_calendar import calendar as st_calendar
    except Exception:
        st.error(
            "Calendário visual não disponível. Instale dependências com: pip install -r requirements.txt"
        )
        return

    today = date.today()
    st.caption(f"Semana atual (ISO): {today.isocalendar().week}")

    if df.empty:
        events = []
    else:
        work = df.copy()
        work["work_day"] = work["work_date"].dt.date
        grouped = work.groupby("work_day", as_index=False).agg(
            total_minutes=("total_minutes", "sum")
        )
        events = [
            {
                "title": f"{minutes_to_human(int(row['total_minutes']))}",
                "start": row["work_day"].isoformat(),
                "allDay": True,
            }
            for _, row in grouped.iterrows()
        ]

    options = {
        "initialView": "dayGridMonth",
        "initialDate": selected_month.isoformat(),
        "locale": "pt-br",
        "firstDay": 1,
        "height": 700,
        "fixedWeekCount": True,
        "showNonCurrentDates": True,
        "weekNumbers": True,
        "weekText": "Sem",
        "headerToolbar": {
            "left": "prev,next today",
            "center": "title",
            "right": "dayGridMonth,timeGridWeek",
        },
        "buttonText": {
            "today": "Hoje",
            "month": "Mês",
            "week": "Semana",
        },
        "eventDisplay": "block",
    }

    st_calendar(
        events=events,
        options=options,
        key=f"hours_calendar_{selected_month.isoformat()}",
    )


def main() -> None:
    st.set_page_config(page_title="Hours Commander", page_icon="⏱️", layout="wide")
    bootstrap_db()

    st.title("⏱️ Hours Commander")
    st.caption(
        "Projeto organizado com SQLite, controle da semana atual, resumo semanal e calendário."
    )

    render_csv_import()
    render_manual_entry()

    entries = fetch_entries(DB_PATH)
    enriched = add_week_fields(entries)

    st.divider()
    render_live_today_session(entries, enriched)

    st.divider()
    render_edit_past_entries(entries)

    st.divider()
    render_simulacao_livre(enriched)

    if entries.empty:
        st.info(
            "Sem registros no banco ainda. Importe CSV ou insira horários manualmente."
        )
        st.stop()

    st.divider()
    render_current_week(enriched)

    st.divider()
    render_monthly_metrics(enriched)

    st.divider()
    render_weekly_summary(enriched)

    st.divider()
    render_calendar(enriched)

    st.divider()
    render_db_controls()


if __name__ == "__main__":
    main()
