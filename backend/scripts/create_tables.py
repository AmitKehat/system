from src.storage.db import get_engine
from src.storage.models import Base  # includes Run, FillRow, and now IBDailyBar

def main():
    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    print("OK: tables created/updated")

if __name__ == "__main__":
    main()
