/**
 * QUIZ FACTORY - Learn with Phoebe
 * ---------------------------------------------------------------------------
 * ONE standalone Apps Script that owns every course final quiz.
 *
 * Reads  : materials/final-quiz.json in each public course repo (raw.githubusercontent)
 * Builds : one Google Form per course TRACK, in quiz mode, auto-graded by Google
 * Writes : every form's responses into ONE spreadsheet, one tab per track
 * Runs   : ZERO onFormSubmit triggers (Apps Script caps them at ~20 per user).
 *          Grading is native to Forms. One time-driven trigger does the rest.
 *
 * SETUP, once:
 *   1. Create a blank Google Sheet named "Quiz Command Centre". Copy its ID from the URL.
 *   2. Paste this whole file into a new standalone Apps Script project.
 *   3. Fill in CONFIG below.
 *   4. Run setupCommandCentre()   -> builds the Registry / Roster / Results tabs
 *   5. Run buildOne()             -> builds the pilot course, both tracks
 *   6. Open the form, take it yourself, confirm the score shows instantly
 *   7. Run installTrigger()       -> one 10-minute aggregator
 *   8. Then buildAll() for the estate
 */

var CONFIG = {
  MASTER_SHEET_ID: 'PASTE_THE_SHEET_ID_HERE',
  GITHUB_USER: 'phoebefu6',
  GITHUB_BRANCH: 'main',
  PILOT_SLUG: 'learn-data-literacy-with-phoebe',
  PASS_PERCENT: 80,
  RESTRICT_TO_DOMAIN: true,   // Workspace only, verified email (decision 1)
  SEND_CERTIFICATES: false,   // flip on after the pilot (decision 4)
  CERT_FROM_NAME: 'Learn with Phoebe',
  QUIZ_FOLDER_NAME: 'Course Final Quizzes'
};

var TAB = {
  REGISTRY: 'Registry',
  ROSTER: 'Roster',
  RESULTS: 'Results',
  DASHBOARD: 'Dashboard',
  CHASE: 'Chase'
};

var REGISTRY_HEADERS = [
  'key', 'slug', 'track', 'title', 'version', 'questions',
  'formId', 'formUrl', 'editUrl', 'responseTab', 'builtAt'
];

// ===========================================================================
// 1. COMMAND CENTRE
// ===========================================================================

function setupCommandCentre() {
  var ss = SpreadsheetApp.openById(CONFIG.MASTER_SHEET_ID);
  ensureTab_(ss, TAB.REGISTRY, REGISTRY_HEADERS);
  ensureTab_(ss, TAB.ROSTER, ['email', 'name', 'slug', 'track', 'cohort', 'sessionDate', 'manager']);
  ensureTab_(ss, TAB.RESULTS, [
    'timestamp', 'email', 'name', 'slug', 'track', 'attempt',
    'score', 'total', 'percent', 'passed', 'firstAttemptPercent', 'bestPercent'
  ]);
  buildDashboard_(ss);
  buildChase_(ss);
  Logger.log('Command centre ready: ' + ss.getUrl());
}

