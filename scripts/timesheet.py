#!/usr/bin/env python3
"""
timesheet.py — dashboard de horas semanais
Uso: python timesheet.py semana1.csv semana2.csv ...
"""

import sys
import csv
from pathlib import Path
from typing import TypedDict
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.columns import Columns
from rich import box
from rich.text import Text
from rich.rule import Rule
from rich.padding import Padding

# ─────────────────────────────────────────────
#  Config
# ─────────────────────────────────────────────
WEEK_TARGET   = 40 * 60   # minutos
DAY_TARGET    = 8  * 60
LUNCH_MIN     = 60
BAR_WIDTH     = 28

console = Console()


# ─────────────────────────────────────────────
#  Types
# ─────────────────────────────────────────────
class WorkDay(TypedDict):
    day       : str
    start     : str
    lunch_start: str
    lunch_end : str
    end       : str
    total     : int
    source    : str


# ─────────────────────────────────────────────
#  Time utils
# ─────────────────────────────────────────────
def to_min(t: str) -> int:
    h, m = map(int, t.strip().split(":"))
    return h * 60 + m


def to_human(m: int) -> str:
    return f"{m // 60}h {m % 60:02d}m"


def to_time(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


def to_decimal(m: int) -> str:
    return f"{m / 60:.1f}h"


# ─────────────────────────────────────────────
#  CSV parser
# ─────────────────────────────────────────────
def parse_csv(path: str) -> list[WorkDay]:
    rows: list[WorkDay] = []
    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            day         = row.get("day",        row.get("Day",        "")).strip().lower()
            start       = row.get("start",      row.get("Start",      "")).strip()
            lunch_start = row.get("lunchStart", row.get("lunch_start","")).strip()
            lunch_end   = row.get("lunchEnd",   row.get("lunch_end",  "")).strip()
            end         = row.get("end",        row.get("End",        "")).strip()

            if not all([day, start, lunch_start, lunch_end, end]):
                continue

            morning   = to_min(lunch_start) - to_min(start)
            afternoon = to_min(end)         - to_min(lunch_end)
            total     = morning + afternoon

            rows.append({
                "day"       : day,
                "start"     : start,
                "lunch_start": lunch_start,
                "lunch_end" : lunch_end,
                "end"       : end,
                "total"     : total,
                "source"    : Path(path).name,
            })
    return rows


# ─────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────
DAY_PT = {
    "monday"   : "Segunda",
    "tuesday"  : "Terça",
    "wednesday": "Quarta",
    "thursday" : "Quinta",
    "friday"   : "Sexta",
    "saturday" : "Sábado",
    "sunday"   : "Domingo",
}

DAY_ORDER = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]


def day_label(d: str) -> str:
    return DAY_PT.get(d, d.capitalize())


def bar(minutes: int, max_minutes: int = DAY_TARGET * 2) -> Text:
    pct     = min(minutes / max_minutes, 1.0)
    filled  = round(pct * BAR_WIDTH)
    empty   = BAR_WIDTH - filled
    ratio   = minutes / DAY_TARGET

    if ratio >= 1.0:
        color = "green3"
    elif ratio >= 0.9:
        color = "yellow3"
    else:
        color = "red3"

    t = Text()
    t.append("█" * filled, style=color)
    t.append("░" * empty,  style="bright_black")
    return t


def diff_pill(minutes: int) -> Text:
    diff = minutes - DAY_TARGET
    t    = Text()
    if diff >= 0:
        t.append(f"+{to_human(diff)}", style="bold green3")
    else:
        t.append(f"{to_human(diff)}", style="bold red3")
    return t


def progress_bar(pct: float, width: int = 40) -> Text:
    filled = round(pct / 100 * width)
    empty  = width - filled
    color  = "green3" if pct >= 100 else ("yellow3" if pct >= 75 else "red3")
    t = Text()
    t.append("█" * filled, style=color)
    t.append("░" * empty,  style="bright_black")
    t.append(f"  {pct:.0f}%", style=f"bold {color}")
    return t


# ─────────────────────────────────────────────
#  Sections
# ─────────────────────────────────────────────
def render_metrics(rows: list[WorkDay], n_csvs: int) -> None:
    total     = sum(r["total"] for r in rows)
    remaining = max(WEEK_TARGET * n_csvs - total, 0)
    avg_day   = round(total / len(rows)) if rows else 0
    pct       = min(total / (WEEK_TARGET * n_csvs) * 100, 100)

    col_style = "bold white"

    cards = [
        Panel(
            f"[bold green3]{to_decimal(total)}[/]\n[dim]{to_human(total)}[/]",
            title="[dim]total trabalhado[/]",
            border_style="green3",
            expand=True,
        ),
        Panel(
            f"[bold {'yellow3' if remaining else 'green3'}]"
            f"{'—' if not remaining else to_decimal(remaining)}[/]\n"
            f"[dim]{'meta atingida' if not remaining else to_human(remaining)}[/]",
            title="[dim]faltam p/ 40h[/]",
            border_style="yellow3" if remaining else "green3",
            expand=True,
        ),
        Panel(
            f"[bold white]{len(rows)}[/]\n[dim]{n_csvs} CSV{'s' if n_csvs > 1 else ''}[/]",
            title="[dim]dias registrados[/]",
            border_style="bright_black",
            expand=True,
        ),
        Panel(
            f"[bold white]{to_decimal(avg_day)}[/]\n[dim]{to_human(avg_day)}[/]",
            title="[dim]média por dia[/]",
            border_style="bright_black",
            expand=True,
        ),
    ]

    console.print(Columns(cards, equal=True, expand=True))
    console.print()

    prog = progress_bar(pct)
    console.print("  Progresso semanal  ", prog)
    console.print()


