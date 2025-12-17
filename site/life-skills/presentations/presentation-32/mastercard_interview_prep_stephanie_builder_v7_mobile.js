(function(){
  const STORAGE_KEY = "mc_interview_prep_builder_v7_mobile";
  const ANCHOR = "I build reliable, scalable systems in ambiguous environments and communicate clearly while doing it.";
  const HEDGE = ["i have no idea","not sure","maybe","i guess","sort of","kind of","probably","i think","i feel like"];
  const NUM_HINT = ["%","ms","sec","seconds","minutes","hours","days","weeks","months","x","times","k","m","b"];
  const OUTCOME_WORDS = ["reduced","increased","improved","shipped","delivered","prevented","fixed","stabilized","optimized","migrated","modernized","refactored","automated","accelerated","cut","decreased","boosted"];
  const JUDGMENT_WORDS = ["tradeoff","risk","constraint","because","chose","choice","prioritized","instead","however","so that","decided","decision","option","alternative"];
  const RELIABILITY_WORDS = ["reliab","stabil","uptime","incident","postmortem","monitor","alert","rollback","runbook","slo","sla","error budget","retry","idempot","failover","degrad","timeout","circuit breaker"];
  const SCALE_WORDS = ["scale","scalable","throughput","latency","perf","performance","load","capacity","burst","peak","cache","caching","queue","backpressure","shard","partition","optimiz"];
  const AMBIG_WORDS = ["ambig","unclear","unknown","vague","discovery","requirements","stakeholder","align","clarif","scope","tradeoff","priority"];
  const COMM_WORDS = ["communicat","document","align","stakeholder","partner","sync","workshop","roadmap","kpi","demo","explain","writeup","diagram"];

  const COLLAB_WORDS = ["collabor","partner","stakeholder","product","qa","devops","support","design","leadership","team","together","we ","our ","cross-functional","cross team","handoff"];
  const DISAGREE_WORDS = ["disagree","conflict","pushback","debate","compromise","calm","listen","aligned","alignment","resolve","negotiat"];
  const OWNERSHIP_WORDS = ["on-call","oncall","incident","root cause","rca","postmortem","runbook","monitor","alert","prevent","proactive","automation","improve","refactor","maintenance","operational","observability","triage","rollback"];

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  const $toast = $("#toast");
  const $preview = $("#exportPreview");
  const $saveChip = $("#saveState");
  const $fatal = $("#fatal");

  let lastExport = "";
  let state = loadState();

  function toast(msg){
    if(!$toast) return;
    $toast.textContent = msg;
    $toast.classList.add("show");
    setTimeout(() => $toast.classList.remove("show"), 900);
  }
  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, s => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[s]));
  }
  function showFatal(msg){
    if(!$fatal) return;
    $fatal.style.display = "block";
    $fatal.innerHTML = "<strong>Module error:</strong> " + escapeHtml(msg) +
      "<br><span style='opacity:.9'>If this is hosted somewhere that blocks scripts, use the two-file version (HTML + JS in the same folder).</span>";
  }

  // -------- Voice-to-text (Web Speech API) --------
  const SpeechCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognizer = null;
  let activeDictation = { btn:null, ta:null, status:null };

  function isSpeechSupported(){
    return !!SpeechCtor;
  }

  function ensureRecognizer(){
    if(!isSpeechSupported()) return null;
    if(recognizer) return recognizer;
    recognizer = new SpeechCtor();
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.lang = "en-US";

    recognizer.onresult = (event) => {
      if(!activeDictation.ta) return;
      let finalText = "";
      let interim = "";

      for(let i=event.resultIndex; i<event.results.length; i++){
        const res = event.results[i];
        const txt = (res[0] && res[0].transcript) ? res[0].transcript : "";
        if(res.isFinal) finalText += txt;
        else interim += txt;
      }

      if(activeDictation.status){
        activeDictation.status.textContent = interim ? ("Listening… " + interim.trim()) : "Listening…";
      }

      if(finalText && activeDictation.ta){
        insertAtCursor(activeDictation.ta, finalText.trim() + " ");
        // trigger autosave
        activeDictation.ta.dispatchEvent(new Event("input", { bubbles:true }));
      }
    };

    recognizer.onerror = (e) => {
      const msg = (e && e.error) ? e.error : "speech error";
      toast("Voice input stopped (" + msg + ").");
      stopDictation(true);
    };

    recognizer.onend = () => {
      // Browser ends recognition on silence; keep UI consistent
      stopDictation(false);
    };

    return recognizer;
  }

  function insertAtCursor(ta, text){
    try{
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? ta.value.length;
      const before = ta.value.slice(0, start);
      const after = ta.value.slice(end);
      ta.value = before + text + after;
      const pos = (before + text).length;
      ta.selectionStart = ta.selectionEnd = pos;
      ta.focus();
    }catch(_){
      ta.value = (ta.value || "") + text;
    }
  }

  function setDictationUI(isOn){
    const { btn, status } = activeDictation;
    if(btn){
      btn.classList.toggle("active", !!isOn);
      btn.setAttribute("aria-pressed", isOn ? "true" : "false");
      btn.querySelector(".micText") && (btn.querySelector(".micText").textContent = isOn ? "Stop" : "Dictate");
    }
    if(status){
      status.textContent = isOn ? "Listening…" : "";
    }
  }

  function stopDictation(forceStop){
    const wasActive = !!activeDictation.ta;
    // Only clear UI if we were actively dictating
    if(wasActive){
      setDictationUI(false);
    }
    const r = recognizer;
    activeDictation = { btn:null, ta:null, status:null };
    if(forceStop && r){
      try{ r.stop(); }catch(_){}
    }
  }

  function startDictation(btn, ta, statusEl){
    const r = ensureRecognizer();
    if(!r){
      toast("Voice-to-text isn’t supported in this browser. On iPhone/iPad, use the keyboard mic dictation.");
      return;
    }

    // Toggle off if same button
    if(activeDictation.btn === btn){
      try{ r.stop(); }catch(_){}
      stopDictation(true);
      return;
    }

    // Stop any current session
    if(activeDictation.ta){
      try{ r.stop(); }catch(_){}
      stopDictation(true);
    }

    activeDictation = { btn, ta, status: statusEl };
    setDictationUI(true);

    try{
      r.start();
    }catch(e){
      // Some browsers throw if start is called too quickly
      toast("Voice-to-text couldn’t start. Try again.");
      setDictationUI(false);
      activeDictation = { btn:null, ta:null, status:null };
    }
  }

  function setupDictationButtons(){
    const fields = $all(".field");
    fields.forEach(field => {
      const ta = field.querySelector("textarea");
      const label = field.querySelector(".label");
      if(!ta || !label) return;

      // Wrap label + mic in a row
      const top = document.createElement("div");
      top.className = "fieldTop";
      label.parentNode.insertBefore(top, label);
      top.appendChild(label);

      // status line
      const status = document.createElement("div");
      status.className = "micStatus";
      status.id = "mic_" + ta.id;

      // mic button
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "micBtn";
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute("title", isSpeechSupported() ? "Voice-to-text" : "Voice-to-text not supported here (use keyboard dictation)");
      btn.innerHTML = `
        <span class="micIcon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" stroke="currentColor" stroke-width="1.8"/>
            <path d="M19 11a7 7 0 0 1-14 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <path d="M12 18v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <path d="M8 21h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        </span>
        <span class="micText">Dictate</span>
      `;

      if(!isSpeechSupported()){
        btn.disabled = true;
      }

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        startDictation(btn, ta, status);
      });

      top.appendChild(btn);
      top.after(status);
    });
  }

  // -------- Mobile/UX helpers --------
  function setupQuestionAccordion(){
    const qblocks = $all(".qblock");
    const isMobile = window.matchMedia("(max-width: 980px)").matches;

    qblocks.forEach((qb, idx) => {
      const top = qb.querySelector(".qtop");
      if(!top) return;

      // add toggle button once
      if(top.querySelector(".qToggle")) return;
      const t = document.createElement("button");
      t.type = "button";
      t.className = "qToggle";
      t.setAttribute("aria-label", "Toggle question");
      t.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
      top.appendChild(t);

      const toggle = () => {
        qb.classList.toggle("collapsed");
      };

      t.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); toggle(); });
      top.addEventListener("click", (e) => {
        if(e.target.closest("button")) return;
        toggle();
      });

      // mobile default: collapse most
      if(isMobile && idx > 0) qb.classList.add("collapsed");
    });
  }

  function setupJumpMenu(){
    const sel = $("#jumpSel");
    if(!sel) return;
    const qblocks = $all(".qblock");
    sel.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "Jump to…";
    sel.appendChild(opt0);

    qblocks.forEach((qb, idx) => {
      const id = qb.getAttribute("data-id") || ("q" + (idx+1));
      const title = (qb.querySelector(".qtitle")?.textContent || "Question " + (idx+1)).trim();
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = (idx+1) + ". " + title.slice(0, 70);
      sel.appendChild(opt);
    });

    sel.addEventListener("change", () => {
      const id = sel.value;
      if(!id) return;
      const target = document.querySelector(`.qblock[data-id="${id}"]`);
      if(target){
        target.classList.remove("collapsed");
        target.scrollIntoView({ behavior:"smooth", block:"start" });
        setTimeout(()=>{ sel.value=""; }, 300);
      }
    });
  }

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return { v: 6, answers: {} };
      const parsed = JSON.parse(raw);
      if(!parsed || typeof parsed !== "object") return { v: 6, answers: {} };
      if(!parsed.answers) parsed.answers = {};
      return parsed;
    }catch(e){
      return { v: 6, answers: {} };
    }
  }
  function saveState(){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      if($saveChip) $saveChip.textContent = "Autosave: ON (Local)";
      toast("Saved");
    }catch(e){
      if($saveChip) $saveChip.textContent = "Autosave: OFF (Storage blocked)";
      // still works in-memory
    }
  }

  function getFields(qid){
    return {
      ctx: $("#ctx_"+qid),
      act: $("#act_"+qid),
      imp: $("#imp_"+qid),
      trd: $("#trd_"+qid),
      lrn: $("#lrn_"+qid),
      fb: $("#fb_"+qid),
      pv: $("#pv_"+qid),
      pvBody: $("#pv_body_"+qid)
    };
  }

  function getAnswerObj(qid){
    if(!state.answers[qid]) state.answers[qid] = { ctx:"", act:"", imp:"", trd:"", lrn:"" };
    return state.answers[qid];
  }

  function setFieldValuesFromState(qid){
    const a = getAnswerObj(qid);
    const f = getFields(qid);
    if(f.ctx) f.ctx.value = a.ctx || "";
    if(f.act) f.act.value = a.act || "";
    if(f.imp) f.imp.value = a.imp || "";
    if(f.trd) f.trd.value = a.trd || "";
    if(f.lrn) f.lrn.value = a.lrn || "";
  }

  function bindInputs(){
    const ids = $$(".qblock").map(b => b.getAttribute("data-id")).filter(Boolean);
    ids.forEach(qid => {
      setFieldValuesFromState(qid);
      const f = getFields(qid);
      [["ctx","ctx"],["act","act"],["imp","imp"],["trd","trd"],["lrn","lrn"]].forEach(([k, suffix])=>{
        const el = f[k];
        if(!el) return;
        el.addEventListener("input", () => {
          const a = getAnswerObj(qid);
          a[k] = el.value || "";
          saveState();
        });
      });
    });
  }

  function tokenize(text){
    return (text || "").toLowerCase();
  }
  function countHits(text, list){
    const t = tokenize(text);
    let c = 0;
    for(const w of list){
      if(t.includes(w)) c++;
    }
    return c;
  }
  function anyHit(text, list){
    const t = tokenize(text);
    return list.some(w => t.includes(w));
  }

  function hasNumberLike(text){
    const t = text || "";
    if(/\d/.test(t)) return true;
    const low = t.toLowerCase();
    return NUM_HINT.some(s => low.includes(s));
  }

  function buildPreview(qid){
    const a = getAnswerObj(qid);
    const parts = [];
    if(a.ctx.trim()) parts.push(a.ctx.trim());
    if(a.act.trim()) parts.push(a.act.trim());
    if(a.imp.trim()) parts.push("Result: " + a.imp.trim());
    if(a.trd.trim()) parts.push("Tradeoff: " + a.trd.trim());
    if(a.lrn.trim()) parts.push("Learning: " + a.lrn.trim());

    // Make it read more like speech
    let text = parts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
    // light cleanup: bullets to sentences-ish
    text = text.replace(/^\s*[-•●]\s*/gm, "• ");

    return text;
  }

  function scorePill(score){
    if(score >= 4) return "good";
    if(score >= 2) return "warn";
    return "bad";
  }

  function checklistRow(label, ok){
    const cls = ok ? "good" : "bad";
    const icon = ok ? "✓" : "✕";
    return `<span class="pill ${cls}">${icon} ${escapeHtml(label)}</span>`;
  }

  function renderFeedback(qid){
    const block = $(`.qblock[data-id="${qid}"]`);
    const kind = block ? (block.getAttribute("data-kind") || "") : "";
    const a = getAnswerObj(qid);
    const full = [a.ctx,a.act,a.imp,a.trd,a.lrn].join("\n").trim();
    const f = getFields(qid);
    if(!f.fb) return;

    if(!full){
      f.fb.hidden = false;
      f.fb.innerHTML = `<div class="fbTitle">Focused feedback</div>
        <div class="muted">Write something first — even rough bullets. Then I can sharpen the signal.</div>`;
      return;
    }

    const low = tokenize(full);

    // Anchor checks
    const rel = anyHit(full, RELIABILITY_WORDS) || low.includes("reliable") || low.includes("stability");
    const scl = anyHit(full, SCALE_WORDS) || low.includes("scalable") || low.includes("scale");
    const amb = anyHit(full, AMBIG_WORDS);
    const com = anyHit(full, COMM_WORDS);

    // Theme scoring
    let tj = 0, col = 0, own = 0;

    // Technical Judgment: scale/failure/change + why + tradeoff
    if(rel || anyHit(full, ["failure","fault","timeout","retry","rollback","monitor"])) tj++;
    if(scl) tj++;
    if(anyHit(full, JUDGMENT_WORDS)) tj++;
    if(anyHit(full, ["design","architecture","schema","model","api","performance","security","testing"])) tj++;
    if(a.trd.trim().length > 0) tj++;

    // Collaboration: cross-team + calm disagreement + shared ownership
    if(anyHit(full, COLLAB_WORDS)) col++;
    if(anyHit(full, DISAGREE_WORDS)) col++;
    if(/\bwe\b|\bour\b|\bus\b/i.test(full)) col++;
    if(anyHit(full, ["align","alignment","stakeholder","clarify","workshop","demo","kpi","roadmap"])) col++;
    if(anyHit(full, ["mentor","pair","code review","review","helped"])) col++;

    // Ownership: beyond my code + proactive + improve system
    if(anyHit(full, OWNERSHIP_WORDS)) own++;
    if(anyHit(full, ["proactive","prevent","spotted","caught"])) own++;
    if(anyHit(full, ["monitor","alert","dashboard","metrics","logging","observability"])) own++;
    if(anyHit(full, ["automation","refactor","hardening","runbook","postmortem","rca"])) own++;
    if(anyHit(full, OUTCOME_WORDS)) own++;

    const hedgeHit = HEDGE.filter(h => low.includes(h));
    const hasOutcome = anyHit(full, OUTCOME_WORDS) || hasNumberLike(full);
    const hasTradeoff = a.trd.trim().length > 0 || anyHit(full, JUDGMENT_WORDS);

    const anchorLine = `<div class="fbSec">
      <h4>Anchor alignment</h4>
      <div class="fbRow">
        ${checklistRow("Reliability", rel)}
        ${checklistRow("Scale", scl)}
        ${checklistRow("Ambiguity", amb)}
        ${checklistRow("Clear comms", com)}
      </div>
      <ul>
        ${(!rel ? "<li>Add one reliability move: monitoring/alerting, rollback plan, idempotency, or postmortem follow-up.</li>" : "")}
        ${(!scl ? "<li>Add one scale move: performance constraint, caching/queuing, load pattern, or capacity thinking.</li>" : "")}
        ${(!amb ? "<li>Name the ambiguity: unclear requirements, shifting scope, competing stakeholders — and how you clarified.</li>" : "")}
        ${(!com ? "<li>Show communication: who you aligned with, what you documented, and how you kept updates flowing.</li>" : "")}
      </ul>
    </div>`;

    function themeSec(title, score, bullets){
      return `<div class="fbSec">
        <h4>${escapeHtml(title)} <span class="pill ${scorePill(score)}" style="margin-left:6px;">${score}/5</span></h4>
        <ul>${bullets.map(b=>`<li>${escapeHtml(b)}</li>`).join("")}</ul>
      </div>`;
    }

    // Focused bullets per theme
    const tjBul = [];
    if(!hasTradeoff) tjBul.push("State the choice + why: “I chose X over Y because …” then name the cost/risk.");
    if(!rel) tjBul.push("Mention a failure mode and how you designed around it (timeouts/retries/rollback/monitoring).");
    if(!scl) tjBul.push("Add one scale constraint (latency/throughput/load) and what you optimized for.");
    if(!hasOutcome) tjBul.push("Add at least one measurable outcome (deployment time, defects, manual work, performance).");
    if(tjBul.length === 0) tjBul.push("Strong: keep it tight and add one crisp metric to make it undeniable.");

    const colBul = [];
    if(!anyHit(full, COLLAB_WORDS)) colBul.push("Name the partners (QA/DevOps/Product/Support) and what you coordinated with them.");
    if(!anyHit(full, DISAGREE_WORDS)) colBul.push("Add a calm disagreement moment: how you handled pushback and got alignment.");
    if(!/\bwe\b|\bour\b/i.test(full)) colBul.push("Use “we” once — show shared ownership without shrinking your contribution.");
    if(!com) colBul.push("Mention a communication artifact: written update, doc/diagram, demo, or stakeholder sync.");
    if(colBul.length === 0) colBul.push("Strong: keep the tone low-ego and show how you prevented misalignment.");

    const ownBul = [];
    if(!anyHit(full, OWNERSHIP_WORDS)) ownBul.push("Add one ‘beyond my code’ move: incident response, monitoring, runbooks, or release safety.");
    if(!anyHit(full, ["proactive","prevent","spotted","caught"])) ownBul.push("Add one proactive catch: what you noticed before it became a ticket.");
    if(!anyHit(full, ["refactor","automation","hardening","improve"])) ownBul.push("Show system improvement: refactor/automation/hardening, not just feature delivery.");
    if(!hasOutcome) ownBul.push("Close with impact + what you did after shipping (measured, monitored, iterated).");
    if(ownBul.length === 0) ownBul.push("Strong: add one post-ship habit (monitoring/postmortem follow-ups) to seal the ownership signal.");

    // Kind-specific nudges (short, not essay)
    const kindNudges = [];
    const K = (kind || "").toLowerCase();
    if(K.includes("narrative")){
      kindNudges.push("Keep it Past→Present→Future, then land on “why now” (scale, standards, reliability).");
      kindNudges.push("Add one signature strength + a 10‑second example.");
    }else if(K.includes("why")){
      kindNudges.push("Bridge the missing posting: state what you DO know (scale/security/payments) and ask a smart clarifier.");
    }else if(K.includes("incident") || K.includes("production")){
      kindNudges.push("Use incident structure: impact → mitigation → root cause → prevention (monitoring/tests/runbook).");
    }else if(K.includes("conflict")){
      kindNudges.push("Name the disagreement + your calm approach + how you aligned on the decision.");
    }else if(K.includes("design") || K.includes("system")){
      kindNudges.push("Say the constraint, the options, the decision, and the tradeoff — no wandering.");
    }

    const polish = [];
    if(hedgeHit.length) polish.push(`Remove hedging (${hedgeHit.join(", ")}). Replace with: “Based on what I know…” + one assumption + one question back.`);
    if(!hasOutcome) polish.push("Add one metric. If you don’t have numbers, give a directional outcome (“cut deploy time materially”).");
    if(!hasTradeoff) polish.push("Add one tradeoff statement. Senior engineers volunteer tradeoffs before being asked.");
    if(polish.length === 0) polish.push("Polish: keep it concise and practice saying it out loud in 60–90 seconds.");

    const html = `
      <div class="fbTitle">Focused feedback (tied to the anchor)</div>

      <div class="fbRow">
        <span class="pill ${scorePill(tj)}">Technical Judgment: ${tj}/5</span>
        <span class="pill ${scorePill(col)}">Collaboration: ${col}/5</span>
        <span class="pill ${scorePill(own)}">Ownership: ${own}/5</span>
      </div>

      ${anchorLine}

      ${themeSec("Technical Judgment", tj, tjBul)}
      ${themeSec("Collaboration", col, colBul)}
      ${themeSec("Ownership", own, ownBul)}

      <div class="fbSec">
        <h4>Make it sound senior (quick fixes)</h4>
        <ul>${polish.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>
      </div>

      ${kindNudges.length ? `<div class="fbSec"><h4>Question-specific nudge</h4><ul>${kindNudges.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></div>` : ""}
    `;

    f.fb.hidden = false;
    f.fb.innerHTML = html;
  }

  function clearFeedback(qid){
    const f = getFields(qid);
    if(!f.fb) return;
    f.fb.hidden = true;
    f.fb.innerHTML = "";
  }

  function showPreview(qid){
    const f = getFields(qid);
    if(!f.pv || !f.pvBody) return;
    const text = buildPreview(qid);
    f.pvBody.textContent = text || "";
    f.pv.hidden = false;
  }

  function copyPreview(qid){
    const text = buildPreview(qid);
    if(!text) return;
    navigator.clipboard.writeText(text).then(()=>toast("Preview copied")).catch(()=>toast("Copy blocked"));
  }

  function clearOne(qid){
    state.answers[qid] = { ctx:"", act:"", imp:"", trd:"", lrn:"" };
    setFieldValuesFromState(qid);
    clearFeedback(qid);
    const f = getFields(qid);
    if(f.pv) f.pv.hidden = true;
    saveState();
  }

  function clearAll(){
    if(!confirm("Clear ALL answers? This cannot be undone.")) return;
    state = { v: 6, answers: {} };
    $$(".qblock").forEach(b => {
      const qid = b.getAttribute("data-id");
      if(qid) clearOne(qid);
    });
    lastExport = "";
    if($preview) $preview.textContent = "";
    toast("Cleared");
  }

  function exportJson(){
    const payload = { meta: { title: "Mastercard Interview Prep – Stephanie", version: "v6", anchor: ANCHOR, exportedAt: new Date().toISOString() }, answers: state.answers };
    lastExport = JSON.stringify(payload, null, 2);
    if($preview) $preview.textContent = lastExport;
    toast("Exported JSON");
  }

  function exportMarkdown(){
    const ids = $$(".qblock").map(b=>b.getAttribute("data-id")).filter(Boolean);
    const lines = [];
    lines.push(`# Mastercard Interview Prep – Stephanie`);
    lines.push(``);
    lines.push(`**Anchor:** ${ANCHOR}`);
    lines.push(``);
    ids.forEach(qid=>{
      const block = $(`.qblock[data-id="${qid}"]`);
      const qtitle = block ? $(".qtitle", block)?.textContent?.trim() : qid;
      const a = getAnswerObj(qid);
      lines.push(`## ${qtitle || qid}`);
      lines.push(``);
      lines.push(`- **Context:** ${a.ctx || ""}`);
      lines.push(`- **Actions:** ${a.act || ""}`);
      lines.push(`- **Impact:** ${a.imp || ""}`);
      lines.push(`- **Tradeoffs:** ${a.trd || ""}`);
      lines.push(`- **Learning:** ${a.lrn || ""}`);
      lines.push(``);
      const preview = buildPreview(qid);
      if(preview){
        lines.push(`**Spoken preview:**`);
        lines.push(``);
        lines.push(preview.split("\n").map(l=>"> "+l).join("\n"));
        lines.push(``);
      }
    });
    lastExport = lines.join("\n");
    if($preview) $preview.textContent = lastExport;
    toast("Exported Markdown");
  }

  function copyExport(){
    if(!lastExport){
      toast("Nothing to copy — export first");
      return;
    }
    navigator.clipboard.writeText(lastExport).then(()=>toast("Copied")).catch(()=>toast("Copy blocked"));
  }

  function analyzeAll(){
    // Generate a compact summary of theme scores per question
    const ids = $$(".qblock").map(b=>b.getAttribute("data-id")).filter(Boolean);
    const rows = [];
    rows.push(`Theme summary (0–5): Technical Judgment / Collaboration / Ownership`);
    rows.push(``);
    ids.forEach(qid=>{
      const block = $(`.qblock[data-id="${qid}"]`);
      const qtitle = block ? $(".qtitle", block)?.textContent?.trim() : qid;
      // renderFeedback computes scores; we re-run the same logic but quickly
      const a = getAnswerObj(qid);
      const full = [a.ctx,a.act,a.imp,a.trd,a.lrn].join("\n").trim();
      let tj=0,col=0,own=0;
      if(full){
        const low = full.toLowerCase();
        const rel = RELIABILITY_WORDS.some(w=>low.includes(w)) || low.includes("reliable") || low.includes("stability");
        const scl = SCALE_WORDS.some(w=>low.includes(w)) || low.includes("scalable") || low.includes("scale");
        if(rel || ["failure","fault","timeout","retry","rollback","monitor"].some(w=>low.includes(w))) tj++;
        if(scl) tj++;
        if(JUDGMENT_WORDS.some(w=>low.includes(w))) tj++;
        if(["design","architecture","schema","model","api","performance","security","testing"].some(w=>low.includes(w))) tj++;
        if((a.trd||"").trim()) tj++;

        if(COLLAB_WORDS.some(w=>low.includes(w))) col++;
        if(DISAGREE_WORDS.some(w=>low.includes(w))) col++;
        if(/\bwe\b|\bour\b|\bus\b/i.test(full)) col++;
        if(["align","alignment","stakeholder","clarify","workshop","demo","kpi","roadmap"].some(w=>low.includes(w))) col++;
        if(["mentor","pair","code review","review","helped"].some(w=>low.includes(w))) col++;

        if(OWNERSHIP_WORDS.some(w=>low.includes(w))) own++;
        if(["proactive","prevent","spotted","caught"].some(w=>low.includes(w))) own++;
        if(["monitor","alert","dashboard","metrics","logging","observability"].some(w=>low.includes(w))) own++;
        if(["automation","refactor","hardening","runbook","postmortem","rca"].some(w=>low.includes(w))) own++;
        if(OUTCOME_WORDS.some(w=>low.includes(w)) || /\d/.test(full)) own++;
      }
      rows.push(`- ${qtitle}: **${tj}/5** / **${col}/5** / **${own}/5**`);
    });
    lastExport = rows.join("\n");
    if($preview) $preview.textContent = lastExport;
    toast("Analysis ready");
  }

  function printPage(){
    window.print();
  }

  function initButtons(){
    $("#btnAnalyzeAll")?.addEventListener("click", analyzeAll);
    $("#btnExportMd")?.addEventListener("click", exportMarkdown);
    $("#btnExportJson")?.addEventListener("click", exportJson);
    $("#btnCopyExport")?.addEventListener("click", copyExport);
    $("#btnPrint")?.addEventListener("click", printPage);
    $("#btnClearAll")?.addEventListener("click", clearAll);

    document.addEventListener("click", (e)=>{
      const btn = e.target.closest("[data-action]");
      if(!btn) return;
      const action = btn.getAttribute("data-action");
      const qid = btn.getAttribute("data-target");
      if(!qid) return;

      try{
        if(action === "feedback") renderFeedback(qid);
        else if(action === "clearFeedback") clearFeedback(qid);
        else if(action === "preview") showPreview(qid);
        else if(action === "copyPreview") copyPreview(qid);
        else if(action === "clearOne") clearOne(qid);
      }catch(err){
        showFatal(err?.message || String(err));
      }
    });
  }

  function init(){
    try{
      bindInputs();
      initButtons();
      setupDictationButtons();
      setupQuestionAccordion();
      setupJumpMenu();
    }catch(e){
      showFatal(e?.message || String(e));
    }
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  }else{
    init();
  }
})();