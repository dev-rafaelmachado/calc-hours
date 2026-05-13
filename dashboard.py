from __future__ import annotations

from datetime import date, datetime, timedelta
from io import StringIO

import pandas as pd
import streamlit as st

from hours_app.constants import DAY_LABELS, DAY_TARGET_MINUTES, week_end_for, week_start_for
from hours_app.db import (
    authenticate_user,
    delete_entry,
    fetch_entries,
    init_db,
    insert_entry,
    insert_many,
    get_remuneration_config,
    reset_entries,
    update_entries_by_date,
    update_entry,
    update_remuneration_config,
)
from hours_app.services import (
    add_week_fields,
    build_live_today_projection,
    current_week_summary,
    forecast_for_current_week,
    month_metrics,
    remuneration_breakdown,
    weekly_summary,
)
from hours_app.time_utils import (
    compute_total_minutes,
    minutes_to_duration_hhmm,
    minutes_to_human,
    parse_hhmm,
)

DB_PATH = None
AUTHENTICATED_KEY = "authenticated"
AUTH_USER_KEY = "auth_user"
WORK_MODE_OPTIONS = ["", "Home office", "Presencial"]


def bootstrap_db() -> None:
    init_db(DB_PATH)


def _ensure_auth_state() -> None:
    if AUTHENTICATED_KEY not in st.session_state:
        st.session_state[AUTHENTICATED_KEY] = False
    if AUTH_USER_KEY not in st.session_state:
        st.session_state[AUTH_USER_KEY] = ""


def _ensure_day_target_state() -> None:
    if "day_target_hours" not in st.session_state:
        st.session_state["day_target_hours"] = DAY_TARGET_MINUTES / 60


def render_settings() -> int:
    _ensure_day_target_state()
    st.sidebar.subheader("Configurações")
    hours = st.sidebar.number_input(
        "Horas por dia útil",
        min_value=0.0,
        max_value=24.0,
        step=0.5,
        value=float(st.session_state["day_target_hours"]),
    )
    st.session_state["day_target_hours"] = hours

    config = get_remuneration_config(DB_PATH)
    with st.sidebar.expander("Configuração de remuneração", expanded=True):
        with st.form("remuneration_config_form"):
            valor_base = st.number_input(
                "Valor base (mensal)",
                min_value=0.0,
                value=float(config.get("valor_base", 0)),
                step=100.0,
                key="remuneration_valor_base",
            )
            valor_hora = st.number_input(
                "Valor por hora",
                min_value=0.0,
                value=float(config.get("valor_hora", 0)),
                step=1.0,
                key="remuneration_valor_hora",
            )
            valor_bonus = st.number_input(
                "Valor do bônus",
                min_value=0.0,
                value=float(config.get("valor_bonus", 0)),
                step=50.0,
                key="remuneration_valor_bonus",
            )
            valor_aux_transporte = st.number_input(
                "Auxílio-transporte por dia presencial",
                min_value=0.0,
                value=float(config.get("valor_aux_transporte", 0)),
                step=1.0,
                key="remuneration_valor_aux",
            )

            save_clicked = st.form_submit_button("Salvar configurações", type="primary")
            if save_clicked:
                update_remuneration_config(
                    DB_PATH,
                    config_id=config.get("id"),
                    valor_base=valor_base,
                    valor_hora=valor_hora,
                    valor_bonus=valor_bonus,
                    valor_aux_transporte=valor_aux_transporte,
                )
                st.success("Configurações salvas.")

    return max(int(round(hours * 60)), 0)


