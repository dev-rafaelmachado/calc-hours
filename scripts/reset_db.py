from hours_app.db import reset_entries

DB_PATH = None


def main() -> None:
    deleted = reset_entries(DB_PATH)
    print(f"Registros removidos no Supabase: {deleted}")


if __name__ == "__main__":
    main()
