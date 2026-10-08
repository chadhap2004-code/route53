import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


@pytest.fixture()
def client(tmp_path):
    """Fresh SQLite file per test, seeded with the demo data, already signed in."""
    settings.database_path = str(tmp_path / "test.db")
    with TestClient(app) as c:
        r = c.post("/api/auth/login", json={"username": settings.demo_username, "password": settings.demo_password})
        assert r.status_code == 200
        yield c


@pytest.fixture()
def zone(client):
    """A new empty public zone: returns its JSON."""
    r = client.post("/api/hosted-zones", json={"name": "unit-test.example", "comment": "tests"})
    assert r.status_code == 201, r.text
    return r.json()


def zone_id_by_name(client, name):
    items = client.get("/api/hosted-zones", params={"q": name, "page_size": 100}).json()["items"]
    return next(z["id"] for z in items if z["name"] == name)
