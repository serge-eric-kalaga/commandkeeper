from __future__ import annotations

import argparse

from sqlalchemy import func, select

from api import database
from api.models import Command, Group, Tag


def _normalize_tag(name: str) -> str:
    return (name or "").strip().lower()


def _get_or_create_tags(db, names: list[str]) -> list[Tag]:
    normalized = []
    seen: set[str] = set()
    for n in names:
        v = _normalize_tag(n)
        if not v or v in seen:
            continue
        seen.add(v)
        normalized.append(v)

    if not normalized:
        return []

    existing = {
        t.name: t for t in db.scalars(select(Tag).where(Tag.name.in_(normalized))).all()
    }

    for name in normalized:
        if name in existing:
            continue
        tag = Tag(name=name)
        db.add(tag)
        existing[name] = tag

    db.flush()
    return [existing[n] for n in normalized]


def seed(reset: bool, delete_seeded: bool) -> None:
    database.init_db()

    db = database.SessionLocal()
    try:
        groups_spec: list[tuple[str, str, str, str]] = [
            ("Docker", "Common Docker commands", "🐳", "#3b82f6"),  # blue
            ("Git", "Git workflows & tips", "🌿", "#10b981"),  # green
            ("Kubernetes", "kubectl shortcuts", "☸️", "#8b5cf6"),  # violet
            ("Python", "Python/uv/pytest helpers", "🐍", "#f59e0b"),  # amber
            ("Node", "Node/Bun/NPM commands", "🟢", "#22c55e"),  # green
            ("Linux", "Everyday shell tools", "🐧", "#06b6d4"),  # cyan
            ("Terraform", "IaC commands", "🧱", "#f97316"),  # orange
            ("AWS", "AWS CLI snippets", "☁️", "#ef4444"),  # red
            ("DB", "Database commands", "🗄️", "#64748b"),  # slate
            ("Misc", "Random useful commands", "🧰", "#ec4899"),  # pink
        ]

        seed_names = [name for name, _desc, _icon, _color in groups_spec]

        def delete_previously_seeded_groups() -> None:
            # Remove previously seeded groups (old prefix-based names + current seed names)
            old_seeded = db.scalars(
                select(Group).where(Group.name.like("Demo -%"))
            ).all()
            for grp in old_seeded:
                db.delete(grp)

            current_seeded = db.scalars(
                select(Group).where(Group.name.in_(seed_names))
            ).all()
            for grp in current_seeded:
                db.delete(grp)

            db.commit()

        if delete_seeded:
            delete_previously_seeded_groups()
            return

        if reset:
            delete_previously_seeded_groups()

        # If already seeded, do nothing.
        existing_seed_count = db.scalar(
            select(func.count()).select_from(Group).where(Group.name.in_(seed_names))
        )
        if existing_seed_count and existing_seed_count >= 10:
            return

        created_groups: list[Group] = []
        for name, desc, icon, color in groups_spec:
            g = Group(name=name, description=desc, icon=icon, color=color)
            db.add(g)
            created_groups.append(g)

        db.flush()

        def add_cmd(
            group: Group,
            title: str,
            cmd: str,
            description: str | None,
            tags: list[str],
            default_variables: dict[str, str] | None = None,
            is_favorite: bool = False,
            copy_count: int = 0,
        ) -> None:
            c = Command(
                group_id=group.id,
                title=title,
                command=cmd,
                description=description,
                default_variables=default_variables or {},
                is_favorite=is_favorite,
                copy_count=copy_count,
            )
            c.tag_entities = _get_or_create_tags(db, tags)
            db.add(c)

        # 5 commands per group (minimum), with some variety.
        g = {grp.name: grp for grp in created_groups}

        # Docker
        add_cmd(
            g["Docker"],
            "List containers",
            "docker ps -a",
            "List all containers",
            ["docker", "containers"],
            copy_count=3,
        )
        add_cmd(
            g["Docker"],
            "Prune system",
            "docker system prune -af",
            "Cleanup unused docker resources",
            ["docker", "cleanup"],
            is_favorite=True,
        )
        add_cmd(
            g["Docker"],
            "Tail logs",
            "docker logs -f {{CONTAINER}}",
            "Follow container logs",
            ["docker", "logs"],
            {"CONTAINER": "my_container"},
        )
        add_cmd(
            g["Docker"],
            "Build image",
            "docker build -t {{IMAGE}} .",
            "Build image in current directory",
            ["docker", "build"],
            {"IMAGE": "my-image:latest"},
        )
        add_cmd(
            g["Docker"],
            "Compose up",
            "docker compose up -d --build",
            "Start stack",
            ["docker", "compose"],
            is_favorite=True,
            copy_count=5,
        )

        # Git
        add_cmd(g["Git"], "Status", "git status", None, ["git"], copy_count=2)
        add_cmd(
            g["Git"],
            "Create branch",
            "git checkout -b {{BRANCH}}",
            "Create and switch to branch",
            ["git", "branch"],
            {"BRANCH": "feature/my-feature"},
        )
        add_cmd(
            g["Git"],
            "Rebase",
            "git pull --rebase",
            "Pull with rebase",
            ["git", "rebase"],
            is_favorite=True,
        )
        add_cmd(
            g["Git"],
            "Last commits",
            "git --no-pager log --oneline -n 20",
            None,
            ["git", "log"],
        )
        add_cmd(
            g["Git"],
            "Stash",
            'git stash push -m "{{MSG}}"',
            "Stash with message",
            ["git", "stash"],
            {"MSG": "wip"},
        )

        # Kubernetes
        add_cmd(
            g["Kubernetes"],
            "Get pods",
            "kubectl -n {{NAMESPACE}} get pods",
            None,
            ["kubernetes", "kubectl"],
            {"NAMESPACE": "default"},
            is_favorite=True,
        )
        add_cmd(
            g["Kubernetes"],
            "Describe pod",
            "kubectl -n {{NAMESPACE}} describe pod {{POD}}",
            None,
            ["kubernetes", "kubectl"],
            {"NAMESPACE": "default", "POD": "my-pod"},
        )
        add_cmd(
            g["Kubernetes"],
            "Tail logs",
            "kubectl -n {{NAMESPACE}} logs -f {{POD}}",
            None,
            ["kubernetes", "logs"],
            {"NAMESPACE": "default", "POD": "my-pod"},
        )
        add_cmd(
            g["Kubernetes"],
            "Port-forward",
            "kubectl -n {{NAMESPACE}} port-forward svc/{{SERVICE}} {{LOCAL}}:{{REMOTE}}",
            None,
            ["kubernetes", "network"],
            {"NAMESPACE": "default", "SERVICE": "api", "LOCAL": "8080", "REMOTE": "80"},
        )
        add_cmd(
            g["Kubernetes"],
            "Apply manifest",
            "kubectl apply -f {{FILE}}",
            None,
            ["kubernetes", "deploy"],
            {"FILE": "k8s.yaml"},
        )

        # Python
        add_cmd(
            g["Python"],
            "Run tests",
            "pytest -q",
            None,
            ["python", "pytest"],
            is_favorite=True,
        )
        add_cmd(
            g["Python"], "Create venv", "python -m venv .venv", None, ["python", "venv"]
        )
        add_cmd(
            g["Python"],
            "Install deps",
            "pip install -r requirements.txt",
            None,
            ["python", "pip"],
        )
        add_cmd(g["Python"], "Format", "ruff format .", None, ["python", "ruff"])
        add_cmd(g["Python"], "Type check", "pyright", None, ["python", "typing"])

        # Node
        add_cmd(
            g["Node"], "Install", "npm install", None, ["node", "npm"], copy_count=1
        )
        add_cmd(
            g["Node"], "Dev", "npm run dev", None, ["node", "vite"], is_favorite=True
        )
        add_cmd(g["Node"], "Build", "npm run build", None, ["node", "build"])
        add_cmd(g["Node"], "Test", "npm test", None, ["node", "test"])
        add_cmd(g["Node"], "Bun install", "bun install", None, ["bun", "node"])

        # Linux
        add_cmd(
            g["Linux"],
            "Find by name",
            'find . -name "*{{NAME}}*"',
            None,
            ["linux", "find"],
            {"NAME": "pattern"},
        )
        add_cmd(g["Linux"], "Disk usage", "du -sh * | sort -h", None, ["linux", "disk"])
        add_cmd(
            g["Linux"],
            "Grep",
            'grep -RIn "{{TEXT}}" .',
            None,
            ["linux", "grep"],
            {"TEXT": "TODO"},
        )
        add_cmd(
            g["Linux"],
            "Ports",
            "ss -lntp",
            None,
            ["linux", "network"],
            is_favorite=True,
        )
        add_cmd(g["Linux"], "Top", "top", None, ["linux", "monitoring"])

        # Terraform
        add_cmd(
            g["Terraform"],
            "Init",
            "terraform init",
            None,
            ["terraform", "iac"],
            is_favorite=True,
        )
        add_cmd(g["Terraform"], "Plan", "terraform plan", None, ["terraform", "iac"])
        add_cmd(g["Terraform"], "Apply", "terraform apply", None, ["terraform", "iac"])
        add_cmd(
            g["Terraform"],
            "Fmt",
            "terraform fmt -recursive",
            None,
            ["terraform", "format"],
        )
        add_cmd(
            g["Terraform"],
            "Validate",
            "terraform validate",
            None,
            ["terraform", "validate"],
        )

        # AWS
        add_cmd(
            g["AWS"],
            "Caller identity",
            "aws sts get-caller-identity",
            None,
            ["aws", "cli"],
            is_favorite=True,
        )
        add_cmd(g["AWS"], "List buckets", "aws s3 ls", None, ["aws", "s3"])
        add_cmd(
            g["AWS"],
            "ECR login",
            "aws ecr get-login-password | docker login --username AWS --password-stdin {{REGISTRY}}",
            None,
            ["aws", "ecr", "docker"],
            {"REGISTRY": "123456789.dkr.ecr.eu-west-1.amazonaws.com"},
        )
        add_cmd(
            g["AWS"],
            "EC2 list",
            "aws ec2 describe-instances --max-items 20",
            None,
            ["aws", "ec2"],
        )
        add_cmd(
            g["AWS"],
            "CloudWatch logs",
            "aws logs tail {{GROUP}} --follow",
            None,
            ["aws", "logs"],
            {"GROUP": "/aws/lambda/my-func"},
        )

        # DB
        add_cmd(
            g["DB"],
            "SQLite tables",
            'sqlite3 {{DB}} ".tables"',
            None,
            ["sqlite", "db"],
            {"DB": "app.db"},
        )
        add_cmd(
            g["DB"],
            "SQLite schema",
            'sqlite3 {{DB}} ".schema"',
            None,
            ["sqlite", "db"],
            {"DB": "app.db"},
        )
        add_cmd(
            g["DB"],
            "Postgres psql",
            'psql "postgresql://{{USER}}:{{PASS}}@{{HOST}}:{{PORT}}/{{DB}}"',
            None,
            ["postgres", "db"],
            {
                "USER": "postgres",
                "PASS": "postgres",
                "HOST": "localhost",
                "PORT": "5432",
                "DB": "postgres",
            },
        )
        add_cmd(
            g["DB"],
            "Dump",
            'pg_dump "postgresql://{{USER}}:{{PASS}}@{{HOST}}:{{PORT}}/{{DB}}" > dump.sql',
            None,
            ["postgres", "backup"],
            {
                "USER": "postgres",
                "PASS": "postgres",
                "HOST": "localhost",
                "PORT": "5432",
                "DB": "postgres",
            },
        )
        add_cmd(g["DB"], "Migrate", "alembic upgrade head", None, ["python", "alembic"])

        # Misc
        add_cmd(
            g["Misc"],
            "HTTP GET",
            "curl -sS {{URL}} | head",
            None,
            ["curl", "http"],
            {"URL": "https://example.com"},
        )
        add_cmd(
            g["Misc"],
            "JSON pretty",
            "cat {{FILE}} | jq .",
            None,
            ["jq", "json"],
            {"FILE": "data.json"},
        )
        add_cmd(
            g["Misc"],
            "Generate SSH key",
            'ssh-keygen -t ed25519 -C "{{EMAIL}}"',
            None,
            ["ssh", "security"],
            {"EMAIL": "you@example.com"},
        )
        add_cmd(
            g["Misc"],
            "Make archive",
            "tar -czf {{OUT}} {{DIR}}",
            None,
            ["tar", "archive"],
            {"OUT": "archive.tgz", "DIR": "./folder"},
        )
        add_cmd(
            g["Misc"],
            "Python http server",
            "python -m http.server {{PORT}}",
            None,
            ["python", "http"],
            {"PORT": "8000"},
        )

        db.commit()
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed sample data for Command Keeper")

    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--reset",
        action="store_true",
        help="Delete previously seeded groups before seeding",
    )
    mode.add_argument(
        "--delete-seeded",
        action="store_true",
        help="Delete previously seeded groups and exit",
    )
    args = parser.parse_args()

    seed(reset=args.reset, delete_seeded=args.delete_seeded)


if __name__ == "__main__":
    main()
