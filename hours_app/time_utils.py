from datetime import datetime


def parse_hhmm(value: str) -> int:
    text = str(value).strip()
    dt = datetime.strptime(text, "%H:%M")
    return dt.hour * 60 + dt.minute


def minutes_to_human(value: int) -> str:
    sign = "-" if value < 0 else ""
    value = abs(value)
    return f"{sign}{value // 60}h {value % 60:02d}m"


def minutes_to_hhmm(value: int) -> str:
    value = value % (24 * 60)
    return f"{value // 60:02d}:{value % 60:02d}"


def minutes_to_duration_hhmm(value: int) -> str:
    sign = "-" if value < 0 else ""
    value = abs(value)
    return f"{sign}{value // 60:02d}:{value % 60:02d}"


def compute_total_minutes(start: str, lunch_start: str, lunch_end: str, end: str) -> int:
    start_m = parse_hhmm(start)
    lunch_start_m = parse_hhmm(lunch_start)
    lunch_end_m = parse_hhmm(lunch_end)
    end_m = parse_hhmm(end)
    return (lunch_start_m - start_m) + (end_m - lunch_end_m)
