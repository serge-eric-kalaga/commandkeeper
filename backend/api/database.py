from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .settings import settings


class Base(DeclarativeBase):
    pass


connect_args: dict[str, object] = {}
if settings.database_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db() -> None:
    """Initialize DB schema.

    We primarily rely on SQLAlchemy's create_all(). For SQLite dev DBs that may
    already exist, we also add newly introduced columns with ALTER TABLE.
    """

    Base.metadata.create_all(bind=engine)

    if not settings.database_url.startswith("sqlite"):
        return

    def has_column(conn, table: str, column: str) -> bool:
        rows = conn.execute(text(f"PRAGMA table_info({table})")).mappings().all()
        return any(r.get("name") == column for r in rows)

    with engine.begin() as conn:
        # groups: description/color/icon
        if not has_column(conn, "groups", "description"):
            conn.execute(text("ALTER TABLE groups ADD COLUMN description TEXT"))
        if not has_column(conn, "groups", "color"):
            conn.execute(
                text(
                    "ALTER TABLE groups ADD COLUMN color VARCHAR(16) NOT NULL DEFAULT '#3b82f6'"
                )
            )
        if not has_column(conn, "groups", "icon"):
            conn.execute(
                text(
                    "ALTER TABLE groups ADD COLUMN icon VARCHAR(8) NOT NULL DEFAULT '📁'"
                )
            )

        # commands: is_favorite/copy_count
        if not has_column(conn, "commands", "is_favorite"):
            conn.execute(
                text(
                    "ALTER TABLE commands ADD COLUMN is_favorite BOOLEAN NOT NULL DEFAULT 0"
                )
            )
        if not has_column(conn, "commands", "copy_count"):
            conn.execute(
                text(
                    "ALTER TABLE commands ADD COLUMN copy_count INTEGER NOT NULL DEFAULT 0"
                )
            )

        # commands: default_variables (JSON as text in SQLite)
        if not has_column(conn, "commands", "default_variables"):
            conn.execute(
                text(
                    "ALTER TABLE commands ADD COLUMN default_variables JSON NOT NULL DEFAULT '{}'"
                )
            )


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
