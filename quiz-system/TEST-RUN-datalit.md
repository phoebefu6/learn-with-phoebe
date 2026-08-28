# Test run - Data Literacy final quiz (C-level)

Purpose: walk the quiz creation flow end to end once, by hand, so we know exactly what the
`quiz-builder` skill has to automate and which settings the API cannot reach. About 15 minutes.

Test course: `learn-data-literacy-with-phoebe`, single track, audience C-level.
Questions: 10, already written and validated, covering all 8 sessions.

---

## Before you start

Nothing is pushed. The questions live locally at
`learn-data-literacy-with-phoebe/materials/final-quiz.json`.

Because that file is not on GitHub yet, the test script carries the quiz inline, so this run needs
no push and no repo change. Once the flow is proven we push the file and the script reads it from
the repo instead, which is the real pipeline.

---

## Step 1 - create the Command Centre sheet

1. drive.google.com, New, Google Sheets, blank
2. Name it **Quiz Command Centre**
3. Copy the ID out of the URL: `docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`

## Step 2 - create the Apps Script project

1. script.google.com, **New project**
2. Name it **Quiz Factory**
3. Delete the boilerplate `myFunction` block
4. Paste the whole of **`QuizFactory-datalit-test.gs`**
5. Near the top, replace `PASTE_THE_SHEET_ID_HERE` with the ID from step 1
6. Save

## Step 3 - build the command centre tabs

1. Function dropdown, pick **`setupCommandCentre`**, Run
2. Approve the permission prompt. It asks for Sheets, Drive, Forms and Gmail, because the script
   creates forms, writes the sheet, and later emails certificates. "Advanced, go to Quiz Factory
   (unsafe)" is the normal Workspace path for your own unpublished script.
3. Open the sheet. You should now see tabs: `Registry`, `Roster`, `Results`, `Dashboard`, `Chase`.

**If this fails**, stop and send me the red error. Everything downstream depends on it.

## Step 4 - build the quiz form

1. Function dropdown, pick **`buildInline`**, Run
2. View, Logs. You should see one line:
   `learn-data-literacy-with-phoebe#single  ->  https://docs.google.com/forms/d/e/.../viewform`
3. Open that URL. Confirm you see 10 questions plus a name field and a date field.

## Step 5 - the part the API cannot set. Check these by hand.

This is the real point of the test. Open the form in **edit** view, then Settings.

| Setting | Must be | Why it matters |
|---|---|---|
| Make this a quiz | on | without it nothing is auto-graded |
| **Release grade: immediately after each submission** | on | **this is the entire real-time promise** |
| Collect email addresses: Verified | on | roster matching, no spoofing |
| Restrict to users in your organisation | on | decision 1 |
| Limit to 1 response | **off** | retakes are the design |

Write down which of these the script actually managed to set, and which you had to flip yourself.
That list is exactly what the skill will have to tell you to do by hand, forever.

## Step 6 - take the quiz as a participant

1. Open the public form URL, answer all 10, submit
2. **Does your score appear immediately, with the explanation under each question?**
   That is the requirement. If it does not, the design needs the answer before we scale.
3. Deliberately get 3 wrong on a second attempt, so we have a below-bar row to test the chase list

## Step 7 - confirm the data landed

Open the Command Centre sheet:
- a new tab named `learn-data-literacy-with-phoebe#single` with your responses and a `Score` column
- `Registry` has one row with the form ID, the public URL and the tab name

## Step 8 - turn on the aggregator

1. Back in Apps Script, run **`installTrigger`**
2. Wait up to 10 minutes, or run **`aggregate`** by hand to skip the wait
3. Check `Results`: one row per attempt, with attempt number, percent, pass true or false,
   first-attempt percent and best percent
4. Check `Dashboard`: submitted, passed, pass rate, average. The weakest-question column needs at
   least 3 responses before it reports anything, so it stays blank on a solo test

## Step 9 - report back

Send me:
1. the public form URL
2. which settings in step 5 were already correct, and which you had to flip
3. whether the score appeared instantly on submit
4. anything that felt wrong for a C-level audience

Then I inject the button, we push, and I build the `quiz-builder` skill around whatever this
run actually taught us rather than what I assumed.

---

## The 10 questions, for review before you send it to executives

All 8 sessions covered. Every question is a decision a C-level person actually faces, not a
definition to recite.

| # | Session | Key term | Tests |
|---|---------|----------|-------|
| 1 | 01 | the ladder | telling information apart from insight |
| 2 | 01 | analytics lifecycle | why analysis takes three weeks |
| 3 | 02 | OLTP vs OLAP | why reporting does not run on the live database |
| 4 | 03 | mean vs median | which average to ask for when whales are present |
| 5 | 03 | Simpson's paradox | asking to see the split |
| 6 | 04 | Goodhart's law | why naked targets get gamed |
| 7 | 05 | cohorts beat averages | growth masking retention decay |
| 8 | 06 | precision and recall | why 95 percent accurate is meaningless on rare events |
| 9 | 07 | CLV to CAC | reading 0.8 as burning money |
| 10 | 08 | diagnosis routine | walk the tree, not the org chart |