def render_avg_bars(rows: list[WorkDay]) -> None:
    by_day: dict[str, list[int]] = {}
    for r in rows:
        by_day.setdefault(r["day"], []).append(r["total"])

    max_val = max((sum(v)/len(v) for v in by_day.values()), default=DAY_TARGET)

    console.print(Rule("[dim]média por dia da semana[/]", style="bright_black"))
    console.print()

    for d in DAY_ORDER:
        if d not in by_day:
            continue
        avg    = round(sum(by_day[d]) / len(by_day[d]))
        b      = bar(avg, max(max_val, DAY_TARGET))
        label  = f"{day_label(d):<9}"
        value  = f"  {to_decimal(avg):>5}"
        t = Text()
        t.append(label, style="dim")
        t.append_text(b)
        t.append(value, style="white")
        console.print("  ", t)

    console.print()


def render_table(rows: list[WorkDay]) -> None:
    console.print(Rule("[dim]todos os registros[/]", style="bright_black"))
    console.print()

    tbl = Table(
        box=box.SIMPLE_HEAD,
        show_header=True,
        header_style="dim",
        show_edge=False,
        pad_edge=True,
    )
    tbl.add_column("dia",          style="white",      min_width=9)
    tbl.add_column("entrada/saída",style="dim",        min_width=15)
    tbl.add_column("almoço",       style="dim",        min_width=13)
    tbl.add_column("horas",        style="bold white", min_width=9)
    tbl.add_column("vs meta",      min_width=10)
    tbl.add_column("arquivo",      style="bright_black",min_width=0)

    for r in rows:
        tbl.add_row(
            day_label(r["day"]),
            f"{r['start']} – {r['end']}",
            f"{r['lunch_start']} – {r['lunch_end']}",
            to_human(r["total"]),
            diff_pill(r["total"]),
            r["source"],
        )

    console.print(tbl)


def render_friday_sim(rows: list[WorkDay], n_csvs: int) -> None:
    total     = sum(r["total"] for r in rows)
    remaining = max(WEEK_TARGET * n_csvs - total, 0)
    has_friday = any(r["day"] == "friday" for r in rows)

    if has_friday or remaining == 0:
        if remaining == 0:
            console.print(Panel(
                "[bold green3]Meta semanal atingida![/]",
                border_style="green3",
                expand=False,
            ))
        return

    try:
        entry = input("\n  Horário de entrada na sexta [09:00]: ").strip() or "09:00"
        exit_min = to_min(entry) + remaining + LUNCH_MIN
        console.print(Panel(
            f"[dim]entrada:[/]  [white]{entry}[/]\n"
            f"[dim]saída:[/]    [bold green3]{to_time(exit_min)}[/]\n"
            f"[dim]faltam:[/]   [yellow3]{to_human(remaining)}[/]  (inclui 1h de almoço)",
            title="[yellow3]simulação de sexta-feira[/]",
            border_style="yellow3",
            expand=False,
        ))
    except (EOFError, KeyboardInterrupt):
        pass


# ─────────────────────────────────────────────
#  Main
# ─────────────────────────────────────────────
def main() -> None:
    paths = sys.argv[1:]

    if not paths:
        console.print(
            Panel(
                "[white]Uso:[/]  [bold green3]python timesheet.py[/] [dim]semana1.csv semana2.csv ...[/]\n\n"
                "[dim]Colunas esperadas:[/]  day, start, lunchStart, lunchEnd, end",
                title="[dim]timesheet[/]",
                border_style="bright_black",
            )
        )
        sys.exit(0)

    all_rows: list[WorkDay] = []
    loaded: list[str]       = []
    errors: list[str]       = []

    for p in paths:
        try:
            rows = parse_csv(p)
            if rows:
                all_rows.extend(rows)
                loaded.append(Path(p).name)
            else:
                errors.append(f"{p}: nenhum dado encontrado")
        except FileNotFoundError:
            errors.append(f"{p}: arquivo não encontrado")
        except Exception as e:
            errors.append(f"{p}: {e}")

    console.print()
    console.print(Rule(
        f"[bold white]timesheet[/] [dim]— {len(loaded)} arquivo{'s' if len(loaded)!=1 else ''}[/]",
        style="bright_black"
    ))
    console.print()

    if errors:
        for err in errors:
            console.print(f"  [red3]✗[/] [dim]{err}[/]")
        console.print()

    if not all_rows:
        console.print("  [dim]nenhum dado para exibir.[/]")
        sys.exit(1)

    render_metrics(all_rows, len(loaded))
    render_avg_bars(all_rows)
    render_table(all_rows)
    render_friday_sim(all_rows, len(loaded))
    console.print()


if __name__ == "__main__":
    main()
