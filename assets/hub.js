/* learn-with-phoebe hub - render the shelf from courses.json, filter it, count up.
   courses.json is the single source of truth; adding a course = one entry there. */
(function () {
  var OWNER = "phoebefu6";
  var AUD = { leader: "🤝 Leader", builder: "🛠️ Builder", both: "⚡ Both", everyone: "🌱 Everyone" };
  var FMT = { project: "🎯 Running project", concept: "📖 Concept", interactive: "▶️ Interactive", video: "🎬 Video" };

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  fetch("courses.json").then(function (r) { return r.json(); }).then(function (data) {
    build(data);
  }).catch(function (err) {
    document.getElementById("shelf").innerHTML =
      '<p class="empty show">Could not load the course list (' + esc(err.message) + ').</p>';
  });

  var LEVELS = {};   // diff -> {name, color}
  function levelOf(d) { return LEVELS[d] || { name: "", color: "var(--faint)" }; }

  function build(data) {
    var buckets = data.buckets, courses = data.courses;
    (data.levels || []).forEach(function (l) { LEVELS[l.d] = { name: l.name, color: l.color }; });

    var byBucket = {};
    buckets.forEach(function (b) { byBucket[b.id] = []; });
    courses.forEach(function (c) { (byBucket[c.bucket] || (byBucket[c.bucket] = [])).push(c); });
    // sort each bucket easy -> hard (stable: equal diff keeps manifest order)
    Object.keys(byBucket).forEach(function (id) {
      byBucket[id].sort(function (a, b) { return (a.diff || 0) - (b.diff || 0); });
    });

    renderLegend(data.levels || []);

    // ---- stats (live courses only; planned ones do not inflate the totals) ----
    var live = courses.filter(function (c) { return c.status !== "planned"; });
    var totalSessions = live.reduce(function (s, c) { return s + (c.sessions || 0); }, 0);
    setCount("stat-courses", live.length);
    setCount("stat-tracks", buckets.length);
    setCount("stat-sessions", totalSessions);

    // ---- filter bar ----
    var bar = document.getElementById("filters");
    var chips = [];
    chips.push(chip("all", "All", courses.length));
    buckets.forEach(function (b) { chips.push(chip("bucket:" + b.id, b.name, byBucket[b.id].length)); });
    bar.appendChild(sep());
    bar.appendChild(dim("For"));
    chips.push(chip("aud:leader", "Leaders", null));
    chips.push(chip("aud:builder", "Builders", null));
    chips.push(chip("fmt:interactive", "Interactive", null));

    // reorder: All + buckets first (before sep), then aud/fmt after
    var frag = document.createDocumentFragment();
    frag.appendChild(chips[0]);                                  // All
    for (var i = 1; i <= buckets.length; i++) frag.appendChild(chips[i]);
    bar.insertBefore(frag, bar.firstChild);
    for (var j = buckets.length + 1; j < chips.length; j++) bar.appendChild(chips[j]);

    // ---- shelf ----
    var shelf = document.getElementById("shelf");
    buckets.forEach(function (b) {
      var sec = el("section", "bucket");
      sec.setAttribute("data-bucket", b.id);
      var head = el("div", "bucket-head");
      head.appendChild(el("h2", null, esc(b.name)));
      var list = byBucket[b.id];
      var allPlanned = list.length > 0 && list.every(function (c) { return c.status === "planned"; });
      var countTxt = list.length + (allPlanned ? " planned" : (list.length === 1 ? " course" : " courses"));
      head.appendChild(el("span", "count", countTxt));
      if (b.tier) {
        var lv = levelOf(b.tier);
        var pill = el("span", "bkt-tier", '<span class="bt-dot" style="background:' + lv.color + '"></span>' + esc(lv.name) + " lane");
        head.appendChild(pill);
      }
      sec.appendChild(head);
      sec.appendChild(el("p", "bucket-blurb", esc(b.blurb)));
      var grid = el("div", "grid");
      byBucket[b.id].forEach(function (c, idx) { grid.appendChild(card(c, b, idx)); });
      sec.appendChild(grid);
      shelf.appendChild(sec);
    });
    shelf.appendChild(el("p", "empty", "No courses match that filter yet."));

    wireFilters();
  }

  function card(c, bucket, idx) {
    var planned = c.status === "planned";
    var lv = levelOf(c.diff);
    var node = planned ? el("div", "card planned") : el("a", "card");
    if (!planned) node.href = "https://" + OWNER + ".github.io/" + c.slug + "/";
    node.setAttribute("data-bucket", c.bucket);
    node.setAttribute("data-aud", c.audience);
    node.setAttribute("data-fmt", c.format);
    if (planned) node.setAttribute("data-planned", "1");
    node.style.animationDelay = (idx * 0.04) + "s";
    node.innerHTML =
      '<span class="dot" style="background:' + lv.color + '" title="' + esc(lv.name) + '"></span>' +
      '<span class="icon">' + c.icon + '</span>' +
      '<span class="bkt">' + esc(bucket.name) + '</span>' +
      '<h3>' + esc(c.title) + '</h3>' +
      '<p class="blurb">' + esc(c.blurb) + '</p>' +
      '<span class="tags">' +
        '<span class="tag">' + (AUD[c.audience] || esc(c.audience)) + '</span>' +
        '<span class="tag' + (c.format === "interactive" || c.format === "video" ? " lime" : "") + '">' + (FMT[c.format] || esc(c.format)) + '</span>' +
      '</span>' +
      (planned
        ? '<span class="go planned-go">Planned - coming soon</span>'
        : '<span class="go">Open course <span class="ar">→</span></span>');
    return node;
  }

  function chip(key, label, n) {
    var b = el("button", "fchip" + (key === "all" ? " on" : ""));
    b.type = "button";
    b.setAttribute("data-filter", key);
    b.innerHTML = esc(label) + (n != null ? ' <span class="n">' + n + "</span>" : "");
    return b;
  }
  function sep() { return el("span", "fsep"); }
  function dim(t) { return el("span", "fdim", esc(t)); }

  function renderLegend(levels) {
    var box = document.getElementById("legend");
    if (!box || !levels.length) return;
    box.innerHTML =
      '<span class="lg-lbl">Each lane runs easy to hard</span>' +
      levels.map(function (l) {
        return '<span class="lg-item"><span class="lg-dot" style="background:' + l.color + '"></span>' + esc(l.name) + '</span>';
      }).join("");
  }

  function wireFilters() {
    var chips = document.querySelectorAll(".fchip");
    var empty = document.querySelector(".empty");
    chips.forEach(function (c) {
      c.addEventListener("click", function () {
        chips.forEach(function (x) { x.classList.remove("on"); });
        c.classList.add("on");
        apply(c.getAttribute("data-filter"), empty);
      });
    });
  }

  function apply(filter, empty) {
    var parts = filter.split(":");
    var kind = parts[0], val = parts[1];
    var anyVisible = false;
    document.querySelectorAll(".bucket").forEach(function (sec) {
      var shown = 0;
      sec.querySelectorAll(".card").forEach(function (card) {
        var ok =
          kind === "all" ? true :
          kind === "bucket" ? card.getAttribute("data-bucket") === val :
          kind === "aud" ? (card.getAttribute("data-aud") === val || card.getAttribute("data-aud") === "both") :
          kind === "fmt" ? card.getAttribute("data-fmt") === val : true;
        // "both" courses should also surface under a specific-audience filter (handled above);
        // when filtering builders, a "both" course counts; same for leaders.
        card.classList.toggle("hidden", !ok);
        if (ok) shown++;
      });
      sec.classList.toggle("hidden", shown === 0);
      if (shown > 0) anyVisible = true;
    });
    empty.classList.toggle("show", !anyVisible);
  }

  function setCount(id, target) {
    var e = document.getElementById(id);
    if (!e) return;
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || target <= 0) { e.textContent = target; return; }
    var start = null, dur = 900;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      e.textContent = Math.round(eased * target);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    // guarantee the final value even if rAF is throttled (background/offscreen tab)
    setTimeout(function () { e.textContent = target; }, dur + 120);
  }
})();
