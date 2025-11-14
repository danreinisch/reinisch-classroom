(function(){
  // Batch target ~3.5 MB (base64 expands ~33% so we use estimated encoded sizes)
  const BATCH_TARGET = 3.5 * 1024 * 1024;
  
  // Session management constants
  const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000; // Touch session every 5 minutes
  const SESSION_SAFETY_BUFFER_SECONDS = 180; // 3 minute safety buffer
  const QUEUE_STORAGE_KEY = 'adminUploadQueueDraft';
  const FORM_STATE_KEY = 'adminFormStateDraft';

  const catEl   = document.getElementById('cat');
  const slotSel = document.getElementById('slotSel');
  const slotWarn= document.getElementById('slotWarn');
  const titleEl = document.getElementById('title');
  const filesEl = document.getElementById('files');
  const folderEl= document.getElementById('folder');
  const dropEl  = document.getElementById('drop');
  const listEl  = document.getElementById('list');
  const logEl   = document.getElementById('log');
  const uploadBtn = document.getElementById('upload');
  const deleteBtn = document.getElementById('deleteBtn');

  let units = [];
  let siteState = null;
  let queue = [];
  let sessionTouchTimer = null;
  let sessionInfo = { expiresIn: 0, expiresAt: 0 };

  function log(){ logEl.textContent += Array.from(arguments).join(' ') + '\n'; logEl.scrollTop = logEl.scrollHeight; }
  function fmtBytes(n){ if(!n && n!==0) return ''; const u=['B','KB','MB','GB']; let i=0; while(n>1024&&i<u.length-1){n/=1024;i++} return n.toFixed(1)+' '+u[i]; }
  function ensureArraySize(arr,n){ while(arr.length<n) arr.push(''); }
  function num(n){ return String(n).padStart(2,'0'); }

  // Session management functions
  async function touchSession() {
    try {
      const r = await fetch('/.netlify/functions/admin-session-touch', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (r.ok) {
        const data = await r.json();
        sessionInfo = {
          expiresIn: data.expiresIn || 0,
          expiresAt: data.expiresAt || 0,
          refreshed: data.refreshed || false
        };
        
        if (data.refreshed) {
          log('✓ Session auto-refreshed, new TTL:', Math.floor(data.expiresIn / 60), 'min');
        }
        
        updateSessionDisplay();
        return true;
      } else {
        console.error('Session touch failed:', r.status);
        return false;
      }
    } catch (e) {
      console.error('Session touch error:', e);
      return false;
    }
  }

  async function refreshSession() {
    try {
      const r = await fetch('/.netlify/functions/admin-session-refresh', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (r.ok) {
        const data = await r.json();
        sessionInfo = {
          expiresIn: data.expiresIn || 0,
          expiresAt: data.expiresAt || 0,
          refreshed: true
        };
        log('✓ Session refreshed, new TTL:', Math.floor(data.expiresIn / 60), 'min');
        updateSessionDisplay();
        return true;
      } else {
        console.error('Session refresh failed:', r.status);
        return false;
      }
    } catch (e) {
      console.error('Session refresh error:', e);
      return false;
    }
  }

  function updateSessionDisplay() {
    // Create or update session status element
    let statusEl = document.getElementById('sessionStatus');
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.id = 'sessionStatus';
      statusEl.style.cssText = 'position:fixed;top:10px;right:10px;background:rgba(0,0,0,0.7);color:#fff;padding:8px 12px;border-radius:6px;font-size:12px;z-index:1000;';
      document.body.appendChild(statusEl);
    }
    
    const minutes = Math.floor(sessionInfo.expiresIn / 60);
    const status = sessionInfo.refreshed ? '🔄 Auto-refreshed' : '✓ Active';
    statusEl.textContent = `Session: ${status} · ${minutes} min remaining`;
    
    // Warning if low
    if (minutes < 5) {
      statusEl.style.background = 'rgba(200,100,0,0.8)';
    } else {
      statusEl.style.background = 'rgba(0,0,0,0.7)';
    }
  }

  function persistQueue() {
    try {
      const queueData = queue.map(q => ({
        name: q.file.name,
        size: q.file.size,
        type: q.file.type,
        path: q.path
      }));
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queueData));
    } catch (e) {
      console.error('Failed to persist queue:', e);
    }
  }

  function persistFormState() {
    try {
      const formState = {
        category: catEl.value,
        slot: slotSel.value,
        title: titleEl.value
      };
      localStorage.setItem(FORM_STATE_KEY, JSON.stringify(formState));
    } catch (e) {
      console.error('Failed to persist form state:', e);
    }
  }

  function clearPersistedData() {
    try {
      localStorage.removeItem(QUEUE_STORAGE_KEY);
      localStorage.removeItem(FORM_STATE_KEY);
    } catch (e) {
      console.error('Failed to clear persisted data:', e);
    }
  }

  function restoreFormState() {
    try {
      const stored = localStorage.getItem(FORM_STATE_KEY);
      if (!stored) return false;
      
      const formState = JSON.parse(stored);
      if (formState.category) catEl.value = formState.category;
      renderSlots(); // Update slots based on category
      if (formState.slot) slotSel.value = formState.slot;
      if (formState.title) titleEl.value = formState.title;
      updateSlotWarningAndTitle();
      
      log('ℹ Restored previous form state from draft');
      return true;
    } catch (e) {
      console.error('Failed to restore form state:', e);
      return false;
    }
  }

  function promptQueueRestore() {
    try {
      const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (!stored) return;
      
      const queueData = JSON.parse(stored);
      if (!queueData || queueData.length === 0) return;
      
      const totalSize = queueData.reduce((sum, item) => sum + (item.size || 0), 0);
      const msg = `Found ${queueData.length} file(s) (${fmtBytes(totalSize)}) from previous session.\n\nRestore this queue?`;
      
      if (confirm(msg)) {
        log('ℹ Previous upload queue found. File selection cannot be restored (browser limitation).');
        log('ℹ Please re-select the same files to continue your upload.');
        log('');
        log('Previously queued files:');
        queueData.forEach((item, idx) => {
          log(`  ${idx + 1}. ${item.path} (${fmtBytes(item.size)})`);
        });
        log('');
        restoreFormState();
      } else {
        clearPersistedData();
      }
    } catch (e) {
      console.error('Failed to restore queue:', e);
    }
  }

  async function loadUnits(){
    try{
      const r = await fetch('/assets/data/units.json', { cache:'no-store' });
      if (r.ok) {
        const j = await r.json();
        units = Array.isArray(j.units) ? j.units : [];
        return;
      }
    }catch(e){ log('Failed to load units.json:', e?.message||String(e)); }
    units = [];
  }
  async function loadState(){
    try{
      const r = await fetch('/assets/data/site-state.json', { cache:'no-store' });
      if (r.ok) { siteState = await r.json(); return; }
    }catch(e){ log('Failed to load site-state.json:', e?.message||String(e)); }
    siteState = { version:'v1', updated:'', categories:{} };
  }

  function renderCategories(){
    catEl.innerHTML = '';
    for (const u of units){
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = `${u.title} (${u.slots})`;
      catEl.appendChild(opt);
    }
    if (!units.length){
      const opt = document.createElement('option');
      opt.value = ''; opt.textContent = 'No units found (check /assets/data/units.json)';
      catEl.appendChild(opt);
    }
  }

  function firstOpenSlot(titles=[], total=1){
    for (let i=0;i<total;i++){ if (!String(titles[i]||'').trim()) return i+1; }
    return 1;
  }

  function renderSlots(){
    const id = catEl.value;
    const unit = units.find(u => u.id === id);
    const total = Number(unit?.slots || 0);

    const titles = (siteState && siteState.categories && siteState.categories[id] && siteState.categories[id].titles) || [];
    ensureArraySize(titles, total);

    const prev = Number(slotSel.value) || 0;
    slotSel.innerHTML = '';
    for (let i=1;i<=total;i++){
      const t = (titles[i-1]||'').trim();
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = t ? `${num(i)} — ${t}` : `${num(i)} — Open`;
      slotSel.appendChild(opt);
    }
    let def = prev>=1 && prev<=total ? prev : firstOpenSlot(titles, total);
    slotSel.value = String(def);
    updateSlotWarningAndTitle();
  }

  function updateSlotWarningAndTitle(){
    const id = catEl.value;
    const s = Number(slotSel.value)||1;
    const titles = (siteState && siteState.categories && siteState.categories[id] && siteState.categories[id].titles) || [];
    const existing = (titles[s-1]||'').trim();
    if (existing) {
      slotWarn.style.display = '';
      slotWarn.textContent = `Note: Slot ${num(s)} is already used (“${existing}”). Uploading will replace its files and title.`;
      deleteBtn.disabled = false;
      if (!(titleEl.value||'').trim()) titleEl.value = existing;
    } else {
      slotWarn.style.display = 'none';
      deleteBtn.disabled = true;
    }
  }

  catEl.addEventListener('change', () => {
    renderSlots();
    persistFormState();
  });
  slotSel.addEventListener('change', () => {
    updateSlotWarningAndTitle();
    persistFormState();
  });
  titleEl.addEventListener('input', () => {
    persistFormState();
  });

  function addFiles(fileList){
    for (const f of fileList) {
      if (String(f.name||'').startsWith('.')) continue; // skip hidden files like .DS_Store
      let path = f.webkitRelativePath || f.name;
      if (path.includes('/')) {
        const parts = path.split('/');
        // Drop top directory if a folder was selected
        path = parts.slice(1).join('/') || parts[parts.length-1];
      }
      queue.push({ file:f, path });
    }
    renderList();
    persistQueue();
    persistFormState();
  }
  function renderList(){
    if (!queue.length) { listEl.textContent = '(no files selected)'; return; }
    const items = queue.map(q => `• ${q.path} (${fmtBytes(q.file.size)})`).join('\n');
    listEl.textContent = items;
  }

  filesEl.addEventListener('change', (e)=> addFiles(e.target.files||[]));
  folderEl.addEventListener('change', (e)=> addFiles(e.target.files||[]));

  ['dragenter','dragover'].forEach(ev => dropEl.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dropEl.classList.add('drag'); }));
  ['dragleave','drop'].forEach(ev => dropEl.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dropEl.classList.remove('drag'); }));
  dropEl.addEventListener('drop', e => { const dt = e.dataTransfer; if (dt && dt.files) addFiles(dt.files); });

  // Robust base64 for large files: FileReader + DataURL, then strip prefix
  async function toBase64(f){
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => {
        try{
          const s = String(r.result||''); const i = s.indexOf('base64,'); res(i>=0 ? s.slice(i+7) : s);
        }catch(e){ rej(e); }
      };
      r.onerror = () => rej(r.error||new Error('read error'));
      r.readAsDataURL(f);
    });
  }
  function estimateB64Size(bytes){ return Math.ceil(bytes * 4 / 3); }

  async function uploadBatchWithRetry(payload, batchNum, totalBatches, retryCount = 0) {
    const maxRetries = 1; // One retry on session expiry
    
    try {
      const res = await fetch('/.netlify/functions/incremental-deploy', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });

      let data = null;
      let text = '';
      
      try {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          data = await res.json();
          text = JSON.stringify(data);
        } else {
          text = await res.text();
        }
      } catch {
        text = await res.text().catch(() => '');
      }

      log(`Batch ${batchNum}/${totalBatches} -> ${res.status} ${text.slice(0, 200)}`);

      if (res.status === 401) {
        // Check if it's a structured error with SESSION_EXPIRED code
        if (data && data.code === 'SESSION_EXPIRED' && data.retryable && retryCount < maxRetries) {
          log('Session expired, attempting to refresh and retry...');
          
          const refreshed = await refreshSession();
          if (refreshed) {
            log('Session refreshed successfully, retrying batch...');
            return await uploadBatchWithRetry(payload, batchNum, totalBatches, retryCount + 1);
          } else {
            log('Session refresh failed');
            alert('Session expired and refresh failed. Please sign in again.');
            persistQueue();
            persistFormState();
            location.replace('/admin-login');
            return { success: false };
          }
        } else {
          // Non-retryable 401 or retry limit reached
          alert('Session expired. Please sign in again.');
          persistQueue();
          persistFormState();
          location.replace('/admin-login');
          return { success: false };
        }
      }

      if (!res.ok) {
        alert(`Upload failed: ${res.status}\n${text.slice(0, 400)}`);
        return { success: false };
      }

      return { success: true, data };
    } catch (e) {
      log('Upload error:', e?.message || String(e));
      alert('Upload error: ' + (e?.message || String(e)));
      return { success: false };
    }
  }

  uploadBtn.addEventListener('click', async () => {
    try{
      const category = catEl.value;
      const unit = units.find(u => u.id === category);
      if (!unit) { alert('Choose a category'); return; }
      const slot = Number(slotSel.value);
      const title = (titleEl.value||'').trim();
      const total = Number(unit.slots||0);
      if (!category || !slot || slot<1 || slot>total) { alert('Please choose a valid category and slot'); return; }
      if (!title) { alert('Please enter a title'); return; }
      if (!queue.length) { alert('Please add at least one file'); return; }

      // Pre-flight session check
      log('Checking session before upload...');
      const sessionOk = await touchSession();
      if (!sessionOk) {
        alert('Session check failed. Please refresh the page and try again.');
        return;
      }

      // Calculate estimated encoding time
      let totalBytes = 0;
      for (const q of queue) totalBytes += q.file.size;
      const estimatedEncodingSeconds = Math.ceil(totalBytes / (1024 * 1024 * 2)); // ~2MB/sec estimate
      
      log(`Estimated encoding time: ${estimatedEncodingSeconds}s`);
      log(`Session TTL: ${sessionInfo.expiresIn}s`);

      // Proactive refresh if TTL is too low
      if (sessionInfo.expiresIn < (estimatedEncodingSeconds + SESSION_SAFETY_BUFFER_SECONDS)) {
        log('Session TTL too low for estimated work, refreshing...');
        const refreshed = await refreshSession();
        if (!refreshed) {
          alert('Failed to refresh session. Please log in again.');
          location.replace('/admin-login');
          return;
        }
      }

      log('Preparing files…');
      const encoded = [];
      let doneBytes = 0;
      for (const q of queue) {
        const b64 = await toBase64(q.file);
        const encSize = estimateB64Size(q.file.size);
        doneBytes += q.file.size;
        encoded.push({ path: q.path, base64: b64, encSize });
        log(`Encoded ${q.path} (${fmtBytes(q.file.size)})  [${fmtBytes(doneBytes)}/${fmtBytes(totalBytes)}]`);
      }

      // Create batches under target size
      const batches = [];
      let cur = [], curSize = 0;
      for (const e of encoded) {
        if (curSize + e.encSize > BATCH_TARGET && cur.length) { batches.push(cur); cur=[]; curSize=0; }
        cur.push({ path:e.path, base64:e.base64 });
        curSize += e.encSize;
      }
      if (cur.length) batches.push(cur);

      log(`Uploading in ${batches.length} batch(es)…`);
      
      for (let i=0;i<batches.length;i++){
        const files = batches[i];
        const isFinal = (i === batches.length - 1);
        
        const uploadResult = await uploadBatchWithRetry({
          category, slot, title, files, final: isFinal
        }, i + 1, batches.length);
        
        if (!uploadResult.success) {
          // Upload failed after retries
          return;
        }
        
        // Update session info from response
        if (uploadResult.data && uploadResult.data.sessionRemainingSeconds) {
          sessionInfo.expiresIn = uploadResult.data.sessionRemainingSeconds;
          updateSessionDisplay();
        }
      }

      // Verify upload: fetch updated state and confirm the slot link was written
      log('Verifying upload…');
      try {
        await new Promise(r => setTimeout(r, 2000)); // Wait 2s for Netlify to deploy
        const verifyRes = await fetch('/assets/data/site-state.json?t=' + Date.now(), { cache: 'no-store' });
        if (verifyRes.ok) {
          const verifyState = await verifyRes.json();
          const slotLink = verifyState?.categories?.[category]?.links?.[slot - 1] || '';
          const slotTitle = verifyState?.categories?.[category]?.titles?.[slot - 1] || '';
          
          if (slotLink && slotTitle) {
            log(`✓ Verification SUCCESS: Slot ${num(slot)} is live!`);
            log(`  Title: "${slotTitle}"`);
            log(`  Link: ${slotLink}`);
            siteState = verifyState; // Update local cache
            
            // Clear persisted data on successful completion
            clearPersistedData();
          } else {
            log(`⚠ Verification WARNING: Slot ${num(slot)} link or title is missing in site-state.json`);
            log(`  Title: "${slotTitle || '(empty)'}"`);
            log(`  Link: ${slotLink || '(empty)'}`);
            log(`  This may resolve after the next Netlify deployment. Try reloading the hub page in 1-2 minutes.`);
            alert('Upload completed but verification shows slot may not be live yet.\nCheck the log below for details.\nThe slot should appear after the next deployment (~1-2 min).');
          }
        } else {
          log('⚠ Verification WARNING: Could not fetch site-state.json for verification (status ' + verifyRes.status + ')');
          log('  Upload succeeded but verification failed. The slot should still be live after deployment.');
        }
      } catch (verifyErr) {
        log('⚠ Verification ERROR:', verifyErr?.message || String(verifyErr));
        log('  Upload succeeded but verification failed. The slot should still be live after deployment.');
      }

      // Update local titles to reflect the change
      if (siteState?.categories?.[category]?.titles) {
        const titles = siteState.categories[category].titles;
        while (titles.length < total) titles.push('');
        titles[slot-1] = title;
      }
      if (siteState?.categories?.[category]?.links) {
        const links = siteState.categories[category].links;
        while (links.length < total) links.push('');
        links[slot-1] = `/${unit.baseOut}/presentation-${num(slot)}/`;
      }
      renderSlots();
      alert('Upload complete - see verification log below');
    }catch(e){
      console.error(e);
      log('Error:', e && e.message ? e.message : String(e));
      alert('Error: ' + (e && e.message ? e.message : String(e)));
    }
  });

  deleteBtn.addEventListener('click', async () => {
    const category = catEl.value;
    const slot = Number(slotSel.value);
    if (!category || !slot) return;
    if (!confirm(`Delete all files and the title for slot ${num(slot)}? This cannot be undone.`)) return;

    try{
      log('Deleting…');
      const res = await fetch('/.netlify/functions/incremental-deploy', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'same-origin',
        body: JSON.stringify({ action:'delete', category, slot })
      });
      
      let text = '';
      try {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          text = JSON.stringify(data);
        } else {
          text = await res.text();
        }
      } catch {
        text = await res.text().catch(() => '');
      }
      
      log(`Delete response ${res.status} -> ${text}`);
      
      if (res.status === 401) { 
        alert('Session expired. Please sign in again.'); 
        persistFormState();
        location.replace('/admin-login'); 
        return; 
      }
      if (!res.ok) { alert(`Delete failed: ${res.status}\n${(text||'').slice(0,400)}`); return; }

      if (siteState?.categories?.[category]) {
        const titles = siteState.categories[category].titles || [];
        const links  = siteState.categories[category].links  || [];
        titles[slot-1] = ''; links[slot-1] = '';
      }
      renderSlots();
      alert('Slot deleted');
    }catch(e){
      console.error(e);
      log('Error:', e && e.message ? e.message : String(e));
      alert('Error: ' + (e && e.message ? e.message : String(e)));
    }
  });

  // Audit Life Skills functionality
  const auditBtn = document.getElementById('auditBtn');
  auditBtn.addEventListener('click', async () => {
    try {
      log('=== Starting Life Skills Audit ===');
      
      // Find Life Skills unit
      const lifeUnit = units.find(u => u.id === 'life');
      if (!lifeUnit) {
        log('ERROR: Life Skills unit not found in units.json');
        alert('Life Skills unit not found');
        return;
      }

      log(`Auditing Life Skills (${lifeUnit.slots} slots)...`);
      
      // Reload fresh state
      await loadState();
      const lifeCat = siteState?.categories?.life || { titles: [], links: [] };
      const titles = lifeCat.titles || [];
      const links = lifeCat.links || [];
      
      ensureArraySize(titles, lifeUnit.slots);
      ensureArraySize(links, lifeUnit.slots);
      
      let issuesFound = 0;
      
      for (let i = 1; i <= lifeUnit.slots; i++) {
        const slotNum = num(i);
        const title = (titles[i - 1] || '').trim();
        const link = (links[i - 1] || '').trim();
        const expectedPath = `/life-skills/presentations/presentation-${slotNum}/`;
        
        // Check if directory exists via HEAD request
        let dirExists = false;
        try {
          const headRes = await fetch(expectedPath, { method: 'HEAD', cache: 'no-store' });
          dirExists = headRes.ok;
        } catch {
          dirExists = false;
        }
        
        // Log slot status
        if (!title && !link && !dirExists) {
          // Empty slot - normal
          log(`Slot ${slotNum}: Empty (no title, no link, no directory) ✓`);
        } else if (title && link && dirExists) {
          // Complete slot - ideal
          log(`Slot ${slotNum}: "${title}" → ${link} ✓`);
        } else {
          // Mismatch detected
          issuesFound++;
          log(`⚠ Slot ${slotNum}: MISMATCH detected!`);
          log(`  Title: ${title || '(empty)'}`);
          log(`  Link: ${link || '(empty)'}`);
          log(`  Directory exists: ${dirExists ? 'YES' : 'NO'}`);
          
          if (title && !link) {
            log(`  → Issue: Has title but no link`);
          }
          if (link && !title) {
            log(`  → Issue: Has link but no title`);
          }
          if (dirExists && !link) {
            log(`  → Issue: Directory exists but no link in state`);
          }
          if (link && !dirExists) {
            log(`  → Issue: Link in state but directory doesn't exist`);
          }
        }
      }
      
      log('');
      if (issuesFound === 0) {
        log('=== Audit Complete: No issues found ✓ ===');
        alert('Audit complete! No issues found. Check log for details.');
      } else {
        log(`=== Audit Complete: ${issuesFound} issue(s) found ===`);
        alert(`Audit found ${issuesFound} issue(s). Check log for details.`);
      }
    } catch (e) {
      console.error(e);
      log('Audit error:', e?.message || String(e));
      alert('Audit error: ' + (e?.message || String(e)));
    }
  });

  (async()=>{
    await loadUnits();
    await loadState();
    renderCategories();
    renderSlots();
    renderList();

    // Initialize session management
    log('Initializing session management...');
    await touchSession();
    
    // Set up periodic session touch
    sessionTouchTimer = setInterval(async () => {
      await touchSession();
    }, SESSION_TOUCH_INTERVAL_MS);

    // Check for and offer to restore previous queue
    promptQueueRestore();

    // Quick function diagnostics
    try{
      const r=await fetch('/.netlify/functions/incremental-deploy?action=diagnostics',{cache:'no-store', credentials:'same-origin'});
      const t=await r.text().catch(()=> ''); log('GET diagnostics ->', r.status, t.slice(0, 300));
    }catch(e){ log('Diagnostics failed', e?.message||String(e)); }
  })();
})();
