"""Quiz system - THE one reader.

Every other script in the quiz system imports this. Do not write a second parser
for .quiz-q markup or for final-quiz.json anywhere in the estate.

Two jobs:
  harvest_repo(path)  -> candidate question bank, per track, from session pages
  validate(quiz_dict) -> list of problems, empty means the quiz is shippable
"""

from __future__ import annotations

import html
import json
import os
import re
from pathlib import Path

TRACK_LEADER = "leader"
TRACK_BUILDER = "builder"
TRACK_SINGLE = "single"

PASS_PERCENT = 80
QUESTIONS_PER_QUIZ = 10
SESSION_COVERAGE_MIN = 0.80  # 10 questions must span >= 80% of the track's sessions

# ---------------------------------------------------------------- harvesting

_QUIZ_BLOCK = re.compile(
    r'<div class="quiz-q"\s+data-answer="(?P<ans>\d+)"\s*>(?P<body>.*?)</div>',
    re.DOTALL,
)
_QTEXT = re.compile(r'<p class="qtext">(?P<t>.*?)</p>', re.DOTALL)
_QOPT = re.compile(r'<button class="qopt"[^>]*>(?P<t>.*?)</button>', re.DOTALL)
_QWHY = re.compile(r'<p class="qwhy">(?P<t>.*?)</p>', re.DOTALL)
_H1 = re.compile(r"<h1[^>]*>(?P<t>.*?)</h1>", re.DOTALL)
_CHEAT_TERM = re.compile(r'<div class="cheat-item"><b>(?P<t>.*?)</b>', re.DOTALL)
_TAGS = re.compile(r"<[^>]+>")
_LEAD_LABEL = re.compile(r"^\s*[A-H]\s*·\s*")   # strips "A · " from harvested options
_LEAD_NUM = re.compile(r"^\s*\d+\s*·\s*")       # strips "1 · " from harvested stems


def _clean(raw: str) -> str:
    """HTML fragment -> plain text, whitespace normalised."""
    txt = _TAGS.sub("", raw)
    txt = html.unescape(txt)
    return re.sub(r"\s+", " ", txt).strip()


def track_of(filename: str) -> str:
    """Session page filename -> which track it belongs to."""
    stem = Path(filename).stem
    if re.match(r"^a\d", stem):
        return TRACK_LEADER
    if re.match(r"^b\d", stem):
        return TRACK_BUILDER
    return TRACK_SINGLE


def session_pages(repo: Path) -> list[Path]:
    d = repo / "courses"
    if not d.is_dir():
        return []
    return sorted(p for p in d.glob("*.html"))


def repo_tracks(repo: Path) -> list[str]:
    """Which tracks this course actually has. Single-track courses return ['single']."""
    found = {track_of(p.name) for p in session_pages(repo)}
    if TRACK_LEADER in found and TRACK_BUILDER in found:
        return [TRACK_LEADER, TRACK_BUILDER]
    return [TRACK_SINGLE]


def harvest_page(path: Path) -> dict:
    """One session page -> its title, key terms, and its in-page questions."""
    src = path.read_text(encoding="utf-8", errors="replace")
    h1 = _H1.search(src)
    questions = []
    for m in _QUIZ_BLOCK.finditer(src):
        body = m.group("body")
        stem = _QTEXT.search(body)
        opts = [_LEAD_LABEL.sub("", _clean(o.group("t"))) for o in _QOPT.finditer(body)]
        why = _QWHY.search(body)
        if not stem or len(opts) < 2:
            continue
        answer = int(m.group("ans"))
        if answer >= len(opts):
            continue
        questions.append(
            {
                "session": path.stem.split("-")[0],
                "page": path.name,
                "q": _LEAD_NUM.sub("", _clean(stem.group("t"))),
                "options": opts,
                "answer": answer,
                "why": _clean(why.group("t")) if why else "",
            }
        )
    return {
        "page": path.name,
        "session": path.stem.split("-")[0],
        "track": track_of(path.name),
        "title": _clean(h1.group("t")) if h1 else path.stem,
        "terms": [_clean(t.group("t")) for t in _CHEAT_TERM.finditer(src)],
        "questions": questions,
    }


