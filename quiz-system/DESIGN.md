# Final Quiz System - design (v1 proposal, 2026-08-25)

One 10-question final quiz per course, delivered on Google Forms, auto-graded in real time,
all responses landing in one Google Sheet command centre, triggered by a button at the end of
every course. Pass bar 80% (8/10). Compulsory for attendees.

Status: DESIGN ONLY. Nothing built, nothing pushed. Decisions at the bottom.

---

## 0. The estate this has to serve

| Fact | Number | Consequence |
|------|--------|-------------|
| Courses live on disk | 79 | 79 forms, not 1 |
| Courses in hub `courses.json` | 130 (79 live, 51 planned) | build for live only, generate for planned on ship |
| Sessions across live courses | 1022 | 10 questions cannot cover every session; they must be sampled |
| Existing in-page quiz questions (`.quiz-q`, 3 per session) | ~3000 | the question bank already exists and is already verified |
| Questions needed | 790 | authoring from scratch is the single biggest cost, so do not |

**The key insight.** Every session page already ends with 3 written, sourced, distractor-balanced
questions in `<div class="quiz-q" data-answer="N">` markup, with a `qwhy` explanation. The final quiz
is a *selection and rewrite* job over material that already exists, not an authoring job. That turns
790 new questions into 79 curation passes.

---

## 1. Architecture in one line

`final-quiz.json` in each course repo (source of truth)
  -> one Apps Script "Quiz Factory" builds/updates 79 Google Forms in quiz mode
  -> all 79 forms write into ONE spreadsheet, one tab each
  -> Forms auto-grades and shows the learner their score instantly
  -> one time-driven trigger aggregates every tab into Results + Dashboard + Chase
  -> a button on each course landing page links to that course's prefilled form

```
course repo                 Google Workspace                    learner
-----------                 ----------------                    -------
materials/                   [Quiz Factory .gs]                 clicks button
  final-quiz.json  --raw-->  builds/updates Form  ------------> takes 10 Qs
  (10 Qs + answers                 |                             sees score + why
   + formUrl)                      v                             instantly
      |                    [Quiz Command Centre .xlsx/Sheet]
      |                     Registry | 79 response tabs |
      v                     Results | Dashboard | Chase
index.html button  <-- formUrl written back                    Phoebe watches
                                                                Dashboard live
```

---

## 2. Layer 1 - the question file (single source of truth)

Path: `<course-repo>/materials/final-quiz.json`. Canonical. Nothing else stores questions.

```json
{
  "slug": "learn-ai-agents-with-phoebe",
  "title": "AI Agents",
  "version": 1,
  "passPercent": 80,
  "formId": "",
  "formUrl": "",
  "questions": [
    {
      "n": 1,
      "session": "b1",
      "term": "agent loop",
      "type": "mcq",
      "q": "What single fact makes a system an agent rather than a workflow?",
      "options": [
        "It runs on the newest, largest model",
        "It is connected to many tools",
        "The model chooses its own next step"
      ],
      "answer": 2,
      "points": 1,
      "why": "Anthropic: workflows run predefined code paths; agents dynamically direct their own processes."
    }
  ]
}
```

**Rules baked into the file, enforced by a validator:**

- exactly 10 questions, 1 point each, pass = 8
- only auto-gradable types: `mcq` (radio, one correct) or `multi` (checkbox, all-or-nothing)
- every question carries `session` and `term` (the key term it tests)
- **coverage rule:** the 10 questions must span at least 80% of the course's sessions, and the
  `term` set must cover the course's cheat-sheet key terms. This is how "people got 80% of the
  content and key terms" becomes a checkable property rather than a hope.
- `why` becomes the Form's per-question feedback, so submitting the quiz teaches, not just scores

**One reader rule.** A single `quiz-system/quiz_lib.py` parses and validates `final-quiz.json`
and is imported by the generator, the harvester, and the page-button injector. No second regex.

---

## 3. Layer 2 - the Quiz Factory (one Apps Script, not 79)

One standalone Apps Script project in her Workspace Drive, bound to nothing, owning all 79 forms.

`buildAll()` / `build(slug)`:
1. read `Registry` tab for the slug list and each course's raw GitHub URL
2. `UrlFetchApp` -> `raw.githubusercontent.com/phoebefu6/<slug>/main/materials/final-quiz.json`
   (repos are public, so no auth needed)
3. `FormApp.create()` on first run, `FormApp.openById()` on later runs (idempotent)
4. configure: `setIsQuiz(true)`, collect verified email, shuffle answer order, allow response
   editing off, confirmation message with the retake link
5. add the 10 items: `addMultipleChoiceItem()` with `createChoice(text, isCorrect)`,
   `setPoints(1)`, `setFeedbackForIncorrect(...)` carrying `why`
