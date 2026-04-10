# 🧰 Command Keeper

Command Keeper est une application web pour **stocker, organiser et retrouver rapidement** tes commandes terminal.

- 📁 Organisation par **Groupes** (projets / contextes)
- 🔎 **Recherche** côté serveur (titre, description, commande, tags)
- 🏷️ **Tags**, ⭐ favoris, compteur de copies
- 🧩 Variables de commande `{{VAR}}` avec valeurs par défaut
- 📦 **Import / Export JSON** (backup/migration)

## 🧱 Stack

- 🖥️ Frontend : React + Vite (UI)
- ⚙️ Backend : FastAPI (API REST) + SQLAlchemy
- 🗄️ DB : SQLite (par défaut)

---

## 🐳 Déploiement (Docker Compose)

### 1) ✅ Pré-requis

- Docker + Docker Compose

### 2) 🧾 Configuration (fichier `.env`)

Le `docker-compose.yml` lit un fichier `.env` à la racine.

Exemple minimal (à adapter) :

```env
# Ports exposés sur la machine hôte
FRONTEND_PORT=2000
BACKEND_PORT=2001

# Backend
# Recommandé pour persister la DB sur le volume docker `backend_data`:
DATABASE_URL=sqlite:////data/commandkeeper.db

# IMPORTANT: à changer en prod
SECRET_KEY=change-me-in-production

# Autorise le frontend (hôte) à appeler l'API
CORS_ORIGINS=http://localhost:2000,http://127.0.0.1:2000

# Compte admin par défaut (1ère connexion)
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=admin

# Frontend (Vite)
# Option A (recommandée avec Docker Compose): utiliser le proxy Vite vers le service backend
VITE_API_URL=
VITE_PROXY_TARGET=http://backend:8000

# Option B (si tu lances le frontend hors docker): pointer directement l'API
# VITE_API_URL=http://localhost:2001
# VITE_PROXY_TARGET=http://localhost:2001
```

### 3) 🚀 Lancer

```bash
docker compose up --build
```

- 🖥️ Frontend : http://localhost:2000
- ⚙️ Backend : http://localhost:2001
- 📚 Swagger : http://localhost:2001/docs

### 4) 🔐 Auth (important)

- Identifiants par défaut : `admin / admin`
- À la première connexion, l’application force un **changement de mot de passe**.

---

## 📦 Déploiement via Docker Hub (images pré-build)

Le workflow GitHub Actions pousse 2 images :

- `kalagaserge/commandkeeper-backend`
- `kalagaserge/commandkeeper-frontend`

Tags publiés :

- `latest`
- `sha-<commit>`

### 🧩 Option simple (adapter le `docker-compose.yml`)

Pour déployer sans build local, remplace `build:` par `image:` (et enlève les volumes de code en prod).

Exemple (extrait) :

```yaml
services:
  backend:
    image: kalagaserge/commandkeeper-backend:latest
    env_file: [ .env ]
    ports:
      - "${BACKEND_PORT}:8000"
    volumes:
      - backend_data:/data

  frontend:
    image: kalagaserge/commandkeeper-frontend:latest
    env_file: [ .env ]
    ports:
      - "${FRONTEND_PORT}:2000"
    depends_on:
      - backend
```

Puis :

```bash
docker compose pull
docker compose up -d
```

---

## 🛡️ Notes de prod (recommandations)

- Change `SECRET_KEY` et les identifiants admin par défaut
- Ajuste `CORS_ORIGINS` au vrai domaine du frontend
- Garde `DATABASE_URL=sqlite:////data/commandkeeper.db` pour persister sur le volume

## 🧭 Routes utiles (backend)

- `GET /health`
- `POST /auth/login`
- `POST /auth/change-password`
- `GET/POST/PATCH/DELETE /groups`
- `GET/POST/PATCH/DELETE /commands`
- `GET /search?q=...`
- `POST /import` (import bulk)
