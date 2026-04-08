
(() => {
  // === RC singleton runtime guard (prevents double-execution bugs in the Viewer) ===
  const __RC_RUNTIME_KEY = "__CAFETERIA_MONEY_MATCH_RUNTIME";
  const __RC_BUILD = "v32-check-singleton";
  try {
    const prev = window[__RC_RUNTIME_KEY];
    if (prev && typeof prev.destroy === "function") prev.destroy();
  } catch (e) {}
  const __rc_ac = new AbortController();
  window[__RC_RUNTIME_KEY] = {
    build: __RC_BUILD,
    destroy() {
      try { __rc_ac.abort(); } catch (e) {}
    },
  };

  // globals/state for reliability patches
  let __lastCheckFire = 0;
  let __dragPulse = 0;
  let __rc_delegate_installed = false;

  window.__CAFETERIA_CASHIER_BUILD = __RC_BUILD;
  console.info('[cafeteria-money-match] build', window.__CAFETERIA_CASHIER_BUILD);

  // NOTE ABOUT YOUR IMAGE:
  // The image you shared contains photos of real currency.
  // To keep this educational tool safe and clearly "play money",
  // we use cartoon/illustration money with clear "PLAY / SPECIMEN" markings.

  // Everything in CENTS (integers) to avoid float errors.
  const MIN_CENTS = 1;
  const MAX_CENTS = 5000;

  const $ = (s) => document.querySelector(s);

  const payZone = $("#payZone");
  const placedWrap = $("#placedWrap");
  const dueAmountEl = $("#dueAmount");
  const builtAmountEl = $("#builtAmount");
  const runningLabel = $("#runningLabel");
  const runningExtra = $("#runningExtra");
  const statusPill = $("#statusPill");
  const cashierTalk = $("#cashierTalk");

  const orderLinesEl = $("#orderLines");
  const ticketTotalEl = $("#ticketTotal");
  const ticketHintEl = $("#ticketHint");

  const streakEl = $("#streak");
  const bestEl = $("#best");
  const pointsEl = $("#points");

  const billLane = $("#billLane");
  const coinLane = $("#coinLane");

  const overlay = $("#overlay");
  const confetti = $("#confetti");
  const winText = $("#winText");

  const btnNew = $("#btnNew");
  const btnClear = $("#btnClear");

  function __fireCheck(e, src) {
    const now = Date.now();
    if (now - __lastCheckFire < 250) return;
    __lastCheckFire = now;
    try { setBubble('Checking…'); } catch (_) {}
    try { check(); } catch (err) { console.error('[cashier] check() threw', err); }
  }

  function __attachReliableCheck(btn) {
  // Install once; document-level delegation survives DOM re-renders.
  if (__rc_delegate_installed) return;
  __rc_delegate_installed = true;
  let __rc_last_check_fire = 0;
  const __rc_MIN_GAP = 250;

  const __rc_getBtn = () => document.getElementById("btnCheck");

  const __rc_pointInside = (b, e) => {
    if (!b) return false;
    const rect = b.getBoundingClientRect();
    const x = (e && e.clientX != null) ? e.clientX : (e && e.touches && e.touches[0] && e.touches[0].clientX);
    const y = (e && e.clientY != null) ? e.clientY : (e && e.touches && e.touches[0] && e.touches[0].clientY);
    if (x == null || y == null) return false;
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  };

  const __rc_isDisabled = (b) => {
    if (!b) return true;
    if (b.disabled) return true;
    if (b.getAttribute && b.getAttribute("aria-disabled") === "true") return true;
    if (b.classList && (b.classList.contains("disabled") || b.classList.contains("is-disabled"))) return true;
    return false;
  };

  const __rc_fire = (e, src, b) => {
    if (!b || __rc_isDisabled(b)) return;
    const now = Date.now();
    if (now - __rc_last_check_fire < __rc_MIN_GAP) return;
    __rc_last_check_fire = now;

    try { b.focus && b.focus({ preventScroll: true }); } catch (_) {}
    try { e && e.preventDefault && e.preventDefault(); } catch (_) {}
    try { e && e.stopPropagation && e.stopPropagation(); } catch (_) {}
    try { e && e.stopImmediatePropagation && e.stopImmediatePropagation(); } catch (_) {}

    try {
      // Call the real check logic directly (don't rely on click handlers).
      check();
    } catch (err) {
      console.error("[cafeteria-money-match] check() failed", err);
    }
  };

  const __rc_handler = (e) => {
    const b = __rc_getBtn();
    if (!b) return;

    const t = e && e.target;
    if (t && t.closest) {
      const hit = t.closest("#btnCheck");
      if (hit) return __rc_fire(e, "target", b);
    }

    if (__rc_pointInside(b, e)) return __rc_fire(e, "rect", b);
  };

  // Capture phase so overlays can't swallow it.
  document.addEventListener("pointerdown", __rc_handler, { capture: true, passive: false, signal: __rc_ac.signal });
  document.addEventListener("mousedown", __rc_handler, { capture: true, signal: __rc_ac.signal });
  document.addEventListener("touchstart", __rc_handler, { capture: true, passive: false, signal: __rc_ac.signal });
  document.addEventListener("click", __rc_handler, { capture: true, signal: __rc_ac.signal });

  // Keyboard support (Enter/Space).
  document.addEventListener("keydown", (e) => {
    if (!e) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    const b = __rc_getBtn();
    if (!b) return;
    const ae = document.activeElement;
    if (ae === b || (ae && ae.closest && ae.closest("#btnCheck"))) {
      __rc_fire(e, "key", b);
    }
  }, true);
}

  const btnUndo = $("#btnUndo");
  const btnCheck = $("#btnCheck");
  const btnBackLifeSkills = $("#btnBackLifeSkills");
  const btnNextWin = $("#btnNextWin");
  const btnSpeak = $("#btnSpeak");
  const btnHint = $("#btnHint");
  const btnRole = $("#btnRole");
  const btnOptions = $("#btnOptions"); // optional; may be absent (btnRole is the Options button)
  const btnRush = $("#btnRush");
  const btnSound = $("#btnSound");
  const modePill = $("#modePill");

  const dueLabel = $("#dueLabel");
  const tenderInfo = $("#tenderInfo");

  const roleOverlay = $("#roleOverlay");
  const btnRoleCustomer = $("#btnRoleCustomer");
  const btnRoleCashier = $("#btnRoleCashier");
  const chkRush = $("#chkRush");
  const chkSound = $("#chkSound");
  const chkReadOnStart = $("#chkReadOnStart");
  const btnStart = $("#btnStart");

  const timerWrap = $("#timerWrap");
  const timerEl = $("#timer");
  const rushOverlay = $("#rushOverlay");
  const rushText = $("#rushText");
  const btnRushAgain = $("#btnRushAgain");
  const btnRushExit = $("#btnRushExit");

  const winTitle = $("#winTitle");


  // Read-aloud buttons
  const btnReadTicket = $("#btnReadTicket");
  const btnReadCounter = $("#btnReadCounter");
  const btnReadWallet = $("#btnReadWallet");

  function updatePlacedScale(){
    const n = placed.length;
    let s = 1;
    if (n <= 4) s = 1;
    else if (n <= 8) s = 0.92;
    else if (n <= 12) s = 0.84;
    else if (n <= 16) s = 0.76;
    else if (n <= 20) s = 0.68;
    else s = 0.60;
    payZone.style.setProperty("--placedScale", String(s));
  }

  function readTicketAloud(){
    // Build a friendly spoken receipt
    const lines = Array.from(orderLinesEl.querySelectorAll(".oLine"));
    if (!lines.length){
      say("Order ticket is empty.");
      return;
    }
    const items = lines.map(row => {
      const name = row.querySelector(".oName")?.textContent?.trim() || "item";
      const price = row.querySelector(".oPrice")?.textContent?.trim() || "";
      return `${name} for ${price}`;
    });
    const spoken = `Order ticket. ${items.join(". ")}. Total due is ${centsToSpeech(targetCents)}.`;
    say(spoken);
  }

  function readCounterAloud(){
    const built = calcTotal();
    const status = statusPill.textContent || "status";
    const spoken = `Total due is ${centsToSpeech(targetCents)}. You have built ${centsToSpeech(built)}. ${status}.`;
    say(spoken);
  }

  function readWalletAloud(){
    const spoken = "Wallet. Bills: one dollar, five dollars, ten dollars, and twenty dollars. Coins: quarter, dime, nickel, and penny. You can drag money up, or click to add.";
    say(spoken);
  }


  // ---------- Helpers ----------
  const fmt = (c) => `$${(c/100).toFixed(2)}`;
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  function clampCents(c){ return Math.max(MIN_CENTS, Math.min(MAX_CENTS, c)); }

  function setStatus(type, text){
    statusPill.classList.remove("ok","warn","nope");
    statusPill.classList.add(type);
    statusPill.textContent = text;
  }

  function say(text){
    if (!("speechSynthesis" in window)) return;
    try{
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95;
      u.pitch = 1.03;
      window.speechSynthesis.speak(u);
    } catch { /* ignored */ }
  }

  function centsToSpeech(cents){
    const dollars = Math.floor(cents/100);
    const centsPart = cents % 100;
    if (dollars === 0) return `${centsPart} cents`;
    if (centsPart === 0) return `${dollars} dollars`;
    return `${dollars} dollars and ${centsPart} cents`;
  }

  function beep(type){
    // tiny web-audio blips: type = "coin" | "bill" | "win" | "nope"
    try{
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      const now = ctx.currentTime;
      const freq = type === "win" ? 880 : type === "nope" ? 220 : type === "coin" ? 660 : 520;
      o.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.07, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      o.connect(g); g.connect(ctx.destination);
      o.start(now);
      o.stop(now + 0.14);
      setTimeout(() => ctx.close(), 250);
    } catch { /* ignored */ }
  }

  function setSound(on){
    soundOn = !!on;
    localStorage.setItem("money_sound", soundOn ? "1" : "0");
    btnSound && (btnSound.textContent = soundOn ? "🔊 Sound: On" : "🔇 Sound: Off");
    chkSound && (chkSound.checked = soundOn);
  }

  // Slightly nicer “cha-ching” and “clink” using the existing beep() as fallback.
  function sfx(type){
    if (!soundOn) return;
    // Try a richer sound using WebAudio, fallback to beep().
    try{
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      g.connect(ctx.destination);

      const now = ctx.currentTime;
      const mk = (freq, t0, t1, vol=0.08, wave="sine") => {
        const o = ctx.createOscillator();
        o.type = wave;
        o.frequency.setValueAtTime(freq, t0);
        const og = ctx.createGain();
        og.gain.setValueAtTime(0.0001, t0);
        og.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
        og.gain.exponentialRampToValueAtTime(0.0001, t1);
        o.connect(og); og.connect(g);
        o.start(t0);
        o.stop(t1 + 0.02);
      };

      if (type === "coin"){
        mk(950, now, now + 0.08, 0.07, "triangle");
        mk(1200, now + 0.02, now + 0.10, 0.05, "sine");
      } else if (type === "bill"){
        mk(520, now, now + 0.10, 0.06, "sine");
        mk(780, now + 0.04, now + 0.16, 0.05, "sine");
      } else if (type === "win"){
        mk(880, now, now + 0.12, 0.08, "sine");
        mk(1320, now + 0.02, now + 0.18, 0.06, "triangle");
        mk(1760, now + 0.06, now + 0.22, 0.05, "sine");
      } else if (type === "nope"){
        mk(220, now, now + 0.18, 0.06, "sawtooth");
      }
      setTimeout(() => ctx.close(), 350);
      return;
    } catch {
      beep(type);
    }
  }

  function setRole(nextRole){
    role = (nextRole === "cashier") ? "cashier" : "customer";
    localStorage.setItem("money_role", role);
    updateModePill();
  }

  function updateModePill(){
    if (!modePill) return;
    const roleLabel = role === "cashier" ? "Cashier" : "Customer";
    const taskLabel = role === "cashier" ? "Make change" : "Exact total";
    modePill.textContent = `${role === "cashier" ? "Cashier" : "Customer"} • ${role === "cashier" ? "Give change" : "Pay exact"}` + (rushActive ? " • Rush" : "");
  }

  function pickTenderForDue(due){
    // Single-bill tendered: choose the smallest available bill strictly greater than due.
    const options = BILL_DENOMS.filter(b => b > due);
    if (!options.length) return BILL_DENOMS[BILL_DENOMS.length - 1];
    // For variety, usually pick smallest, sometimes pick next one up.
    if (options.length > 1 && Math.random() < 0.25) return options[1];
    return options[0];
  }

  function setRoleOverlaySelected(){
    btnRoleCustomer?.classList.toggle("selected", role !== "cashier");
    btnRoleCashier?.classList.toggle("selected", role === "cashier");
  }

  function showRoleOverlay(show=true){
    if (!roleOverlay) return;
    if (show){
      setRoleOverlaySelected();
      chkSound && (chkSound.checked = soundOn);
      roleOverlay.classList.add("show");
    } else {
      roleOverlay.classList.remove("show");
    }
  }

  function startRush(seconds=60){
    rushActive = true;
    rushScore = 0;
    rushSolved = 0;
    rushEndMs = Date.now() + seconds*1000;
    timerWrap && (timerWrap.style.display = "inline-flex");
    updateModePill();

    if (rushTick) clearInterval(rushTick);
    rushTick = setInterval(() => {
      const leftMs = Math.max(0, rushEndMs - Date.now());
      const leftS = Math.ceil(leftMs / 1000);
      if (timerEl) timerEl.textContent = String(leftS);
      if (leftMs <= 0){
        endRush();
      }
    }, 200);

    // Start fresh order
    newOrder();
  }

  function stopRush(){
    rushActive = false;
    if (rushTick) clearInterval(rushTick);
    rushTick = null;
    timerWrap && (timerWrap.style.display = "none");
    updateModePill();
  }

  function endRush(){
    if (!rushActive) return;
    stopRush();
    // Show summary
    const msg = `Orders completed: ${rushSolved}. Score: ${rushScore}. Best streak: ${best}.`;
    if (rushText) rushText.textContent = msg;
    rushOverlay?.classList.add("show");
    say(`Lunch rush over. ${msg}`);
  }

  // ---------- State ----------
  let targetCents = 0;
  // Role + modes
  let role = localStorage.getItem("money_role") || "customer"; // "customer" | "cashier"
  let soundOn = (localStorage.getItem("money_sound") || "1") === "1";

  // For cashier mode
  let dueCents = 0;
  let tenderCents = 0;
  let changeCents = 0; // what student places as change

  // Lunch Rush
  let rushActive = false;
  let rushEndMs = 0;
  let rushTick = null;
  let rushScore = 0;
  let rushSolved = 0;
  let placed = []; // [{cents, kind}]
  let streak = Number(localStorage.getItem("money_streak") || "0");
  let best = Number(localStorage.getItem("money_best") || "0");
  let points = Number(localStorage.getItem("money_points") || "0");

  streakEl.textContent = streak;
  bestEl.textContent = best;
  pointsEl.textContent = points;

  // ---------- Cartoon play money (SVG) ----------
  function billSVG(denom, themeA, themeB, icon){
    const label = `$${denom}`;
    return `
<svg viewBox="0 0 160 84" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label} play bill">
  <defs>
    <linearGradient id="bg_${denom}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${themeA}"/>
      <stop offset="1" stop-color="${themeB}"/>
    </linearGradient>
    <filter id="paper_${denom}" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
      <feColorMatrix type="matrix"
        values="0 0 0 0 0.65
                0 0 0 0 0.65
                0 0 0 0 0.65
                0 0 0 .18 0"/>
      <feComposite operator="in" in2="SourceGraphic"/>
      <feBlend mode="multiply" in2="SourceGraphic"/>
    </filter>
    <pattern id="lines_${denom}" width="10" height="10" patternUnits="userSpaceOnUse">
      <path d="M0 10 L10 0" stroke="rgba(0,0,0,.10)" stroke-width="1"/>
    </pattern>
  </defs>

  <rect x="1" y="1" width="158" height="82" rx="16" fill="url(#bg_${denom})" stroke="rgba(0,0,0,.16)" />
  <rect x="10" y="10" width="140" height="64" rx="12" fill="rgba(255,255,255,.28)" stroke="rgba(0,0,0,.12)"/>
  <rect x="10" y="10" width="140" height="64" rx="12" fill="url(#lines_${denom})" opacity=".55"/>
  <rect x="10" y="10" width="140" height="64" rx="12" filter="url(#paper_${denom})" opacity=".75"/>

  <text x="14" y="22" font-size="9" font-weight="1000" fill="rgba(0,0,0,.55)" letter-spacing=".22em">PLAY MONEY</text>
  <text x="14" y="34" font-size="8" font-weight="1000" fill="rgba(0,0,0,.45)" letter-spacing=".16em">EDUCATIONAL • SPECIMEN</text>

  <g>
    <circle cx="80" cy="44" r="18" fill="rgba(255,255,255,.26)" stroke="rgba(0,0,0,.20)"/>
    <text x="80" y="50" text-anchor="middle" font-size="18" font-weight="1200" fill="rgba(0,0,0,.70)">${label}</text>
  </g>

  <g opacity=".85">
    <text x="26" y="66" text-anchor="middle" font-size="18">${icon}</text>
    <text x="134" y="66" text-anchor="middle" font-size="18">${icon}</text>
  </g>

  <path d="M18 44 C30 34, 50 34, 62 44 C74 54, 94 54, 106 44 C118 34, 138 34, 150 44"
        fill="none" stroke="rgba(0,0,0,.10)" stroke-width="2" opacity=".6"/>
</svg>`;
  }

  function coinSVG(label, tintA, tintB, centerEmoji){
    return `
<svg viewBox="0 0 92 92" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label} play coin">
  <defs>
    <radialGradient id="metal_${label}" cx="30%" cy="25%" r="75%">
      <stop offset="0" stop-color="${tintA}" stop-opacity=".98"/>
      <stop offset=".42" stop-color="${tintB}" stop-opacity=".98"/>
      <stop offset="1" stop-color="#b7b7b7" stop-opacity=".98"/>
    </radialGradient>
    <radialGradient id="shine_${label}" cx="30%" cy="25%" r="60%">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".92"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <circle cx="46" cy="46" r="44" fill="url(#metal_${label})" stroke="rgba(0,0,0,.18)" stroke-width="1"/>
  <!-- ridges -->
  <g opacity=".28" stroke="rgba(0,0,0,.40)" stroke-width="1">
    ${Array.from({length: 36}).map((_,i)=> {
      const a = (i*10) * Math.PI/180;
      const x1 = 46 + Math.cos(a)*41;
      const y1 = 46 + Math.sin(a)*41;
      const x2 = 46 + Math.cos(a)*44;
      const y2 = 46 + Math.sin(a)*44;
      return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" />`;
    }).join("")}
  </g>

  <circle cx="46" cy="46" r="36" fill="rgba(255,255,255,.22)" stroke="rgba(0,0,0,.16)" stroke-width="1"/>
  <circle cx="40" cy="36" r="22" fill="url(#shine_${label})" opacity=".55"/>

  <text x="46" y="49" text-anchor="middle" font-size="18" font-weight="1200" fill="rgba(15,42,82,.92)">${label}</text>
  <text x="46" y="66" text-anchor="middle" font-size="9" font-weight="1200" fill="rgba(15,42,82,.65)" letter-spacing=".16em">PLAY</text>
  <text x="46" y="34" text-anchor="middle" font-size="14" opacity=".9">${centerEmoji}</text>