function ensureTab_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (headers && sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#1B1B2F').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Live formulas, so the dashboard moves as the room submits. No trigger involved. */
function buildDashboard_(ss) {
  var sh = ensureTab_(ss, TAB.DASHBOARD, null);
  sh.clear();
  var head = ['slug', 'track', 'invited', 'submitted', 'passed', 'pass rate',
              'avg %', 'first-attempt avg %', 'weakest question'];
  sh.getRange(1, 1, 1, head.length).setValues([head])
    .setFontWeight('bold').setBackground('#1B1B2F').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);

  // one row per registry entry, all live
  sh.getRange('A2').setFormula(
    "=IFERROR(QUERY(" + TAB.REGISTRY + "!B2:C, \"select B, C where B is not null\", 0), \"\")");
  sh.getRange('C2').setFormula(
    "=ARRAYFORMULA(IF(A2:A=\"\",\"\"," +
    "COUNTIFS(" + TAB.ROSTER + "!C:C,A2:A," + TAB.ROSTER + "!D:D,B2:B)))");
  sh.getRange('D2').setFormula(
    "=ARRAYFORMULA(IF(A2:A=\"\",\"\"," +
    "COUNTIFS(" + TAB.RESULTS + "!D:D,A2:A," + TAB.RESULTS + "!E:E,B2:B)))");
  sh.getRange('E2').setFormula(
    "=ARRAYFORMULA(IF(A2:A=\"\",\"\"," +
    "COUNTIFS(" + TAB.RESULTS + "!D:D,A2:A," + TAB.RESULTS + "!E:E,B2:B," +
    TAB.RESULTS + "!J:J,TRUE)))");
  sh.getRange('F2').setFormula("=ARRAYFORMULA(IF(D2:D=\"\",\"\",IF(D2:D=0,0,E2:E/D2:D)))");
  sh.getRange('G2').setFormula(
    "=ARRAYFORMULA(IF(A2:A=\"\",\"\",IFERROR(" +
    "AVERAGEIFS(" + TAB.RESULTS + "!I:I," + TAB.RESULTS + "!D:D,A2:A," +
    TAB.RESULTS + "!E:E,B2:B),0)))");
  sh.getRange('H2').setFormula(
    "=ARRAYFORMULA(IF(A2:A=\"\",\"\",IFERROR(" +
    "AVERAGEIFS(" + TAB.RESULTS + "!K:K," + TAB.RESULTS + "!D:D,A2:A," +
    TAB.RESULTS + "!E:E,B2:B),0)))");
  sh.getRange('F2:F').setNumberFormat('0%');
  sh.getRange('G2:H').setNumberFormat('0.0');
  sh.setColumnWidth(1, 260).setColumnWidth(9, 320);
  // column I (weakest question) is filled by the aggregator, since item analysis
  // needs to read each response tab's per-question columns
}

function buildChase_(ss) {
  var sh = ensureTab_(ss, TAB.CHASE, null);
  sh.clear();
  var head = ['email', 'name', 'slug', 'track', 'manager', 'attempts', 'best %', 'status'];
  sh.getRange(1, 1, 1, head.length).setValues([head])
    .setFontWeight('bold').setBackground('#1B1B2F').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  sh.getRange('A2').setFormula(
    "=IFERROR(QUERY({" + TAB.ROSTER + "!A2:D," + TAB.ROSTER + "!G2:G}, \"select Col1,Col2,Col3,Col4,Col5 where Col1 is not null\", 0), \"\")");
  sh.getRange('F2').setFormula(
    "=ARRAYFORMULA(IF(A2:A=\"\",\"\"," +
    "COUNTIFS(" + TAB.RESULTS + "!B:B,A2:A," + TAB.RESULTS + "!D:D,C2:C," +
    TAB.RESULTS + "!E:E,D2:D)))");
  sh.getRange('G2').setFormula(
    "=ARRAYFORMULA(IF(A2:A=\"\",\"\",IFERROR(" +
    "MAXIFS(" + TAB.RESULTS + "!I:I," + TAB.RESULTS + "!B:B,A2:A," +
    TAB.RESULTS + "!D:D,C2:C," + TAB.RESULTS + "!E:E,D2:D),0)))");
  sh.getRange('H2').setFormula(
    "=ARRAYFORMULA(IF(A2:A=\"\",\"\",IF(F2:F=0,\"not started\"," +
    "IF(G2:G>=" + CONFIG.PASS_PERCENT + ",\"passed\",\"below bar\"))))");
  sh.getRange('G2:G').setNumberFormat('0.0');
}

// ===========================================================================
// 2. THE FACTORY
// ===========================================================================

function buildOne() { buildCourse_(CONFIG.PILOT_SLUG); }

