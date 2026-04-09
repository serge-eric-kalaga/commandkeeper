from .auth import router as auth_router
from .commands import router as commands_router
from .groups import router as groups_router
from .search import router as search_router

__all__ = [
    "auth_router",
    "commands_router",
    "groups_router",
    "search_router",
]
