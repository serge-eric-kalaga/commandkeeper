import datetime as dt


def _login(client, username: str, password: str) -> dict:
    res = client.post("/auth/login", json={"username": username, "password": password})
    assert res.status_code == 200
    return res.json()


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_dashboard_stats_counts_and_copies_range(client):
    login = _login(client, "admin", "admin")
    token = login["access_token"]

    # Need to be a "ready" user
    res = client.post(
        "/auth/change-password",
        json={"old_password": "admin", "new_password": "admin123"},
        headers=_auth_headers(token),
    )
    assert res.status_code == 200

    login2 = _login(client, "admin", "admin123")
    token2 = login2["access_token"]

    # Create group
    res = client.post(
        "/groups",
        json={"name": "Projet A"},
        headers=_auth_headers(token2),
    )
    assert res.status_code == 201
    group = res.json()

    # Create command with 2 tags
    res = client.post(
        "/commands",
        json={
            "group_id": group["id"],
            "title": "Hello",
            "command": "echo hi",
            "tags": ["docker", "git"],
        },
        headers=_auth_headers(token2),
    )
    assert res.status_code == 201
    cmd = res.json()

    # Simulate 3 copies (PATCH copy_count)
    res = client.patch(
        f"/commands/{cmd['id']}",
        json={"copy_count": 3},
        headers=_auth_headers(token2),
    )
    assert res.status_code == 200
    assert res.json()["copy_count"] == 3

    today = dt.date.today().isoformat()

    res = client.get(
        "/stats/dashboard",
        params={"from_date": today, "to_date": today},
        headers=_auth_headers(token2),
    )
    assert res.status_code == 200
    data = res.json()

    assert data["commands"] == 1
    assert data["groups"] == 1
    assert data["tags"] == 2
    assert data["copies"] == 3
    assert data["from_date"] == today
    assert data["to_date"] == today
