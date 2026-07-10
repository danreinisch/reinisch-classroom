(function(){
  // Batch target ~3.5 MB (base64 expands ~33% so we use estimated encoded sizes)
  const BATCH_TARGET = 3.5 * 1024 * 1024;
  
  // Session management constants
  const QUEUE_STORAGE_KEY = 'adminUploadQueueDraft';
  const FORM_STATE_KEY = 'adminFormStateDraft';
  
  // Error message display constants
  const MAX_ERROR_MESSAGE_LENGTH = 400;

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
  let sessionTouchTimer = null; // eslint-disable-line no-unused-vars -- Used by setInterval, cleared on unload
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

  async function promptQueueRestore() {
    try {
      const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (!stored) return;
      
      const queueData = JSON.parse(stored);
      if (!queueData || queueData.length === 0) return;
      
      const totalSize = queueData.reduce((sum, item) => sum + (item.size || 0), 0);
      const msg = `Found ${queueData.length} file(s) (${fmtBytes(totalSize)}) from previous session.\n\nRestore this queue?`;
      
      if (await rcConfirm('Confirm Action', msg)) {
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

          log('Auth missing/expired; redirecting to /hub for SSO re-auth...');

          persistQueue();

          persistFormState();

          window.location.assign('/hub/?reason=tc_session_expired&next=%2Fadmin%2F');

          return;

        } else {

          // Non-retryable 401 or retry limit reached
          persistQueue();
          persistFormState();
          window.location.assign('/hub/?reason=tc_session_expired&next=%2Fadmin%2F');
          return { success: false };
        }
      }

      if (!res.ok) {
        const errorMsg = `Upload failed with status ${res.status}:\n\n${(text||'').slice(0, MAX_ERROR_MESSAGE_LENGTH)}`;
        console.error('[Incremental Deploy] Upload error:', { status: res.status, body: text });
        log(`ERROR: ${errorMsg}`);
        await rcAlert('Error', errorMsg);
        return { success: false };
      }

      return { success: true, data };
    } catch (e) {
      const errorMsg = `Upload error: ${e?.message || String(e)}`;
      console.error('[Incremental Deploy] Upload exception:', e);
      log(`ERROR: ${errorMsg}`);
      await rcAlert('Error', errorMsg);
      return { success: false };
    }
  }

  uploadBtn.addEventListener('click', async () => {
    try{
      const category = catEl.value;
      const unit = units.find(u => u.id === category);
      if (!unit) { await rcAlert('Validation', 'Choose a category'); return; }
      const slot = Number(slotSel.value);
      const title = (titleEl.value||'').trim();
      const total = Number(unit.slots||0);
      if (!category || !slot || slot<1 || slot>total) { await rcAlert('Validation', 'Please choose a valid category and slot'); return; }
      if (!title) { await rcAlert('Validation', 'Please enter a title'); return; }
      if (!queue.length) { await rcAlert('Validation', 'Please add at least one file'); return; }

      // SSO-only: skip legacy admin session preflight/refresh.

            let totalBytes = 0;

            for (const q of queue) totalBytes += q.file.size;

      

      

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

      // Verify upload: fetch updated state with retry and dual-path fallback
      log('Verifying upload with retry…');
      
      const MAX_RETRIES = 6;
      const RETRY_DELAYS = [3000, 5000, 8000, 10000, 15000, 20000]; // Total 61 seconds
      let verifySuccess = false;
      let lastError = null;
      let verifyState = null;
      
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          // Wait before attempting (except first attempt)
          if (attempt > 0) {
            const delayIndex = Math.min(attempt - 1, RETRY_DELAYS.length - 1);
            const delay = RETRY_DELAYS[delayIndex];
            log(`  Waiting ${delay / 1000}s before attempt ${attempt + 1}/${MAX_RETRIES}…`);
            await new Promise(r => setTimeout(r, delay));
          } else {
            // Initial delay for Netlify to start deploying
            await new Promise(r => setTimeout(r, 3000));
          }
          
          log(`Verification attempt ${attempt + 1}/${MAX_RETRIES}…`);
          
          // Try root path first
          const paths = [
            '/assets/data/site-state.json'
          ];
          
          let fetchSuccess = false;
          for (const path of paths) {
            try {
              const verifyRes = await fetch(path + '?t=' + Date.now(), { cache: 'no-store' });
              if (verifyRes.ok) {
                verifyState = await verifyRes.json();
                log(`  ✓ Fetched from ${path}`);
                fetchSuccess = true;
                break;
              }
            } catch (pathErr) {
              // Continue to next path
            }
          }
          
          if (!fetchSuccess) {
            lastError = 'Could not fetch site-state.json from any path';
            log(`  ⚠ ${lastError}`);
            continue;
          }
          
          // Check if slot data is present
          const slotLink = verifyState?.categories?.[category]?.links?.[slot - 1] || '';
          const slotTitle = verifyState?.categories?.[category]?.titles?.[slot - 1] || '';
          
          if (slotLink && slotTitle) {
            log(`✓ Verification SUCCESS: Slot ${num(slot)} is live!`);
            log(`  Title: "${slotTitle}"`);
            log(`  Link: ${slotLink}`);
            siteState = verifyState; // Update local cache
            verifySuccess = true;
            
            // Clear persisted data on successful completion
            clearPersistedData();
            break;
          } else {
            lastError = 'Slot link or title missing in site-state.json';
            log(`  ⚠ ${lastError} (may still be deploying)`);
            log(`    Title: "${slotTitle || '(empty)'}"`);
            log(`    Link: ${slotLink || '(empty)'}`);
          }
        } catch (verifyErr) {
          lastError = verifyErr?.message || String(verifyErr);
          log(`  ⚠ Attempt ${attempt + 1} error: ${lastError}`);
        }
      }
      
      // Final result
      if (verifySuccess) {
        await rcAlert('Upload Complete', '✓ Upload and verification complete!\nYour content is live. See log for details.');
      } else {
        log('');
        log('⚠ Verification did not confirm deployment after retries.');
        log(`  Last error: ${lastError || 'unknown'}`);
        log('  Your upload succeeded, but the deployment may still be in progress.');
        log('  Check the hub page in 1-2 minutes, or check Netlify deploy status.');
        await rcAlert('Upload Complete', 'Upload completed successfully.\n\nVerification could not confirm deployment yet - this is normal if Netlify is still processing.\n\nCheck the hub page in 1-2 minutes to confirm your content is live.');
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
      await rcAlert('Upload Complete', 'Upload complete - see verification log below');
    }catch(e){
      console.error(e);
      log('Error:', e && e.message ? e.message : String(e));
      await rcAlert('Error', 'Error: ' + (e && e.message ? e.message : String(e)));
    }
  });

  deleteBtn.addEventListener('click', async () => {
    const category = catEl.value;
    const slot = Number(slotSel.value);
    if (!category || !slot) return;
    if (!await rcConfirm('Delete Slot', `Delete all files and the title for slot ${num(slot)}? This cannot be undone.`, 'Delete', { danger: true })) return;

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
        window.location.assign('/hub/?reason=tc_session_expired&next=%2Fadmin%2F');
        persistFormState();
        location.replace('/hub/?entry=teacher'); 
        return; 
      }
      
      if (!res.ok) {
        const errorMsg = `Delete failed with status ${res.status}:\n\n${(text||'').slice(0, MAX_ERROR_MESSAGE_LENGTH)}`;
        console.error('[Incremental Deploy] Delete error:', { status: res.status, body: text });
        log(`ERROR: ${errorMsg}`);
        await rcAlert('Error', errorMsg);
        return;
      }

      if (siteState?.categories?.[category]) {
        const titles = siteState.categories[category].titles || [];
        const links  = siteState.categories[category].links  || [];
        titles[slot-1] = ''; links[slot-1] = '';
      }
      renderSlots();
      await rcAlert('Slot Deleted', 'Slot deleted');
    }catch(e){
      const errorMsg = `Delete error: ${e && e.message ? e.message : String(e)}`;
      console.error('[Incremental Deploy] Delete exception:', e);
      log(`ERROR: ${errorMsg}`);
      await rcAlert('Error', errorMsg);
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
        await rcAlert('Error', 'Life Skills unit not found');
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
        await rcAlert('Audit Complete', 'Audit complete! No issues found. Check log for details.');
      } else {
        log(`=== Audit Complete: ${issuesFound} issue(s) found ===`);
        await rcAlert('Audit Complete', `Audit found ${issuesFound} issue(s). Check log for details.`);
      }
    } catch (e) {
      console.error(e);
      log('Audit error:', e?.message || String(e));
      await rcAlert('Audit Error', 'Audit error: ' + (e?.message || String(e)));
    }
  });

  (async()=>{
    await loadUnits();
    await loadState();
    renderCategories();
    renderSlots();
    renderList();

    // Initialize session management
    log('Skipping legacy admin session management (SSO-only).');

    // Check for and offer to restore previous queue
    promptQueueRestore();

    // Quick function diagnostics
    try{
      const r=await fetch('/.netlify/functions/incremental-deploy?action=diagnostics',{cache:'no-store', credentials:'same-origin'});
      const t=await r.text().catch(()=> ''); log('GET diagnostics ->', r.status, t.slice(0, 300));
    }catch(e){ log('Diagnostics failed', e?.message||String(e)); }
  })();
})();

