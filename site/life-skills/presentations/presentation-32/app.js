/* Mastercard interview prep — CSP-safe (no inline scripts).
   Focus: get into interview mode without overload.
*/
(() => {
  const STORAGE_KEY = "mc_r261114_locked_in_v3_csp_safe";

  const ANCHOR = "I build reliable, scalable systems in ambiguous environments and communicate clearly while doing it.";

  const INTERVIEWS = {
    abigail: {
      key: "abigail",
      title: "Interview 1 — Abigail (1:30–2:30)",
      sub: "60 minutes = main technical workout. Keep answers crisp, explicit, and tradeoff-aware.",
      prompts: [
        {
          id: "a_intro",
          title: "60-second technical intro",
          tags: ["Clarity", "Anchor"],
          q: "Give a 60-second intro that hits the anchor statement, your strengths, and the problems you like solving. Keep it concrete: systems, scale, reliability, ambiguity. End with the kind of impact you aim for.",
        },
        {
          id: "a_coding",
          title: "Live-coding talk track",
          tags: ["Process", "Clarity"],
          q: "When you get a coding prompt, what do you do before typing? Write: (1) your first 3 clarifying questions, (2) your approach + data structures, (3) how you’ll validate with tests/edge cases, and (4) how you’ll discuss tradeoffs.",
        },
        {
          id: "a_tradeoff",
          title: "Decision + tradeoffs (with collaboration)",
          tags: ["Judgment", "Collaboration"],
          q: "Pick a real decision you owned: What options were on the table? Why did you choose one? What tradeoffs did you accept? Include a moment of disagreement and how you handled it calmly and collaboratively.",
        },
        {
          id: "a_incident",
          title: "Reliability / incident story",
          tags: ["Ownership", "Reliability"],
          q: "Tell the story of a production issue (or a scary near-miss): symptoms → investigation → fix → follow-ups. Call out failure modes, mitigations (timeouts/retries/idempotency/observability), and what changed to prevent repeat incidents.",
        },
      ],
    },
    harish: {
      key: "harish",
      title: "Interview 2 — Harish (3:30–4:00)",
      sub: "30 minutes = tight deep dive. Expect design/reliability judgment + ownership + crisp communication.",
      prompts: [
        {
          id: "h_design",
          title: "Mini system design (8-minute version)",
          tags: ["Design", "Scale"],
          q: "Design a service/API you’ve built or could build: define requirements + constraints, sketch components/data flow, and call out how it scales. Mention security/PII considerations briefly (payments-world mindset).",
        },
        {
          id: "h_failures",
          title: "Failure modes + mitigations",
          tags: ["Reliability", "Tradeoffs"],
          q: "For that design, list 5 failure modes and how you mitigate them (timeouts/retries, idempotency, rate limits, backpressure, DLQs, caching, monitoring/SLOs). Include one tradeoff you’d revisit if traffic doubled.",
        },
        {
          id: "h_ownership",
          title: "Ownership beyond “my code”",
          tags: ["Ownership", "Collaboration"],
          q: "Describe a time you spotted a problem before a ticket existed and improved the system (not just a feature). Who did you align with? How did you communicate risks and get buy-in? What measurable impact resulted?",
        },
        {
          id: "h_close",
          title: "Closing questions (ask like a senior)",
          tags: ["Communication", "Team"],
          q: "Write 3 questions you’ll ask Harish that signal senior judgment (reliability/scaling pain points, success metrics, cross-team workflows, on-call/incident culture).",
        },
      ],
    },
  };

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { active: "abigail", answers: {}, grades: {} };
      const parsed = JSON.parse(raw);
      return {
        active: parsed.active || "abigail",
        answers: parsed.answers || {},
        grades: parsed.grades || {},
      };
    } catch {
      return { active: "abigail", answers: {}, grades: {} };
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function toast(msg) {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    window.clearTimeout(toast._tm);
    toast._tm = window.setTimeout(() => t.classList.remove("show"), 1600);
  }

  function wordCount(s) {
    return (s || "").trim().split(/\s+/).filter(Boolean).length;
  }

  function normalize(s) {
    return (s || "").toLowerCase();
  }

  function scoreAnswer(promptId, text) {
    const t = normalize(text);
    const wc = wordCount(text);

    const hasAny = (...words) => words.some(w => t.includes(w));
    const countAny = (...words) => words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);

    // Buckets aligned to your rubric
    const technicalHits = countAny(
      "tradeoff","latency","throughput","scale","scal", "timeout","retry","idempot",
      "rate limit","backpressure","circuit","slo","sla","monitor","metrics","logging","trace",
      "cache","queue","dlq","rollback","feature flag","load","perf"
    );

    const whyHits = countAny("because","so that","therefore","to optimize","reason","why");
    const outcomeHits = countAny("result","impact","reduced","improved","increased","decreased","measured","metric","baseline","after");
    const failureHits = countAny("failure","outage","incident","degraded","root cause","postmortem","mitigation","prevent");
    const collabHits = countAny("stakeholder","partner","aligned","align","disagree","feedback","review","pair","mentor","communicat","product","design","ops","sre");
    const ownershipHits = countAny("owned","ownership","proactive","initiative","fixed","refactor","automated","on-call","follow-up","runbook","alert","instrument");

    // Structure hint: context/decision/tradeoff/outcome
    const structureHits =
      (hasAny("context") ? 1 : 0) +
      (hasAny("decision","chose") ? 1 : 0) +
      (hasAny("tradeoff","constraint") ? 1 : 0) +
      (hasAny("outcome","result","impact") ? 1 : 0);

    // Length scoring (encourage concrete but not essays)
    let lengthPts = 0;
    if (wc >= 45 && wc <= 220) lengthPts = 18;
    else if (wc >= 25 && wc < 45) lengthPts = 12;
    else if (wc > 220 && wc <= 340) lengthPts = 12;
    else if (wc >= 12) lengthPts = 6;
    else lengthPts = 0;

    const techPts = Math.min(20, technicalHits * 4);
    const whyPts = Math.min(12, whyHits * 4);
    const outcomePts = Math.min(12, outcomeHits * 4);
    const failurePts = Math.min(12, failureHits * 4);
    const collabPts = Math.min(12, collabHits * 3);
    const ownPts = Math.min(12, ownershipHits * 3);
    const structPts = Math.min(14, structureHits * 4);

    let score = lengthPts + techPts + whyPts + outcomePts + failurePts + collabPts + ownPts + structPts;
    score = Math.max(0, Math.min(100, score));

    // Traffic light
    const color = score >= 80 ? "green" : score >= 60 ? "yellow" : "red";

    // Suggestions (tight, actionable)
    const tips = [];
    if (wc < 25) tips.push("Add 2–3 concrete details (what you built/changed, what constraints you had).");
    if (whyHits === 0) tips.push("Make the ‘why’ explicit (what were you optimizing for?).");
    if (technicalHits === 0 && !promptId.includes("intro")) tips.push("Name at least one technical tradeoff (latency vs cost, consistency vs availability, etc.).");
    if (failureHits === 0 && (promptId.includes("incident") || promptId.includes("fail"))) tips.push("Call out the failure mode + mitigation (timeouts/retries/idempotency/observability).");
    if (outcomeHits === 0) tips.push("Add an outcome + metric (what changed, how you measured impact).");
    if (collabHits === 0) tips.push("Add collaboration detail (who you aligned with, how you handled disagreement calmly).");
    if (ownershipHits === 0) tips.push("Add ownership detail (what you did beyond ‘my code’: alerts/runbooks/follow-ups).");
    if (structureHits < 3) tips.push("Use a simple structure: Context → Decision → Why → Tradeoffs → Outcome.");

    // Trim tips to 3 to avoid overload
    const trimmed = tips.slice(0, 3);

    const notes = [];
    notes.push(`Anchor check: “${ANCHOR}”`);
    notes.push("Aim to hit: Technical Judgment (scale/failure/change + tradeoffs), Collaboration (no ego), Ownership (beyond tickets).");

    return { score, color, wc, tips: trimmed, notes };
  }

  function overallScore(state, interviewKey) {
    const prompts = INTERVIEWS[interviewKey].prompts;
    const scored = prompts
      .map(p => state.grades?.[p.id])
      .filter(g => g && typeof g.score === "number");
    if (scored.length === 0) return { score: null, color: null };
    const avg = Math.round(scored.reduce((s, g) => s + g.score, 0) / scored.length);
    const color = avg >= 80 ? "green" : avg >= 60 ? "yellow" : "red";
    return { score: avg, color };
  }

  function setOverallUI(os) {
    const chip = $("#overallChip");
    const fill = $("#barFill");
    chip.classList.remove("green","yellow","red");
    if (os.score === null) {
      chip.textContent = "Score: —";
      fill.style.width = "0%";
      return;
    }
    chip.textContent = `Score: ${os.score}%`;
    chip.classList.add(os.color);
    fill.style.width = `${os.score}%`;
  }

  function render(state) {
    // Update tab active state
    $$(".nav-btn").forEach(b => {
      b.classList.toggle("is-active", b.dataset.interview === state.active);
    });

    // Update header
    $("#interviewTitle").textContent = INTERVIEWS[state.active].title;
    $("#interviewSub").textContent = INTERVIEWS[state.active].sub;

    // Render prompts
    const list = $("#promptList");
    list.innerHTML = "";

    INTERVIEWS[state.active].prompts.forEach(p => {
      const card = document.createElement("section");
      card.className = "card";
      card.dataset.prompt = p.id;

      const grade = state.grades?.[p.id] || null;

      const head = document.createElement("div");
      head.className = "card-head";

      const left = document.createElement("div");
      const title = document.createElement("div");
      title.className = "prompt-title";
      title.textContent = p.title;

      const tags = document.createElement("div");
      tags.className = "tags";
      p.tags.forEach(t => {
        const span = document.createElement("span");
        span.className = "tag";
        span.textContent = t;
        tags.appendChild(span);
      });

      left.appendChild(title);
      left.appendChild(tags);

      const right = document.createElement("div");
      right.className = "meta";
      const chip = document.createElement("span");
      chip.className = "chip";
      const wc = wordCount(state.answers?.[p.id] || "");
      if (grade) {
        chip.textContent = `Grade: ${grade.score}%`;
        chip.classList.add(grade.color);
      } else {
        chip.textContent = "Grade: —";
      }
      const wcSpan = document.createElement("span");
      wcSpan.textContent = `${wc} words`;
      right.appendChild(chip);
      right.appendChild(wcSpan);

      head.appendChild(left);
      head.appendChild(right);

      const q = document.createElement("div");
      q.className = "prompt-q";
      q.textContent = p.q;

      const ta = document.createElement("textarea");
      ta.value = state.answers?.[p.id] || "";
      ta.placeholder = "Type your answer here. Bullet points are fine — just make the why + tradeoffs + reliability explicit.";
      ta.setAttribute("aria-label", p.title);

      ta.addEventListener("input", () => {
        state.answers[p.id] = ta.value;
        saveState(state);
        // update word count display
        wcSpan.textContent = `${wordCount(ta.value)} words`;
      });

      const row = document.createElement("div");
      row.className = "row";

      const rowLeft = document.createElement("div");
      rowLeft.className = "row-left";

      const btnFb = document.createElement("button");
      btnFb.className = "btn-small primary";
      btnFb.type = "button";
      btnFb.textContent = "Feedback";

      const btnDict = document.createElement("button");
      btnDict.className = "btn-small";
      btnDict.type = "button";
      btnDict.textContent = "Dictate";

      const btnClear = document.createElement("button");
      btnClear.className = "btn-small";
      btnClear.type = "button";
      btnClear.textContent = "Clear";

      rowLeft.appendChild(btnFb);
      rowLeft.appendChild(btnDict);
      rowLeft.appendChild(btnClear);

      const rowRight = document.createElement("div");
      rowRight.className = "meta";
      const hint = document.createElement("span");
      hint.textContent = "Context → Decision → Why → Tradeoffs → Outcome";
      rowRight.appendChild(hint);

      row.appendChild(rowLeft);
      row.appendChild(rowRight);

      const fb = document.createElement("div");
      fb.className = "feedback";
      const fbHead = document.createElement("div");
      fbHead.className = "fb-head";
      const fbTitle = document.createElement("div");
      fbTitle.className = "tiny muted";
      fbTitle.textContent = "Feedback";
      const fbChip = document.createElement("span");
      fbChip.className = "chip";
      fbChip.textContent = "—";
      fbHead.appendChild(fbTitle);
      fbHead.appendChild(fbChip);

      const fbNotes = document.createElement("div");
      fbNotes.className = "fb-notes";

      const ul = document.createElement("ul");
      ul.className = "ul";

      fb.appendChild(fbHead);
      fb.appendChild(fbNotes);
      fb.appendChild(ul);

      function showFeedback() {
        const result = scoreAnswer(p.id, ta.value);
        state.grades[p.id] = result;
        saveState(state);

        // update grade UI
        chip.classList.remove("green","yellow","red");
        chip.textContent = `Grade: ${result.score}%`;
        chip.classList.add(result.color);

        fbChip.classList.remove("green","yellow","red");
        fbChip.textContent = `${result.score}%`;
        fbChip.classList.add(result.color);

        // notes + tips
        fbNotes.textContent = result.notes.join(" • ");
        ul.innerHTML = "";
        result.tips.forEach(tip => {
          const li = document.createElement("li");
          li.textContent = tip;
          ul.appendChild(li);
        });

        fb.classList.add("is-show");

        // update overall
        setOverallUI(overallScore(state, state.active));
        toast(`${result.score}% • ${result.color.toUpperCase()}`);
      }

      btnFb.addEventListener("click", showFeedback);

      btnClear.addEventListener("click", () => {
        ta.value = "";
        state.answers[p.id] = "";
        delete state.grades[p.id];
        saveState(state);
        wcSpan.textContent = "0 words";
        chip.classList.remove("green","yellow","red");
        chip.textContent = "Grade: —";
        fb.classList.remove("is-show");
        setOverallUI(overallScore(state, state.active));
      });

      // Dictation (Web Speech API)
      let recognition = null;
      function getRecognition() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) return null;
        const r = new SR();
        r.continuous = false;
        r.interimResults = true;
        r.lang = "en-US";
        return r;
      }

      btnDict.addEventListener("click", () => {
        if (!recognition) recognition = getRecognition();
        if (!recognition) {
          toast("Dictation not supported in this browser.");
          return;
        }
        btnDict.disabled = true;
        btnDict.textContent = "Listening…";
        let interim = "";

        recognition.onresult = (e) => {
          let finalText = "";
          interim = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            if (res.isFinal) finalText += res[0].transcript;
            else interim += res[0].transcript;
          }
          // Update textarea live
          const base = ta.value.trim();
          const next = (base ? base + " " : "") + (finalText || interim);
          ta.value = next;
          state.answers[p.id] = ta.value;
          saveState(state);
          wcSpan.textContent = `${wordCount(ta.value)} words`;
        };

        recognition.onerror = () => {
          btnDict.disabled = false;
          btnDict.textContent = "Dictate";
          toast("Dictation error.");
        };

        recognition.onend = () => {
          btnDict.disabled = false;
          btnDict.textContent = "Dictate";
          toast("Dictation stopped.");
        };

        try {
          recognition.start();
        } catch {
          btnDict.disabled = false;
          btnDict.textContent = "Dictate";
        }
      });

      card.appendChild(head);
      card.appendChild(q);
      card.appendChild(ta);
      card.appendChild(row);
      card.appendChild(fb);

      list.appendChild(card);
    });

    setOverallUI(overallScore(state, state.active));
  }

  function exportMarkdown(state) {
    const interview = INTERVIEWS[state.active];
    let md = `# Mastercard Prep — ${interview.title}\n\n`;
    md += `**Anchor:** ${ANCHOR}\n\n`;
    const os = overallScore(state, state.active);
    if (os.score !== null) md += `**Overall score:** ${os.score}% (${os.color})\n\n`;
    for (const p of interview.prompts) {
      const ans = (state.answers?.[p.id] || "").trim();
      const g = state.grades?.[p.id];
      md += `## ${p.title}\n\n`;
      md += `**Prompt:** ${p.q}\n\n`;
      md += `**Grade:** ${g ? `${g.score}% (${g.color})` : "—"}\n\n`;
      md += ans ? ans + "\n\n" : "_(no answer)_\n\n";
    }
    return md;
  }

  function download(filename, content, mime = "text/plain") {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function wireUI(state) {
    $$(".nav-btn").forEach(b => {
      b.addEventListener("click", () => {
        state.active = b.dataset.interview;
        saveState(state);
        render(state);
      });
    });

    $("#btnExport").addEventListener("click", () => {
      const md = exportMarkdown(state);
      const safe = state.active === "abigail" ? "abigail" : "harish";
      download(`mastercard_prep_${safe}.md`, md, "text/markdown");
      toast("Exported Markdown.");
    });

    $("#btnReset").addEventListener("click", () => {
      if (!confirm("Reset all saved answers and grades?")) return;
      localStorage.removeItem(STORAGE_KEY);
      const fresh = { active: state.active, answers: {}, grades: {} };
      Object.assign(state, fresh);
      saveState(state);
      render(state);
      toast("Reset complete.");
    });
  }

  // init
  const state = loadState();
  // Ensure object maps exist
  state.answers = state.answers || {};
  state.grades = state.grades || {};

  wireUI(state);
  render(state);
})();