6. `setDestination(SPREADSHEET, MASTER_SHEET_ID)` so every form writes into one workbook
7. write `formId`, `formUrl` and the prefill URL back into `Registry`

**Constraint that shaped this design:** Apps Script allows ~20 installable triggers per script per
user. 79 `onFormSubmit` triggers is impossible. So the system uses **zero** form-submit triggers and
**one** time-driven trigger. Grading is done by Google Forms natively, not by code.

**Two things to verify in the Forms UI, not assumed:** Apps Script does not expose the grade-release
setting. Quiz forms default to "release grade immediately after each submission", which is exactly
what real-time scoring needs, but that must be eyeballed on the pilot form before scaling to 79.
Same for "restrict to my organisation".

**Known rough edge, stated up front:** rebuilding a form's items after responses exist shifts the
response-sheet columns. Mitigation: bump `version` in `final-quiz.json` on any content change, and
have the factory archive the old response tab as `<slug>-v1` before rebuilding. Content edits are
therefore cheap before launch and deliberate after.

---

## 4. Layer 3 - the Quiz Command Centre (one Google Sheet)

| Tab | Contents | Built by |
|-----|----------|----------|
| `Registry` | slug, title, bucket, formId, formUrl, prefill URL, version, question count, live? | Factory |
| `<slug>` x 79 | raw responses. Forms writes a `Score` column automatically for quiz forms | Forms |
| `Roster` | expected attendees per course and cohort: name, email, course, session date | Phoebe / calendar export |
| `Results` | flattened: email, course, attempt no, raw score, %, pass/fail, first-attempt %, best % | trigger |
| `Dashboard` | per course: invited, submitted, passed, pass rate, avg %, median, **worst question** | live formulas |
| `Chase` | roster rows with no pass yet, ready for mail merge | live formulas |

**Real time, precisely.** Two different clocks, both fast:

- **Learner:** Google Forms shows the score and the per-question `why` the instant they submit. Zero
  code, zero latency. This is the "I will give a score in real time" requirement, met natively.
- **Phoebe:** the response row lands in the Sheet within a second of submit, and `Dashboard` is
  built on live `QUERY`/`COUNTIFS`, so it updates as the room submits. Watch it on screen during
  the last 5 minutes of the session.
- Only the pass/fail email and certificate need the 10-minute trigger. Nothing a human waits on.

**The payoff beyond compliance.** `Dashboard`'s worst-question column is item analysis: it tells her
which concept did not land, per course, across every cohort she has ever taught. That feeds directly
back into the course content. The quiz stops being an admin tax and becomes the course's feedback loop.

---

## 5. Layer 4 - the button

Placement: the **course landing page** (`index.html`), plus the last session page of each track.
"At the end of the course", not at the end of every session (the 3-question in-page quizzes already
own the per-session check, and they stay).

New band in the existing editorial-bold language, no new dependencies:

```html
<section class="section finalquiz" id="final-quiz">
  <div class="section-kicker">
    <span class="klabel">Required</span>
    <h2>Final quiz 🎓 <span class="tag">10 questions · 80% to pass · ~8 min</span></h2>
  </div>
  <p>Everyone who attends completes this. Ten questions across the whole course, auto-scored
     the moment you submit, with the reasoning shown for every answer. Retake it as many times
     as you need to clear 80%.</p>
  <a class="quizbtn" href="{{formUrl}}?usp=pp_url&entry.XXXX={{slug}}"
     target="_blank" rel="noopener">Take the final quiz →</a>
</section>
```

`formUrl` is injected from `final-quiz.json` by the same one reader, so the link never has a second
home. The prefill entry stamps the course slug on the response, which keeps the data clean if forms
are ever merged.

Hub additions: a quiz badge on each course card, and `learn-with-phoebe/quiz.html` listing every
course's quiz link, for the attendee who lost the email.

---

## 6. Layer 5 - "compulsory", honestly

Google Forms cannot block anyone from anything. Compulsory has to be built out of consequence, not
gates. Three rungs, pick one:

1. **Soft (default).** Attendance is only recorded on a pass. `Chase` gives Phoebe the mail-merge
   list of who has not cleared 80%. Two automatic nudges, then it goes to the manager list.
2. **Carrot.** Auto-generated certificate: Slides template -> PDF -> emailed, only on >= 80%.
   Runs on the same 10-minute trigger. This is what actually moves completion rates.
3. **Hard gate.** Course recording or later material behind a pass. Needs Cloudflare Access on a
   private mirror, since GitHub Pages is public. Real work. Out of scope for v1, possible later.

**Retakes:** unlimited, by design. The bar is mastery, not one-shot performance. Track both
`first-attempt %` (the honest signal of whether the teaching landed) and `best %` (the 80% gate).

---

## 7. Data governance (this collects personal data)

Attendee name, email and score is personal data, and some attendees will be client staff.

