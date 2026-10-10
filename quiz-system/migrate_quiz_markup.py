#!/usr/bin/env python3
"""Migrate the newer quiz markup back to the estate shape.

Eight courses built in Sept/Oct 2026 render quiz options as <div class="qopt">
and explanations as <q class="qwhy">. Measured in a real browser, that shape has
two defects the <button>/<p> shape does not:

  1. a <div> is not focusable, so those quizzes are mouse-only - tabIndex -1,
     zero focusable elements inside a question
  2. <q> carries open-quote/close-quote pseudo-elements, so every explanation
     renders wrapped in quotation marks

app.js selects by class, not tag, so the migration needs no JS change.

  python3 migrate_quiz_markup.py <repo> [...]      apply
  python3 migrate_quiz_markup.py --check <repo>    report only
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import quiz_lib as Q  # noqa: E402

OPT = re.compile(r'<div class="qopt">(.*?)</div>', re.DOTALL)
WHY = re.compile(r'<q class="qwhy">(.*?)</q>', re.DOTALL)


def migrate_text(src: str) -> tuple[str, int, int]:
    out, n_opt = OPT.subn(r'<button class="qopt" type="button">\1</button>', src)
    out, n_why = WHY.subn(r'<p class="qwhy">\1</p>', out)
    return out, n_opt, n_why


def check_page(src: str, path: Path) -> list[str]:
    """Refuse to touch anything the simple substitution would get wrong."""
    problems = []
    opts = OPT.findall(src)
    whys = WHY.findall(src)
    if src.count('<div class="qopt">') != len(opts):
        problems.append(f"{path.name}: unbalanced qopt divs")
    if src.count('<q class="qwhy">') != len(whys):
        problems.append(f"{path.name}: unbalanced qwhy elements")
    for o in opts:
        if "<div" in o:
            problems.append(f"{path.name}: nested div inside a qopt")
        if "\n" in o:
            problems.append(f"{path.name}: multiline qopt")
    for w in whys:
        if "\n" in w:
            problems.append(f"{path.name}: multiline qwhy")
    return problems


def run(repo: Path, apply: bool) -> dict:
    pages = Q.session_pages(repo)
    problems, opts, whys, touched = [], 0, 0, 0
    for p in pages:
        src = p.read_text(encoding="utf-8")
        if '<div class="qopt">' not in src and '<q class="qwhy">' not in src:
            continue
        problems += check_page(src, p)
        new, n_o, n_w = migrate_text(src)
        opts += n_o
        whys += n_w
        if new != src:
            touched += 1
            if apply and not problems:
                p.write_text(new, encoding="utf-8")
    return {"pages": touched, "opts": opts, "whys": whys, "problems": problems}


def verify(repo: Path) -> list[str]:
    """Nothing of the old shape may survive, and the bank must still harvest."""
    bad = []
    for p in Q.session_pages(repo):
        src = p.read_text(encoding="utf-8")
        if '<div class="qopt">' in src or '<q class="qwhy">' in src:
            bad.append(f"{p.name}: old markup survived")
    try:
        bank = Q.harvest_repo(repo)
        total = sum(len(t["candidates"]) for t in bank["tracks"].values())
        if total == 0:
            bad.append("harvest returned no questions after migration")
    except Q.HarvestError as e:
        bad.append(str(e))
    return bad


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("repos", nargs="+")
    ap.add_argument("--check", action="store_true", help="report, change nothing")
    args = ap.parse_args()

    failed = False
    for r in args.repos:
        repo = Path(r).resolve()
        before = sum(len(t["candidates"]) for t in Q.harvest_repo(repo)["tracks"].values())
        res = run(repo, apply=not args.check)
        tag = "CHECK" if args.check else "MIGRATED"
        if res["problems"]:
            failed = True
            print(f"{repo.name}: REFUSED")
            for p in res["problems"][:5]:
                print("   ", p)
            continue
        if args.check:
            print(f"{repo.name}: {tag} {res['pages']} pages, {res['opts']} options, "
                  f"{res['whys']} explanations, bank={before}")
            continue
        bad = verify(repo)
        after = sum(len(t["candidates"]) for t in Q.harvest_repo(repo)["tracks"].values())
        if bad or after != before:
            failed = True
            print(f"{repo.name}: VERIFY FAILED (bank {before} -> {after})")
            for b in bad[:5]:
                print("   ", b)
        else:
            print(f"{repo.name}: {tag} {res['pages']} pages, {res['opts']} options, "
                  f"{res['whys']} explanations, bank {before} -> {after} unchanged")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
