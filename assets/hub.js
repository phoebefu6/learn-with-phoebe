/* learn-with-phoebe hub - render the shelf from courses.json as a BOOKSHELF.
   Each course is a book spine standing on a plank; clicking a book opens a
   detail drawer under that shelf. courses.json is the single source of truth. */
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

  fetch("courses.json?ts=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (data) {
    build(data);
  }).catch(function (err) {
    document.getElementById("shelf").innerHTML =
      '<p class="empty show">Could not load the course list (' + esc(err.message) + ').</p>';
  });

  var LEVELS = {};
  function levelOf(d) { return LEVELS[d] || { name: "", color: "var(--faint)" }; }

  function build(data) {
    var buckets = data.buckets, courses = data.courses;
    (data.levels || []).forEach(function (l) { LEVELS[l.d] = { name: l.name, color: l.color }; });

    var byBucket = {};
    buckets.forEach(function (b) { byBucket[b.id] = []; });
    courses.forEach(function (c) { (byBucket[c.bucket] || (byBucket[c.bucket] = [])).push(c); });
    Object.keys(byBucket).forEach(function (id) {
      byBucket[id].sort(function (a, b) { return (a.diff || 0) - (b.diff || 0); });
    });

    renderLegend(data.levels || []);

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

    var frag = document.createDocumentFragment();
    frag.appendChild(chips[0]);
    for (var i = 1; i <= buckets.length; i++) frag.appendChild(chips[i]);
    bar.insertBefore(frag, bar.firstChild);
    for (var j = buckets.length + 1; j < chips.length; j++) bar.appendChild(chips[j]);

    // ---- shelves ----
    var shelf = document.getElementById("shelf");
    buckets.forEach(function (b, bi) {
      var list = byBucket[b.id];
      var sec = el("section", "shelf");
      sec.setAttribute("data-bucket", b.id);

      // label row
      var head = el("div", "shelf-label");
      head.appendChild(el("span", "shelf-no", ("0" + (bi + 1)).slice(-2)));
      head.appendChild(el("h2", "shelf-name", esc(b.name)));
      var liveN = list.filter(function (c) { return c.status !== "planned"; }).length;
      var planN = list.length - liveN;
      var cnt = liveN + (liveN === 1 ? " course" : " courses") + (planN ? " · " + planN + " planned" : "");
      if (liveN === 0 && planN) cnt = planN + " planned";
      head.appendChild(el("span", "shelf-cnt", cnt));
      if (b.tier) {
        var lv = levelOf(b.tier);
        head.appendChild(el("span", "shelf-tier",
          '<span class="st-dot" style="background:' + lv.color + '"></span>' + esc(lv.name) + " lane"));
      }
      sec.appendChild(head);

      var blurb = el("p", "shelf-blurb", esc(b.blurb));
      sec.appendChild(blurb);

      // books on a plank
      var books = el("div", "books");
      list.forEach(function (c, idx) { books.appendChild(book(c, b, idx)); });
      sec.appendChild(books);
      sec.appendChild(el("div", "plank"));

      // detail drawer (one per shelf)
      var detail = el("div", "shelf-detail");
      detail.appendChild(el("div", "sd-inner"));
      sec.appendChild(detail);

      shelf.appendChild(sec);
    });
    shelf.appendChild(el("p", "empty", "Nothing on the shelf matches that filter yet."));

    wireFilters();
  }

  function book(c, bucket, idx) {
    var planned = c.status === "planned";
    var lv = levelOf(c.diff);
    var sessions = Math.min(c.sessions || 6, 16);
    var w = planned ? 46 : Math.round(50 + (sessions - 4) * 1.7);   // thickness = depth
    var h = planned ? 178 : (178 + (c.diff || 1) * 13);             // height = difficulty
    var inter = c.format === "interactive" || c.format === "video";

    var b = el("button", "book" + (planned ? " planned" : "") + (inter ? " interactive" : ""));
    b.type = "button";
    b.style.setProperty("--lane", lv.color);
    b.style.height = h + "px";
    b.style.width = w + "px";
    b.setAttribute("data-bucket", c.bucket);
    b.setAttribute("data-aud", c.audience);
    b.setAttribute("data-fmt", c.format);
    if (planned) b.setAttribute("data-planned", "1");
    b.setAttribute("aria-label", c.title + (planned ? " (planned)" : ""));
    b.style.animationDelay = (idx * 0.05) + "s";
    b.innerHTML =
      '<span class="bk-ico">' + c.icon + '</span>' +
      '<span class="bk-ttl">' + esc(c.title) + '</span>' +
      '<span class="bk-foot"></span>';

    b.addEventListener("click", function () { openDetail(b, c, bucket, lv); });
    return b;
  }

  function openDetail(bookEl, c, bucket, lv) {
    var sec = bookEl.closest(".shelf");
    var drawer = sec.querySelector(".shelf-detail");
    var inner = drawer.querySelector(".sd-inner");
    var already = bookEl.classList.contains("selected");

    // clear selection across all shelves (one open at a time feels calmer)
    document.querySelectorAll(".book.selected").forEach(function (x) { x.classList.remove("selected"); });
    document.querySelectorAll(".shelf-detail.open").forEach(function (d) {
      if (d !== drawer) { d.classList.remove("open"); }
    });

    if (already) { drawer.classList.remove("open"); return; }

    bookEl.classList.add("selected");
    var planned = c.status === "planned";
    var url = "https://" + OWNER + ".github.io/" + c.slug + "/";
    inner.innerHTML =
      '<div class="sd-spine" style="--lane:' + lv.color + '"><span>' + c.icon + '</span></div>' +
      '<div class="sd-body">' +
        '<div class="sd-kick">' + esc(bucket.name) + '</div>' +
        '<h3 class="sd-title">' + esc(c.title) + '</h3>' +
        '<p class="sd-blurb">' + esc(c.blurb) + '</p>' +
        '<div class="sd-tags">' +
          '<span class="tag"><span class="tag-dot" style="background:' + lv.color + '"></span>' + esc(lv.name) + '</span>' +
          '<span class="tag">' + (AUD[c.audience] || esc(c.audience)) + '</span>' +
          '<span class="tag' + ((c.format === "interactive" || c.format === "video") ? " lime" : "") + '">' + (FMT[c.format] || esc(c.format)) + '</span>' +
          (c.sessions ? '<span class="tag">' + c.sessions + " sessions</span>" : "") +
        '</div>' +
      '</div>' +
      '<div class="sd-cta">' +
        (planned
          ? '<span class="sd-planned">Planned<br>coming soon</span>'
          : '<a class="sd-open" href="' + url + '">Open course <span class="ar">→</span></a>') +
        '<button class="sd-close" type="button" aria-label="Close">✕</button>' +
      '</div>';
    inner.querySelector(".sd-close").addEventListener("click", function (e) {
      e.stopPropagation();
      drawer.classList.remove("open");
      bookEl.classList.remove("selected");
    });
    drawer.classList.add("open");
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
      '<span class="lg-lbl">Each shelf runs easy to hard</span>' +
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
    // collapse any open drawer when refiltering
    document.querySelectorAll(".shelf-detail.open").forEach(function (d) { d.classList.remove("open"); });
    document.querySelectorAll(".book.selected").forEach(function (x) { x.classList.remove("selected"); });

    document.querySelectorAll(".shelf").forEach(function (sec) {
      var shown = 0;
      sec.querySelectorAll(".book").forEach(function (bk) {
        var ok =
          kind === "all" ? true :
          kind === "bucket" ? bk.getAttribute("data-bucket") === val :
          kind === "aud" ? (bk.getAttribute("data-aud") === val || bk.getAttribute("data-aud") === "both") :
          kind === "fmt" ? bk.getAttribute("data-fmt") === val : true;
        bk.classList.toggle("hidden", !ok);
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
    setTimeout(function () { e.textContent = target; }, dur + 120);
  }
})();