def render_auth_gate() -> None:
    _ensure_auth_state()

    if st.session_state[AUTHENTICATED_KEY]:
        c1, c2 = st.columns([0.8, 0.2])
        c1.caption(f"Autenticado como: {st.session_state[AUTH_USER_KEY]}")
        if c2.button("Sair"):
            st.session_state[AUTHENTICATED_KEY] = False
            st.session_state[AUTH_USER_KEY] = ""
            st.rerun()
        return

    st.subheader("🔐 Login")
    with st.form("auth_login_form"):
        login = st.text_input("Login")
        password = st.text_input("Senha", type="password")
        submit = st.form_submit_button("Entrar", type="primary")

    if submit:
        authenticated = authenticate_user(DB_PATH, login=login, password=password)
        if authenticated:
            st.session_state[AUTHENTICATED_KEY] = True
            st.session_state[AUTH_USER_KEY] = login.strip().lower()
            st.rerun()
        st.error("Login ou senha inválidos.")

    st.stop()


def render_db_controls() -> None:
    st.subheader("🗄️ Banco")
    st.caption(
        "Use para apagar os registros no Supabase quando quiser começar do zero."
    )

    confirm_reset = st.checkbox(
        "Confirmar reset total (apaga todos os registros)", value=False
    )
    if st.button("Resetar banco", type="primary"):
        if not confirm_reset:
            st.warning("Marque a confirmação antes de resetar.")
            return

        deleted_count = reset_entries(DB_PATH)
        st.success(
            f"Banco resetado com sucesso. {deleted_count} registro(s) removido(s)."
        )
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


