(Backend) CommandKeeper

Ce backend expose une API REST via FastAPI et stocke les données dans SQLite.

Lancement

- Dev (local)
	- `cd backend`
	- `uvicorn main:app --reload`
	- API: `http://127.0.0.1:8000`
	- Swagger: `http://127.0.0.1:8000/docs`

Configuration

Variables d’environnement (optionnelles) via `.env` dans `backend/` :

- `DATABASE_URL` (défaut: `sqlite:///./commandkeeper.db`)
- `SECRET_KEY` (défaut: `dev-secret-change-me`)
- `CORS_ORIGINS` (défaut: `http://localhost:5173,http://127.0.0.1:5173`)
- `DEFAULT_ADMIN_USERNAME` (défaut: `admin`)
- `DEFAULT_ADMIN_PASSWORD` (défaut: `admin`)

Authentification

- 1ère connexion: `admin/admin`
- Tant que le mot de passe n’est pas changé, les routes métiers renvoient `403 Password change required`.

Routes utiles

- `GET /health`
- `POST /auth/login` -> `{ access_token, must_change_password }`
- `POST /auth/change-password`
- `GET/POST/PATCH/DELETE /groups`
- `GET/POST/PATCH/DELETE /commands`
- `GET /search?q=...&group_id=...`

Tags

- Une commande peut avoir des tags (liste de chaînes).
- `POST /commands` accepte `tags: ["docker", "devops"]`.
- `PATCH /commands/{id}` accepte `tags` (remplace la liste) ou `tags: []` (vide).
- La recherche (`/search?q=...`) matche aussi les tags.