function buildAll() {
  var slugs = listSlugsFromRegistry_();
  if (!slugs.length) throw new Error('Registry has no slugs. Add them to column B, or seed it first.');
  slugs.forEach(function (s) {
    try { buildCourse_(s); }
    catch (e) { Logger.log('FAILED ' + s + ': ' + e.message); }
  });
}

function buildCourse_(slug) {
  buildFromQuiz_(fetchQuiz_(slug));
}

function buildFromQuiz_(quiz) {
  var slug = quiz.slug;
  var folder = ensureFolder_(CONFIG.QUIZ_FOLDER_NAME);
  var ss = SpreadsheetApp.openById(CONFIG.MASTER_SHEET_ID);

  Object.keys(quiz.tracks).forEach(function (track) {
    var t = quiz.tracks[track];
    var key = slug + '#' + track;
    var row = registryRow_(key);
    var form = (row && row.formId) ? safeOpen_(row.formId) : null;

    if (!form) {
      form = FormApp.create(formTitle_(quiz, track));
      moveToFolder_(form.getId(), folder);
    }
    configureForm_(form, quiz, track);
    clearItems_(form);
    addHeaderItems_(form, quiz, track);
    t.questions.forEach(function (q) { addQuestion_(form, q); });

    var tabName = linkResponses_(form, ss, key);
    writeRegistry_(key, {
      key: key, slug: slug, track: track, title: quiz.title,
      version: quiz.version, questions: t.questions.length,
      formId: form.getId(), formUrl: form.getPublishedUrl(),
      editUrl: form.getEditUrl(), responseTab: tabName,
      builtAt: new Date()
    });
    Logger.log(key + '  ->  ' + form.getPublishedUrl());
  });
}

/**
 * TEST MODE. Paste one course's final-quiz.json between the backticks to build a
 * form before that file has been pushed to GitHub. Set it back to '' once the file
 * is live in the repo, so the repo stays the single source of truth.
 */
var INLINE_QUIZ_JSON = '';

function buildInline() {
  if (!INLINE_QUIZ_JSON) throw new Error('INLINE_QUIZ_JSON is empty. Paste the quiz JSON into it first.');
  buildFromQuiz_(validateQuiz_(JSON.parse(INLINE_QUIZ_JSON)));
}

function fetchQuiz_(slug) {
  if (INLINE_QUIZ_JSON) {
    var inline = JSON.parse(INLINE_QUIZ_JSON);
    if (inline.slug === slug) return validateQuiz_(inline);
  }
  var url = 'https://raw.githubusercontent.com/' + CONFIG.GITHUB_USER + '/' + slug +
            '/' + CONFIG.GITHUB_BRANCH + '/materials/final-quiz.json';
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error('no final-quiz.json for ' + slug + ' (HTTP ' + res.getResponseCode() + ')');
  }
  return validateQuiz_(JSON.parse(res.getContentText()));
}

/** Same checks whether the quiz came from GitHub or from INLINE_QUIZ_JSON. */
function validateQuiz_(quiz) {
  if (quiz.passPercent !== CONFIG.PASS_PERCENT) {
    throw new Error(quiz.slug + ': passPercent mismatch');
  }
  Object.keys(quiz.tracks).forEach(function (t) {
    var n = quiz.tracks[t].questions.length;
    if (n !== 10) throw new Error(quiz.slug + '#' + t + ': ' + n + ' questions, expected 10');
  });
  return quiz;
}

function formTitle_(quiz, track) {
  var label = quiz.tracks[track].label || track;
  return (track === 'single')
    ? quiz.title + ' - final quiz'
    : quiz.title + ' - final quiz (' + label + ')';
}