def harvest_repo(repo: str | Path) -> dict:
    """Whole course repo -> candidate bank keyed by track.

    {track: {"sessions": [...], "terms": [...], "candidates": [...]}}
    """
    repo = Path(repo)
    out: dict[str, dict] = {}
    for page in session_pages(repo):
        h = harvest_page(page)
        t = h["track"]
        bucket = out.setdefault(t, {"sessions": [], "terms": [], "candidates": []})
        bucket["sessions"].append({"session": h["session"], "page": h["page"], "title": h["title"]})
        bucket["terms"].extend(h["terms"])
        bucket["candidates"].extend(h["questions"])
    # single-track courses land under 'single' already via track_of
    for t in out:
        seen = set()
        out[t]["terms"] = [x for x in out[t]["terms"] if not (x in seen or seen.add(x))]
    return {"slug": repo.name, "tracks": out}


# ---------------------------------------------------------------- validation

def validate(quiz: dict, bank: dict | None = None) -> list[str]:
    """Return a list of problems. Empty list means shippable."""
    problems: list[str] = []
    if quiz.get("passPercent") != PASS_PERCENT:
        problems.append(f"passPercent must be {PASS_PERCENT}")
    tracks = quiz.get("tracks")
    if not isinstance(tracks, dict) or not tracks:
        return problems + ["no tracks object"]

    for tname, t in tracks.items():
        p = f"[{tname}]"
        qs = t.get("questions", [])
        if len(qs) != QUESTIONS_PER_QUIZ:
            problems.append(f"{p} has {len(qs)} questions, need {QUESTIONS_PER_QUIZ}")
        stems = set()
        used_sessions = set()
        used_terms = set()
        for i, q in enumerate(qs, 1):
            qp = f"{p} q{i}"
            if q.get("type") not in ("mcq", "multi"):
                problems.append(f"{qp}: type must be mcq or multi (auto-gradable only)")
            opts = q.get("options", [])
            if not 3 <= len(opts) <= 5:
                problems.append(f"{qp}: {len(opts)} options, want 3 to 5")
            if len(set(opts)) != len(opts):
                problems.append(f"{qp}: duplicate option text")
            ans = q.get("answer")
            if q.get("type") == "mcq":
                if not isinstance(ans, int) or not 0 <= ans < len(opts):
                    problems.append(f"{qp}: answer index out of range")
            else:
                if not isinstance(ans, list) or not ans or any(
                    not isinstance(a, int) or not 0 <= a < len(opts) for a in ans
                ):
                    problems.append(f"{qp}: multi answer must be a non-empty index list")
            if q.get("points") != 1:
                problems.append(f"{qp}: points must be 1")
            if not q.get("why"):
                problems.append(f"{qp}: missing 'why' feedback text")
            if not q.get("session"):
                problems.append(f"{qp}: missing session tag")
            if not q.get("term"):
                problems.append(f"{qp}: missing key term tag")
            stem = (q.get("q") or "").strip().lower()
            if not stem:
                problems.append(f"{qp}: empty question stem")
            elif stem in stems:
                problems.append(f"{qp}: duplicate question stem")
            stems.add(stem)
            used_sessions.add(q.get("session"))
            used_terms.add((q.get("term") or "").lower())
            for bad in ("—", "–"):
                blob = " ".join([q.get("q", ""), q.get("why", "")] + opts)
                if bad in blob:
                    problems.append(f"{qp}: contains an em or en dash")
                    break

        if bank:
            all_sessions = {s["session"] for s in bank["tracks"].get(tname, {}).get("sessions", [])}
            if all_sessions:
                cov = len(used_sessions & all_sessions) / len(all_sessions)
                if cov < SESSION_COVERAGE_MIN:
                    missing = sorted(all_sessions - used_sessions)
                    problems.append(
                        f"{p}: session coverage {cov:.0%} below {SESSION_COVERAGE_MIN:.0%}, "
                        f"missing {', '.join(missing)}"
                    )
    return problems


def load(path: str | Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def quiz_path(repo: str | Path) -> Path:
    return Path(repo) / "materials" / "final-quiz.json"


if __name__ == "__main__":
    import sys

    repo = sys.argv[1] if len(sys.argv) > 1 else "."
    bank = harvest_repo(repo)
    for t, d in bank["tracks"].items():
        print(f"{t:8s} sessions={len(d['sessions']):3d}  candidates={len(d['candidates']):3d}  terms={len(d['terms']):3d}")
    qp = quiz_path(repo)
    if qp.exists():
        probs = validate(load(qp), bank)
        print("VALID" if not probs else "PROBLEMS:\n  " + "\n  ".join(probs))
