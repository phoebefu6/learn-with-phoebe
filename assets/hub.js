/* learn-with-phoebe hub - render the shelf from courses.json as a GARMENT RACK.
   Each course is a printed T-shirt hanging on a rail; clicking a shirt opens a
   detail drawer under that rack. courses.json is the single source of truth. */
(function () {
  var OWNER = "phoebefu6";
  var AUD = { leader: "🤝 Leader", builder: "🛠️ Builder", both: "⚡ Both", everyone: "🌱 Everyone" };
  var FMT = { project: "🎯 Running project", concept: "📖 Concept", interactive: "▶️ Interactive", video: "🎬 Video" };

  var HANGER =
    '<svg class="hanger" width="48" height="30" viewBox="0 0 48 30" fill="none" aria-hidden="true">' +
    '<path d="M24 7c0-2.2 1.7-4 3.8-4s3.8 1.8 3.8 4c0 1.8-1.3 2.9-2.7 3.4" stroke="#9384c0" stroke-width="1.8" stroke-linecap="round"/>' +
    '<path d="M24 8 4.5 23.5A2 2 0 0 0 5.7 27h36.6a2 2 0 0 0 1.2-3.6L24 8Z" stroke="#b3a4dd" stroke-width="1.8" fill="#fff" stroke-linejoin="round"/></svg>';
  var SHIRT =
    '<svg class="s-svg" viewBox="0 0 180 160" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
    '<path class="s-body" d="M60 15 L36 15 L6 42 L6 69 L30 77 L32 152 L148 152 L150 77 L174 69 L174 42 L144 15 L120 15 Q90 44 60 15 Z"/>' +
    '<path class="s-collar" d="M60 15 Q90 44 120 15"/></svg>';
  var FMT_SHORT = { interactive: "▶ Interactive", video: "▶ Video", project: "Running project", concept: "Concept" };

  // mix a hex colour with white; k = fraction of colour kept (rest white)
  function mix(hex, k) {
    hex = String(hex).replace("#", "");
    if (hex.length !== 6) return hex;
    var r = parseInt(hex.substr(0, 2), 16), g = parseInt(hex.substr(2, 2), 16), b = parseInt(hex.substr(4, 2), 16);
    var w = function (c) { return Math.round(c * k + 255 * (1 - k)); };
    return "rgb(" + w(r) + "," + w(g) + "," + w(b) + ")";
  }

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
    // topic: All + one chip per track
    bar.appendChild(chip("all", "All", courses.length));
    buckets.forEach(function (b) { bar.appendChild(chip("bucket:" + b.id, b.name, byBucket[b.id].length)); });
    // audience group (who it's for)
    bar.appendChild(sep());
    bar.appendChild(dim("For"));
    bar.appendChild(chip("aud:leader", "Leaders", null));
    bar.appendChild(chip("aud:builder", "Builders", null));
    // format group (how it's taught)
    bar.appendChild(sep());
    bar.appendChild(dim("Format"));
    bar.appendChild(chip("fmt:interactive", "Interactive", null));
    bar.appendChild(chip("fmt:project", "Running project", null));

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

      // shirts on a rail
      var bar = el("div", "bar");
      var rail = el("div", "rail");
      list.forEach(function (c, idx) { rail.appendChild(garment(c, b, idx)); });
      bar.appendChild(rail);
      sec.appendChild(bar);

      // detail drawer (one per shelf)
      var detail = el("div", "shelf-detail");
      detail.appendChild(el("div", "sd-inner"));
      sec.appendChild(detail);

      shelf.appendChild(sec);
    });
    shelf.appendChild(el("p", "empty", "Nothing on the shelf matches that filter yet."));

    wireFilters();
    fitTitles();
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(fitTitles); }
    else { setTimeout(fitTitles, 350); }
    var rt;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(fitTitles, 150); });
  }

  // Shrink each shirt's printed name until it fits the chest (3-line clamp);
  // only the very longest names get an ellipsis.
  function fitTitles() {
    document.querySelectorAll(".garment .s-name").forEach(function (t) {
      t.style.fontSize = "13.5px";
      if (t.clientHeight < 8) return;   // not laid out yet; skip until fonts.ready pass
      var size = 13.5, guard = 0;
      while (t.scrollHeight > t.clientHeight + 1 && size > 10 && guard < 24) { size -= 0.5; t.style.fontSize = size + "px"; guard++; }
    });
  }

  function garment(c, bucket, idx) {
    var planned = c.status === "planned";
    var lv = levelOf(c.diff);
    var inter = c.format === "interactive" || c.format === "video";

    var g = el("button", "garment" + (planned ? " planned" : "") + (inter ? " interactive" : ""));
    g.type = "button";
    g.style.setProperty("--lane", lv.color);
    g.style.setProperty("--lane-tint", mix(lv.color, 0.24));   // whole-shirt fill
    g.style.setProperty("--lane-edge", mix(lv.color, 0.55));   // shirt outline
    g.setAttribute("data-bucket", c.bucket);
    g.setAttribute("data-aud", c.audience);
    g.setAttribute("data-fmt", c.format);
    if (planned) g.setAttribute("data-planned", "1");
    g.setAttribute("aria-label", c.title + (planned ? " (planned)" : ""));
    g.style.animationDelay = (idx * 0.05) + "s";
    var name = c.title.replace(/^Learn\s+/i, "");             // site is about learning; show the subject
    var cap = planned ? "Planned" : (FMT_SHORT[c.format] || (lv.name || ""));
    g.innerHTML =
      HANGER +
      '<span class="shirt">' + SHIRT +
        '<span class="s-face">' +
          '<span class="s-ico">' + c.icon + '</span>' +
          '<span class="s-name">' + esc(name) + '</span>' +
          '<span class="s-cap">' + esc(cap) + '</span>' +
        '</span>' +
      '</span>';

    g.addEventListener("click", function () { openDetail(g, c, bucket, lv); });
    return g;
  }

  function openDetail(bookEl, c, bucket, lv) {
    var sec = bookEl.closest(".shelf");
    var drawer = sec.querySelector(".shelf-detail");
    var inner = drawer.querySelector(".sd-inner");
    var already = bookEl.classList.contains("selected");

    // clear selection across all racks (one open at a time feels calmer)
    document.querySelectorAll(".garment.selected").forEach(function (x) { x.classList.remove("selected"); });
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
    document.querySelectorAll(".garment.selected").forEach(function (x) { x.classList.remove("selected"); });

    document.querySelectorAll(".shelf").forEach(function (sec) {
      var shown = 0;
      sec.querySelectorAll(".garment").forEach(function (bk) {
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
