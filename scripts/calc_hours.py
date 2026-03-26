import sys
from typing import List, Optional, TypedDict


class WorkDay(TypedDict):
    day: str
    start: str
    lunchStart: str
    lunchEnd: str
    end: str


WEEK_TARGET_MINUTES = 40 * 60
LUNCH_DURATION = 60  # minutos


# ---------- Time utils ----------

def time_to_minutes(time: str) -> int:
    hours, minutes = map(int, time.strip().split(":"))
    return hours * 60 + minutes


def minutes_to_human(minutes: int) -> str:
    h = minutes // 60
    m = minutes % 60
    return f"{h}h {m}m"


def minutes_to_time(minutes: int) -> str:
    h = minutes // 60
    m = minutes % 60
    return f"{h:02d}:{m:02d}"


# ---------- Work calculations ----------

def calculate_day_minutes(day: WorkDay) -> int:
    start = time_to_minutes(day["start"])
    lunch_start = time_to_minutes(day["lunchStart"])
    lunch_end = time_to_minutes(day["lunchEnd"])
    end = time_to_minutes(day["end"])

    morning = lunch_start - start
    afternoon = end - lunch_end

    return morning + afternoon


def calculate_week(days: List[WorkDay]):
    total_minutes = sum(calculate_day_minutes(day) for day in days)
    remaining = max(WEEK_TARGET_MINUTES - total_minutes, 0)

    return {
        "totalMinutes": total_minutes,
        "remaining": remaining
    }


# ---------- CSV parser ----------

def parse_csv(path: str) -> List[WorkDay]:
    days: List[WorkDay] = []

    with open(path, "r", encoding="utf-8") as file:
        lines = [line.strip() for line in file.readlines() if line.strip()]

    for line in lines[1:]:
        day, start, lunch_start, lunch_end, end = [v.strip() for v in line.split(",")]

        days.append({
            "day": day.lower(),
            "start": start,
            "lunchStart": lunch_start,
            "lunchEnd": lunch_end,
            "end": end
        })

    return days


# ---------- Friday simulation ----------

def simulate_friday_exit(remaining_minutes: int):
    print("\nFriday simulation")

    start_input = input("Horário de entrada na sexta (HH:mm): ")

    start_minutes = time_to_minutes(start_input)

    exit_minutes = start_minutes + remaining_minutes + LUNCH_DURATION

    print("\nPara completar 40h:")
    print("Entrada:", start_input)
    print("Saída estimada:", minutes_to_time(exit_minutes))
    print("(considerando 1h de almoço)\n")


# ---------- Report ----------

def print_report(days: List[WorkDay]):
    print("\n------ Weekly Report ------\n")

    for day in days:
        minutes = calculate_day_minutes(day)
        print(f"{day['day'].ljust(10)} {minutes_to_human(minutes)}")

    week = calculate_week(days)

    print("\n---------------------------\n")

    print("Total worked:", minutes_to_human(week["totalMinutes"]))
    print("Remaining to 40h:", minutes_to_human(week["remaining"]))

    # verificar se sexta existe
    has_friday = any(day["day"] == "friday" for day in days)

    if not has_friday and week["remaining"] > 0:
        simulate_friday_exit(week["remaining"])


# ---------- CLI input manual ----------

def ask_day(day_name: str) -> Optional[WorkDay]:
    print(f"\n{day_name}")

    start = input("Entrada (HH:mm ou vazio para pular): ")

    if not start:
        return None

    lunch_start = input("Saída almoço: ")
    lunch_end = input("Volta almoço: ")
    end = input("Saída: ")

    return {
        "day": day_name.lower(),
        "start": start,
        "lunchStart": lunch_start,
        "lunchEnd": lunch_end,
        "end": end
    }


def manual_input() -> List[WorkDay]:
    days_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

    days: List[WorkDay] = []

    for day in days_names:
        result = ask_day(day)

        if result:
            days.append(result)

    return days


# ---------- Main ----------

def main():
    csv_path = sys.argv[1] if len(sys.argv) > 1 else None

    if csv_path:
        days = parse_csv(csv_path)
    else:
        print("Manual mode\n")
        days = manual_input()

    print_report(days)


if __name__ == "__main__":
    main()