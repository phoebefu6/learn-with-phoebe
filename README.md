# Learn with Phoebe

The front door to every **learn-X-with-phoebe** course - a single shelf that categorizes
them into five buckets and links out to each live course site.

By Phoebe Fu. Live: https://phoebefu6.github.io/learn-with-phoebe/

## Buckets

- 🤖 **AI & LLMs** - LangChain, Prompt Engineering, Claude, Codex, Hermes AI, AI Literacy
- 📊 **Data & Analytics** - SQL, Python Data Analysis, Data Literacy, Data Governance, DataOps
- 💻 **Programming & Dev Tools** - Python, HTML, GitHub (builder + non-tech)
- ✍️ **Markup, Docs & Diagrams** - Markdown, Mermaid, Tech Writing
- 🧭 **Leadership & Delivery** - Strategic Thinking, Tech Project PMO

Filter by bucket, by audience (leaders / builders), or by interactive courses.

## How it works

`courses.json` is the single source of truth. `assets/hub.js` fetches it, renders the
bucketed shelf and the filter bar, and counts up the stats. Adding a course = one entry in
`courses.json` (slug, title, bucket, audience, format, sessions, blurb) - no HTML to touch.

```
index.html          hero + filter bar + shelf (populated by JS)
courses.json         the manifest - edit this to add/update courses
assets/style.css     charcoal + electric-lime identity
assets/hub.js        render + filter + count-up
```

Course URLs are derived as `https://phoebefu6.github.io/<slug>/`.

## Local preview

```bash
python3 -m http.server 8000
# open http://localhost:8000
```
