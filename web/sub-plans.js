// sub-plans.js
// Substitute plan helpers with Supabase and local fallback

import { getSupabase } from './supabase-client.js';

const NS = 'rc_sub_plans_';

/**
 * Local storage helpers for offline fallback
 */
const localStore = {
  get: (k, def) => {
    try {
      return JSON.parse(localStorage.getItem(NS + k)) ?? def;
    } catch {
      return def;
    }
  },
  set: (k, v) => localStorage.setItem(NS + k, JSON.stringify(v))
};

// Simple counter for generating collision-free local IDs
let _localIdCounter = 0;
function localId() {
  return Date.now() * 1000 + (++_localIdCounter % 1000);
}
  const supabase = await getSupabase();
  return supabase && typeof supabase.from === 'function';
}

/**
 * Format date as YYYY-MM-DD
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get today's substitute plan
 * @param {string} date - Optional date (YYYY-MM-DD), defaults to today
 * @returns {Promise<Object|null>} Sub plan or null if not found
 */
export async function getTodaysSubPlan(date = null) {
  const planDate = date || formatDate(new Date());
  
  // Try remote first if available
  if (await isSupabaseAvailable()) {
    const supabase = await getSupabase();
    try {
      const { data, error } = await supabase
        .from('sub_plans')
        .select('*')
        .eq('plan_date', planDate)
        .eq('published', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows found - not an error, just no plan
          console.log('[sub-plans] No published plan found for:', planDate);
          return null;
        }
        console.warn('[sub-plans] Supabase error, falling back to local:', error.message);
        return getLocalSubPlan(planDate);
      }

      console.log('[sub-plans] Remote plan fetched for:', planDate);
      // Cache locally for offline access
      cacheSubPlan(data);
      return data;
    } catch (err) {
      console.warn('[sub-plans] Network error, falling back to local:', err.message);
      return getLocalSubPlan(planDate);
    }
  } else {
    // Supabase not available, use local
    console.log('[sub-plans] Supabase not configured, using local storage');
    return getLocalSubPlan(planDate);
  }
}

/**
 * Get sub plan from local storage
 */
function getLocalSubPlan(planDate) {
  const plans = localStore.get('plans', {});
  return plans[planDate] || null;
}

/**
 * Cache sub plan locally
 */
function cacheSubPlan(plan) {
  if (!plan || !plan.plan_date) return;
  
  const plans = localStore.get('plans', {});
  plans[plan.plan_date] = plan;
  localStore.set('plans', plans);
}

/**
 * Upsert (create or update) a substitute plan
 * @param {Object} plan - Plan object with plan_date, la_lesson, etc.
 * @returns {Promise<Object>} Created/updated plan
 */
export async function upsertSubPlan(plan) {
  if (!plan.plan_date) {
    throw new Error('plan_date is required');
  }

  // Normalize arrays (ensure they're arrays, not comma-separated strings)
  if (plan.la_presentations && typeof plan.la_presentations === 'string') {
    plan.la_presentations = plan.la_presentations
      .split(/[,\n]/)
      .map(s => s.trim())
      .filter(s => s);
  }
  if (plan.life_skills_presentations && typeof plan.life_skills_presentations === 'string') {
    plan.life_skills_presentations = plan.life_skills_presentations
      .split(/[,\n]/)
      .map(s => s.trim())
      .filter(s => s);
  }

  // Try remote first if available
  if (await isSupabaseAvailable()) {
    const supabase = await getSupabase();
    try {
      const { data, error } = await supabase
        .from('sub_plans')
        .upsert({
          plan_date: plan.plan_date,
          la_lesson: plan.la_lesson || null,
          la_book: plan.la_book || null,
          la_presentations: plan.la_presentations || [],
          life_skills_topic: plan.life_skills_topic || null,
          life_skills_presentations: plan.life_skills_presentations || [],
          notes: plan.notes || null,
          published: plan.published || false,
          created_by: plan.created_by || 'teacher',
          plan_mode: plan.plan_mode || 'subject',
          sub_feedback: plan.sub_feedback || null,
          emergency_acknowledged: plan.emergency_acknowledged || false,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'plan_date'
        })
        .select()
        .single();

      if (error) {
        console.warn('[sub-plans] Supabase error, falling back to local:', error.message);
        return upsertLocalSubPlan(plan);
      }

      console.log('[sub-plans] Remote plan saved for:', plan.plan_date);
      // Cache locally
      cacheSubPlan(data);
      return data;
    } catch (err) {
      console.warn('[sub-plans] Network error, falling back to local:', err.message);
      return upsertLocalSubPlan(plan);
    }
  } else {
    // Supabase not available, use local
    console.log('[sub-plans] Supabase not configured, using local storage');
    return upsertLocalSubPlan(plan);
  }
}