- Purpose line printed at the top of every form: what is collected, why, who sees it, how long kept.
- Retention: scores kept 12 months, then aggregated and the identifiers dropped.
- Access: the Sheet stays inside the Workspace, link sharing off, Phoebe plus named admins only.
- If the audience is client staff, the client's own DPA governs. Route B2B through Centience.
- Do not put email addresses in any public artefact: the hub quiz page links to forms, never to results.

---

## 8. Build plan and honest cost

| Phase | Work | Size |
|-------|------|------|
| 0 | **Pilot on 1 course** end to end: harvest, JSON, Factory, form, sheet, button, take it myself | one sitting |
| 1 | Harvester: parse `.quiz-q` blocks across all 79 repos into candidate banks | ~1 hour of build |
| 2 | Curate 10 per course: select for session coverage + key terms, rewrite to exam register, add 4th distractor. Fan out to subagents, roughly 8 courses per agent | the bulk, 10 agent batches |
| 3 | Quiz Factory + Command Centre + Dashboard formulas | one sitting |
| 4 | Inject the button into 79 repos, commit, push, verify links live | scripted, one sitting |
| 5 | Certificate generator, if wanted | half a sitting |

Only phase 2 is genuinely large, and only because 79 is a big number, not because any one course
is hard. Nothing here is speculative: the question material exists, the Forms quiz features are
native, and the trigger budget is respected.

## 9. What this deliberately does not do

- No custom web quiz engine. Forms already auto-grades, handles auth, and is free with her seats.
- No per-form Apps Script. One project, one trigger, 79 forms.
- No replacement of the in-page 3-question quizzes. Those stay as the per-session check.
- No proctoring, no time limits, no anti-cheat. The goal is that people learn the key terms,
  and an open-book retake-until-you-pass quiz serves that better than an exam does.

---

## DECISIONS LOCKED (2026-08-25, approved by Phoebe)

| # | Decision | Choice | Consequence |
|---|----------|--------|-------------|
| 1 | Access | **Workspace only, verified email** | Google verifies identity, no spoofing, roster matching is exact. External client staff cannot take it - if that becomes needed, add a second open form per course later, same questions, same Sheet. |
| 2 | Scale | **Pilot one course end to end first** | Every Forms assumption tested on a live form before 131 exist. Scale only after Phoebe has taken the pilot herself. |
| 3 | Questions | **Harvest and rewrite the existing in-page quizzes** | The bank already exists in the session pages. Curate 10 per track for session coverage plus key terms, rewrite to exam register, add a fourth distractor. |
| 4 | Enforcement | **Certificate carrot plus chase list** | Auto certificate emailed on a pass. Chase tab drives two automated nudges. No hard gate, no public naming. |

---

## AMENDMENT 1 - two-track courses need two quizzes

**Finding:** 52 of the 79 live courses are two-track (leader pages `a1..aN`, builder pages `b1..bN`).
27 are single-track. A leader attendee must not be scored on builder sessions.

**Rejected:** one form with a track question at the top and Forms section branching. In quiz mode,
questions in a skipped section still count toward the total, so a leader would score 10 out of 20 and
see "50%". The 80% bar breaks and the learner sees a confusing number.

**Chosen:** one form per **track**. Registry key becomes `<slug>#<track>` where track is
`leader`, `builder` or `single`.

| | Count | Forms | Questions to curate |
|---|---|---|---|
| Two-track courses | 52 | 104 | 1040 |
| Single-track courses | 27 | 27 | 270 |
| **Total** | **79** | **131** | **1310** |

Form count costs nothing - they are generated. The harvest partitions naturally: the leader bank
comes from the `a*` pages, the builder bank from the `b*` pages, each already carrying roughly 3
verified questions per session. A 6-session leader track yields about 18 candidates for 10 slots;
a 10-session builder track yields about 30 for 10. Comfortable selection ratios either way.

**File shape change.** `materials/final-quiz.json` gains a `tracks` object rather than a flat
question list:

```json
{
  "slug": "learn-ai-agents-with-phoebe",
  "version": 1,
  "passPercent": 80,
  "tracks": {
    "leader":  { "label": "Leader track",  "formId": "", "formUrl": "", "questions": [ ... 10 ... ] },
    "builder": { "label": "Builder track", "formId": "", "formUrl": "", "questions": [ ... 10 ... ] }
  }
}
```

Single-track courses carry one key, `"single"`. One file per course either way, so the source of
truth stays one file per repo.

**Button change.** A two-track course landing page shows two buttons side by side, labelled by track,
so an attendee picks the track they actually sat in. Single-track pages show one.

---

## AMENDMENT 2 - prefill dropped

