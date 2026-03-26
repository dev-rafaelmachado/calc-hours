from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "hours.db"


def main() -> None:
    if DB_PATH.exists():
        DB_PATH.unlink()
        print(f"Banco removido: {DB_PATH}")
    else:
        print(f"Banco não existe: {DB_PATH}")


if __name__ == "__main__":
    main()