/**
 * Upsert sub plan in local storage
 */
function upsertLocalSubPlan(plan) {
  const plans = localStore.get('plans', {});
  
  const existingPlan = plans[plan.plan_date] || {};
  const updatedPlan = {
    ...existingPlan,
    ...plan,
    id: existingPlan.id || localId(),
    updated_at: new Date().toISOString(),
    created_at: existingPlan.created_at || new Date().toISOString()
  };
  
  plans[plan.plan_date] = updatedPlan;
  localStore.set('plans', plans);
  
  return updatedPlan;
}

/**
 * List all substitute plans (for teacher center)
 * @param {Object} filters - Optional filters (published, date_from, date_to)
 * @returns {Promise<Array>} Array of plans
 */
export async function listSubPlans(filters = {}) {
  // Try remote first if available
  if (await isSupabaseAvailable()) {
    const supabase = await getSupabase();
    try {
      let query = supabase.from('sub_plans').select('*');
      
      if (filters.published !== undefined) {
        query = query.eq('published', filters.published);
      }
      if (filters.date_from) {
        query = query.gte('plan_date', filters.date_from);
      }
      if (filters.date_to) {
        query = query.lte('plan_date', filters.date_to);
      }
      
      query = query.order('plan_date', { ascending: false });

      const { data, error } = await query;

      if (error) {
        console.warn('[sub-plans] Supabase error, falling back to local:', error.message);
        return listLocalSubPlans(filters);
      }

      console.log('[sub-plans] Remote plans fetched, count:', data.length);
      return data;
    } catch (err) {
      console.warn('[sub-plans] Network error, falling back to local:', err.message);
      return listLocalSubPlans(filters);
    }
  } else {
    // Supabase not available, use local
    console.log('[sub-plans] Supabase not configured, using local storage');
    return listLocalSubPlans(filters);
  }
}

/**
 * List sub plans from local storage
 */
function listLocalSubPlans(filters = {}) {
  const plans = localStore.get('plans', {});
  let result = Object.values(plans);
  
  // Apply filters
  if (filters.published !== undefined) {
    result = result.filter(p => p.published === filters.published);
  }
  if (filters.date_from) {
    result = result.filter(p => p.plan_date >= filters.date_from);
  }
  if (filters.date_to) {
    result = result.filter(p => p.plan_date <= filters.date_to);
  }
  
  // Sort by date descending
  result.sort((a, b) => b.plan_date.localeCompare(a.plan_date));
  
  return result;
}

/**
 * Delete a substitute plan
 * @param {string} planDate - Date of plan to delete (YYYY-MM-DD)
 * @returns {Promise<boolean>} True if deleted successfully
 */
export async function deleteSubPlan(planDate) {
  // Try remote first if available
  if (await isSupabaseAvailable()) {
    const supabase = await getSupabase();
    try {
      const { error } = await supabase
        .from('sub_plans')
        .delete()
        .eq('plan_date', planDate);

      if (error) {
        console.warn('[sub-plans] Supabase error, falling back to local:', error.message);
        return deleteLocalSubPlan(planDate);
      }

      console.log('[sub-plans] Remote plan deleted for:', planDate);
      // Remove from local cache
      deleteLocalSubPlan(planDate);
      return true;
    } catch (err) {
      console.warn('[sub-plans] Network error, falling back to local:', err.message);
      return deleteLocalSubPlan(planDate);
    }
  } else {
    // Supabase not available, use local
    console.log('[sub-plans] Supabase not configured, using local storage');
    return deleteLocalSubPlan(planDate);
  }
}

/**
 * Delete sub plan from local storage
 */
function deleteLocalSubPlan(planDate) {
  const plans = localStore.get('plans', {});
  if (plans[planDate]) {
    delete plans[planDate];
    localStore.set('plans', plans);
    return true;
  }
  return false;
}

// ============================================================================
// Sub Plan Periods
// ============================================================================

/**
 * List periods for a given sub plan
 * @param {number} planId - The sub_plans.id
 * @returns {Promise<Array>} Array of period objects, sorted by sort_order
 */
export async function listSubPlanPeriods(planId) {
  if (await isSupabaseAvailable()) {
    const supabase = await getSupabase();
    try {
      const { data, error } = await supabase
        .from('sub_plan_periods')
        .select('*')
        .eq('plan_id', planId)
        .order('sort_order', { ascending: true });

      if (error) {
        console.warn('[sub-plans] Supabase error listing periods, falling back to local:', error.message);
        return listLocalSubPlanPeriods(planId);
      }

      console.log('[sub-plans] Remote periods fetched for plan:', planId);
      localStore.set(`periods_${planId}`, data);
      return data;
    } catch (err) {
      console.warn('[sub-plans] Network error listing periods, falling back to local:', err.message);
      return listLocalSubPlanPeriods(planId);
    }
  } else {
    console.log('[sub-plans] Supabase not configured, using local storage');
    return listLocalSubPlanPeriods(planId);
  }
}