def _normalize_work_mode(value: str | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _format_currency(value: float) -> str:
    return f"R$ {value:,.2f}"


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

        c1, c2 = st.columns(2)
        is_holiday = c1.checkbox("Marcar como feriado", value=False)
        work_mode = c2.selectbox("Modo", options=WORK_MODE_OPTIONS, index=0)
        if is_holiday:
            st.caption("Feriado: horários não são contabilizados nas metas.")

        save = st.form_submit_button("Salvar no banco")

        if save:
            if is_holiday:
                start = "00:00"
                lunch_s = "00:00"
                lunch_e = "00:00"
                end = "00:00"
                total = 0
            else:
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
                is_holiday=is_holiday,
                work_mode=_normalize_work_mode(work_mode),
            )
            st.success("Horário salvo no Supabase.")


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

        holiday_value = bool(row.get("is_holiday", False))
        work_mode_value = row.get("work_mode")
        mode_index = (
            WORK_MODE_OPTIONS.index(work_mode_value)
            if work_mode_value in WORK_MODE_OPTIONS
            else 0
        )

        c6, c7 = st.columns(2)
        is_holiday = c6.checkbox(
            "Marcar como feriado",
            value=holiday_value,
            key=f"edit_holiday_{selected_id}",
        )
        work_mode = c7.selectbox(
            "Modo",
            options=WORK_MODE_OPTIONS,
            index=mode_index,
            key=f"edit_work_mode_{selected_id}",
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
                is_holiday=is_holiday,
                work_mode=_normalize_work_mode(work_mode),
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


def render_live_today_session(
    entries: pd.DataFrame,
    enriched: pd.DataFrame,
    day_target_minutes: int,
) -> None:
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

    holiday_default = False
    work_mode_default = None
    if not today_saved.empty:
        holiday_default = bool(today_saved["is_holiday"].fillna(False).any())
        mode_candidates = today_saved["work_mode"].dropna().tolist()
        work_mode_default = mode_candidates[0] if mode_candidates else None

    c1, c2 = st.columns(2)
    is_holiday_today = c1.checkbox(
        "Hoje é feriado",
        value=holiday_default,
        key="live_today_holiday",
    )
    mode_index = (
        WORK_MODE_OPTIONS.index(work_mode_default)
        if work_mode_default in WORK_MODE_OPTIONS
        else 0
    )
    work_mode = c2.selectbox(
        "Modo do dia",
        options=WORK_MODE_OPTIONS,
        index=mode_index,
        key="live_today_work_mode",
    )
    if is_holiday_today:
        st.caption("Feriado: horas de hoje não entram nas metas da semana/mês.")

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

    planning_df = enriched.copy()
    if is_holiday_today:
        holiday_dates = set()
        if not planning_df.empty and "is_holiday" in planning_df.columns:
            holiday_dates = set(
                pd.to_datetime(planning_df["work_date"]).dt.date[
                    planning_df["is_holiday"].fillna(False).astype(bool)
                ]
            )
        if today not in holiday_dates:
            holiday_row = {col: None for col in planning_df.columns}
            holiday_row.update(
                {
                    "work_date": pd.to_datetime(today),
                    "start_time": "00:00",
                    "lunch_start_time": "00:00",
                    "lunch_end_time": "00:00",
                    "end_time": "00:00",
                    "total_minutes": 0,
                    "source": "holiday_marker",
                    "created_at": pd.Timestamp.now(),
                    "is_holiday": True,
                    "work_mode": _normalize_work_mode(work_mode),
                    "weekday": today.strftime("%A").lower(),
                    "day_label": DAY_LABELS.get(today.strftime("%A").lower()),
                    "week_start": week_start_for(today),
                    "week_end": week_end_for(today),
                    "week_key": str(week_start_for(today)),
                }
            )
            planning_df = pd.concat(
                [planning_df, pd.DataFrame([holiday_row])], ignore_index=True
            )

    projection = build_live_today_projection(
        planning_df,
        start_time=start_value,
        lunch_start_time=lunch_start_value,
        lunch_end_time=lunch_end_value,
        end_time=end_value,
        today=today,
        day_target_minutes=day_target_minutes,
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
    c4.metric("Falta p/ meta da semana", minutes_to_human(missing_dynamic_minutes))

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

    st.markdown("**Horas por dia da semana para fechar meta**")
    week_start = week_start_for(today)
    week_dates = [week_start + pd.Timedelta(days=i) for i in range(5)]

    holiday_dates = set()
    if not planning_df.empty and "is_holiday" in planning_df.columns:
        holiday_dates = set(
            pd.to_datetime(planning_df["work_date"]).dt.date[
                planning_df["is_holiday"].fillna(False).astype(bool)
            ].tolist()
        )

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

        if d_date in holiday_dates:
            value_text = "0h 00m"
            status = "Feriado"
        elif d_date < today:
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
        if invalid_fields and not is_holiday_today:
            st.error("Corrija os horários com formato inválido antes de salvar.")
            return

        if is_holiday_today:
            filled = ["00:00", "00:00", "00:00", "00:00"]
            total = 0
        else:
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
                is_holiday=is_holiday_today,
                work_mode=_normalize_work_mode(work_mode),
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
                is_holiday=is_holiday_today,
                work_mode=_normalize_work_mode(work_mode),
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

        st.success(f"{total_rows} registro(s) importado(s) para o Supabase.")


def render_day_metadata(entries: pd.DataFrame) -> None:
    st.subheader("📌 Marcar feriado / modo do dia")
    st.caption("Use para marcar datas sem precisar inserir horários.")

    c1, c2, c3 = st.columns(3)
    selected_date = c1.date_input("Data", value=date.today())
    is_holiday = c2.checkbox("Feriado", value=False)
    work_mode = c3.selectbox("Modo", options=WORK_MODE_OPTIONS, index=0)

    if st.button("Salvar marcação", type="primary"):
        normalized_mode = _normalize_work_mode(work_mode)
        if not is_holiday and not normalized_mode:
            st.warning("Selecione feriado ou um modo para salvar.")
            return

        existing = (
            entries[entries["work_date"] == selected_date]
            if not entries.empty
            else pd.DataFrame()
        )
        if not existing.empty:
            updated = update_entries_by_date(
                DB_PATH,
                work_date=selected_date.isoformat(),
                is_holiday=is_holiday,
                work_mode=normalized_mode,
            )
            if updated:
                st.success("Marcações atualizadas para o dia selecionado.")
            else:
                st.warning("Nenhum registro foi atualizado.")
        else:
            insert_entry(
                DB_PATH,
                work_date=selected_date.isoformat(),
                start_time="00:00",
                lunch_start_time="00:00",
                lunch_end_time="00:00",
                end_time="00:00",
                total_minutes=0,
                source="day_marker",
                is_holiday=is_holiday,
                work_mode=normalized_mode,
            )
            st.success("Marcações salvas para o dia selecionado.")

        st.rerun()


def render_simulacao_livre(df: pd.DataFrame, day_target_minutes: int) -> None:
    st.subheader("🧪 simulação livre")
    st.caption("Visão interativa da semana atual. As edições não são salvas no banco.")

    today = date.today()
    week_start = week_start_for(today)
    week_dates = [week_start + pd.Timedelta(days=i) for i in range(5)]

    forecast, details = forecast_for_current_week(
        df, today=today, day_target_minutes=day_target_minutes
    )
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
    holiday_dates = set()
    if not df.empty and "is_holiday" in df.columns:
        holiday_dates = set(
            df["work_date"].dt.date[
                df["is_holiday"].fillna(False).astype(bool)
            ].tolist()
        )

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

        if row_date not in holiday_dates:
            week_total_minutes += row_minutes
            if row_date <= today:
                worked_until_today_minutes += row_minutes

    if invalid_rows:
        st.warning(
            f"Linhas inválidas na simulação: {invalid_rows}. Use data válida e horários HH:MM."
        )

    business_days = [week_start + timedelta(days=i) for i in range(5)]
    effective_days = [d for d in business_days if d not in holiday_dates]
    week_target_minutes = len(effective_days) * max(int(day_target_minutes), 0)

    previous_weeks_debt = int(details.get("previous_weeks_debt", 0))
    missing_40h = max(week_target_minutes - week_total_minutes, 0)
    overtime_vs_40h = max(week_total_minutes - week_target_minutes, 0)
    compensation_remaining = max(previous_weeks_debt - overtime_vs_40h, 0)
    plus_hours = max(
        week_total_minutes - (week_target_minutes + previous_weeks_debt), 0
    )

    st.markdown("**Resultados da simulação**")
    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Projeção total da semana", minutes_to_human(week_total_minutes))
    c2.metric("Trabalhado", minutes_to_human(worked_until_today_minutes))
    c3.metric("Falta p/ meta da semana", minutes_to_human(missing_40h))
    c4.metric("Compensação restante faltante", minutes_to_human(compensation_remaining))
    c5.metric("Quantidade de horas a+ feitas", minutes_to_human(plus_hours))


def render_current_week(df: pd.DataFrame, day_target_minutes: int) -> None:
    st.subheader("📅 Controle da semana atual")
    summary = current_week_summary(df, day_target_minutes=day_target_minutes)

    m1, m2, m3 = st.columns(3)
    m1.metric("Semana", f"{summary['week_start']} a {summary['week_end']}")
    m2.metric("Trabalhado", summary["worked_human"])
    m3.metric("Falta p/ meta da semana", summary["remaining_human"])

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
                "is_holiday",
                "work_mode",
            ]
        ].copy()
        view["hours_hhmm"] = view["total_minutes"].apply(minutes_to_duration_hhmm)
        view = view.drop(columns=["total_minutes"])
        view["is_holiday"] = view["is_holiday"].apply(
            lambda value: "Sim" if bool(value) else "Não"
        )
        view.columns = [
            "Data",
            "Dia",
            "Entrada",
            "Saída almoço",
            "Volta almoço",
            "Saída",
            "Origem",
            "Feriado",
            "Modo",
            "Horas (HH:MM)",
        ]
        st.dataframe(view, width="stretch", hide_index=True)

    forecast, details = forecast_for_current_week(
        df, day_target_minutes=day_target_minutes
    )
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