</svg>`;
  }

  const MONEY = [
    { kind: "bill", cents: 100,  label: "$1",  svg: billSVG(1,  "#f1fff7", "#cfeedd", "🥛") },
    { kind: "bill", cents: 500,  label: "$5",  svg: billSVG(5,  "#f3f7ff", "#d5e6ff", "🍕") },
    { kind: "bill", cents: 1000, label: "$10", svg: billSVG(10, "#fff6ee", "#ffe0c7", "🍟") },
    { kind: "bill", cents: 2000, label: "$20", svg: billSVG(20, "#f0fffb", "#c6f2e6", "🍪") },

    { kind: "coin", cents: 25, label: "25¢", svg: coinSVG("25¢", "#ffffff", "#ececec", "⭐") },
    { kind: "coin", cents: 10, label: "10¢", svg: coinSVG("10¢", "#ffffff", "#ededed", "🔟") },
    { kind: "coin", cents: 5,  label: "5¢",  svg: coinSVG("5¢",  "#ffffff", "#ebebeb", "🖐️") },
    { kind: "coin", cents: 1,  label: "1¢",  svg: coinSVG("1¢",  "#ffe8da", "#f1bfa4", "🪙") },
  ];

  // Add a $50 bill to reduce frustration on large totals / cashier tender.
  MONEY.unshift({ kind: "bill", cents: 5000, label: "$50", svg: billSVG(50, "#f0fff9", "#c5f3e1", "🧃") });

  const BILL_DENOMS = MONEY.filter(m => m.kind === "bill").map(m => m.cents).sort((a,b)=>a-b);



  function renderWallet(){
    // clear lanes except labels
    billLane.querySelectorAll(".template").forEach(n => n.remove());
    coinLane.querySelectorAll(".template").forEach(n => n.remove());

    for (const m of MONEY){
      const el = document.createElement("div");
      el.className = `money ${m.kind} template`;
      el.dataset.cents = String(m.cents);
      el.dataset.kind = m.kind;
      el.dataset.label = m.label;
      el.innerHTML = m.svg;
      (m.kind === "bill" ? billLane : coinLane).appendChild(el);
    }
    return Array.from(document.querySelectorAll(".template"));
  }

  // ---------- Orders ----------
  const MENU_POOL = [
    { name:"Pizza Slice", icon:"🍕" },
    { name:"Milk", icon:"🥛" },
    { name:"Apple", icon:"🍎" },
    { name:"Fries", icon:"🍟" },
    { name:"Chicken Sandwich", icon:"🍗" },
    { name:"Salad", icon:"🥗" },
    { name:"Cookie", icon:"🍪" },
    { name:"Juice", icon:"🧃" },
    { name:"Nachos", icon:"🧀" },
    { name:"Water", icon:"💧" },
    { name:"Pudding", icon:"🍮" },
  ];

  function priceForItem(){
    // 0.50 to 12.99 with cents
    return randInt(50, 1299);
  }

  function makeOrder(){
    const count = randInt(2, 4);
    const shuffled = [...MENU_POOL].sort(()=>Math.random() - 0.5);
    const picks = shuffled.slice(0, count);

    const lines = picks.map(p => ({ ...p, price: priceForItem() }));
    let sum = lines.reduce((s, x) => s + x.price, 0);

    let tries = 0;
    while (sum > MAX_CENTS && tries < 25){
      for (const l of lines) l.price = priceForItem();
      sum = lines.reduce((s, x) => s + x.price, 0);
      tries++;
    }
    sum = clampCents(sum);

    return { lines, total: sum };
  }

  function renderTicket(lines, total){
    orderLinesEl.innerHTML = "";
    for (const l of lines){
      const row = document.createElement("div");
      row.className = "oLine";
      row.innerHTML = `
        <div class="oLeft">
          <div class="oIcon">${l.icon}</div>
          <div class="oName" title="${l.name}">${l.name}</div>
        </div>
        <div class="oPrice">${fmt(l.price)}</div>
      `;
      orderLinesEl.appendChild(row);
    }
    ticketTotalEl.textContent = fmt(total);
  }

  // ---------- Payment ----------
  function calcTotal(){
    return placed.reduce((sum, p) => sum + p.cents, 0);
  }

  function renderTotalAndFeedback(){
    const built = calcTotal(); // sum of items placed in the tray
    const isCashier = role === "cashier";

    // Compute compare + goal
    const running = isCashier ? clampCents(dueCents + built) : built;
    const goal = isCashier ? tenderCents : targetCents;

    // Running line text
    if (runningLabel && runningExtra){
      if (isCashier){
        runningLabel.textContent = "Change on tray:";
        builtAmountEl.textContent = fmt(built);
        runningExtra.textContent = ` • Running total: ${fmt(running)} / ${fmt(goal)}`;
      } else {
        runningLabel.textContent = "You’ve built:";
        builtAmountEl.textContent = fmt(built);
        runningExtra.textContent = "";
      }
    } else {
      builtAmountEl.textContent = fmt(built);
    }

    // Clear zone states
    payZone.classList.remove("good","bad");

    // Friendly cashier prompt base
    const cashierBase = isCashier
      ? `Customer gave you ${fmt(tenderCents)}. The total is ${fmt(dueCents)}.`
      : "";

    // If no money placed yet, nudge
    if (built === 0){
      setStatus("warn", "Drag money here");
      if (isCashier){
        cashierTalk.innerHTML = `${cashierBase} Please make change (count up to ${fmt(goal)}).`;
      } else {
        cashierTalk.innerHTML = `Start with bills, then use coins for cents. Hit <span class="kbd">Check</span> when ready.`;
      }
      return;
    }

    if (running === goal){
      setStatus("ok", "Exact match!");
      payZone.classList.add("good");
      cashierTalk.textContent = isCashier
        ? `${cashierBase} Perfect — you reached ${fmt(goal)}. Hit Check!`
        : "That matches exactly. Hit Check!";
    } else if (running < goal){
      const diff = goal - running;
      setStatus("warn", `Need ${fmt(diff)} more`);
      cashierTalk.textContent = isCashier
        ? `${cashierBase} You're at ${fmt(running)}. Add ${fmt(diff)} more change.`
        : `You still owe ${fmt(diff)}. Add more money.`;
    } else {
      const diff = running - goal;
      setStatus("nope", `Too much by ${fmt(diff)}`);
      payZone.classList.add("bad");
      cashierTalk.textContent = isCashier
        ? `${cashierBase} Oops — that's past ${fmt(goal)} by ${fmt(diff)}. Remove ${fmt(diff)}.`
        : `That’s too much. Remove ${fmt(diff)}.`;
    }
  }

  function addPlacedFromTemplate(tpl){
    const cents = Number(tpl.dataset.cents);
    const kind = tpl.dataset.kind || "money";
    placed.push({ cents, kind });

    const el = document.createElement("div");
    el.className = `money placed ${kind}`;
    el.dataset.cents = String(cents);
    el.dataset.kind = kind;
    el.style.setProperty("--tilt", `${randInt(-6,6)}deg`);
    el.innerHTML = tpl.innerHTML;

    el.addEventListener("click", () => {
      const idx = Array.from(placedWrap.children).indexOf(el);
      if (idx >= 0){
        placed.splice(idx, 1);
        el.remove();
        updatePlacedScale();
        renderTotalAndFeedback();
      }
    });

    placedWrap.appendChild(el);
    updatePlacedScale();
    renderTotalAndFeedback();
    sfx(kind === "coin" ? "coin" : "bill");
  }

  function undo(){
    if (!placed.length) return;
    placed.pop();
    placedWrap.lastElementChild?.remove();
    updatePlacedScale();
    renderTotalAndFeedback();
  }

  function clearAll(){
    placed = [];
    placedWrap.innerHTML = "";
    updatePlacedScale();
    renderTotalAndFeedback();
  }

  function confettiBurst(){
    confetti.innerHTML = "";
    for (let i=0; i<42; i++){
      const p = document.createElement("i");
      const left = Math.random()*100;
      const delay = Math.random()*120;
      const dur = 720 + Math.random()*520;
      const rotate = Math.random()*360;
      const w = 8 + Math.random()*10;
      const h = 12 + Math.random()*16;
      p.style.left = `${left}%`;
      p.style.animationDelay = `${delay}ms`;
      p.style.animationDuration = `${dur}ms`;
      p.style.transform = `rotate(${rotate}deg)`;
      p.style.width = `${w}px`;
      p.style.height = `${h}px`;
      p.style.background = `rgba(${randInt(10,30)}, ${randInt(60,180)}, ${randInt(60,220)}, .90)`;
      confetti.appendChild(p);
    }
  }

  function win(){
    sfx("win");
    confettiBurst();

    // In Lunch Rush, don’t block with a modal every time.
    if (rushActive){
      // Tiny toast via status + talk; then next order quickly.
      winTitle && (winTitle.textContent = role === "cashier" ? "CHANGE ✅" : "PAID ✅");
      setStatus("ok", role === "cashier" ? "Correct change!" : "Paid!");
      cashierTalk.textContent = "Next customer!";
      setTimeout(() => newOrder(), 380);
      return;
    }

    winTitle && (winTitle.textContent = role === "cashier" ? "CHANGE ✅" : "PAID ✅");
    overlay.classList.add("show");

    if (role === "cashier"){
      winText.textContent = `Nice! You counted up from ${fmt(dueCents)} to ${fmt(tenderCents)}. Change on tray: ${fmt(changeCents)}. Streak +1.`;
      say(`Nice. You counted up to ${centsToSpeech(tenderCents)}. Change is ${centsToSpeech(changeCents)}.`);
    } else {
      winText.textContent = `You paid ${fmt(targetCents)} exactly. Streak +1.`;
      say(`Paid. You paid ${centsToSpeech(targetCents)} exactly.`);
    }
  }

  function fail(){
    beep("nope");
  }

  function check(){
    const built = calcTotal();
    const isCashier = role === "cashier";
    const running = isCashier ? clampCents(dueCents + built) : built;
    const goal = isCashier ? tenderCents : targetCents;

    if (running === goal){
      // Store change amount for the win modal text (cashier mode)
      if (isCashier) changeCents = built;

      setStatus("ok", "Exact match!");
      payZone.classList.add("good");

      streak += 1;
      best = Math.max(best, streak);
      localStorage.setItem("money_streak", String(streak));
      localStorage.setItem("money_best", String(best));

      // Score / Rush
      if (rushActive){
        const timeLeft = Math.max(0, rushEndMs - Date.now());
        const speedBonus = Math.floor(timeLeft / 1000);
        const streakBonus = Math.min(25, streak * 2);
        rushScore += 10 + speedBonus + streakBonus;
        rushSolved += 1;
        rushScoreEl && (rushScoreEl.textContent = String(rushScore));
      } else {
        points += 15;
      }
      pointsEl && (pointsEl.textContent = String(points));
      streakEl && (streakEl.textContent = String(streak));
      bestEl && (bestEl.textContent = String(best));

      // Win handler (confetti + sound + modal / rush auto-advance)
      win();
    } else {
      streak = 0;
      localStorage.setItem("money_streak", "0");
      streakEl && (streakEl.textContent = "0");
      fail();
      renderTotalAndFeedback();
    }
  }

  function hint(){
    const isCashier = role === "cashier";
    if (isCashier){
      const built = calcTotal();
      const running = clampCents(dueCents + built);
      const goal = tenderCents;
      if (running >= goal){
        say("You're at or past the goal. Remove money to get back to the paid amount.");
        return;
      }
      // Suggest a friendly next step (count-up strategy)
      const centsPart = running % 100;
      let step = 0;
      let stepTo = running;
      if (centsPart !== 0){
        // go to next whole dollar first
        const nextDollar = Math.min(goal, (Math.floor(running/100)+1)*100);
        step = nextDollar - running;
        stepTo = nextDollar;
        say(`First, add ${centsToSpeech(step)} to reach ${centsToSpeech(stepTo)}.`);
        return;
      }
      const diff = goal - running;
      const bills = [2000, 1000, 500, 100];
      const coins = [25, 10, 5, 1];
      for (const b of bills){
        if (b <= diff){ step = b; break; }
      }
      if (step === 0){
        for (const c of coins){
          if (c <= diff){ step = c; break; }
        }
      }
      if (step === 0) step = diff;
      say(`Add ${centsToSpeech(step)} next.`);
      return;
    }
    const built = calcTotal();
    const remaining = targetCents - built;

    if (remaining <= 0){
      cashierTalk.textContent = remaining === 0 ? "Looks good. Hit Check!" : "You're over. Remove something.";
      return;
    }

    const options = MONEY
      .filter(m => m.cents <= remaining)
      .sort((a,b)=> b.cents - a.cents);

    if (!options.length){
      cashierTalk.textContent = "Try removing something and using smaller coins.";
      return;
    }
    const next = options[0];
    cashierTalk.textContent = `Hint: add ${next.label} next.`;
    ticketHintEl.textContent = `Hint: Try adding ${next.label} next.`;
  }

  function speakTotal(){
    if (role === "cashier"){
      say(`Total due is ${centsToSpeech(dueCents)}. Customer paid ${centsToSpeech(tenderCents)}. Give change of ${centsToSpeech(targetCents)}.`);
    } else {
      say(`Your total is ${centsToSpeech(targetCents)}.`);
    }
  }

  // ---------- Drag behavior ----------
  function makeGhostFromTemplate(tpl){
    const ghost = tpl.cloneNode(true);
    ghost.classList.add("ghost");
    ghost.classList.remove("template");
    ghost.style.setProperty("--tilt", `${randInt(-8,8)}deg`);
    document.body.appendChild(ghost);
    return ghost;
  }
  function pointerInsideRect(x, y, rect){
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function wireTemplates(templates){
    templates.forEach(tpl => {
      tpl.__dragging = false;

      // click-to-add (fast mode)
      tpl.addEventListener("click", () => {
        if (tpl.__dragging) return;
        addPlacedFromTemplate(tpl);
      });

      tpl.addEventListener("pointerdown", (e) => {
      __dragPulse = Date.now();
        tpl.__dragging = false;
        const startX = e.clientX;
        const startY = e.clientY;
        let ghost = null;

        const onMove = (ev) => {
          const dx = Math.abs(ev.clientX - startX);
          const dy = Math.abs(ev.clientY - startY);
          if (!ghost && (dx + dy) > 6){
            tpl.__dragging = true;
            ghost = makeGhostFromTemplate(tpl);
          }
          if (ghost){
            ghost.style.left = `${ev.clientX}px`;
            ghost.style.top = `${ev.clientY}px`;
          }
        };

        const onUp = (ev) => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);

          if (ghost){
            const rect = payZone.getBoundingClientRect();
            const inside = pointerInsideRect(ev.clientX, ev.clientY, rect);
            ghost.remove();
            if (inside){
              addPlacedFromTemplate(tpl);
            }
          }

          setTimeout(() => { tpl.__dragging = false; }, 60);
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp, { once: true });
      });
    });
  }

  // ---------- Game loop ----------
  function newOrder(){
    clearAll();
    updatePlacedScale();

    const order = makeOrder();
    dueCents = order.total;

    if (role === "cashier"){
      // Customer pays one bill
      // Ensure due is < max tender so change exists
      if (dueCents >= 5000) dueCents = 4999;
      tenderCents = pickTenderForDue(dueCents);
      targetCents = tenderCents; // goal running total (count-up method)

      renderTicket(order.lines, dueCents);

      // Counter shows GOAL (count-up) instead of giving the subtraction away
      dueLabel && (dueLabel.textContent = "COUNT UP TO");
      // The big number shows what the customer paid (your goal)
      dueAmountEl.textContent = fmt(tenderCents);

      // Mini line inside total box
      if (tenderInfo){
        tenderInfo.style.display = "block";
        tenderInfo.textContent = `Start: ${fmt(dueCents)} · Goal: ${fmt(tenderCents)}`;
      }

      ticketHintEl.textContent = `Customer paid ${fmt(tenderCents)}. Total is ${fmt(dueCents)}. Make change by counting up.`;
      cashierTalk.textContent = `Customer gave you ${fmt(tenderCents)}. The total is ${fmt(dueCents)}. Please make change.`;
      setStatus("warn", "Count up to the paid amount");
      speakTotal();
    } else {
      tenderCents = 0;

      targetCents = dueCents;
      renderTicket(order.lines, dueCents);

      dueLabel && (dueLabel.textContent = "TOTAL DUE");
      dueAmountEl.textContent = fmt(targetCents);

      if (tenderInfo){
        tenderInfo.style.display = "none";
      }

      ticketHintEl.textContent = "Try bills for dollars first, then coins for cents.";
      setStatus("warn", "Drag money here");
      cashierTalk.textContent = "Next customer! Pay the total on the order ticket.";
      speakTotal();
    }

    updateModePill();
  }

  btnReadTicket?.addEventListener("click", readTicketAloud);
  btnReadCounter?.addEventListener("click", readCounterAloud);
  btnReadWallet?.addEventListener("click", readWalletAloud);


  btnNextWin.addEventListener("click", () => {
    overlay.classList.remove("show");
    newOrder();
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.remove("show");
  });

  const templates = renderWallet();
  wireTemplates(templates);

  // Header controls
  btnRole?.addEventListener("click", () => showRoleOverlay(true));

  btnSound?.addEventListener("click", () => setSound(!soundOn));

  btnRush?.addEventListener("click", () => {
    if (rushActive){
      stopRush();
      cashierTalk.textContent = "Lunch Rush stopped.";
    } else {
      startRush(60);
    }
  });

  // Role overlay controls
  btnRoleCustomer?.addEventListener("click", () => { setRole("customer"); setRoleOverlaySelected(); });
  btnRoleCashier?.addEventListener("click", () => { setRole("cashier"); setRoleOverlaySelected(); });

  chkSound?.addEventListener("change", (e) => setSound(e.target.checked));

  btnStart?.addEventListener("click", () => {
    // Apply role based on selected button
    if (btnRoleCashier?.classList.contains("selected")) setRole("cashier");
    else setRole("customer");

    setSound(chkSound?.checked ?? true);

    showRoleOverlay(false);

    if (chkRush?.checked){
      startRush(60);
    } else {
      stopRush();
      newOrder();
    }

    if (chkReadOnStart?.checked){
      setTimeout(() => speakTotal(), 250);
    }
  });

  // Rush overlay buttons
  btnRushAgain?.addEventListener("click", () => {
    rushOverlay?.classList.remove("show");
    startRush(60);
  });
  btnRushExit?.addEventListener("click", () => {
    rushOverlay?.classList.remove("show");
    stopRush();
    showRoleOverlay(true);
  });

  // Existing buttons
  if (btnRole) {
    const openRole = (e) => {
      if (e) {
        try { e.preventDefault(); } catch (_) {}
        try { e.stopPropagation(); } catch (_) {}
      }
      try { showRoleOverlay(true); } catch (err) { console.error('[cashier] role overlay error', err); }
    };
    ['click','pointerup'].forEach((evt) => btnRole.addEventListener(evt, openRole, { capture: true }));
  }
  if (btnOptions) {
    const openOpts = (e) => {
      if (e) {
        try { e.preventDefault(); } catch (_) {}
        try { e.stopPropagation(); } catch (_) {}
      }
      try { setBubble('Options: coming soon.'); } catch (_) {}
    };
    ['click','pointerup'].forEach((evt) => btnOptions.addEventListener(evt, openOpts, { capture: true }));
  }

  if (btnBackLifeSkills) {
    const go = (e) => {
      if (e) {
        try { e.preventDefault(); } catch (_) {}
        try { e.stopPropagation(); } catch (_) {}
      }
      const url = '/life-skills/';
      try { window.top.location.href = url; return; } catch (_) {}
      try { window.parent.location.href = url; return; } catch (_) {}
      window.location.href = url;
    };
    ['click','pointerup'].forEach((evt) => btnBackLifeSkills.addEventListener(evt, go, { capture: true }));
  }

  btnNew.addEventListener("click", newOrder);
  btnClear.addEventListener("click", clearAll);
  btnUndo.addEventListener("click", undo);
  __attachReliableCheck(btnCheck);
  btnSpeak.addEventListener("click", speakTotal);
  btnHint.addEventListener("click", hint);

  btnReadTicket?.addEventListener("click", readTicketAloud);
  btnReadCounter?.addEventListener("click", readCounterAloud);
  btnReadWallet?.addEventListener("click", readWalletAloud);

  btnNextWin.addEventListener("click", () => {
    overlay.classList.remove("show");
    newOrder();
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.remove("show");
  });
  // Initialize
  setSound(soundOn);
  updateModePill();
  updatePlacedScale();

  // Require role selection at the start
  showRoleOverlay(true);
})();