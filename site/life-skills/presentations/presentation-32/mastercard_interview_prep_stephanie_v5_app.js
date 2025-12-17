(function(){
  const STORAGE_KEY = "mc_interview_prep_stephanie_v5";
  const $toast = document.getElementById("toast");
  const $preview = document.getElementById("exportPreview");
  const $saveChip = document.getElementById("saveState");
  const $fatal = document.getElementById("fatal");

  const HEDGE = ["i have no idea","not sure","maybe","i guess","sort of","kind of","probably","i think"];
  const OUTCOME_WORDS = ["reduced","increased","improved","shipped","delivered","prevented","saved","cut","sped","optimized","stabilized","migrated","modernized","refactored"];
  const SENIOR_SIGNALS = ["tradeoff","risk","rollback","feature flag","canary","postmortem","slo","sla","latency","throughput","monitor","alert","idempotent","backpressure","least privilege","threat model","audit","encryption"];

  function toast(msg){
    if(!$toast) return;
    $toast.textContent = msg;
    $toast.classList.add("show");
    setTimeout(() => $toast.classList.remove("show"), 950);
  }
  function showFatal(msg){
    if(!$fatal) return;
    $fatal.style.display="block";
    $fatal.innerHTML = "<strong>Module error:</strong> " + escapeHtml(msg) +
      "<br><span style='opacity:.9'>The questions are still visible (static). If buttons don’t work on your host, scripts may be blocked by a Content Security Policy.</span>";
  }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function storageOK(){
    try{
      const k="__mc_test__";
      localStorage.setItem(k,"1");
      localStorage.removeItem(k);
      return true;
    }catch{ return false; }
  }
  function setSaveChip(){
    if(!$saveChip) return;
    $saveChip.textContent = storageOK() ? "Autosave: ON (Local)" : "Autosave: OFF (Blocked)";
  }

  function getState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    }catch{ return {}; }
  }
  function setState(next){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }catch{}
  }

  function readAllAnswers(){
    const state = {};
    document.querySelectorAll("textarea.answer").forEach(ta => {
      const id = ta.id.replace(/^ans_/, "");
      state[id] = ta.value || "";
    });
    return state;
  }

  function writeAllAnswers(state){
    document.querySelectorAll("textarea.answer").forEach(ta => {
      const id = ta.id.replace(/^ans_/, "");
      if(state[id] != null) ta.value = state[id];
    });
  }

  function countBullets(text){
    const lines = String(text||"").split(/\n/).map(l=>l.trim()).filter(Boolean);
    if(lines.length===0) return 0;
    // bullet-ish lines: starts with -, •, *, or just short sentence lines
    const bulletish = lines.filter(l => /^[-*•]/.test(l) || l.length < 140).length;
    return Math.max(bulletish, lines.length);
  }

  function analyzeText(kind, text){
    const t = String(text||"").trim();
    const notes = [];
    if(!t){
      return {score:0, notes:["No answer yet. Write 3–6 bullets. Aim for: Context → Action → Result → Learning."]};
    }

    const lower = t.toLowerCase();
    const wordCount = t.split(/\s+/).filter(Boolean).length;
    const bullets = countBullets(t);

    // score components
    let score = 0;

    // length
    if(wordCount >= 35) score++;
    else notes.push("Add a bit more detail (aim ~40–90 words or 3–6 bullets).");

    // structure hints
    const hasAction = /\b(i|we)\s+(built|designed|implemented|led|fixed|shipped|migrated|refactored|improved|reduced|increased)\b/i.test(t);
    if(hasAction) score++; else notes.push("Include what YOU did (verbs: built, designed, led, fixed, shipped).");

    // outcome
    const hasOutcome = OUTCOME_WORDS.some(w => lower.includes(w));
    if(hasOutcome) score++; else notes.push("Add an outcome: reduced errors/latency, improved reliability, shipped X, prevented Y.");

    // senior signals
    const seniorHits = SENIOR_SIGNALS.filter(w => lower.includes(w)).length;
    if(seniorHits>=1) score++; else notes.push("Add one senior signal: tradeoff, risk, monitoring, rollback plan, feature flag, SLO.");

    // bullet hygiene
    if(bullets >= 3) score++; else notes.push("Use 3+ bullets — easier to speak, easier to remember.");

    // hedging penalty
    const hedgeHits = HEDGE.filter(h => lower.includes(h)).length;
    if(hedgeHits){
      score = Math.max(0, score-1);
      notes.push("Remove hedge language (e.g., \"not sure\", \"maybe\"). Replace with: “Based on what I know…” + one smart assumption.");
    }

    // kind-specific checks
    if(kind==="incident"){
      const incidentWords = ["impact","mitigate","rollback","restart","timeline","postmortem","comms","stabilize","monitor"];
      const hit = incidentWords.some(w => lower.includes(w));
      if(!hit) notes.push("Incident answers should include: impact → mitigation → root cause → prevention (postmortem).");
    }
    if(kind==="design"){
      const designWords = ["security","reliability","scalability","performance","tradeoff"];
      const hit = designWords.some(w => lower.includes(w));
      if(!hit) notes.push("Design answers should mention at least 2 of: security, reliability, scalability, performance, tradeoffs.");
    }
    if(kind==="narrative"){
      const nar = ["past","present","future","why","now"];
      const hit = nar.some(w => lower.includes(w));
      if(!hit) notes.push("Narrative answers work best as: Past → Present → Future, ending with why this role now.");
    }

    score = Math.max(0, Math.min(5, score));
    if(notes.length===0) notes.push("Looks strong. Practice out loud in ~60 seconds and tighten any fluffy phrases.");
    return {score, notes};
  }

  function dots(score){
    const wrap = document.createElement("div");
    wrap.className="dots";
    for(let i=1;i<=5;i++){
      const d=document.createElement("div");
      d.className="dot" + (i<=score ? " on" : "");
      if(i<=score){
        d.classList.add(score>=4 ? "good" : (score>=3 ? "warn" : "bad"));
      }
      wrap.appendChild(d);
    }
    return wrap;
  }

  function renderFeedback(qid){
    const block = document.querySelector('.qblock[data-id="'+qid+'"]');
    if(!block) return;
    const kind = block.getAttribute("data-kind") || "general";
    const ta = document.getElementById("ans_"+qid);
    const fb = document.getElementById("fb_"+qid);
    if(!ta || !fb) return;

    const {score, notes} = analyzeText(kind, ta.value);
    fb.innerHTML = "";
    const row = document.createElement("div");
    row.className = "scoreRow";
    row.innerHTML = "<strong>Quick score:</strong>";
    row.appendChild(dots(score));
    fb.appendChild(row);

    const ul = document.createElement("ul");
    notes.forEach(n => {
      const li=document.createElement("li");
      li.textContent=n;
      ul.appendChild(li);
    });
    fb.appendChild(ul);
    fb.hidden = false;
  }

  function clearFeedback(qid){
    const fb = document.getElementById("fb_"+qid);
    if(!fb) return;
    fb.hidden = true;
    fb.innerHTML = "";
  }

  function exportMarkdown(){
    const state = readAllAnswers();
    let out = "# Mastercard Interview Prep – Stephanie\n\n";
    document.querySelectorAll(".sec").forEach(sec => {
      const h = sec.querySelector("h3");
      out += "## " + (h ? h.textContent.trim() : "Section") + "\n\n";
      sec.querySelectorAll(".qblock").forEach(q => {
        const qid = q.getAttribute("data-id");
        const qtitle = q.querySelector(".qtitle")?.textContent?.trim() || qid;
        out += "### " + qid.toUpperCase() + ": " + qtitle + "\n\n";
        const val = (state[qid]||"").trim();
        if(val){
          out += val + "\n\n";
        } else {
          out += "_(no answer yet)_\n\n";
        }
      });
    });
    $preview.textContent = out;
    toast("Exported to Markdown preview.");
    return out;
  }

  function exportJson(){
    const payload = {
      meta: { title: "Mastercard Interview Prep – Stephanie", version:"v5", generatedAt: new Date().toISOString() },
      answers: readAllAnswers()
    };
    const out = JSON.stringify(payload, null, 2);
    $preview.textContent = out;
    toast("Exported to JSON preview.");
    return out;
  }

  async function copyPreview(){
    const text = $preview.textContent || "";
    if(!text.trim()){
      toast("Nothing to copy yet. Export first.");
      return;
    }
    try{
      await navigator.clipboard.writeText(text);
      toast("Copied.");
    }catch{
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast("Copied (fallback).");
    }
  }

  function clearAll(){
    if(!confirm("Clear all answers?")) return;
    document.querySelectorAll("textarea.answer").forEach(ta => ta.value = "");
    document.querySelectorAll(".feedback").forEach(fb => { fb.hidden=true; fb.innerHTML=""; });
    try{ localStorage.removeItem(STORAGE_KEY); }catch{}
    $preview.textContent = "";
    toast("Cleared.");
  }

  function analyzeAll(){
    // show a quick summary in preview
    const lines = [];
    document.querySelectorAll(".qblock").forEach(q => {
      const qid = q.getAttribute("data-id");
      const kind = q.getAttribute("data-kind") || "general";
      const ta = document.getElementById("ans_"+qid);
      const {score, notes} = analyzeText(kind, ta?.value || "");
      lines.push(qid.toUpperCase() + " — score " + score + "/5");
      if(notes[0]) lines.push("  • " + notes[0]);
    });
    $preview.textContent = lines.join("\n");
    toast("Analysis summary generated.");
  }

  function wire(){
    // restore saved answers
    try{
      writeAllAnswers(getState());
    }catch{}

    // autosave on input (delegated)
    document.addEventListener("input", (e) => {
      const ta = e.target;
      if(!(ta instanceof HTMLTextAreaElement)) return;
      if(!ta.classList.contains("answer")) return;
      const state = getState();
      const id = ta.id.replace(/^ans_/, "");
      state[id] = ta.value;
      setState(state);
    });

    // buttons
    document.getElementById("btnAnalyze")?.addEventListener("click", analyzeAll);
    document.getElementById("btnExportMd")?.addEventListener("click", exportMarkdown);
    document.getElementById("btnExportJson")?.addEventListener("click", exportJson);
    document.getElementById("btnCopy")?.addEventListener("click", copyPreview);
    document.getElementById("btnPrint")?.addEventListener("click", () => window.print());
    document.getElementById("btnClear")?.addEventListener("click", clearAll);

    // per-question feedback buttons (delegated)
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if(!btn) return;
      const action = btn.getAttribute("data-action");
      const qid = btn.getAttribute("data-target");
      if(!qid) return;
      if(action==="feedback") renderFeedback(qid);
      if(action==="clearFeedback") clearFeedback(qid);
    });

    setSaveChip();
  }

  function start(){
    try{ wire(); }
    catch(e){ console.error(e); showFatal(e.message || String(e)); }
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", start);
  }else{
    start();
  }
})();