function configureForm_(form, quiz, track) {
  var pass = Math.round(quiz.passPercent / 10);
  form.setIsQuiz(true)
      .setTitle(formTitle_(quiz, track))
      .setDescription(
        'Ten questions across the whole course. Auto-scored the moment you submit, with the ' +
        'reasoning shown for every answer.\n\n' +
        'Pass mark: ' + pass + ' out of 10 (' + quiz.passPercent + '%). ' +
        'Retake as many times as you need. Your best attempt counts.\n\n' +
        (quiz.purposeNote || ''))
      .setCollectEmail(true)
      .setAllowResponseEdits(false)
      .setLimitOneResponsePerUser(false)   // retakes are the point
      .setProgressBar(true)
      .setShowLinkToRespondAgain(true)
      .setConfirmationMessage(
        'Submitted. Your score is above, with the reasoning for every question.\n\n' +
        'Below ' + quiz.passPercent + '%? Read the explanations, then take it again. ' +
        'There is no limit and only your best attempt counts.');
  if (CONFIG.RESTRICT_TO_DOMAIN) form.setRequireLogin(true);
}

function clearItems_(form) {
  var items = form.getItems();
  for (var i = items.length - 1; i >= 0; i--) form.deleteItem(items[i]);
}

function addHeaderItems_(form, quiz, track) {
  form.addTextItem()
      .setTitle('Your full name')
      .setHelpText('As it should appear on your completion certificate.')
      .setRequired(true);
  form.addDateItem()
      .setTitle('Date you attended')
      .setRequired(true);
}

function addQuestion_(form, q) {
  var order = shuffledOrder_(q);
  var item = form.addMultipleChoiceItem()
                 .setTitle(q.n + '. ' + q.q)
                 .setPoints(q.points || 1)
                 .setRequired(true);
  var correct = correctSet_(q);
  item.setChoices(order.map(function (i) {
    return item.createChoice(q.options[i], correct.indexOf(i) !== -1);
  }));
  var fb = FormApp.createFeedback().setText(q.why).build();
  item.setFeedbackForIncorrect(fb);
  item.setFeedbackForCorrect(fb);
  return item;
}

function correctSet_(q) {
  return (q.answer instanceof Array) ? q.answer : [q.answer];
}

/**
 * Forms has no per-respondent option shuffle in the API, so option order is
 * shuffled once at build time. Deterministic per question number, so a rebuild
 * of an unchanged quiz produces an identical form.
 */
function shuffledOrder_(q) {
  var idx = q.options.map(function (_, i) { return i; });
  var seed = q.n * 2654435761 % 2147483647;
  for (var i = idx.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) % 2147483647;
    var j = seed % (i + 1);
    var tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp;
  }
  return idx;
}

/** Point the form at the master spreadsheet and rename its tab to the registry key. */
function linkResponses_(form, ss, key) {
  var before = ss.getSheets().map(function (s) { return s.getSheetId(); });
  try {
    form.setDestination(FormApp.DestinationType.SPREADSHEET, CONFIG.MASTER_SHEET_ID);
  } catch (e) {
    // already linked to this spreadsheet - fine
  }
  SpreadsheetApp.flush();
  ss = SpreadsheetApp.openById(CONFIG.MASTER_SHEET_ID);
  var editUrl = form.getEditUrl().replace(/\/edit.*$/, '');
  var target = null;
  ss.getSheets().forEach(function (sh) {
    var linked = sh.getFormUrl();
    if (linked && linked.indexOf(form.getId()) !== -1) target = sh;
    else if (linked && linked.replace(/\/(edit|viewform).*$/, '') === editUrl) target = sh;
  });
  if (target && target.getName() !== key) {
    if (!ss.getSheetByName(key)) target.setName(key);
  }
  return target ? target.getName() : '';
}

// ===========================================================================
// 3. REGISTRY HELPERS
// ===========================================================================

function registrySheet_() {
  return SpreadsheetApp.openById(CONFIG.MASTER_SHEET_ID).getSheetByName(TAB.REGISTRY);
}