def render_monthly_metrics(df: pd.DataFrame, day_target_minutes: int) -> None:
    st.subheader("📊 Métricas do mês")
    selected_month = st.date_input(
        "Mês para métricas",
        value=date.today().replace(day=1),
        key="month_metrics_picker",
    )
    selected_month = selected_month.replace(day=1)

    metrics, week_details = month_metrics(
        df, selected_month, day_target_minutes=day_target_minutes
    )

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

    indicators_df = pd.DataFrame(
        [
            {"Indicador": "Horas no mês", "Valor": metrics["total_hhmm"]},
            {"Indicador": "Meta do mês", "Valor": metrics["target_hhmm"]},
            {
                "Indicador": "Falta para fechar mês",
                "Valor": metrics["remaining_hhmm"],
            },
            {"Indicador": "Extra no mês", "Valor": metrics["extra_hhmm"]},
            {
                "Indicador": "Horas extras por semana (soma)",
                "Valor": metrics["weekly_overtime_hhmm"],
            },
            {
                "Indicador": "Horas faltantes de semanas",
                "Valor": metrics["weekly_debt_hhmm"],
            },
        ]
    )

    csv_buffer = StringIO()
    indicators_df.to_csv(csv_buffer, index=False)
    csv_buffer.write("\n")
    csv_buffer.write("Detalhe semanal no mês\n")
    week_details.to_csv(csv_buffer, index=False)

    st.download_button(
        "Baixar métricas do mês (CSV)",
        data=csv_buffer.getvalue().encode("utf-8-sig"),
        file_name=f"metricas_mes_{selected_month.strftime('%Y_%m')}.csv",
        mime="text/csv",
        width="stretch",
    )


