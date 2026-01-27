const RECIPES = [{"id": "pbj", "title": "PB & Jelly Sandwich", "icon": "🥪", "time": "5 min", "skill": "No-cook", "safety": "Wash hands. Watch for allergies. No heat needed.", "steps": [{"key": "wash", "text": "Wash your hands with soap and water.", "actions": [{"type": "scene", "scene": "sink"}, {"type": "hold", "label": "Scrub hands", "ms": 1800, "emo": "🧼"}]}, {"key": "plate", "text": "Put 2 slices of bread on a plate.", "actions": [{"type": "scene", "scene": "plate"}, {"type": "drag", "item": "🍞 Bread slice", "target": "plate"}, {"type": "drag", "item": "🍞 Bread slice", "target": "plate"}]}, {"key": "spread", "text": "Spread peanut butter on 1 slice.", "actions": [{"type": "scene", "scene": "plate"}, {"type": "clickTool", "tool": "🔪 Knife"}, {"type": "drag", "item": "🥜 Peanut butter", "target": "bread"}, {"type": "hold", "label": "Spread", "ms": 1400, "emo": "🔪"}]}, {"key": "spread", "text": "Spread jelly on the other slice.", "actions": [{"type": "scene", "scene": "plate"}, {"type": "drag", "item": "🍓 Jelly", "target": "bread"}, {"type": "hold", "label": "Spread", "ms": 1200, "emo": "🔪"}]}, {"key": "assemble", "text": "Put the sandwich together.", "actions": [{"type": "scene", "scene": "plate"}, {"type": "tapTarget", "target": "stack", "emo": "🥪"}]}, {"key": "eat", "text": "Take a bite and enjoy.", "actions": [{"type": "scene", "scene": "eat"}, {"type": "tapTarget", "target": "eat", "emo": "😋"}]}]}, {"id": "cereal", "title": "Cereal & Milk", "icon": "🥣", "time": "3 min", "skill": "No-cook", "safety": "Wash hands. Pour carefully to avoid spills.", "steps": [{"key": "wash", "text": "Wash your hands.", "actions": [{"type": "scene", "scene": "sink"}, {"type": "hold", "label": "Scrub hands", "ms": 1500, "emo": "🧼"}]}, {"key": "bowl", "text": "Put the bowl on the counter.", "actions": [{"type": "scene", "scene": "counter"}, {"type": "drag", "item": "🥣 Bowl", "target": "counter"}]}, {"key": "pour", "text": "Pour cereal into the bowl.", "actions": [{"type": "scene", "scene": "bowl"}, {"type": "drag", "item": "🌾 Cereal", "target": "bowl"}]}, {"key": "pour", "text": "Pour milk into the bowl.", "actions": [{"type": "scene", "scene": "bowl"}, {"type": "drag", "item": "🥛 Milk", "target": "bowl"}]}, {"key": "stir", "text": "Stir with a spoon.", "actions": [{"type": "scene", "scene": "bowl"}, {"type": "clickTool", "tool": "🥄 Spoon"}, {"type": "hold", "label": "Stir", "ms": 1200, "emo": "🥄"}]}, {"key": "eat", "text": "Eat your cereal.", "actions": [{"type": "scene", "scene": "eat"}, {"type": "tapTarget", "target": "eat", "emo": "😋"}]}]}, {"id": "oatmeal", "title": "Instant Oatmeal (Microwave)", "icon": "🍯", "time": "6–8 min", "skill": "Microwave", "safety": "Hot bowl warning. Ask for help if needed.", "steps": [{"key": "wash", "text": "Wash your hands.", "actions": [{"type": "scene", "scene": "sink"}, {"type": "hold", "label": "Scrub hands", "ms": 1500, "emo": "🧼"}]}, {"key": "pour", "text": "Put oatmeal packet in a bowl.", "actions": [{"type": "scene", "scene": "bowl"}, {"type": "drag", "item": "🥣 Oatmeal packet", "target": "bowl"}]}, {"key": "pour", "text": "Add water (or milk) to the bowl.", "actions": [{"type": "scene", "scene": "bowl"}, {"type": "drag", "item": "💧 Water", "target": "bowl"}]}, {"key": "microwave", "text": "Microwave it.", "actions": [{"type": "scene", "scene": "microwave"}, {"type": "clickTool", "tool": "📟 Microwave"}, {"type": "timer", "label": "Microwave", "seconds": 8, "emo": "📟"}]}, {"key": "stir", "text": "Stir it carefully.", "actions": [{"type": "scene", "scene": "bowl"}, {"type": "clickTool", "tool": "🥄 Spoon"}, {"type": "hold", "label": "Stir", "ms": 1400, "emo": "🥄"}]}, {"key": "eat", "text": "Eat and enjoy.", "actions": [{"type": "scene", "scene": "eat"}, {"type": "tapTarget", "target": "eat", "emo": "😋"}]}]}, {"id": "chocmilk", "title": "Chocolate Milk", "icon": "🍫", "time": "4 min", "skill": "No-cook", "safety": "Wash hands. Stir until mixed.", "steps": [{"key": "wash", "text": "Wash your hands.", "actions": [{"type": "scene", "scene": "sink"}, {"type": "hold", "label": "Scrub hands", "ms": 1400, "emo": "🧼"}]}, {"key": "pour", "text": "Pour milk into a cup.", "actions": [{"type": "scene", "scene": "cup"}, {"type": "drag", "item": "🥛 Milk", "target": "cup"}]}, {"key": "pour", "text": "Add chocolate.", "actions": [{"type": "scene", "scene": "cup"}, {"type": "drag", "item": "🍫 Chocolate", "target": "cup"}]}, {"key": "stir", "text": "Stir until smooth.", "actions": [{"type": "scene", "scene": "cup"}, {"type": "clickTool", "tool": "🥄 Spoon"}, {"type": "hold", "label": "Stir", "ms": 1400, "emo": "🥄"}]}, {"key": "taste", "text": "Take a small sip.", "actions": [{"type": "scene", "scene": "eat"}, {"type": "tapTarget", "target": "taste", "emo": "👅"}]}]}, {"id": "parfait", "title": "Yogurt Fruit Parfait", "icon": "🍓", "time": "7 min", "skill": "No-cook", "safety": "Wash hands. Check allergies.", "steps": [{"key": "wash", "text": "Wash your hands.", "actions": [{"type": "scene", "scene": "sink"}, {"type": "hold", "label": "Scrub hands", "ms": 1500, "emo": "🧼"}]}, {"key": "pour", "text": "Add yogurt to a bowl.", "actions": [{"type": "scene", "scene": "bowl"}, {"type": "drag", "item": "🥣 Yogurt", "target": "bowl"}]}, {"key": "pour", "text": "Add fruit.", "actions": [{"type": "scene", "scene": "bowl"}, {"type": "drag", "item": "🍌 Fruit", "target": "bowl"}]}, {"key": "pour", "text": "Add granola (optional).", "actions": [{"type": "scene", "scene": "bowl"}, {"type": "drag", "item": "🥜 Granola", "target": "bowl"}]}, {"key": "stir", "text": "Stir gently.", "actions": [{"type": "scene", "scene": "bowl"}, {"type": "clickTool", "tool": "🥄 Spoon"}, {"type": "hold", "label": "Stir", "ms": 1200, "emo": "🥄"}]}, {"key": "eat", "text": "Eat your parfait.", "actions": [{"type": "scene", "scene": "eat"}, {"type": "tapTarget", "target": "eat", "emo": "😋"}]}]}, {"id": "quesadilla", "title": "Microwave Quesadilla", "icon": "🫓", "time": "8–10 min", "skill": "Microwave", "safety": "Hot plate warning. Ask for help if needed.", "steps": [{"key": "wash", "text": "Wash your hands.", "actions": [{"type": "scene", "scene": "sink"}, {"type": "hold", "label": "Scrub hands", "ms": 1500, "emo": "🧼"}]}, {"key": "plate", "text": "Put tortilla on a plate.", "actions": [{"type": "scene", "scene": "plate"}, {"type": "drag", "item": "🫓 Tortilla", "target": "plate"}]}, {"key": "cheese", "text": "Add cheese on half.", "actions": [{"type": "scene", "scene": "plate"}, {"type": "drag", "item": "🧀 Cheese", "target": "tortilla"}]}, {"key": "fold", "text": "Fold it in half.", "actions": [{"type": "scene", "scene": "plate"}, {"type": "tapTarget", "target": "fold", "emo": "🫓"}]}, {"key": "microwave", "text": "Microwave it.", "actions": [{"type": "scene", "scene": "microwave"}, {"type": "clickTool", "tool": "📟 Microwave"}, {"type": "timer", "label": "Microwave", "seconds": 8, "emo": "📟"}]}, {"key": "eat", "text": "Take a bite and enjoy.", "actions": [{"type": "scene", "scene": "eat"}, {"type": "tapTarget", "target": "eat", "emo": "😋"}]}]}, {"id": "scrambledeggs", "title": "Scrambled Eggs", "icon": "🍳", "time": "12–15 min", "skill": "Stovetop", "safety": "Hot pan warning. Teacher supervision recommended.", "steps": [{"key": "wash", "text": "Wash your hands.", "actions": [{"type": "scene", "scene": "sink"}, {"type": "hold", "label": "Scrub hands", "ms": 1600, "emo": "🧼"}]}, {"key": "crack", "text": "Crack eggs into a bowl.", "actions": [{"type": "scene", "scene": "bowl"}, {"type": "drag", "item": "🥚 Eggs", "target": "bowl"}]}, {"key": "whisk", "text": "Whisk with a fork.", "actions": [{"type": "scene", "scene": "bowl"}, {"type": "clickTool", "tool": "🍴 Fork"}, {"type": "hold", "label": "Whisk", "ms": 1400, "emo": "🍴"}]}, {"key": "teacher", "text": "Ask the teacher to heat the pan.", "actions": [{"type": "scene", "scene": "stove"}, {"type": "teacherConfirm", "label": "Teacher heats pan", "emo": "👩‍🏫"}]}, {"key": "cook", "text": "Pour eggs into the pan.", "actions": [{"type": "scene", "scene": "stove"}, {"type": "tapTarget", "target": "pan", "emo": "🍳"}]}, {"key": "stir", "text": "Stir with a spatula.", "actions": [{"type": "scene", "scene": "stove"}, {"type": "clickTool", "tool": "🥄 Spatula"}, {"type": "hold", "label": "Stir", "ms": 1600, "emo": "🥄"}]}, {"key": "eat", "text": "Eat your eggs.", "actions": [{"type": "scene", "scene": "eat"}, {"type": "tapTarget", "target": "eat", "emo": "😋"}]}]}, {"id": "grilledcheese", "title": "Grilled Cheese", "icon": "🧀", "time": "12 min", "skill": "Stovetop", "safety": "Hot pan warning. Teacher supervision recommended.", "steps": [{"key": "wash", "text": "Wash your hands.", "actions": [{"type": "scene", "scene": "sink"}, {"type": "hold", "label": "Scrub hands", "ms": 1500, "emo": "🧼"}]}, {"key": "butter", "text": "Butter the bread.", "actions": [{"type": "scene", "scene": "counter"}, {"type": "clickTool", "tool": "🔪 Knife"}, {"type": "drag", "item": "🧈 Butter", "target": "bread"}, {"type": "hold", "label": "Spread", "ms": 1200, "emo": "🧈"}]}, {"key": "cheese", "text": "Add cheese and close the sandwich.", "actions": [{"type": "scene", "scene": "counter"}, {"type": "drag", "item": "🧀 Cheese", "target": "bread"}, {"type": "tapTarget", "target": "stack", "emo": "🥪"}]}, {"key": "teacher", "text": "Ask the teacher to heat the pan.", "actions": [{"type": "scene", "scene": "stove"}, {"type": "teacherConfirm", "label": "Teacher heats pan", "emo": "👩‍🏫"}]}, {"key": "cook", "text": "Cook and flip the sandwich.", "actions": [{"type": "scene", "scene": "stove"}, {"type": "timer", "label": "Cook", "seconds": 10, "emo": "⏲️"}, {"type": "tapTarget", "target": "flip", "emo": "🍳"}]}, {"key": "eat", "text": "Eat it.", "actions": [{"type": "scene", "scene": "eat"}, {"type": "tapTarget", "target": "eat", "emo": "😋"}]}]}, {"id": "butterpasta", "title": "Pasta + Butter + Cheese", "icon": "🍝", "time": "20 min", "skill": "Boiling", "safety": "Boiling water is dangerous. Teacher must supervise.", "steps": [{"key": "wash", "text": "Wash your hands.", "actions": [{"type": "scene", "scene": "sink"}, {"type": "hold", "label": "Scrub hands", "ms": 1500, "emo": "🧼"}]}, {"key": "teacher", "text": "Ask the teacher to boil water in a pot.", "actions": [{"type": "scene", "scene": "stove"}, {"type": "teacherConfirm", "label": "Teacher starts boiling", "emo": "👩‍🏫"}]}, {"key": "pour", "text": "Add pasta to the pot.", "actions": [{"type": "scene", "scene": "stove"}, {"type": "drag", "item": "🍝 Pasta", "target": "pot"}]}, {"key": "cook", "text": "Cook pasta (timer).", "actions": [{"type": "scene", "scene": "stove"}, {"type": "timer", "label": "Cook pasta", "seconds": 12, "emo": "⏲️"}]}, {"key": "teacher", "text": "Ask teacher to drain pasta.", "actions": [{"type": "scene", "scene": "stove"}, {"type": "teacherConfirm", "label": "Teacher drains pasta", "emo": "👩‍🏫"}]}, {"key": "stir", "text": "Add butter and cheese. Stir.", "actions": [{"type": "scene", "scene": "bowl"}, {"type": "drag", "item": "🧈 Butter", "target": "bowl"}, {"type": "drag", "item": "🧀 Cheese", "target": "bowl"}, {"type": "clickTool", "tool": "🥄 Spoon"}, {"type": "hold", "label": "Stir", "ms": 1500, "emo": "🥄"}]}, {"key": "eat", "text": "Eat your pasta.", "actions": [{"type": "scene", "scene": "eat"}, {"type": "tapTarget", "target": "eat", "emo": "😋"}]}]}, {"id": "nachos", "title": "Microwave Nachos", "icon": "🌽", "time": "6–8 min", "skill": "Microwave", "safety": "Hot plate warning. Ask for help if needed.", "steps": [{"key": "wash", "text": "Wash your hands.", "actions": [{"type": "scene", "scene": "sink"}, {"type": "hold", "label": "Scrub hands", "ms": 1500, "emo": "🧼"}]}, {"key": "plate", "text": "Put chips on a plate.", "actions": [{"type": "scene", "scene": "plate"}, {"type": "drag", "item": "🌽 Chips", "target": "plate"}]}, {"key": "cheese", "text": "Sprinkle cheese on top.", "actions": [{"type": "scene", "scene": "plate"}, {"type": "drag", "item": "🧀 Cheese", "target": "chips"}]}, {"key": "microwave", "text": "Microwave until cheese melts.", "actions": [{"type": "scene", "scene": "microwave"}, {"type": "clickTool", "tool": "📟 Microwave"}, {"type": "timer", "label": "Microwave", "seconds": 8, "emo": "📟"}]}, {"key": "eat", "text": "Eat your nachos.", "actions": [{"type": "scene", "scene": "eat"}, {"type": "tapTarget", "target": "eat", "emo": "😋"}]}]}];
const STEP_EMO = {"wash": "🧼", "plate": "🍽️", "bowl": "🥣", "cup": "🥛", "pour": "🫗", "spread": "🔪", "stir": "🥄", "microwave": "📟", "heat": "🔥", "cook": "⏲️", "crack": "🥚", "whisk": "🍴", "fold": "🫓", "cheese": "🧀", "butter": "🧈", "taste": "👅", "eat": "😋", "teacher": "👩‍🏫", "assemble": "🥪"};

