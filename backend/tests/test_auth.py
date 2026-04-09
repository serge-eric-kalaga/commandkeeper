def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_login_default_admin_requires_password_change(client):
    res = client.post("/auth/login", json={"username": "admin", "password": "admin"})
    assert res.status_code == 200

    data = res.json()
    assert data["token_type"] == "bearer"
    assert isinstance(data["access_token"], str) and len(data["access_token"]) > 20
    assert data["must_change_password"] is True


def test_login_invalid_credentials(client):
    res = client.post("/auth/login", json={"username": "admin", "password": "wrong"})
    assert res.status_code == 401
