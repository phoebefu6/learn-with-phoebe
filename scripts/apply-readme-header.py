#!/usr/bin/env python3
"""Apply the standard README header to every live repo.

The header puts the live GitHub Pages link above the fold twice - as a badge and
as a headline link - so a visitor's first click is always the running site.

It carries no hardcoded numbers. The course count is a shields.io dynamic badge
reading stats.json off the live hub, so it stays correct without re-running this.

Idempotent: the block lives between marker comments, so a re-run replaces it
rather than stacking. Also recognises the older hub-banner markers.

Usage:
    python3 scripts/apply-readme-header.py --dry-run
    python3 scripts/apply-readme-header.py
    python3 scripts/apply-readme-header.py learn-sql-with-phoebe   # one repo
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen

OWNER = "phoebefu6"
HUB = f"https://{OWNER}.github.io/learn-with-phoebe/"
STATS = f"https://{OWNER}.github.io/learn-with-phoebe/stats.json"

START, END = "<!-- phoebe header -->", "<!-- /phoebe header -->"
LEGACY = ("<!-- learn-with-phoebe hub banner -->", "<!-- /learn-with-phoebe hub banner -->")

# Repos that are not courses: their own call to action, and no hub banner.
SPECIAL = {
    "learn-with-phoebe": ("Browse every course", "hub"),
    "phoebefu6.github.io": ("Open the live site", "site"),
    "phoebe-the-builder": ("Open the live site", "site"),
    "phoebe-data-skills": ("Open the live showcase", "site"),
    "agent-skills-phoebe-picks": ("Open the live gallery", "site"),
    "sketch-ideas-with-phoebe": ("Open the live gallery", "site"),
    "design-dashboard-with-phoebe": ("Open the live gallery", "site"),
    "play-game-with-phoebe": ("Open the live hub", "site"),
}

SUBTITLE = {
    "course": "Free, runs in your browser. No install, no login.",
    "hub": "Every course is free and runs in your browser. No install, no login.",
    "site": "Free and open. Every build links to its source.",
}


def live_url(slug: str) -> str:
    if slug == f"{OWNER}.github.io":
        return f"https://{OWNER}.github.io/"
    return f"https://{OWNER}.github.io/{slug}/"


def badge(label: str, color: str) -> str:
    return f"https://img.shields.io/badge/{quote(label, safe='')}-{color}?style=for-the-badge"


def course_count_badge() -> str:
    """Reads courses_live out of stats.json at render time - never hardcoded."""
    return (
        "https://img.shields.io/badge/dynamic/json"
        f"?url={quote(STATS, safe='')}"
        "&query=%24.courses_live"
        "&label=free%20courses"
        "&style=for-the-badge&color=111111"
    )


def header(slug: str) -> str:
    live = live_url(slug)
    stars = f"https://github.com/{OWNER}/{slug}/stargazers"
    verb, kind = SPECIAL.get(slug, ("Open the live course", "course"))

    rows = [
        f"[![{verb}]({badge('▶ ' + verb.lower(), '1f6feb')})]({live})",
        f"[![Star this repo](https://img.shields.io/github/stars/{OWNER}/{slug}"
        f"?style=for-the-badge&label=star%20this%20repo&color=444444)]({stars})",
    ]
    if kind == "course":
        rows.append(f"[![Free courses]({course_count_badge()})]({HUB})")

    out = [START, "", "\n".join(rows), "", f"### ▶︎ [{verb} →]({live})", "", SUBTITLE[kind], ""]
    if kind == "course":
        out += [
            f"> 📚 Part of **[Learn with Phoebe]({HUB})** - free, hands-on courses on AI, data, "
            f"and the craft around them. **[Browse every course ↗]({HUB})**",
            "",
        ]
    out += [END, ""]
    return "\n".join(out)


def patch(text: str, slug: str) -> str:
    block = header(slug)
    for start, end in ((START, END), LEGACY):
        if start in text and end in text:
            i, j = text.index(start), text.index(end) + len(end)
            return re.sub(r"\n{3,}", "\n\n", text[:i] + block.rstrip("\n") + text[j:])
    return block + text.lstrip("\n")


def run(cmd: list[str], cwd: Path) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)


def main() -> int:
    dry = "--dry-run" in sys.argv
    only = [a for a in sys.argv[1:] if not a.startswith("-")]

    stats = json.loads(urlopen(STATS, timeout=30).read())
    targets = sorted(set(stats["live_course_slugs"]) | set(SPECIAL))
    if only:
        targets = [t for t in targets if t in only]

    work = Path(tempfile.mkdtemp(prefix="header-rollout-"))
    changed = skipped = failed = 0
    try:
        for slug in targets:
            r = run(
                ["gh", "repo", "clone", f"{OWNER}/{slug}", slug, "--", "--depth", "1", "-q"], work
            )
            if r.returncode != 0:
                print(f"CLONE FAIL {slug}: {r.stderr.strip()[:100]}")
                failed += 1
                continue

            repo = work / slug
            readme = repo / "README.md"
            before = readme.read_text() if readme.exists() else ""
            after = patch(before, slug)
            if before == after:
                skipped += 1
                continue
            readme.write_text(after)

            if dry:
                print(f"WOULD PATCH {slug}")
                changed += 1
                continue

            run(["git", "add", "README.md"], repo)
            run(
                [
                    "git",
                    "commit",
                    "-q",
                    "-m",
                    "docs: standardise README header with a prominent live link\n\n"
                    "Puts the live GitHub Pages link above the fold as both a badge and a\n"
                    "headline link, and adds a star CTA. The course count is a dynamic badge\n"
                    "reading stats.json from the hub, so it never goes stale.",
                ],
                repo,
            )
            p = run(["git", "push", "-q", "origin", "HEAD"], repo)
            if p.returncode != 0:
                print(f"PUSH FAIL {slug}: {p.stderr.strip()[:120]}")
                failed += 1
            else:
                changed += 1
                print(f"ok {slug}")
    finally:
        shutil.rmtree(work, ignore_errors=True)

    print(f"\nchanged: {changed}  already-current: {skipped}  failed: {failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
