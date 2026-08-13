#!/usr/bin/env python3
"""Regenerate stats.json - the single source of truth for every count shown on
Phoebe's GitHub repos, badges and profile README.

Nothing anywhere should hardcode a course count. Everything reads this file, so
shipping a new course updates every surface on the next run.

Counts are derived from two places:
  - courses.json   (the hub manifest: total + planned)
  - the GitHub API (which repos actually serve a live GitHub Pages site)

Usage:
    python3 scripts/build-stats.py            # writes stats.json
    python3 scripts/build-stats.py --check    # exit 1 if stats.json is stale
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import date
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
OWNER = "phoebefu6"
API = "https://api.github.com"


def gh_json(path: str):
    """GET an API path. Uses GITHUB_TOKEN when present (CI), else gh's token."""
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not token:
        try:
            token = subprocess.run(
                ["gh", "auth", "token"], capture_output=True, text=True, check=True
            ).stdout.strip()
        except (FileNotFoundError, subprocess.CalledProcessError):
            token = ""
    req = Request(f"{API}{path}", headers={"Accept": "application/vnd.github+json"})
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except HTTPError as e:
        if e.code == 404:
            return None
        raise


def live_repos() -> list[str]:
    """Public repos of OWNER that serve a GitHub Pages site."""
    names, page = [], 1
    while True:
        batch = gh_json(f"/users/{OWNER}/repos?per_page=100&page={page}&type=owner")
        if not batch:
            break
        for repo in batch:
            if repo.get("private") or repo.get("archived"):
                continue
            if repo.get("has_pages"):
                names.append(repo["name"])
        if len(batch) < 100:
            break
        page += 1
    return sorted(names)


def build() -> dict:
    manifest = json.loads((ROOT / "courses.json").read_text())
    courses = manifest["courses"]
    slugs = {c["slug"] for c in courses}
    planned = {c["slug"] for c in courses if c.get("status") == "planned"}

    live = live_repos()
    live_courses = sorted(s for s in live if s in slugs and s not in planned)
    # Courses that exist as a repo but the manifest has not caught up with.
    unlisted = sorted(
        s
        for s in live
        if s.startswith("learn-")
        and s.endswith("-with-phoebe")
        and s not in slugs
        and s != "learn-with-phoebe"  # the hub itself matches the course pattern
    )

    sessions = sum(c.get("sessions", 0) for c in courses if c["slug"] in set(live_courses))
    buckets = sorted({c["bucket"] for c in courses if c["slug"] in set(live_courses)})

    return {
        "updated": date.today().isoformat(),
        "courses_live": len(live_courses),
        "courses_planned": len(planned),
        "courses_total": len(courses),
        "sessions_live": sessions,
        "buckets_live": len(buckets),
        "repos_live": len(live),
        "live_course_slugs": live_courses,
        "unlisted_course_repos": unlisted,
    }


def main() -> int:
    stats = build()
    out = ROOT / "stats.json"
    new = json.dumps(stats, indent=2) + "\n"

    if "--check" in sys.argv:
        old = out.read_text() if out.exists() else ""
        # Ignore the date when checking, only real drift matters.
        strip = lambda s: "\n".join(l for l in s.splitlines() if '"updated"' not in l)
        if strip(old) != strip(new):
            print("stats.json is stale - run scripts/build-stats.py", file=sys.stderr)
            return 1
        print("stats.json current")
        return 0

    out.write_text(new)
    print(
        f"stats.json: {stats['courses_live']} live courses, "
        f"{stats['sessions_live']} sessions, {stats['repos_live']} live repos"
    )
    if stats["unlisted_course_repos"]:
        print("  not yet in courses.json:", ", ".join(stats["unlisted_course_repos"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
