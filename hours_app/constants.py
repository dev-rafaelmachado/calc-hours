from datetime import date, timedelta

WEEK_TARGET_MINUTES = 40 * 60
DAY_TARGET_MINUTES = 8 * 60
WEEKDAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
DAY_LABELS = {
    "monday": "Segunda",
    "tuesday": "Terça",
    "wednesday": "Quarta",
    "thursday": "Quinta",
    "friday": "Sexta",
    "saturday": "Sábado",
    "sunday": "Domingo",
}


def week_start_for(any_day: date) -> date:
    return any_day - timedelta(days=any_day.weekday())


def week_end_for(any_day: date) -> date:
    return week_start_for(any_day) + timedelta(days=6)