Section 5 originally stamped the course slug onto each response with a prefilled form field.
Dropped. Each form writes into its own tab in the master spreadsheet, and the factory renames that
tab to `<slug>#<track>`, so the tab name already carries the identity. A prefilled field would be a
second, respondent-editable copy of the same fact, which is exactly the duplicate-source-of-truth
shape the estate rules warn about. The button href is now the plain published form URL.

---

## PILOT STATUS - built 2026-08-25, not yet published

| Artefact | Path | State |
|---|---|---|
| One reader | `quiz-system/quiz_lib.py` | done, harvests and validates |
| Pilot questions | `learn-ai-agents-with-phoebe/materials/final-quiz.json` | 20 questions, validates clean |
| Form generator | `quiz-system/QuizFactory.gs` | done, needs Phoebe to run it |
| Button injector | `quiz-system/inject_button.py` | done, run against the pilot with placeholder links |
| Live forms | Google Workspace | **not created yet - needs Phoebe to run the script** |

**Verified locally on the pilot** (served on `python3 -m http.server`, measured in-browser):
band 944px wide matching a normal section at 1280px, no child overlap, palette inherited correctly
from the course's own orange variables, buttons side by side at desktop and stacked full width at
375px with no horizontal overflow, body line-height 1.85, no em or en dashes, placeholder links
correctly inert.

**Estate-wide feasibility confirmed before committing to the approach:**
all 131 tracks have at least 12 harvestable candidate questions for 10 slots, all 79 repos share the
same `--indigo*` variable names and a `.btn.primary` class, so one CSS block themes correctly
everywhere.

### Next actions, in order

1. Phoebe creates a blank Sheet "Quiz Command Centre", pastes `QuizFactory.gs` into a new standalone
   Apps Script project, fills `CONFIG.MASTER_SHEET_ID`, runs `setupCommandCentre()` then `buildOne()`.
2. Phoebe takes the pilot quiz herself and confirms the score appears immediately on submit, and
   that "release grade immediately" is what the form actually does. This is the one assumption the
   API cannot set and the whole real-time promise rests on it.
3. She pastes the two published form URLs back. Then
   `python3 inject_button.py <repo> --set leader=<url> --set builder=<url>`, verify, commit, push.
4. `installTrigger()`, confirm Results and Dashboard populate.
5. Only then fan out the remaining 78 courses.

---

## AMENDMENT 3 - quiz-builder skill, planned 2026-08-25

The quiz system gets its own skill, `quiz-builder`, a sibling of `course-builder`. Course-builder
keeps owning courses and calls quiz-builder at Phase 6. Four modes, one course link as the input:

| Mode | Trigger | Does |
|---|---|---|
| A. Create | `/quiz-builder <course url or slug>` | resolve slug, harvest the bank, curate 10 per track, write `final-quiz.json`, validate, emit the Google steps, inject the button |
| B. Collect | `/quiz-builder results <slug>` | read the Command Centre through the Drive connector, report attempts, pass rate, who is outstanding |
| C. Visualize | `/quiz-builder dashboard <slug>` | styled dashboard tab via `app-script-partner`, plus item analysis on which concept did not land |
| D. Notify | `/quiz-builder email <slug>` | draft pass, fail and certificate mail. Never sends without an explicit go-ahead each time |

The skill is a ROUTER over the existing files in `learn-with-phoebe/quiz-system/`, not a second
copy of them. `quiz_lib.py` stays the one reader, `QuizFactory.gs` stays the one generator,
`inject_button.py` stays the one injector. If the skill ever grows its own parser or its own
question format, that is the bug.

Open question for build time: whether Mode A commits and pushes, or stops at the diff for review.
Recommendation is stop at the diff.

**Blocked on the test run** (`TEST-RUN-datalit.md`). The skill should encode what the flow actually
turns out to be, not what this document assumes it will be. Specifically: which Forms settings the
Apps Script really manages to set, and which have to be flipped by hand every time.

---

## TEST RUN - Data Literacy, C-level, prepared 2026-08-25

Test course `learn-data-literacy-with-phoebe`: single track, 8 sessions, 24 harvested candidates,
audience already `leader`. Ten questions curated and validating, covering all 8 sessions, framed as
executive decisions rather than definitions.

Test-mode addition to the factory: `INLINE_QUIZ_JSON` plus `buildInline()`, so a form can be built
before its `final-quiz.json` has been pushed to GitHub. `validateQuiz_()` was split out so inline
and fetched quizzes get identical checks. Set `INLINE_QUIZ_JSON` back to empty once the file is
live in the repo, so the repo stays the single source of truth.

Paste-ready artefact: `QuizFactory-datalit-test.gs`, the factory with the Data Literacy quiz already
inlined. Both scripts pass a real syntax check.

Housekeeping spotted, unrelated: the hub `courses.json` records `sessions: 6` for Data Literacy but
the repo has 8 session pages. Worth a sweep across the hub for the same drift elsewhere.