/**
 * List periods for a plan from local storage
 */
function listLocalSubPlanPeriods(planId) {
  const periods = localStore.get(`periods_${planId}`, []);
  return [...periods].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

/**
 * Upsert periods for a sub plan (bulk — replaces all periods for that plan)
 * @param {number} planId - The sub_plans.id
 * @param {Array} periods - Array of period objects
 * @returns {Promise<Array>} Saved periods
 */
export async function upsertSubPlanPeriods(planId, periods) {
  const records = periods.map((p, i) => ({
    plan_id: planId,
    period_hour: p.period_hour,
    subject: p.subject || null,
    instructions: p.instructions || null,
    presentations: p.presentations || [],
    materials: p.materials || null,
    completed: p.completed || false,
    sub_note: p.sub_note || null,
    sort_order: p.sort_order !== undefined ? p.sort_order : i,
    updated_at: new Date().toISOString()
  }));

  if (await isSupabaseAvailable()) {
    const supabase = await getSupabase();
    try {
      const { data, error } = await supabase
        .from('sub_plan_periods')
        .upsert(records, { onConflict: 'plan_id,period_hour' })
        .select();

      if (error) {
        console.warn('[sub-plans] Supabase error upserting periods, falling back to local:', error.message);
        return upsertLocalSubPlanPeriods(planId, records);
      }

      console.log('[sub-plans] Remote periods saved for plan:', planId);
      localStore.set(`periods_${planId}`, data);
      return data;
    } catch (err) {
      console.warn('[sub-plans] Network error upserting periods, falling back to local:', err.message);
      return upsertLocalSubPlanPeriods(planId, records);
    }
  } else {
    console.log('[sub-plans] Supabase not configured, using local storage');
    return upsertLocalSubPlanPeriods(planId, records);
  }
}

/**
 * Upsert periods in local storage (replaces all periods for the plan)
 */
function upsertLocalSubPlanPeriods(planId, records) {
  const existing = localStore.get(`periods_${planId}`, []);
  const existingMap = {};
  existing.forEach(p => { existingMap[p.period_hour] = p; });

  const updated = records.map(r => ({
    ...existingMap[r.period_hour],
    ...r,
    id: (existingMap[r.period_hour] && existingMap[r.period_hour].id) || localId(),
    created_at: (existingMap[r.period_hour] && existingMap[r.period_hour].created_at) || new Date().toISOString()
  }));

  localStore.set(`periods_${planId}`, updated);
  return updated;
}

/**
 * Update a single period (for checklist toggle or sub note)
 * @param {number} periodId - The sub_plan_periods.id
 * @param {Object} updates - Fields to update (e.g., { completed: true } or { sub_note: "..." })
 * @returns {Promise<Object>} Updated period
 */
export async function updateSubPlanPeriod(periodId, updates) {
  const payload = { ...updates, updated_at: new Date().toISOString() };

  if (await isSupabaseAvailable()) {
    const supabase = await getSupabase();
    try {
      const { data, error } = await supabase
        .from('sub_plan_periods')
        .update(payload)
        .eq('id', periodId)
        .select()
        .single();

      if (error) {
        console.warn('[sub-plans] Supabase error updating period, falling back to local:', error.message);
        return updateLocalSubPlanPeriod(periodId, payload);
      }

      console.log('[sub-plans] Remote period updated:', periodId);
      // Refresh local cache for the plan
      if (data && data.plan_id) {
        const cached = localStore.get(`periods_${data.plan_id}`, []);
        const idx = cached.findIndex(p => p.id === periodId);
        if (idx !== -1) {
          cached[idx] = data;
          localStore.set(`periods_${data.plan_id}`, cached);
        }
      }
      return data;
    } catch (err) {
      console.warn('[sub-plans] Network error updating period, falling back to local:', err.message);
      return updateLocalSubPlanPeriod(periodId, payload);
    }
  } else {
    console.log('[sub-plans] Supabase not configured, using local storage');
    return updateLocalSubPlanPeriod(periodId, payload);
  }
}

/**
 * Update a single period in local storage by id (searches across all plan caches)
 */
function updateLocalSubPlanPeriod(periodId, updates) {
  // Search all period caches in local storage for the matching period
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(NS + 'periods_')) {
      try {
        const periods = JSON.parse(localStorage.getItem(key)) || [];
        const idx = periods.findIndex(p => p.id === periodId);
        if (idx !== -1) {
          periods[idx] = { ...periods[idx], ...updates };
          localStorage.setItem(key, JSON.stringify(periods));
          return periods[idx];
        }
      } catch {
        // skip malformed entries
      }
    }
  }
  return null;
}

