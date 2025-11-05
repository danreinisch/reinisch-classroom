// sub-plans.js
// Substitute plan helpers with Supabase and local fallback

import { supabase } from './supabase-client.js';

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

/**
 * Check if Supabase is available
 */
function isSupabaseAvailable() {
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
  if (isSupabaseAvailable()) {
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
  if (isSupabaseAvailable()) {
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
    id: existingPlan.id || Date.now(),
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
  if (isSupabaseAvailable()) {
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
  if (isSupabaseAvailable()) {
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
