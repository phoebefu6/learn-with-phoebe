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
import re
from html.parser import HTMLParser
from pathlib import Path

TRACK_LEADER = "leader"
TRACK_BUILDER = "builder"
TRACK_PRACTITIONER = "practitioner"
TRACK_STAKEHOLDER = "stakeholder"
TRACK_EXEC = "exec"
TRACK_CHAIRMAN = "chairman"
TRACK_SINGLE = "single"

PASS_PERCENT = 80
QUESTIONS_PER_QUIZ = 10
SESSION_COVERAGE_MIN = 0.80  # 10 questions must span >= 80% of the track's sessions

# ---------------------------------------------------------------- harvesting

# Option and feedback markup drifted across course batches: older repos use
# <button class="qopt"> + <p class="qwhy">, newer ones <div class="qopt"> +
# <q class="qwhy">. A tag-specific regex matched nothing on the newer shape and
# returned an empty bank instead of failing, so this parses structurally by
# class and never by tag name.

_H1 = re.compile(r"<h1[^>]*>(?P<t>.*?)</h1>", re.DOTALL)
_CHEAT_TERM = re.compile(r'<div class="cheat-item"><b>(?P<t>.*?)</b>', re.DOTALL)
_HAS_QUIZ = re.compile(r'class="[^"]*\bquiz-q\b')
_TAGS = re.compile(r"<[^>]+>")
_LEAD_LABEL = re.compile(r"^\s*[A-H]\s*[·.)]\s*")   # strips "A · " from options
_LEAD_NUM = re.compile(r"^\s*\d+\s*[·.)]\s*")       # strips "1 · " from stems

# filename prefix -> track key. Unknown prefixes keep their own letter rather
# than being silently folded into "single".
_PREFIX_TRACK = {
    "a": TRACK_LEADER, "b": TRACK_BUILDER, "p": TRACK_PRACTITIONER,
    "s": TRACK_STAKEHOLDER, "e": TRACK_EXEC, "c": TRACK_CHAIRMAN,
}

# Courses name their own tracks in the page footer ("Analyst session 1 of 8").
# The key above is for stable filing; this is the label a human reads, and it is
# taken from the course rather than guessed - "a" is Leader in most courses but
# Analyst in learn-customer-retention.
_FOOTER_TRACK = re.compile(r"<span>\s*([A-Z][A-Za-z-]*)\s+session\s+\d+\s+of\s+\d+")
_PREFIX_RE = re.compile(r"^([a-z]+)\d")


def _clean(raw: str) -> str:
    txt = _TAGS.sub("", raw)
    txt = html.unescape(txt)
    return re.sub(r"\s+", " ", txt).strip()