/* initUnitScaffolderHelper__v1
 * Admin helper: generate copy/paste terminal commands to scaffold a new Language Arts unit
 * and regenerate lessons-index.json. This does NOT attempt to write to GitHub from the browser.
 */
(function () {
  function shellQuoteBash(s) {
    // Wrap in single quotes; escape internal single quotes safely for bash/zsh.
    // abc'def -> 'abc'"'"'def'
    const str = String(s || '').trim();
    if (!str) return "''";
    return "'" + str.replace(/'/g, "'\"'\"'") + "'";
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      // Fallback
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return !!ok;
      } catch (_) {
        return false;
      }
    }
  }

  function buildCommands(title, withPresentation) {
    const q = shellQuoteBash(title);
    const scaffold = withPresentation
      ? `node scripts/new-lesson-unit.mjs ${q} --with-presentation`
      : `node scripts/new-lesson-unit.mjs ${q}`;

    const gen = `node scripts/generate-lessons-index.mjs`;
    const full = [
      `cd ~/reinisch-classroom || exit 1`,
      scaffold,
      gen,
      `git status`
    ].join('\n');

    return { scaffold, gen, full };
  }

  function setPreview(el, text) {
    if (!el) return;
    el.textContent = text || '';
  }

  document.addEventListener('DOMContentLoaded', () => {
    const card = document.getElementById('unitScaffolderCard');
    if (!card) return;

    const input = document.getElementById('newUnitTitle');
    const preview = document.getElementById('unitCmdPreview');

    const btnWith = document.getElementById('copyNewUnitCmd');
    const btnNo = document.getElementById('copyNewUnitCmdNoPres');
    const btnGen = document.getElementById('copyGenerateIndexCmd');
    const btnFull = document.getElementById('copyFullWorkflowCmd');

    const clipboardSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>';

    function currentTitle() {
      return (input && input.value ? input.value : '').trim();
    }

    // Don’t use True (pythonism) — just show something useful
    function previewFull(title) {
      const t = title || '<<enter a unit title>>';
      const cmds = buildCommands(t, true);
      setPreview(preview, cmds.full);
    }

    if (input) {
      input.addEventListener('input', () => previewFull(currentTitle()));
      previewFull(currentTitle());
    } else {
      previewFull('');
    }

    if (btnWith) btnWith.addEventListener('click', async () => {
      const t = currentTitle();
      const cmds = buildCommands(t, true);
      const ok = await copyToClipboard(cmds.scaffold);
      previewFull(t);
      if (ok) btnWith.textContent = 'Copied ✅';
      setTimeout(() => { btnWith.innerHTML = clipboardSvg + ' Copy: scaffold category + Presentation 1'; }, 900);
    });

    if (btnNo) btnNo.addEventListener('click', async () => {
      const t = currentTitle();
      const cmds = buildCommands(t, false);
      const ok = await copyToClipboard(cmds.scaffold);
      previewFull(t);
      if (ok) btnNo.textContent = 'Copied ✅';
      setTimeout(() => { btnNo.innerHTML = clipboardSvg + ' Copy: scaffold category only'; }, 900);
    });

    if (btnGen) btnGen.addEventListener('click', async () => {
      const cmds = buildCommands('x', true);
      const ok = await copyToClipboard(cmds.gen);
      if (ok) btnGen.textContent = 'Copied ✅';
      setTimeout(() => { btnGen.innerHTML = clipboardSvg + ' Copy: regenerate Lessons index'; }, 900);
    });

    if (btnFull) btnFull.addEventListener('click', async () => {
      const t = currentTitle();
      const cmds = buildCommands(t, true);
      const ok = await copyToClipboard(cmds.full);
      previewFull(t);
      if (ok) btnFull.textContent = 'Copied ✅';
      setTimeout(() => { btnFull.innerHTML = clipboardSvg + ' Copy: full workflow'; }, 900);
    });
  });
})();

