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


def test_deleting_group_deletes_its_commands(client):
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
    cmd = res.json()

    res = client.delete(f"/groups/{group['id']}", headers=_auth_headers(token2))
    assert res.status_code == 204

    res = client.get(
        "/commands", params={"group_id": group["id"]}, headers=_auth_headers(token2)
    )
    assert res.status_code == 200
    assert res.json() == []

    res = client.get(f"/commands/{cmd['id']}", headers=_auth_headers(token2))
    assert res.status_code == 404


def test_bulk_import_creates_groups_commands_and_tags(client):
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

    payload = {
        "groups": [
            {
                "source_id": 10,
                "name": "Imported A",
                "description": "Group A",
                "color": "#3b82f6",
                "icon": "📁",
            },
            {
                "source_id": 11,
                "name": "Imported B",
                "description": None,
                "color": "#3b82f6",
                "icon": "📁",
            },
        ],
        "commands": [
            {
                "source_group_id": 10,
                "title": "Cmd 1",
                "command": "echo 1",
                "description": "d1",
                "default_variables": {"FOO": "bar"},
                "tags": ["Docker", "docker", " DevOps "],
                "is_favorite": True,
                "copy_count": 2,
            },
            {
                "source_group_id": 11,
                "title": "Cmd 2",
                "command": "echo 2",
                "description": None,
                "default_variables": {},
                "tags": [],
                "is_favorite": False,
                "copy_count": 0,
            },
        ],
    }

    res = client.post("/import", json=payload, headers=_auth_headers(token2))
    assert res.status_code == 200
    body = res.json()
    assert body["groups_created"] == 2
    assert body["commands_created"] == 2

    res = client.get("/groups", headers=_auth_headers(token2))
    assert res.status_code == 200
    groups = res.json()
    imported_a = next(g for g in groups if g["name"] == "Imported A")
    imported_b = next(g for g in groups if g["name"] == "Imported B")

    res = client.get(
        "/commands",
        params={"group_id": imported_a["id"]},
        headers=_auth_headers(token2),
    )
    assert res.status_code == 200
    cmds_a = res.json()
    assert len(cmds_a) == 1
    assert cmds_a[0]["title"] == "Cmd 1"
    assert cmds_a[0]["default_variables"] == {"FOO": "bar"}
    assert cmds_a[0]["is_favorite"] is True
    assert cmds_a[0]["copy_count"] == 2
    assert set(cmds_a[0]["tags"]) == {"docker", "devops"}

    res = client.get(
        "/commands",
        params={"group_id": imported_b["id"]},
        headers=_auth_headers(token2),
    )
    assert res.status_code == 200
    cmds_b = res.json()
    assert len(cmds_b) == 1
    assert cmds_b[0]["title"] == "Cmd 2"


def test_top_copied_commands_returns_sorted_by_copy_count(client):
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

    res = client.post(
        "/commands",
        json={
            "group_id": group["id"],
            "title": "C1",
            "command": "echo 1",
            "tags": [],
            "copy_count": 2,
        },
        headers=_auth_headers(token2),
    )
    assert res.status_code == 201
    c1 = res.json()

    res = client.post(
        "/commands",
        json={
            "group_id": group["id"],
            "title": "C2",
            "command": "echo 2",
            "tags": [],
            "copy_count": 5,
        },
        headers=_auth_headers(token2),
    )
    assert res.status_code == 201
    c2 = res.json()

    res = client.post(
        "/commands",
        json={
            "group_id": group["id"],
            "title": "C3",
            "command": "echo 3",
            "tags": [],
            "copy_count": 1,
        },
        headers=_auth_headers(token2),
    )
    assert res.status_code == 201
    c3 = res.json()

    res = client.get(
        "/commands/top-copied",
        params={"limit": 10},
        headers=_auth_headers(token2),
    )
    assert res.status_code == 200
    items = res.json()

    ids = [item["id"] for item in items]
    assert c2["id"] in ids
    assert c1["id"] in ids
    assert c3["id"] in ids

    # Ensure sorted by copy_count desc for these three
    top_three = [item for item in items if item["id"] in {c1["id"], c2["id"], c3["id"]}]
    assert [item["id"] for item in top_three][:3] == [c2["id"], c1["id"], c3["id"]]


def test_import_history_preview_and_import_creates_only_new_commands(client):
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

    # Existing command in DB (should be treated as duplicate)
    res = client.post(
        "/commands",
        json={
            "group_id": group["id"],
            "title": "Docker list",
            "command": "docker ps -a",
            "tags": [],
        },
        headers=_auth_headers(token2),
    )
    assert res.status_code == 201

    history = "\n".join(
        [
            "cd /tmp",
            "ls -la",
            ": 1712345678:0;docker ps -a",
            "docker ps -a",
            "docker system prune -af",
            "echo hello",
        ]
    )

    res = client.post(
        "/import/history/preview",
        json={"group_id": group["id"], "history": history, "tags": ["devops"]},
        headers=_auth_headers(token2),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["total_lines"] == 6
    assert body["parsed"] == 6
    assert body["created_candidates"] == 2
    assert body["duplicate_candidates"] == 2
    assert body["noise_candidates"] == 2

    res = client.post(
        "/import/history",
        json={"group_id": group["id"], "history": history, "tags": ["devops"]},
        headers=_auth_headers(token2),
    )
    assert res.status_code == 200
    body2 = res.json()
    assert body2["created"] == 2
    assert body2["skipped_duplicates"] == 2
    assert body2["skipped_noise"] == 2

    res = client.get(
        "/commands", params={"group_id": group["id"]}, headers=_auth_headers(token2)
    )
    assert res.status_code == 200
    cmds = res.json()
    assert len(cmds) == 3
    created_commands = {c["command"] for c in cmds}
    assert "docker system prune -af" in created_commands
    assert "echo hello" in created_commands