function registryRow_(key) {
  var sh = registrySheet_();
  if (!sh || sh.getLastRow() < 2) return null;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, REGISTRY_HEADERS.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (vals[i][0] === key) {
      var o = { _row: i + 2 };
      REGISTRY_HEADERS.forEach(function (h, c) { o[h] = vals[i][c]; });
      return o;
    }
  }
  return null;
}

function writeRegistry_(key, data) {
  var sh = registrySheet_();
  var existing = registryRow_(key);
  var row = REGISTRY_HEADERS.map(function (h) { return data[h] !== undefined ? data[h] : ''; });
  if (existing) sh.getRange(existing._row, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
}

function listSlugsFromRegistry_() {
  var sh = registrySheet_();
  if (!sh || sh.getLastRow() < 2) return [];
  var col = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues();
  var seen = {}, out = [];
  col.forEach(function (r) {
    var s = String(r[0] || '').trim();
    if (s && !seen[s]) { seen[s] = 1; out.push(s); }
  });
  return out;
}

function ensureFolder_(name) {
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

function moveToFolder_(fileId, folder) {
  try { DriveApp.getFileById(fileId).moveTo(folder); } catch (e) { /* older runtime */ }
}

function safeOpen_(id) {
  try { return FormApp.openById(id); } catch (e) { return null; }
}

// ===========================================================================
// 4. AGGREGATOR - one time-driven trigger for the whole estate
// ===========================================================================

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'aggregate') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('aggregate').timeBased().everyMinutes(10).create();
  Logger.log('Aggregator installed: every 10 minutes. That is the ONLY trigger this system needs.');
}

function aggregate() {
  var ss = SpreadsheetApp.openById(CONFIG.MASTER_SHEET_ID);
  var reg = registrySheet_();
  if (!reg || reg.getLastRow() < 2) return;
  var entries = reg.getRange(2, 1, reg.getLastRow() - 1, REGISTRY_HEADERS.length).getValues();

  var rows = [];
  var weakest = {};

  entries.forEach(function (e) {
    var key = e[0], slug = e[1], track = e[2], total = e[5], tab = e[9];
    if (!key || !tab) return;
    var sh = ss.getSheetByName(tab);
    if (!sh || sh.getLastRow() < 2) return;

    var data = sh.getDataRange().getValues();
    var head = data[0];
    var iScore = indexOfHeader_(head, 'score');
    var iEmail = indexOfHeader_(head, 'email');
    var iName = indexOfHeader_(head, 'full name');
    var qCols = [];
    head.forEach(function (h, c) { if (/^\d+\.\s/.test(String(h))) qCols.push(c); });

    var byEmail = {};

    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var email = String(row[iEmail] || '').toLowerCase().trim();
      if (!email) continue;
      var score = parseFloat(String(row[iScore]).split('/')[0]) || 0;
      var pct = total ? (score / total) * 100 : 0;
      byEmail[email] = byEmail[email] || [];
      byEmail[email].push({
        ts: row[0], name: row[iName] || '', score: score, pct: pct
      });
    }

    Object.keys(byEmail).forEach(function (email) {
      var attempts = byEmail[email].sort(function (a, b) { return new Date(a.ts) - new Date(b.ts); });
      var first = attempts[0].pct;
      var best = Math.max.apply(null, attempts.map(function (a) { return a.pct; }));
      attempts.forEach(function (a, i) {
        rows.push([a.ts, email, a.name, slug, track, i + 1, a.score, total,
                   round1_(a.pct), a.pct >= CONFIG.PASS_PERCENT,
                   round1_(first), round1_(best)]);
      });
    });

    // item analysis: which question the room gets wrong most often.
    // Forms writes the chosen ANSWER TEXT per question column, so compare it
    // against the correct option text from the course's own final-quiz.json.
    var qdef = quizQuestions_(slug, track);
    var worstText = '', worstMiss = -1, worstN = 0;
    qCols.forEach(function (c) {
      var n = parseInt(String(head[c]), 10);
      var def = qdef[n];
      if (!def) return;
      var correct = correctSet_(def).map(function (k) { return def.options[k]; });
      var miss = 0, seen = 0;
      for (var r = 1; r < data.length; r++) {
        var v = String(data[r][c] || '').trim();
        if (!v) continue;
        seen++;
        if (correct.indexOf(v) === -1) miss++;
      }
      if (seen < 3) return;                       // too few responses to be a signal
      var rate = miss / seen;
      if (rate > worstMiss) { worstMiss = rate; worstText = def.term; worstN = n; }
    });
    weakest[key] = (worstMiss > 0)
      ? 'q' + worstN + ' "' + worstText + '" missed by ' + Math.round(worstMiss * 100) + '%'
      : '';
  });

  var res = ss.getSheetByName(TAB.RESULTS);
  if (res.getLastRow() > 1) res.getRange(2, 1, res.getLastRow() - 1, 12).clearContent();
  if (rows.length) {
    rows.sort(function (a, b) { return new Date(b[0]) - new Date(a[0]); });
    res.getRange(2, 1, rows.length, 12).setValues(rows);
  }
  writeWeakest_(ss, weakest);
  if (CONFIG.SEND_CERTIFICATES) sendCertificates_(rows);
}