const SCENES = {
  sink: { icon:"🧼", label:"Sink", targetEmoji:"👐", targetText:"Wash hands here", hint:"Hold the 🧼 soap sticker until it fills up." },
  counter: { icon:"🧑‍🍳", label:"Counter", targetEmoji:"🎯", targetText:"Put it on the counter", hint:"Drag the correct sticker to the target." },
  plate: { icon:"🍽️", label:"Plate", targetEmoji:"🍽️", targetText:"Put it on the plate", hint:"Drag the correct sticker to the target." },
  bowl: { icon:"🥣", label:"Bowl", targetEmoji:"🥣", targetText:"Put it in the bowl", hint:"Drag the correct sticker to the target." },
  cup: { icon:"🥛", label:"Cup", targetEmoji:"🥛", targetText:"Put it in the cup", hint:"Drag the correct sticker to the target." },
  microwave: { icon:"📟", label:"Microwave", targetEmoji:"📟", targetText:"Use the microwave", hint:"Click the 📟 sticker to start the timer." },
  stove: { icon:"🔥", label:"Stove / Pan", targetEmoji:"🍳", targetText:"Cook here (teacher may help)", hint:"Click the teacher sticker if needed." },
  eat: { icon:"😋", label:"Eat / Taste", targetEmoji:"😋", targetText:"All done!", hint:"Click the 😋 sticker to finish." },
};