class _QuizParser(HTMLParser):
    """Pulls .quiz-q blocks out of a session page, whatever tags they use."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.questions: list[dict] = []
        self._depth = 0           # nesting depth inside the current quiz-q
        self._cur: dict | None = None
        self._capture: str | None = None
        self._cap_depth = 0
        self._buf: list[str] = []

    @staticmethod
    def _classes(attrs) -> set[str]:
        d = dict(attrs)
        return set((d.get("class") or "").split())

    def handle_starttag(self, tag, attrs):
        cls = self._classes(attrs)
        if self._cur is None:
            if "quiz-q" in cls:
                d = dict(attrs)
                try:
                    ans = int(d.get("data-answer", ""))
                except ValueError:
                    return
                self._cur = {"answer": ans, "q": "", "options": [], "why": ""}
                self._depth = 1
            return

        self._depth += 1
        if self._capture is None:
            for name in ("qtext", "qopt", "qwhy"):
                if name in cls:
                    self._capture = name
                    self._cap_depth = self._depth
                    self._buf = []
                    break

    def handle_data(self, data):
        if self._capture is not None:
            self._buf.append(data)

    def handle_endtag(self, tag):
        if self._cur is None:
            return
        if self._capture is not None and self._depth == self._cap_depth:
            text = _clean("".join(self._buf))
            if self._capture == "qtext":
                self._cur["q"] = _LEAD_NUM.sub("", text)
            elif self._capture == "qopt":
                self._cur["options"].append(_LEAD_LABEL.sub("", text))
            else:
                self._cur["why"] = text
            self._capture = None
        self._depth -= 1
        if self._depth == 0:
            q = self._cur
            self._cur = None
            if q["q"] and len(q["options"]) >= 2 and q["answer"] < len(q["options"]):
                self.questions.append(q)


def track_of(filename: str, prefixes: set[str] | None = None) -> str:
    """Session page filename -> track key.

    A repo with one filename prefix is single-track. With several, each prefix
    is its own track: a and b keep their historic names, anything else keeps
    its own letter so a new convention cannot be silently mislabelled.
    """
    m = _PREFIX_RE.match(Path(filename).stem)
    pref = m.group(1) if m else ""
    if prefixes is not None and len(prefixes) <= 1:
        return TRACK_SINGLE
    if not pref:
        return TRACK_SINGLE
    return _PREFIX_TRACK.get(pref, pref)


def track_label(repo: Path, track: str) -> str:
    """The name this course gives a track, read from its own page footers."""
    prefixes = page_prefixes(repo)
    for page in session_pages(repo):
        if track_of(page.name, prefixes) != track:
            continue
        m = _FOOTER_TRACK.search(page.read_text(encoding="utf-8", errors="replace"))
        if m:
            return m.group(1) + " track"
    return track.capitalize() + " track"


def session_pages(repo: Path) -> list[Path]:
    d = repo / "courses"
    if not d.is_dir():
        return []
    return sorted(p for p in d.glob("*.html"))


def page_prefixes(repo: Path) -> set[str]:
    out = set()
    for p in session_pages(repo):
        m = _PREFIX_RE.match(p.stem)
        out.add(m.group(1) if m else "")
    return out


def repo_tracks(repo: Path) -> list[str]:
    prefixes = page_prefixes(repo)
    seen: list[str] = []
    for p in session_pages(repo):
        t = track_of(p.name, prefixes)
        if t not in seen:
            seen.append(t)
    return seen or [TRACK_SINGLE]


def harvest_page(path: Path) -> dict:
    src = path.read_text(encoding="utf-8", errors="replace")
    parser = _QuizParser()
    parser.feed(src)
    h1 = _H1.search(src)
    session = _PREFIX_RE.sub(lambda m: m.group(0), path.stem).split("-")[0]
    questions = []
    for q in parser.questions:
        q = dict(q)
        q["session"] = session
        q["page"] = path.name
        questions.append(q)
    return {
        "page": path.name,
        "session": session,
        "title": _clean(h1.group("t")) if h1 else path.stem,
        "terms": [_clean(t.group("t")) for t in _CHEAT_TERM.finditer(src)],
        "questions": questions,
        "has_quiz_markup": bool(_HAS_QUIZ.search(src)),
    }


class HarvestError(RuntimeError):
    """A page carries quiz markup that the parser could not read."""


def harvest_repo(repo: str | Path, strict: bool = True) -> dict:
    """Course repo -> candidate bank keyed by track.

    strict=True raises when a page clearly contains quiz markup but yielded no
    questions. An empty bank is almost always a parser problem, not a course
    without quizzes, and silently returning zero is how that stays hidden.
    """
    repo = Path(repo)
    prefixes = page_prefixes(repo)
    out: dict[str, dict] = {}
    unreadable: list[str] = []

    for page in session_pages(repo):
        h = harvest_page(page)
        if h["has_quiz_markup"] and not h["questions"]:
            unreadable.append(h["page"])
        t = track_of(page.name, prefixes)
        bucket = out.setdefault(t, {"sessions": [], "terms": [], "candidates": []})
        bucket["sessions"].append(
            {"session": h["session"], "page": h["page"], "title": h["title"]})
        bucket["terms"].extend(h["terms"])
        bucket["candidates"].extend(h["questions"])

    if unreadable and strict:
        raise HarvestError(
            f"{repo.name}: {len(unreadable)} page(s) contain quiz-q markup that produced "
            f"no questions, e.g. {', '.join(unreadable[:3])}. The parser is out of date "
            f"with this course's markup - fix it rather than accepting an empty bank.")

    for t in out:
        seen = set()
        out[t]["terms"] = [x for x in out[t]["terms"] if not (x in seen or seen.add(x))]
    return {"slug": repo.name, "tracks": out, "unreadable": unreadable}


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
