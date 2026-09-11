/**
 * Teacher Center Overview — command-center presentation layer.
 * Presentation/navigation only: existing tc-overview-core.js remains the owner
 * of dashboard data, calculations, persistence, and classroom workflow logic.
 */
(() => {
  "use strict";

  if (location.pathname !== "/teacher/" && location.pathname !== "/teacher/index.html") return;

  const VERSION = "20260910-overview-command-center1";
  const CATEGORY_ORDER = ["all", "teaching", "reviews", "data", "deadlines"];
  const CATEGORY_LABELS = {
    all: "All",
    teaching: "Teaching",
    reviews: "Reviews",
    data: "Progress/Data",
    deadlines: "Deadlines",
  };

  let scheduled = false;
  let observer = null;

  function ensureStyles() {
    if (document.querySelector('link[data-overview-v2]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `/assets/css/teacher-overview-v2.css?v=${VERSION}`;
    link.dataset.overviewV2 = "true";
    document.head.appendChild(link);
  }

  function svg(name) {
    const attrs = 'width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const icons = {
      attention: `<svg ${attrs}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
      review: `<svg ${attrs}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5Z"/></svg>`,
      data: `<svg ${attrs}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
      calendar: `<svg ${attrs}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
      observation: `<svg ${attrs}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
      today: `<svg ${attrs}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
      students: `<svg ${attrs}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>`,
      pulse: `<svg ${attrs}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
      quick: `<svg ${attrs}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
      plus: `<svg ${attrs}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
      report: `<svg ${attrs}><path d="M3 3v18h18"/><path d="m7 16 4-5 4 3 4-6"/></svg>`,
      gradebook: `<svg ${attrs}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="17" x2="13" y2="17"/></svg>`,
    };
    return icons[name] || icons.data;
  }

  function makeSectionHeader(icon, title, subtitle, actionHtml = "") {
    return `
      <div class="ov-v2-section-head">
        <div class="ov-v2-section-title-wrap">
          <span class="ov-v2-section-icon">${svg(icon)}</span>
          <div>
            <h2>${title}</h2>
            ${subtitle ? `<p>${subtitle}</p>` : ""}
          </div>
        </div>
        ${actionHtml}
      </div>`;
  }

  function textCount(id) {
    const raw = document.getElementById(id)?.textContent?.trim() || "";
    const match = raw.match(/-?\d+(?:\.\d+)?/);
    return match ? match[0] : raw || "—";
  }

  function elementVisible(id) {
    const el = document.getElementById(id);
    if (!el) return false;
    return el.style.display !== "none";
  }

  function parseSummaryCount(pattern) {
    const text = document.getElementById("ovOverdueContent")?.textContent || "";
    const match = text.match(pattern);
    return match ? match[1] : "0";
  }

  function makeAttentionCard({ tone, icon, label, value, sub, href }) {
    const a = document.createElement("a");
    a.className = `ov-v2-attention-card ov-v2-tone-${tone}`;
    a.href = href;
    a.innerHTML = `
      <span class="ov-v2-attention-icon">${svg(icon)}</span>
      <span class="ov-v2-attention-copy">
        <span class="ov-v2-attention-label">${label}</span>
        <strong>${value}</strong>
        <small>${sub}</small>
      </span>
      <span class="ov-v2-chevron" aria-hidden="true">›</span>`;
    return a;
  }

  function refreshAttention() {
    const grid = document.getElementById("ovV2AttentionGrid");
    if (!grid) return;

    const cards = [
      {
        tone: "red",
        icon: "review",
        label: "Pending Reviews",
        value: textCount("kpiReview"),
        sub: "Student submissions ready",
        href: "/teacher/review/",
      },
      {
        tone: "amber",
        icon: "data",
        label: "Data Collection Due",
        value: parseSummaryCount(/(\d+)\s+students?\s+need\s+data/i),
        sub: "Goals need new data",
        href: "/teacher/students/",
      },
    ];

    if (elementVisible("kpiIepEvalCard")) {
      cards.push({
        tone: "blue",
        icon: "calendar",
        label: "IEP / Eval Deadlines",
        value: textCount("kpiIepEval"),
        sub: document.getElementById("kpiIepEvalSub")?.textContent?.trim() || "Upcoming deadlines",
        href: "/teacher/calendar/",
      });
    }

    if (elementVisible("kpiObsCoverageCard")) {
      cards.push({
        tone: "green",
        icon: "observation",
        label: "Observation Coverage",
        value: document.getElementById("kpiObsCoverage")?.textContent?.trim() || "—",
        sub: document.getElementById("kpiObsCoverageSub")?.textContent?.trim() || "Recent observation coverage",
        href: "/teacher/observations/",
      });
    }

    const signature = cards.map((c) => `${c.label}:${c.value}:${c.sub}`).join("|");
    if (grid.dataset.signature === signature) return;
    grid.dataset.signature = signature;
    grid.replaceChildren(...cards.map(makeAttentionCard));
  }

  function classifyTodayItem(item) {
    const text = item.textContent.toLowerCase();
    if (/review|submission/.test(text)) return "reviews";
    if (/progress|data|goal|observation/.test(text)) return "data";
    if (/iep|eval|meeting|deadline/.test(text)) return "deadlines";
    return "teaching";
  }

  function applyTodayFilter(card, category) {
    card.dataset.todayCategory = category;
    card.querySelectorAll(".ov-v2-today-chip").forEach((chip) => {
      const active = chip.dataset.category === category;
      chip.classList.toggle("active", active);
      chip.setAttribute("aria-pressed", active ? "true" : "false");
    });
    card.querySelectorAll("#ovChecklistContent .checklist-item").forEach((item) => {
      item.hidden = category !== "all" && item.dataset.ovTodayCategory !== category;
    });
  }

  function refreshToday() {
    const card = document.getElementById("ovChecklistCard");
    const content = document.getElementById("ovChecklistContent");
    if (!card || !content) return;

    card.classList.add("ov-v2-today-card");
    const items = [...content.querySelectorAll(".checklist-item")];
    const counts = { all: items.length, teaching: 0, reviews: 0, data: 0, deadlines: 0 };

    items.forEach((item) => {
      const category = classifyTodayItem(item);
      item.dataset.ovTodayCategory = category;
      counts[category] += 1;

      const checkbox = item.querySelector(".checklist-checkbox");
      if (checkbox) checkbox.setAttribute("tabindex", "-1");

      const link = item.querySelector("a[href]");
      if (link && !item.dataset.ovRowBound) {
        item.dataset.ovRowBound = "true";
        item.setAttribute("role", "link");
        item.setAttribute("tabindex", "0");
        const go = () => { location.href = link.href; };
        item.addEventListener("click", (event) => {
          if (event.target.closest("a,button,input")) return;
          go();
        });
        item.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            go();
          }
        });
      }
    });

    let chips = card.querySelector("#ovV2TodayChips");
    if (!chips) {
      chips = document.createElement("div");
      chips.id = "ovV2TodayChips";
      chips.className = "ov-v2-today-chips";
      content.before(chips);
    }

    const signature = CATEGORY_ORDER.map((key) => `${key}:${counts[key]}`).join("|");
    if (chips.dataset.signature !== signature) {
      chips.dataset.signature = signature;
      chips.innerHTML = CATEGORY_ORDER.map((key) => `
        <button type="button" class="ov-v2-today-chip" data-category="${key}" aria-pressed="false">
          <span>${CATEGORY_LABELS[key]}</span><strong>${counts[key]}</strong>
        </button>`).join("");
      chips.querySelectorAll("button[data-category]").forEach((button) => {
        button.addEventListener("click", () => applyTodayFilter(card, button.dataset.category));
      });
    }

    const selected = CATEGORY_ORDER.includes(card.dataset.todayCategory) ? card.dataset.todayCategory : "all";
    applyTodayFilter(card, selected);
  }

  function makeQuickAccess() {
    const section = document.createElement("section");
    section.id = "ovV2QuickAccess";
    section.className = "ov-v2-section ov-v2-quick";
    section.innerHTML = `
      ${makeSectionHeader("quick", "Quick Access", "Jump straight to the work behind the overview")}
      <div class="ov-v2-quick-grid">
        <a href="/teacher/work/" class="ov-v2-quick-link"><span>${svg("plus")}</span><span><strong>Create Assignment</strong><small>Build and issue work</small></span><b>›</b></a>
        <a href="/teacher/review/" class="ov-v2-quick-link"><span>${svg("review")}</span><span><strong>Review Work</strong><small>Grade and give feedback</small></span><b>›</b></a>
        <a href="/teacher/observations/" class="ov-v2-quick-link"><span>${svg("observation")}</span><span><strong>Record Observation</strong><small>Document student progress</small></span><b>›</b></a>
        <a href="/teacher/gradebook/" class="ov-v2-quick-link"><span>${svg("gradebook")}</span><span><strong>Open Gradebook</strong><small>View and manage grades</small></span><b>›</b></a>
        <a href="/teacher/reporting/" class="ov-v2-quick-link"><span>${svg("report")}</span><span><strong>Reporting</strong><small>Run reports and evidence</small></span><b>›</b></a>
      </div>`;
    return section;
  }

  function makeAttentionSection(overdueCard) {
    const section = document.createElement("section");
    section.id = "ovV2Attention";
    section.className = "ov-v2-section ov-v2-attention";
    section.innerHTML = `
      ${makeSectionHeader("attention", "Needs Attention", "Key items that need your focus", '<button type="button" class="ov-v2-text-action" id="ovV2AttentionToggle" aria-expanded="false">View details <span>→</span></button>')}
      <div class="ov-v2-attention-grid" id="ovV2AttentionGrid"></div>
      <div class="ov-v2-attention-detail" id="ovV2AttentionDetail" hidden></div>`;

    const detail = section.querySelector("#ovV2AttentionDetail");
    detail.appendChild(overdueCard);

    const toggle = section.querySelector("#ovV2AttentionToggle");
    toggle.addEventListener("click", () => {
      const open = detail.hidden;
      detail.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.firstChild.textContent = open ? "Hide details " : "View details ";
    });
    return section;
  }

  function setupStructure() {
    const main = document.querySelector(".tc-main");
    if (!main || main.dataset.overviewV2Ready === "true") return Boolean(main);

    const kpis = document.getElementById("ovKpis");
    const overdue = document.getElementById("ovOverdueCard");
    const alerts = document.getElementById("ovAtRiskCard");
    const today = document.getElementById("ovChecklistCard");
    if (!kpis || !overdue || !alerts || !today) return false;

    main.dataset.overviewV2Ready = "true";
    document.body.classList.add("tc-overview-v2");

    const header = main.firstElementChild;
    header?.classList.add("ov-v2-page-head");
    if (header && !header.querySelector(".ov-v2-date")) {
      const h1 = header.querySelector("h1");
      const copy = document.createElement("div");
      copy.className = "ov-v2-heading-copy";
      if (h1) {
        h1.parentNode.insertBefore(copy, h1);
        copy.appendChild(h1);
      } else {
        header.prepend(copy);
      }
      const date = document.createElement("div");
      date.className = "ov-v2-date";
      date.textContent = new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }).format(new Date());
      copy.appendChild(date);
    }

    const attention = makeAttentionSection(overdue);

    const middle = document.createElement("div");
    middle.id = "ovV2Middle";
    middle.className = "ov-v2-middle-grid";

    const todayWrap = document.createElement("section");
    todayWrap.className = "ov-v2-section ov-v2-today";
    todayWrap.innerHTML = makeSectionHeader(
      "today",
      "Today",
      "What's on your plate today",
      '<a class="ov-v2-text-action" href="/teacher/calendar/">View Calendar <span>→</span></a>'
    );
    todayWrap.appendChild(today);

    const alertsWrap = document.createElement("section");
    alertsWrap.className = "ov-v2-section ov-v2-alerts";
    alertsWrap.innerHTML = makeSectionHeader(
      "students",
      "Student Alerts",
      "Students who may need support",
      '<a class="ov-v2-text-action" href="/teacher/students/">View All <span>→</span></a>'
    );
    alertsWrap.appendChild(alerts);

    middle.append(todayWrap, alertsWrap);

    const pulse = document.createElement("section");
    pulse.id = "ovV2Pulse";
    pulse.className = "ov-v2-section ov-v2-pulse";
    pulse.innerHTML = makeSectionHeader(
      "pulse",
      "Classroom Pulse",
      "At a glance for this term",
      '<a class="ov-v2-text-action" href="/teacher/reporting/">View Details <span>→</span></a>'
    );
    pulse.appendChild(kpis);

    const quick = makeQuickAccess();

    const legacyTopLevel = [...main.children].filter((child) => child !== header);
    header.after(attention, middle, pulse, quick);
    legacyTopLevel.forEach((child) => {
      if (![attention, middle, pulse, quick].includes(child)) {
        child.classList.add("ov-v2-legacy-shell");
        child.hidden = true;
      }
    });

    document.getElementById("ovLastEntry")?.classList.add("ov-v2-last-entry");
    today.querySelector(".ov-card-header")?.remove();
    alerts.querySelector(".ov-card-header")?.remove();
    overdue.querySelector(".ov-card-header")?.classList.add("ov-v2-detail-heading");

    setupPulseLinks();
    return true;
  }

  function setupPulseLinks() {
    const links = [
      ["kpiStudents", "/teacher/students/"],
      ["kpiGoals", "/teacher/students/"],
      ["kpiQuarter", "/teacher/work/"],
      ["kpiNearMastery", "/teacher/students/"],
    ];

    links.forEach(([valueId, href]) => {
      const card = document.getElementById(valueId)?.closest(".rc-card");
      if (!card || card.dataset.ovPulseBound) return;
      card.dataset.ovPulseBound = "true";
      card.dataset.href = href;
      card.classList.add("ov-v2-clickable");
      card.setAttribute("role", "link");
      card.setAttribute("tabindex", "0");
      const go = () => { location.href = href; };
      card.addEventListener("click", go);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          go();
        }
      });
    });
  }

  function simplifyAlertCard() {
    const card = document.getElementById("ovAtRiskCard");
    if (!card) return;
    card.classList.add("ov-v2-alert-card");
    const content = document.getElementById("ovAtRiskContent");
    if (!content) return;
    const rows = [...content.querySelectorAll("a.ov-row-card")];
    rows.forEach((row, index) => {
      row.classList.add("ov-v2-alert-row");
      row.hidden = index >= 4;
    });
  }

  function refresh() {
    scheduled = false;
    if (!setupStructure()) return;
    refreshAttention();
    refreshToday();
    simplifyAlertCard();
  }

  function scheduleRefresh() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(refresh);
  }

  function start() {
    ensureStyles();
    scheduleRefresh();
    observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("pagehide", () => observer?.disconnect(), { once: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