// ============================================================================
// Sub Plan Templates
// ============================================================================

/**
 * List all sub plan templates
 * @returns {Promise<Array>} Array of template objects
 */
export async function listSubPlanTemplates() {
  if (await isSupabaseAvailable()) {
    const supabase = await getSupabase();
    try {
      const { data, error } = await supabase
        .from('sub_plan_templates')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.warn('[sub-plans] Supabase error listing templates, falling back to local:', error.message);
        return listLocalSubPlanTemplates();
      }

      console.log('[sub-plans] Remote templates fetched, count:', data.length);
      localStore.set('templates', data);
      return data;
    } catch (err) {
      console.warn('[sub-plans] Network error listing templates, falling back to local:', err.message);
      return listLocalSubPlanTemplates();
    }
  } else {
    console.log('[sub-plans] Supabase not configured, using local storage');
    return listLocalSubPlanTemplates();
  }
}

/**
 * List templates from local storage
 */
function listLocalSubPlanTemplates() {
  const templates = localStore.get('templates', []);
  return [...templates].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

/**
 * Upsert (create or update) a template
 * @param {Object} template - Template object
 * @returns {Promise<Object>} Saved template
 */
export async function upsertSubPlanTemplate(template) {
  if (await isSupabaseAvailable()) {
    const supabase = await getSupabase();
    try {
      const record = {
        name: template.name,
        day_of_week: template.day_of_week !== undefined ? template.day_of_week : null,
        plan_mode: template.plan_mode || 'subject',
        periods_data: template.periods_data || null,
        subject_data: template.subject_data || null,
        created_by: template.created_by || 'teacher',
        updated_at: new Date().toISOString()
      };
      if (template.id) {
        record.id = template.id;
      }

      const { data, error } = await supabase
        .from('sub_plan_templates')
        .upsert(record)
        .select()
        .single();

      if (error) {
        console.warn('[sub-plans] Supabase error upserting template, falling back to local:', error.message);
        return upsertLocalSubPlanTemplate(template);
      }

      console.log('[sub-plans] Remote template saved:', data.id);
      // Update local cache
      const templates = localStore.get('templates', []);
      const idx = templates.findIndex(t => t.id === data.id);
      if (idx !== -1) {
        templates[idx] = data;
      } else {
        templates.push(data);
      }
      localStore.set('templates', templates);
      return data;
    } catch (err) {
      console.warn('[sub-plans] Network error upserting template, falling back to local:', err.message);
      return upsertLocalSubPlanTemplate(template);
    }
  } else {
    console.log('[sub-plans] Supabase not configured, using local storage');
    return upsertLocalSubPlanTemplate(template);
  }
}

/**
 * Upsert a template in local storage
 */
function upsertLocalSubPlanTemplate(template) {
  const templates = localStore.get('templates', []);
  const existingIdx = template.id ? templates.findIndex(t => t.id === template.id) : -1;

  const saved = {
    ...template,
    id: template.id || localId(),
    updated_at: new Date().toISOString(),
    created_at: (existingIdx !== -1 && templates[existingIdx].created_at) || new Date().toISOString()
  };

  if (existingIdx !== -1) {
    templates[existingIdx] = saved;
  } else {
    templates.push(saved);
  }

  localStore.set('templates', templates);
  return saved;
}

/**
 * Delete a template
 * @param {number} templateId - The template id
 * @returns {Promise<boolean>} Success
 */
export async function deleteSubPlanTemplate(templateId) {
  if (await isSupabaseAvailable()) {
    const supabase = await getSupabase();
    try {
      const { error } = await supabase
        .from('sub_plan_templates')
        .delete()
        .eq('id', templateId);

      if (error) {
        console.warn('[sub-plans] Supabase error deleting template, falling back to local:', error.message);
        return deleteLocalSubPlanTemplate(templateId);
      }

      console.log('[sub-plans] Remote template deleted:', templateId);
      deleteLocalSubPlanTemplate(templateId);
      return true;
    } catch (err) {
      console.warn('[sub-plans] Network error deleting template, falling back to local:', err.message);
      return deleteLocalSubPlanTemplate(templateId);
    }
  } else {
    console.log('[sub-plans] Supabase not configured, using local storage');
    return deleteLocalSubPlanTemplate(templateId);
  }
}

/**
 * Delete a template from local storage
 */
function deleteLocalSubPlanTemplate(templateId) {
  const templates = localStore.get('templates', []);
  const idx = templates.findIndex(t => t.id === templateId);
  if (idx !== -1) {
    templates.splice(idx, 1);
    localStore.set('templates', templates);
    return true;
  }
  return false;
}
