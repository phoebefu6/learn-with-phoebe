#!/usr/bin/env python3
"""Backfill repo-card metadata across every live repo.

A new course ships almost every day, and a fresh repo arrives with no
description, no homepage link and no topics - invisible on the repo card even
though its site is already serving. This closes that gap on a schedule rather
than by remembering.

What it sets, per repo:
  homepage     always, to the live GitHub Pages URL
  description  only when missing, derived from the course blurb in courses.json
  topics       always, derived from the course bucket and audience

Descriptions are never overwritten. A description Phoebe wrote by hand wins over
anything generated here.

Usage:
    python3 scripts/backfill-metadata.py --dry-run    # report, change nothing
    python3 scripts/backfill-metadata.py              # apply
    python3 scripts/backfill-metadata.py --only learn-sql-with-phoebe
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
OWNER = "phoebefu6"
API = "https://api.github.com"
DESCRIPTION_LIMIT = 350

BASE_TOPICS = [
    "learn-with-phoebe",
    "free-course",
    "interactive-learning",
    "tutorial",
    "github-pages",
]

BUCKET_TOPICS = {
    "data": ["data-analytics", "analytics", "sql", "business-intelligence"],
    "ds": ["data-science", "machine-learning", "scikit-learn"],
    "deng": ["data-engineering", "data-pipeline", "etl", "data-warehouse"],
    "ai": ["llm", "generative-ai", "artificial-intelligence", "claude"],
    "aiap": ["applied-ai", "ai-tools", "artificial-intelligence"],
    "dsec": ["dataops", "data-security", "security-operations"],
    "gov": ["data-governance", "ai-governance", "compliance", "privacy"],
    "sys": ["system-design", "product-management", "ux-design"],
    "lead": ["leadership", "management", "decision-making"],
    "dev": ["programming", "developer-tools"],
    "docs": ["documentation", "technical-writing", "markdown"],
    "move": ["wellbeing", "mindfulness"],
    "ecom": ["ecommerce", "analytics", "growth"],
}

# Repos that are not courses keep hand-written topics.
NON_COURSE_TOPICS = {
    "learn-with-phoebe": [
        "learn-with-phoebe", "free-course", "interactive-learning", "data-science",
        "artificial-intelligence", "curriculum", "education", "github-pages",
    ],
    "agent-skills-phoebe-picks": [
        "claude-skills", "agent-skills", "ai-agents", "claude-code", "skill-review",
        "awesome-list", "codex", "llm-tools", "github-pages",
    ],
    "phoebe-data-skills": [
        "claude-skills", "data-science", "data-analysis", "python", "pandas", "eda",
        "ai-agents", "reproducible-research", "github-pages",
    ],
    "phoebe-the-builder": [
        "portfolio", "ai-agents", "data-science", "builder", "showcase", "github-pages",
    ],
    "phoebefu6.github.io": ["personal-website", "portfolio", "github-pages"],
    "sketch-ideas-with-phoebe": [
        "data-visualization", "ai-art", "design", "explainer", "gallery",
        "generative-ai", "github-pages",
    ],
}


def token() -> str:
    t = os.environ.get("REPO_ADMIN_TOKEN") or os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if t:
        return t
    try:
        return subprocess.run(
            ["gh", "auth", "token"], capture_output=True, text=True, check=True
        ).stdout.strip()
    except (FileNotFoundError, subprocess.CalledProcessError):
        return ""


def api(path: str, method: str = "GET", payload: dict | None = None):
    req = Request(
        f"{API}{path}",
        method=method,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Accept": "application/vnd.github+json", "Content-Type": "application/json"},
    )
    t = token()
    if t:
        req.add_header("Authorization", f"Bearer {t}")
    try:
        with urlopen(req, timeout=30) as r:
            body = r.read()
            return json.loads(body) if body else {}
    except HTTPError as e:
        if e.code == 404:
            return None
        raise


def all_repos() -> list[dict]:
    out, page = [], 1
    while True:
        batch = api(f"/users/{OWNER}/repos?per_page=100&page={page}&type=owner")
        if not batch:
            break
        out += [r for r in batch if not r["private"] and not r["archived"]]
        if len(batch) < 100:
            break
        page += 1
    return out


def blurb_to_description(blurb: str) -> str:
    """Trim a course blurb to a repo description, cut on a clause boundary."""
    text = re.sub(r"\s+", " ", blurb).strip()
    if len(text) > 300:
        cut = text[:300]
        for sep in (". ", " - ", ", "):
            i = cut.rfind(sep)
            if i > 140:
                text = cut[:i].rstrip(" ,-.") + "."
                break
        else:
            text = cut.rstrip() + "..."
    tail = " by Phoebe Fu"
    if "Phoebe" not in text and len(text) + len(tail) <= DESCRIPTION_LIMIT:
        text = text.rstrip(".") + "." + tail
    return text


def topics_for(slug: str, course: dict | None) -> list[str]:
    if slug in NON_COURSE_TOPICS:
        wanted = NON_COURSE_TOPICS[slug]
    elif course:
        wanted = BASE_TOPICS + BUCKET_TOPICS.get(course["bucket"], [])
        if course.get("audience") in ("leader", "both"):
            wanted.append("executive-education")
        if course.get("audience") in ("builder", "both"):
            wanted.append("hands-on")
    else:
        wanted = ["phoebe-fu", "github-pages", "showcase"]
    seen: list[str] = []
    for t in wanted:
        if t not in seen:
            seen.append(t)
    return seen[:20]


def main() -> int:
    dry = "--dry-run" in sys.argv
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None

    courses = {c["slug"]: c for c in json.loads((ROOT / "courses.json").read_text())["courses"]}
    fixed: list[str] = []
    unlisted: list[str] = []

    for repo in all_repos():
        slug = repo["name"]
        if only and slug != only:
            continue
        if not repo.get("has_pages"):
            continue

        course = courses.get(slug)
        # The user site serves at the bare domain, every other repo at /<slug>/.
        live = (
            f"https://{OWNER}.github.io/"
            if slug == f"{OWNER}.github.io"
            else f"https://{OWNER}.github.io/{slug}/"
        )
        changes: dict[str, object] = {}

        if (repo.get("homepage") or "") != live:
            changes["homepage"] = live

        if not (repo.get("description") or "").strip():
            if course:
                changes["description"] = blurb_to_description(course["blurb"])
            else:
                unlisted.append(slug)

        wanted_topics = topics_for(slug, course)
        if sorted(repo.get("topics") or []) != sorted(wanted_topics):
            changes["topics"] = wanted_topics

        if not changes:
            continue

        fixed.append(f"{slug}: {', '.join(sorted(changes))}")
        if dry:
            continue

        patch = {k: v for k, v in changes.items() if k != "topics"}
        if patch:
            api(f"/repos/{OWNER}/{slug}", "PATCH", patch)
        if "topics" in changes:
            api(f"/repos/{OWNER}/{slug}/topics", "PUT", {"names": changes["topics"]})

    verb = "would fix" if dry else "fixed"
    print(f"{verb}: {len(fixed)}")
    for line in fixed:
        print(f"  {line}")
    if unlisted:
        print("\nno description and not in courses.json (needs a blurb, or a hand-written one):")
        for slug in unlisted:
            print(f"  {slug}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