const el = (id) => document.getElementById(id);
const toast = el("toast");
let toastTimer = null;
function showToast(msg){
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>toast.classList.remove("show"), 1600);
}
function showScreen(name){
  el("screenPicker").classList.toggle("hidden", name!=="picker");
  el("screenChallenge").classList.toggle("hidden", name!=="challenge");
  el("screenGame").classList.toggle("hidden", name!=="game");
  el("screenHelp").classList.toggle("hidden", name!=="help");
  window.scrollTo({top:0, behavior:"smooth"});
}
function escapeHtml(str){
  return String(str).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

// Speech
const supportsSpeech = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
let voices = [];
let chosenVoiceURI = null;
const SETTINGS_KEY = "recipeQuestVoiceSettings.v4";
function getSettings(){ try{return JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}");}catch{return {};} }
function setSettings(o){ localStorage.setItem(SETTINGS_KEY, JSON.stringify(o)); }
function stopSpeech(){ if(supportsSpeech) speechSynthesis.cancel(); }
function speak(text){
  if(!supportsSpeech){ showToast("Voice not supported."); return; }
  stopSpeech();
  const u = new SpeechSynthesisUtterance(text);
  const v = voices.find(v=>v.voiceURI===chosenVoiceURI);
  if(v) u.voice = v;
  u.rate = Number(el("rate").value);
  u.pitch = Number(el("pitch").value);
  speechSynthesis.speak(u);
}
function updateVoiceLabels(){
  el("rateVal").textContent = `${Number(el("rate").value).toFixed(2)}×`;
  el("pitchVal").textContent = `${Number(el("pitch").value).toFixed(2)}`;
}
function loadVoices(){
  if(!supportsSpeech) return;
  voices = speechSynthesis.getVoices() || [];
  const sel = el("voiceSelect");
  sel.innerHTML = "";
  if(voices.length===0){ setTimeout(loadVoices, 250); return; }
  voices.forEach(v=>{
    const opt = document.createElement("option");
    opt.value = v.voiceURI;
    opt.textContent = `${v.name} (${v.lang})`;
    sel.appendChild(opt);
  });
  const s = getSettings();
  if(s.voiceURI && voices.some(v=>v.voiceURI===s.voiceURI)){ chosenVoiceURI = s.voiceURI; sel.value = s.voiceURI; }
  else {
    const en = voices.find(v=>(v.lang||"").toLowerCase().startsWith("en"));
    chosenVoiceURI = (en||voices[0]).voiceURI;
    sel.value = chosenVoiceURI;
  }
  if(typeof s.rate==="number") el("rate").value = String(s.rate);
  if(typeof s.pitch==="number") el("pitch").value = String(s.pitch);
  updateVoiceLabels();
}

// Picker
function renderPicker(){
  const grid = el("recipeGrid");
  grid.innerHTML = "";
  RECIPES.forEach(r=>{
    const card = document.createElement("div");
    card.className = "card recipeCard";
    const top = document.createElement("div");
    top.className = "recipeTop";

    const icon = document.createElement("div");
    icon.className = "iconBlob";
    icon.textContent = r.icon;

    const info = document.createElement("div");
    info.style.flex = "1";
    info.innerHTML = `<div class="rTitle">${escapeHtml(r.title)}</div>
      <div class="rMeta">
        <span class="chip">⏱️ ${escapeHtml(r.time)}</span>
        <span class="chip">🎯 ${escapeHtml(r.skill)}</span>
      </div>`;

    const play = document.createElement("button");
    play.className = "btn small primary";
    play.type = "button";
    play.textContent = "Play ▶";
    play.addEventListener("click",(e)=>{e.stopPropagation(); startRecipe(r.id);});

    top.appendChild(icon); top.appendChild(info); top.appendChild(play);
    const bottom = document.createElement("div");
    bottom.style.fontWeight="900"; bottom.style.opacity=".9";
    bottom.textContent = "Click to start the step-order challenge.";

    card.appendChild(top); card.appendChild(bottom);
    card.addEventListener("click", ()=>startRecipe(r.id));
    grid.appendChild(card);
  });
}

// Challenge state
let currentRecipe = null;
let order = [];
let attempts = 0;

function startRecipe(id){
  currentRecipe = RECIPES.find(x=>x.id===id);
  if(!currentRecipe) return;
  attempts = 0;
  el("btnStartPrep").disabled = true;
  el("attemptChip").textContent = `🧠 Attempts: ${attempts}`;
  el("challengeRecipeName").textContent = `🍽️ Recipe: ${currentRecipe.title}`;

  order = [...Array(currentRecipe.steps.length).keys()];
  shuffle(order);
  renderChallenge();
  showScreen("challenge");
  showToast(`Challenge started: ${currentRecipe.title}`);
}
function shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }

function renderChallenge(){
  const board = el("challengeBoard");
  board.innerHTML = "";
  order.forEach((stepIdx, pos)=>{
    const step = currentRecipe.steps[stepIdx];
    const emo = STEP_EMO[step.key] || "✅";

    const tile = document.createElement("div");
    tile.className="stepTile";
    tile.draggable=true;
    tile.dataset.pos=String(pos);

    const slot = document.createElement("div");
    slot.className="slot"; slot.textContent=String(pos+1);

    const mark = document.createElement("div");
    mark.className="mark"; mark.textContent="…";

    const text = document.createElement("div");
    text.className="tileText"; text.textContent = `${emo} ${step.text}`;

    const btns = document.createElement("div");
    btns.className="tileBtns";

    const readBtn = document.createElement("button");
    readBtn.className="btn small secondary";
    readBtn.textContent="🔊";
    readBtn.addEventListener("click",(e)=>{e.stopPropagation(); speak(`Step ${pos+1}. ${step.text}`);});

    const upBtn = document.createElement("button");
    upBtn.className="btn small"; upBtn.textContent="▲"; upBtn.disabled = pos===0;
    upBtn.addEventListener("click",(e)=>{e.stopPropagation(); move(pos,pos-1);});

    const dnBtn = document.createElement("button");
    dnBtn.className="btn small"; dnBtn.textContent="▼"; dnBtn.disabled = pos===order.length-1;
    dnBtn.addEventListener("click",(e)=>{e.stopPropagation(); move(pos,pos+1);});

    btns.appendChild(readBtn); btns.appendChild(upBtn); btns.appendChild(dnBtn);

    tile.addEventListener("dragstart",(e)=>{ tile.classList.add("dragging"); e.dataTransfer.effectAllowed="move"; e.dataTransfer.setData("text/plain", String(pos)); });
    tile.addEventListener("dragend",()=>{ tile.classList.remove("dragging"); [...board.children].forEach(c=>c.classList.remove("dropTarget")); });
    tile.addEventListener("dragover",(e)=>{ e.preventDefault(); tile.classList.add("dropTarget"); e.dataTransfer.dropEffect="move"; });
    tile.addEventListener("dragleave",()=>tile.classList.remove("dropTarget"));
    tile.addEventListener("drop",(e)=>{
      e.preventDefault(); tile.classList.remove("dropTarget");
      const from = Number(e.dataTransfer.getData("text/plain"));
      const to = Number(tile.dataset.pos);
      if(Number.isFinite(from)&&Number.isFinite(to)&&from!==to) move(from,to);
    });

    tile.appendChild(slot); tile.appendChild(mark); tile.appendChild(text); tile.appendChild(btns);
    board.appendChild(tile);
  });
}
function move(from,to){
  if(from<0||to<0||from>=order.length||to>=order.length) return;
  const item = order.splice(from,1)[0];
  order.splice(to,0,item);
  renderChallenge();
}

function checkOrder(){
  attempts += 1;
  el("attemptChip").textContent = `🧠 Attempts: ${attempts}`;

  const correct = order.every((stepIdx,pos)=>stepIdx===pos);
  const marks = [...el("challengeBoard").querySelectorAll(".mark")];

  if(correct){
    el("btnStartPrep").disabled = false;
    marks.forEach(m=>{m.textContent="✓"; m.classList.add("good"); m.classList.remove("bad");});
    showToast("Correct! Start Prep 🎮");
    speak("Nice work. The steps are in the correct order. You can start prep.");
    return;
  }

  let okCount=0;
  order.forEach((stepIdx,pos)=>{
    const ok = stepIdx===pos;
    if(ok) okCount++;
    const m = marks[pos];
    if(!m) return;
    m.textContent = ok ? "✓" : "✗";
    m.classList.toggle("good", ok);
    m.classList.toggle("bad", !ok);
  });
  el("btnStartPrep").disabled = true;
  showToast(`Not yet. ${okCount} correct spots.`);
  speak(`Not quite. ${okCount} steps are in the correct spot. Try again.`);
}

// Prep game engine
let stepIndex = 0;
let stepActions = [];
let selectedToolLabel = null;

function emojiFromLabel(label){
  const s = String(label).trim();
  const m = s.match(/^\p{Extended_Pictographic}/u);
  return m ? m[0] : "🧩";
}
function stripLeadingEmoji(label){
  return String(label).replace(/^\p{Extended_Pictographic}\s*/u, "").trim();
}
function nextActions(){
  return stepActions.filter(a=>a.type!=="scene" && !a.done);
}
function firstPending(type){
  return stepActions.find(a=>a.type===type && !a.done);
}
function pendingOfType(type){
  return stepActions.filter(a=>a.type===type && !a.done);
}
function allDone(){
  return stepActions.filter(a=>a.type!=="scene").every(a=>a.done);
}

function startPrep(){
  stepIndex = 0;
  selectedToolLabel = null;
  el("gameRecipeChip").textContent = `${currentRecipe.icon} ${currentRecipe.title}`;
  showScreen("game");
  loadStep();
}

function loadStep(){
  const step = currentRecipe.steps[stepIndex];
  const emo = STEP_EMO[step.key] || "✅";
  el("stepTitle").textContent = `Step ${stepIndex+1} / ${currentRecipe.steps.length} — ${emo} ${step.text}`;
  el("btnNext").disabled = true;
  el("btnBack").disabled = stepIndex===0;

  stepActions = (step.actions||[]).map(a=>({...a, done:false, _timer:null}));
  selectedToolLabel = null;

  const sceneKey = (stepActions.find(a=>a.type==="scene")||{scene:"counter"}).scene;
  const sc = SCENES[sceneKey] || SCENES.counter;
  el("sceneIcon").textContent = sc.icon;
  el("sceneLabel").textContent = sc.label;
  el("sceneSafety").textContent = currentRecipe.safety || "";
  el("targetEmoji").textContent = sc.targetEmoji;
  el("targetText").textContent = sc.targetText;
  el("targetHint").textContent = sc.hint;
  el("targetZone").classList.remove("highlight");

  const tz = el("targetZone");
  tz.ondragover = (e)=>{e.preventDefault(); e.dataTransfer.dropEffect="move";};
  tz.ondrop = (e)=>{
    e.preventDefault();
    const payload = e.dataTransfer.getData("text/plain");
    if(!payload) return;
    try{
      const obj = JSON.parse(payload);
      if(obj.kind==="item") attemptDragItem(obj.label);
      else if(obj.kind==="tool") attemptClickTool(obj.label, obj._dom);
      else if(obj.kind==="action") attemptClickAction(obj.actionType, obj.label);
    }catch{}
  };

  renderObjects();
  renderInstruction();
  updateProgress();
}

function renderInstruction(){
  const pending = nextActions();
  if(pending.length===0){
    el("instruction").textContent = "Step complete! Click Next ➡️";
    return;
  }
  const parts = pending.slice(0,3).map(a=>{
    if(a.type==="clickTool") return `Click ${stripLeadingEmoji(a.tool)}`;
    if(a.type==="drag") return `Drag ${stripLeadingEmoji(a.item)} to the target`;
    if(a.type==="hold") return `Hold ${a.label}`;
    if(a.type==="timer") return `Start ${a.label} timer`;
    if(a.type==="teacherConfirm") return `Click teacher`;
    if(a.type==="tapTarget") return `Click the target`;
    return "Do the action";
  });
  el("instruction").textContent = parts.join(" • ");
}

function clearGlow(){
  [...el("objects").querySelectorAll(".obj")].forEach(o=>o.classList.remove("glow"));
}

function renderObjects(){
  const container = el("objects");
  container.innerHTML = "";

  const pending = nextActions();
  const objs = [];

  pending.filter(a=>a.type==="clickTool").forEach(a=>{
    objs.push({kind:"tool", label:a.tool, emo:emojiFromLabel(a.tool), name:stripLeadingEmoji(a.tool)});
  });

  pending.filter(a=>a.type==="drag").forEach(a=>{
    objs.push({kind:"item", label:a.item, emo:emojiFromLabel(a.item), name:stripLeadingEmoji(a.item)});
  });

  pending.filter(a=>a.type==="hold").forEach(a=>{
    objs.push({kind:"action", actionType:"hold", label:a.label, emo:(a.emo||"🧼"), name:a.label});
  });
  pending.filter(a=>a.type==="timer").forEach(a=>{
    objs.push({kind:"action", actionType:"timer", label:a.label, emo:(a.emo||"⏲️"), name:a.label});
  });
  pending.filter(a=>a.type==="teacherConfirm").forEach(a=>{
    objs.push({kind:"action", actionType:"teacherConfirm", label:a.label, emo:(a.emo||"👩‍🏫"), name:"Teacher"});
  });
  pending.filter(a=>a.type==="tapTarget").forEach(a=>{
    objs.push({kind:"action", actionType:"tapTarget", label:"Tap", emo:(a.emo||"👉"), name:"Tap"});
  });

  const seen = new Set();
  const uniq = [];
  for(const o of objs){
    const key = `${o.kind}|${o.actionType||""}|${o.label}`;
    if(seen.has(key)) continue;
    seen.add(key);
    uniq.push(o);
  }

  if(uniq.length===0){
    const d = document.createElement("div");
    d.className = "obj action";
    d.innerHTML = `<div class="sticker" style="cursor:default;">✅</div><div class="name">Done</div>`;
    container.appendChild(d);
    return;
  }

  uniq.forEach(o=>{
    const wrap = document.createElement("div");
    wrap.className = "obj " + (o.kind==="tool" ? "tool" : (o.kind==="action" ? "action" : ""));
    wrap.dataset.kind = o.kind;
    wrap.dataset.label = o.label;
    if(o.actionType) wrap.dataset.actionType = o.actionType;

    const sticker = document.createElement("div");
    sticker.className = "sticker";
    sticker.textContent = o.emo;
    sticker.setAttribute("draggable","true");

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = o.name;

    sticker.addEventListener("dragstart",(e)=>{
      e.dataTransfer.effectAllowed="move";
      e.dataTransfer.setData("text/plain", JSON.stringify(o));
    });

    sticker.addEventListener("click", ()=>{
      clearGlow();
      if(o.kind==="tool"){
        attemptClickTool(o.label, wrap);
      } else if(o.kind==="item"){
        attemptDragItem(o.label);
      } else if(o.kind==="action"){
        attemptClickAction(o.actionType, o.label);
      }
    });

    sticker.addEventListener("dblclick",(e)=>{
      e.preventDefault();
      speak(`${o.name}`);
    });

    wrap.appendChild(sticker);
    wrap.appendChild(name);
    container.appendChild(wrap);
  });
}

function completeAction(a){
  a.done = true;
  if(a.type==="timer" && a._timer){ clearInterval(a._timer); a._timer=null; }

  renderInstruction();
  renderObjects();
  updateProgress();

  if(allDone()){
    el("btnNext").disabled = false;
    showToast("Step complete! Next ➡️");
  } else {
    showToast("Nice! Keep going.");
  }
}

function attemptClickTool(toolLabel, domWrap=null){
  const a = stepActions.find(x=>x.type==="clickTool" && !x.done && String(x.tool)===String(toolLabel));
  if(!a){
    showToast("That tool is not needed right now.");
    return;
  }
  selectedToolLabel = toolLabel;

  [...el("objects").querySelectorAll(".obj.tool")].forEach(x=>x.classList.remove("selected"));
  if(domWrap) domWrap.classList.add("selected");

  showToast(`Tool selected: ${stripLeadingEmoji(toolLabel)}`);
  completeAction(a);
}

function attemptDragItem(itemLabel){
  const a = stepActions.find(x=>x.type==="drag" && !x.done && String(x.item)===String(itemLabel));
  if(!a){
    showToast("That item is not needed right now.");
    return;
  }
  showToast(`Dropped: ${stripLeadingEmoji(itemLabel)} ✅`);
  completeAction(a);
}

function attemptClickAction(actionType, label){
  if(actionType==="tapTarget"){
    const a = firstPending("tapTarget");
    if(!a){ showToast("Not needed right now."); return; }
    completeAction(a);
    return;
  }
  if(actionType==="teacherConfirm"){
    const a = firstPending("teacherConfirm");
    if(!a){ showToast("Not needed right now."); return; }
    completeAction(a);
    return;
  }
  if(actionType==="timer"){
    const a = firstPending("timer");
    if(!a){ showToast("Not needed right now."); return; }
    if(a._timer){ showToast("Timer already running."); return; }
    let remaining = a.seconds || 8;
    showToast(`Timer started: ${remaining}s`);
    const baseline = el("instruction").textContent;
    el("instruction").textContent = `⏲️ Timer running… ${remaining}s`;
    a._timer = setInterval(()=>{
      remaining -= 1;
      if(remaining<=0){
        clearInterval(a._timer); a._timer=null;
        el("instruction").textContent = baseline;
        showToast("Timer done! ✅");
        completeAction(a);
      } else {
        el("instruction").textContent = `⏲️ Timer running… ${remaining}s`;
      }
    }, 1000);
    return;
  }
  if(actionType==="hold"){
    const a = firstPending("hold");
    if(!a){ showToast("Not needed right now."); return; }
    const ms = a.ms || 1500;
    let start = null, raf = null, holding = true;
    const baseline = el("instruction").textContent;

    const tick = (ts)=>{
      if(!holding) return;
      if(start===null) start = ts;
      const pct = Math.min(1, (ts-start)/ms);
      el("instruction").textContent = `🧼 Holding… ${Math.round(pct*100)}%`;
      if(pct>=1){
        holding=false;
        el("instruction").textContent = baseline;
        showToast("Washed! ✅");
        completeAction(a);
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    const stop = ()=>{
      holding = false;
      if(raf) cancelAnimationFrame(raf);
      el("instruction").textContent = baseline;
      showToast("Hold cancelled. Try again.");
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("pointerleave", stop);
    };

    window.addEventListener("pointerup", stop, {once:true});
    window.addEventListener("pointercancel", stop, {once:true});
    window.addEventListener("pointerleave", stop, {once:true});
    requestAnimationFrame(tick);
    return;
  }
}

function updateProgress(){
  const total = currentRecipe.steps.length;
  const pct = Math.round(((stepIndex)/total)*100);
  el("progressInner").style.width = `${pct}%`;
}

function hint(){
  el("targetZone").classList.add("highlight");
  clearGlow();
  const pending = nextActions();
  const needed = new Set();
  pending.forEach(a=>{
    if(a.type==="drag") needed.add(a.item);
    if(a.type==="clickTool") needed.add(a.tool);
    if(a.type==="hold") needed.add(a.label);
    if(a.type==="timer") needed.add(a.label);
  });
  [...el("objects").querySelectorAll(".obj")].forEach(o=>{
    if(needed.has(o.dataset.label)) o.classList.add("glow");
  });
  showToast("Hint: look for glowing stickers.");
  setTimeout(()=>{
    el("targetZone").classList.remove("highlight");
    clearGlow();
  }, 1400);
}

// Navigation buttons
el("btnBack").addEventListener("click", ()=>{
  if(stepIndex<=0) return;
  stepIndex -= 1;
  loadStep();
});
el("btnNext").addEventListener("click", ()=>{
  if(el("btnNext").disabled){ showToast("Finish the step first."); return; }
  if(stepIndex < currentRecipe.steps.length-1){
    stepIndex += 1;
    loadStep();
    speak(`Step ${stepIndex+1}. ${currentRecipe.steps[stepIndex].text}`);
  } else {
    el("progressInner").style.width = "100%";
    showToast("All done! 🎉");
    speak(`Great job. You finished ${currentRecipe.title}.`);
    showScreen("picker");
  }
});

// Top buttons
el("btnHome").addEventListener("click", ()=>{ stopSpeech(); showScreen("picker"); });
el("btnStop").addEventListener("click", ()=>{ stopSpeech(); showToast("Voice stopped."); });
el("btnHelp").addEventListener("click", ()=>showScreen("help"));

// Challenge controls
el("btnReadChallenge").addEventListener("click", ()=>speak("Step order challenge. Put the steps in the correct order. Drag and drop, or use the up and down buttons. Then click check order."));
el("btnShuffle").addEventListener("click", ()=>{ shuffle(order); el("btnStartPrep").disabled=true; renderChallenge(); showToast("Shuffled!"); });
el("btnCheck").addEventListener("click", checkOrder);
el("btnStartPrep").addEventListener("click", ()=>startPrep());
el("btnSkip").addEventListener("click", ()=>{ if(!currentRecipe) return; startPrep(); });

// Game buttons
el("btnReadStep").addEventListener("click", ()=>{ if(!currentRecipe) return; speak(currentRecipe.steps[stepIndex].text); });
el("btnReadInstruction").addEventListener("click", ()=>speak(el("instruction").textContent));
el("btnHint").addEventListener("click", hint);

// Help / voice controls
el("btnReadHelp").addEventListener("click", ()=>speak("Pick a recipe. Put steps in order. Prep mode shows one step at a time. Click tools so the game knows. Drag ingredients to the target."));
el("btnTestVoice").addEventListener("click", ()=>speak("Voice test. If you can hear this, read aloud is working."));
el("btnCloseHelp").addEventListener("click", ()=>{
  if(!currentRecipe) showScreen("picker");
  else if(!el("screenGame").classList.contains("hidden")) showScreen("game");
  else showScreen("challenge");
});

el("voiceSelect").addEventListener("change", ()=>{
  chosenVoiceURI = el("voiceSelect").value;
  const s = getSettings();
  setSettings({...s, voiceURI: chosenVoiceURI, rate:Number(el("rate").value), pitch:Number(el("pitch").value)});
  showToast("Voice updated.");
});
el("rate").addEventListener("input", ()=>{
  updateVoiceLabels();
  const s=getSettings();
  setSettings({...s, voiceURI:chosenVoiceURI, rate:Number(el("rate").value), pitch:Number(el("pitch").value)});
});
el("pitch").addEventListener("input", ()=>{
  updateVoiceLabels();
  const s=getSettings();
  setSettings({...s, voiceURI:chosenVoiceURI, rate:Number(el("rate").value), pitch:Number(el("pitch").value)});
});

// Keyboard
document.addEventListener("keydown",(e)=>{
  const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
  if(tag==="select"||tag==="input"||tag==="button") return;
  if(!el("screenChallenge").classList.contains("hidden") && e.key.toLowerCase()==="c") el("btnCheck").click();
});

// Init
renderPicker();
showScreen("picker");
updateVoiceLabels();
if(supportsSpeech){ speechSynthesis.onvoiceschanged = loadVoices; loadVoices(); }