/* initUnitCategoryManager__v1
 * Admin UI: Create/Update categories by calling /.netlify/functions/admin-units-upsert


 */

async function showPRResult(pr){
  if(!pr || !pr.url) return;
  const msg = (pr.existing ? "Draft updated. PR already open:" : "Draft saved. PR created:")
    + "\n" + pr.url + "\n\nOpen PR now?";
  try { navigator.clipboard && navigator.clipboard.writeText(pr.url); } catch (e) { /* ignore */ }
  if (await rcConfirm('Confirm Action', msg)) window.open(pr.url, "_blank", "noopener");
}


(function () {
  let knownUnits = [];

  function slugify(s) {
    return String(s || '')
      .toLowerCase()
      .trim()
      .replace(/&/g, 'and')
      .replace(/['"]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function qs(id) {
    return document.getElementById(id);
  }

  function value(id, fallback = '') {
    return String(qs(id)?.value || fallback).trim();
  }

  function setStatus(msg) {
    const el = qs('unitMgrStatus');
    if (el) el.textContent = msg || '';
  }

  function languageArtsCollections() {
    return knownUnits
      .filter((unit) =>
        unit &&
        unit.section === 'language-arts' &&
        unit.id !== 'toolkit'
      )
      .sort((a, b) => {
        const aOrder = Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : 0;
        const bOrder = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 0;

        if (aOrder !== bOrder) return aOrder - bOrder;

        return String(a.title || '').localeCompare(String(b.title || ''));
      });
  }

  function nextLanguageArtsSortOrder() {
    const orders = languageArtsCollections()
      .map((unit) => Number(unit.sortOrder))
      .filter(Number.isFinite);

    return orders.length ? Math.max(...orders) + 10 : 10;
  }

  function selectedExistingUnit() {
    const id = value('unitMgrExisting');
    return knownUnits.find((unit) => unit && unit.id === id) || null;
  }

  function buildPayload() {
    const existing = selectedExistingUnit();
    const title = value('unitMgrTitle');
    const id = value('unitMgrId');
    const section = value('unitMgrSection', 'language-arts');
    const slots = Number(value('unitMgrSlots', '16'));
    const kind = value('unitMgrKind', 'collection');
    const description = value('unitMgrDescription');
    const status = value('unitMgrStatusField', 'active');
    const sortOrder = Number(value('unitMgrSortOrder', '0'));

    let baseOut = value('unitMgrBaseOut');
    let pagePath = value('unitMgrPagePath');

    if (section === 'language-arts' && !existing) {
      if (!baseOut && id) baseOut = `presentations/${id}`;
      if (!pagePath) pagePath = '/language-arts/collection/';
    }

    return {
      id,
      title,
      kind,
      description,
      status,
      sortOrder,
      section,
      slots,
      baseOut,
      pagePath,
    };
  }

  function renderPreview(payload) {
    const pre = qs('unitMgrPreview');
    if (!pre) return;

    pre.textContent = JSON.stringify(payload, null, 2);
  }

  function validateClient(payload) {
    if (!payload.title) return 'Title is required';
    if (!/^[a-z0-9][a-z0-9_-]{1,31}$/.test(payload.id)) {
      return 'Invalid Collection ID (use lowercase a–z, 0–9, - or _)';
    }
    if (!['book', 'unit', 'theme', 'text-set', 'collection'].includes(payload.kind)) {
      return 'Invalid collection type';
    }
    if (payload.description.length > 500) {
      return 'Description must be 500 characters or fewer';
    }
    if (!['active', 'archived'].includes(payload.status)) {
      return 'Invalid collection status';
    }
    if (!Number.isFinite(payload.sortOrder)) {
      return 'Display order must be a number';
    }
    if (payload.section !== 'language-arts') {
      return 'Curriculum Collection Manager is currently scoped to Language Arts.';
    }
    if (!Number.isFinite(payload.slots) || payload.slots < 1 || payload.slots > 64) {
      return 'Slots must be 1–64';
    }
    if (!payload.baseOut || payload.baseOut.startsWith('/') || payload.baseOut.includes('..')) {
      return 'Presentation folder must be a relative path without ".."';
    }
    if (!payload.pagePath.startsWith('/') || !payload.pagePath.endsWith('/')) {
      return 'Collection route must start and end with "/"';
    }

    return '';
  }

  function populateCollectionSelect() {
    const select = qs('unitMgrExisting');
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = '';

    const newOption = document.createElement('option');
    newOption.value = '';
    newOption.textContent = 'Create a new collection';
    select.appendChild(newOption);

    languageArtsCollections().forEach((unit) => {
      const option = document.createElement('option');
      option.value = unit.id;
      option.textContent =
        `${unit.title || unit.id} — ${unit.status || 'active'}`;
      select.appendChild(option);
    });

    if ([...select.options].some((option) => option.value === currentValue)) {
      select.value = currentValue;
    }
  }

  function resetNewCollection() {
    const select = qs('unitMgrExisting');
    if (select) select.value = '';

    if (qs('unitMgrTitle')) qs('unitMgrTitle').value = '';
    if (qs('unitMgrId')) qs('unitMgrId').value = '';
    if (qs('unitMgrKind')) qs('unitMgrKind').value = 'book';
    if (qs('unitMgrDescription')) qs('unitMgrDescription').value = '';
    if (qs('unitMgrStatusField')) qs('unitMgrStatusField').value = 'active';
    if (qs('unitMgrSortOrder')) {
      qs('unitMgrSortOrder').value = String(nextLanguageArtsSortOrder());
    }
    if (qs('unitMgrSection')) qs('unitMgrSection').value = 'language-arts';
    if (qs('unitMgrSlots')) qs('unitMgrSlots').value = '16';
    if (qs('unitMgrBaseOut')) qs('unitMgrBaseOut').value = '';
    if (qs('unitMgrPagePath')) {
      qs('unitMgrPagePath').value = '/language-arts/collection/';
    }

    setStatus('New Language Arts collection');
    renderPreview(buildPayload());
  }

  function loadSelectedCollection() {
    const unit = selectedExistingUnit();

    if (!unit) {
      resetNewCollection();
      return;
    }

    if (qs('unitMgrTitle')) qs('unitMgrTitle').value = unit.title || '';
    if (qs('unitMgrId')) qs('unitMgrId').value = unit.id || '';
    if (qs('unitMgrKind')) qs('unitMgrKind').value = unit.kind || 'collection';
    if (qs('unitMgrDescription')) qs('unitMgrDescription').value = unit.description || '';
    if (qs('unitMgrStatusField')) qs('unitMgrStatusField').value = unit.status || 'active';
    if (qs('unitMgrSortOrder')) {
      qs('unitMgrSortOrder').value = String(
        Number.isFinite(Number(unit.sortOrder)) ? Number(unit.sortOrder) : 0
      );
    }
    if (qs('unitMgrSection')) qs('unitMgrSection').value = unit.section || 'language-arts';
    if (qs('unitMgrSlots')) qs('unitMgrSlots').value = String(unit.slots || 16);
    if (qs('unitMgrBaseOut')) qs('unitMgrBaseOut').value = unit.baseOut || '';
    if (qs('unitMgrPagePath')) qs('unitMgrPagePath').value = unit.pagePath || '';

    setStatus(`Editing "${unit.title || unit.id}"`);
    renderPreview(buildPayload());
  }

  async function loadKnownCollections() {
    try {
      const response = await fetch('/assets/data/units.json?t=' + Date.now(), {
        cache: 'no-store',
      });

      if (!response.ok) throw new Error(`units.json ${response.status}`);

      const data = await response.json();
      knownUnits = Array.isArray(data.units) ? data.units : [];
      populateCollectionSelect();
      resetNewCollection();
    } catch (error) {
      knownUnits = [];
      console.warn('[Curriculum Collection Manager] Could not load units.json:', error);
      setStatus('Registry unavailable; manual fields remain available.');
      renderPreview(buildPayload());
    }
  }

  async function upsert() {
    const button = qs('btnUnitMgrUpsert');
    const payload = buildPayload();
    renderPreview(payload);

    const err = validateClient(payload);
    if (err) {
      await rcAlert('Collection validation', err);
      return;
    }

    try {
      if (button) button.disabled = true;
      setStatus('Saving draft…');

      const response = await fetch('/.netlify/functions/admin-units-upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ ...payload, createPr: true }),
      });

      const bodyText = await response.text().catch(() => '');
      let data;

      try {
        data = JSON.parse(bodyText);
      } catch {
        data = { ok: false, error: bodyText };
      }

      if (!response.ok || !data.ok) {
        console.error('[Curriculum Collection Manager] Save failed:', {
          status: response.status,
          body: bodyText,
          parsed: data,
        });
        await rcAlert(
          'Collection save failed',
          data.error || bodyText || String(response.status)
        );
        setStatus('Save failed');
        return;
      }

      try {
        showPRResult(data.pr || null);
      } catch (_) {
        // The save itself completed. A blocked pop-up should not make it look failed.
      }

      setStatus('Draft saved');
      await rcAlert(
        'Collection draft saved',
        `Saved "${payload.title}". Commit: ${data.commit}\nDraft PR: ${data.pr?.url || 'not created'}`
      );

      await loadKnownCollections();
    } catch (error) {
      console.error('[Curriculum Collection Manager] Save error:', error);
      await rcAlert(
        'Collection save failed',
        error?.message || String(error)
      );
      setStatus('Save failed');
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function autofill() {
    const title = value('unitMgrTitle');
    if (!title) {
      await rcAlert('Collection setup', 'Enter a collection title first.');
      return;
    }

    const slug = slugify(title);
    const section = value('unitMgrSection', 'language-arts');

    if (qs('unitMgrId') && !value('unitMgrId')) {
      qs('unitMgrId').value = slug.slice(0, 32);
    }

    const id = value('unitMgrId');

    if (qs('unitMgrBaseOut') && !value('unitMgrBaseOut')) {
      qs('unitMgrBaseOut').value =
        section === 'life-skills'
          ? 'life-skills/presentations'
          : `presentations/${id || slug}`;
    }

    if (qs('unitMgrPagePath') && !value('unitMgrPagePath')) {
      qs('unitMgrPagePath').value =
        section === 'life-skills'
          ? '/life-skills/'
          : '/language-arts/collection/';
    }

    if (qs('unitMgrSortOrder') && !value('unitMgrSortOrder')) {
      qs('unitMgrSortOrder').value = String(nextLanguageArtsSortOrder());
    }

    renderPreview(buildPayload());
  }

  document.addEventListener('DOMContentLoaded', () => {
    const card = qs('unitManagerCard');
    if (!card) return;

    qs('btnUnitMgrAutofill')?.addEventListener('click', autofill);
    qs('btnUnitMgrUpsert')?.addEventListener('click', upsert);
    qs('btnUnitMgrNew')?.addEventListener('click', resetNewCollection);
    qs('unitMgrExisting')?.addEventListener('change', loadSelectedCollection);

    [
      'unitMgrTitle',
      'unitMgrId',
      'unitMgrKind',
      'unitMgrDescription',
      'unitMgrStatusField',
      'unitMgrSortOrder',
      'unitMgrSection',
      'unitMgrSlots',
      'unitMgrBaseOut',
      'unitMgrPagePath',
    ].forEach((id) => {
      qs(id)?.addEventListener('input', () => renderPreview(buildPayload()));
      qs(id)?.addEventListener('change', () => renderPreview(buildPayload()));
    });

    loadKnownCollections();
  });
})();

