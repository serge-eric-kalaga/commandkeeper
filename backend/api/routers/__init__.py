from .auth import router as auth_router
from .commands import router as commands_router
from .groups import router as groups_router
from .imports import router as imports_router
from .search import router as search_router
from .tags import router as tags_router
from .stats import router as stats_router

__all__ = [
    "auth_router",
    "commands_router",
    "groups_router",
    "imports_router",
    "search_router",
    "tags_router",
    "stats_router",
]