def render_remuneration(df: pd.DataFrame, day_target_minutes: int) -> None:
    st.subheader("💰 Remuneração do mês")

    selected_month = st.date_input(
        "Mês de referência",
        value=date.today().replace(day=1),
        key="remuneration_month_picker",
    )
    selected_month = selected_month.replace(day=1)

    config = get_remuneration_config(DB_PATH)

    bonus_applied = st.checkbox("Bateu a meta?", value=False, key="remuneration_bonus")

    breakdown = remuneration_breakdown(
        df,
        selected_month,
        config,
        day_target_minutes=day_target_minutes,
        bonus_applied=bonus_applied,
    )

    st.markdown("**Prévia de remuneração**")
    r1, r2, r3, r4 = st.columns(4)
    r1.metric("Salário base", _format_currency(breakdown["valor_base"]))
    r2.metric("Ajuste por horas", _format_currency(breakdown["ajuste_horas"]))
    r3.metric("Bônus", _format_currency(breakdown["bonus_total"]))
    r4.metric("Aux. transporte", _format_currency(breakdown["aux_transporte_total"]))

    st.metric("Remuneração estimada", _format_currency(breakdown["total_remuneracao"]))

    details = pd.DataFrame(
        [
            {"Indicador": "Horas trabalhadas", "Valor": f"{breakdown['worked_hours']:.2f}"},
            {"Indicador": "Meta de horas", "Valor": f"{breakdown['target_hours']:.2f}"},
            {"Indicador": "Horas excedentes", "Valor": f"{breakdown['horas_excedentes']:.2f}"},
            {"Indicador": "Horas faltantes", "Valor": f"{breakdown['horas_faltantes']:.2f}"},
            {"Indicador": "Dias presenciais", "Valor": f"{breakdown['presencial_days']}"},
        ]
    )
    st.dataframe(details, width="stretch", hide_index=True)

    st.button("Gerar Relatório Mensal Final", disabled=True)