/** Cached fetch of a track's question definitions, for item analysis. */
var _quizCache = {};
function quizQuestions_(slug, track) {
  var ck = slug + '#' + track;
  if (_quizCache[ck]) return _quizCache[ck];
  var map = {};
  try {
    var quiz = fetchQuiz_(slug);
    (quiz.tracks[track].questions || []).forEach(function (q) { map[q.n] = q; });
  } catch (e) {
    Logger.log('item analysis skipped for ' + ck + ': ' + e.message);
  }
  _quizCache[ck] = map;
  return map;
}

/** Write the weakest-question column onto the Dashboard, matched by slug + track. */
function writeWeakest_(ss, weakest) {
  var sh = ss.getSheetByName(TAB.DASHBOARD);
  if (!sh || sh.getLastRow() < 2) return;
  var n = sh.getLastRow() - 1;
  var keys = sh.getRange(2, 1, n, 2).getValues();
  var out = keys.map(function (r) {
    var k = String(r[0] || '') + '#' + String(r[1] || '');
    return [weakest[k] || ''];
  });
  sh.getRange(2, 9, n, 1).setValues(out);
}

function indexOfHeader_(head, needle) {
  for (var i = 0; i < head.length; i++) {
    if (String(head[i]).toLowerCase().indexOf(needle) !== -1) return i;
  }
  return 0;
}

function round1_(n) { return Math.round(n * 10) / 10; }

// ===========================================================================
// 5. CERTIFICATES - the carrot (decision 4). Off until the pilot passes.
// ===========================================================================

function sendCertificates_(rows) {
  var props = PropertiesService.getScriptProperties();
  var sent = JSON.parse(props.getProperty('certsSent') || '{}');
  var out = 0;
  rows.forEach(function (r) {
    var email = r[1], slug = r[3], track = r[4], passed = r[9], name = r[2];
    var key = email + '|' + slug + '|' + track;
    if (!passed || sent[key]) return;
    MailApp.sendEmail({
      to: email,
      name: CONFIG.CERT_FROM_NAME,
      subject: 'Passed: ' + slug.replace(/^learn-|-with-phoebe$/g, '').replace(/-/g, ' '),
      htmlBody:
        '<p>' + (name || 'Hello') + ',</p>' +
        '<p>You cleared the final quiz at <b>' + r[11] + '%</b>. Your completion is recorded.</p>' +
        '<p>Course: ' + slug + ' (' + track + ' track)</p>' +
        '<p>Phoebe Fu</p>'
    });
    sent[key] = true;
    out++;
  });
  props.setProperty('certsSent', JSON.stringify(sent));
  if (out) Logger.log('certificates sent: ' + out);
}
