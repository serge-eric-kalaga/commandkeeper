def _login(client, username: str, password: str) -> dict:
    res = client.post("/auth/login", json={"username": username, "password": password})
    assert res.status_code == 200
    return res.json()


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_business_routes_forbidden_until_password_change(client):
    login = _login(client, "admin", "admin")
    token = login["access_token"]

    res = client.post(
        "/groups", json={"name": "Projet A"}, headers=_auth_headers(token)
    )
    assert res.status_code == 403
    assert res.json()["detail"] == "Password change required"


def test_full_flow_change_password_then_crud_and_search(client):
    login = _login(client, "admin", "admin")
    token = login["access_token"]

    # Change password
    res = client.post(
        "/auth/change-password",
        json={"old_password": "admin", "new_password": "admin123"},
        headers=_auth_headers(token),
    )
    assert res.status_code == 200
    assert res.json()["must_change_password"] is False

    # Login again (new password)
    login2 = _login(client, "admin", "admin123")
    token2 = login2["access_token"]

    # Create group
    res = client.post(
        "/groups", json={"name": "Projet A"}, headers=_auth_headers(token2)
    )
    assert res.status_code == 201
    group = res.json()
    assert group["name"] == "Projet A"

    # List groups
    res = client.get("/groups", headers=_auth_headers(token2))
    assert res.status_code == 200
    assert any(g["id"] == group["id"] for g in res.json())

    # Create command
    res = client.post(
        "/commands",
        json={
            "group_id": group["id"],
            "title": "Lister docker",
            "command": "docker ps -a",
            "description": "liste tous les containers",
            "tags": ["Docker", "containers", "docker"],
        },
        headers=_auth_headers(token2),
    )
    assert res.status_code == 201
    cmd = res.json()
    assert cmd["group_id"] == group["id"]
    assert cmd["title"] == "Lister docker"
    assert cmd["tags"] == ["containers", "docker"]

    # Search
    res = client.get("/search", params={"q": "docker"}, headers=_auth_headers(token2))
    assert res.status_code == 200
    items = res.json()["items"]
    assert any(item["id"] == cmd["id"] for item in items)

    # Search by tag
    res = client.get(
        "/search", params={"q": "containers"}, headers=_auth_headers(token2)
    )
    assert res.status_code == 200
    items = res.json()["items"]
    assert any(item["id"] == cmd["id"] for item in items)

    # Update command
    res = client.patch(
        f"/commands/{cmd['id']}",
        json={"title": "Lister docker (all)", "tags": ["devops"]},
        headers=_auth_headers(token2),
    )
    assert res.status_code == 200
    assert res.json()["title"] == "Lister docker (all)"
    assert res.json()["tags"] == ["devops"]

    # Delete command
    res = client.delete(f"/commands/{cmd['id']}", headers=_auth_headers(token2))
    assert res.status_code == 204

    # Ensure command no longer appears in search
    res = client.get("/search", params={"q": "docker"}, headers=_auth_headers(token2))
    assert res.status_code == 200
    assert all(item["id"] != cmd["id"] for item in res.json()["items"])


def test_search_relevance_orders_by_matched_keywords(client):
    login = _login(client, "admin", "admin")
    token = login["access_token"]

    res = client.post(
        "/auth/change-password",
        json={"old_password": "admin", "new_password": "admin123"},
        headers=_auth_headers(token),
    )
    assert res.status_code == 200

    login2 = _login(client, "admin", "admin123")
    token2 = login2["access_token"]

    res = client.post(
        "/groups", json={"name": "Projet A"}, headers=_auth_headers(token2)
    )
    assert res.status_code == 201
    group = res.json()

    # Create the "better match" first (older updated_at), then the weaker one.
    res = client.post(
        "/commands",
        json={
            "group_id": group["id"],
            "title": "Docker cleanup",
            "command": "docker system prune -af",
            "description": "cleanup docker resources",
            "tags": ["docker", "cleanup"],
        },
        headers=_auth_headers(token2),
    )
    assert res.status_code == 201
    strong = res.json()

    res = client.post(
        "/commands",
        json={
            "group_id": group["id"],
            "title": "Docker list",
            "command": "docker ps -a",
            "description": "list containers",
            "tags": ["docker"],
        },
        headers=_auth_headers(token2),
    )
    assert res.status_code == 201
    weak = res.json()

    res = client.get(
        "/search",
        params={"q": "docker prune", "limit": 10},
        headers=_auth_headers(token2),
    )
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) >= 2
    assert items[0]["id"] == strong["id"]
    assert any(item["id"] == weak["id"] for item in items)