def render_monthly_csv_export(df: pd.DataFrame) -> None:
    st.subheader("📤 Exportar CSV mensal")
    selected_month = st.date_input(
        "Mês para exportação",
        value=date.today().replace(day=1),
        key="month_export_picker",
    )
    selected_month = selected_month.replace(day=1)

    if df.empty:
        st.info("Sem registros para exportar.")
        return

    month_start = selected_month
    month_end = (pd.Timestamp(month_start) + pd.offsets.MonthEnd(0)).date()

    in_month = (df["work_date"].dt.date >= month_start) & (
        df["work_date"].dt.date <= month_end
    )
    month_rows = df.loc[in_month].copy().sort_values(["work_date", "start_time"])

    if month_rows.empty:
        st.info("Não há registros no mês selecionado.")
        return

    def lunch_duration_hhmm(row: pd.Series) -> str:
        try:
            lunch_start = parse_hhmm(str(row["lunch_start_time"]))
            lunch_end = parse_hhmm(str(row["lunch_end_time"]))
            return minutes_to_duration_hhmm(max(lunch_end - lunch_start, 0))
        except Exception:
            return "00:00"

    month_rows["Dia"] = month_rows["work_date"].dt.strftime("%d/%m/%Y")
    month_rows["Entrada"] = month_rows["start_time"].astype(str)
    month_rows["Saída almoço"] = month_rows["lunch_start_time"].astype(str)
    month_rows["Almoço"] = month_rows.apply(lunch_duration_hhmm, axis=1)
    month_rows["Volta almoço"] = month_rows["lunch_end_time"].astype(str)
    month_rows["Saída"] = month_rows["end_time"].astype(str)
    month_rows["Total HH:MM"] = month_rows["total_minutes"].apply(
        minutes_to_duration_hhmm
    )

    export_df = month_rows[
        [
            "Dia",
            "Entrada",
            "Saída almoço",
            "Almoço",
            "Volta almoço",
            "Saída",
            "Total HH:MM",
        ]
    ]
    st.dataframe(export_df, width="stretch", hide_index=True)

    csv_data = export_df.to_csv(index=False).encode("utf-8-sig")
    filename = f"horas_{selected_month.strftime('%Y_%m')}.csv"
    st.download_button(
        "Baixar CSV do mês",
        data=csv_data,
        file_name=filename,
        mime="text/csv",
        width="stretch",
    )


def render_weekly_summary(df: pd.DataFrame, day_target_minutes: int) -> None:
    st.subheader("🧾 Resumo por semana")
    summary_df = weekly_summary(df, day_target_minutes=day_target_minutes)

    if summary_df.empty:
        st.info("Sem dados no resumo por semana para exportar.")
        return

    st.dataframe(summary_df, width="stretch", hide_index=True)

    csv_data = summary_df.to_csv(index=False).encode("utf-8-sig")
    st.download_button(
        "Baixar resumo por semana (CSV)",
        data=csv_data,
        file_name="resumo_por_semana.csv",
        mime="text/csv",
        width="stretch",
    )


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
        work["is_holiday"] = work.get("is_holiday", False)
        work["work_mode"] = work.get("work_mode")
        grouped = work.groupby("work_day", as_index=False).agg(
            total_minutes=("total_minutes", "sum"),
            is_holiday=("is_holiday", "max"),
            work_mode=("work_mode", "first"),
        )
        events = [
            {
                "title": (
                    "Feriado"
                    if bool(row["is_holiday"])
                    else f"{minutes_to_human(int(row['total_minutes']))}"
                )
                + (
                    f" • {row['work_mode']}"
                    if row.get("work_mode")
                    else ""
                ),
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
        "Projeto organizado com Supabase, controle da semana atual, resumo semanal e calendário."
    )

    render_auth_gate()

    day_target_minutes = render_settings()

    render_csv_import()
    render_manual_entry()

    entries = fetch_entries(DB_PATH)
    render_day_metadata(entries)
    enriched = add_week_fields(entries)

    st.divider()
    render_live_today_session(entries, enriched, day_target_minutes)

    st.divider()
    render_edit_past_entries(entries)

    st.divider()
    render_simulacao_livre(enriched, day_target_minutes)

    if entries.empty:
        st.info(
            "Sem registros no banco ainda. Importe CSV ou insira horários manualmente."
        )
        st.stop()

    st.divider()
    render_current_week(enriched, day_target_minutes)

    st.divider()
    render_monthly_metrics(enriched, day_target_minutes)

    st.divider()
    render_remuneration(enriched, day_target_minutes)

    st.divider()
    render_monthly_csv_export(enriched)

    st.divider()
    render_weekly_summary(enriched, day_target_minutes)

    st.divider()
    render_calendar(enriched)

    st.divider()
    render_db_controls()


if __name__ == "__main__":
    main()
