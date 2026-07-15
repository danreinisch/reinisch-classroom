import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from "node:child_process";

function stableGeneratedAt() {
  // Stable timestamp so running the generator doesn't create a fake git diff.
  // We use the latest commit time affecting presentation directories.
  try {
    const out = execSync(
      "git log -1 --format=%cI -- site/presentations site/life-skills/presentations",
      { stdio: ["ignore", "pipe", "ignore"] }
    ).toString().trim();
    if (out) return out;
  } catch (_) {}

  // Fallback: keep existing generatedAt if present, otherwise current time.
  try {
    const existing = JSON.parse(fs.readFileSync("site/assets/content/lessons-index.json", "utf8"));
    if (existing && existing.generatedAt) return existing.generatedAt;
  } catch (_) {}

  return new Date().toISOString();
}


const SITE_DIR = path.join(process.cwd(), 'site');
const OUT_PATH = path.join(SITE_DIR, 'assets', 'content', 'lessons-index.json');

const LANG_DIR = path.join(SITE_DIR, 'presentations');
const LIFE_DIR = path.join(SITE_DIR, 'life-skills', 'presentations');

const UNITS_JSON = path.join(SITE_DIR, 'assets', 'data', 'units.json');
const SITE_STATE_JSON = path.join(SITE_DIR, 'assets', 'data', 'site-state.json');

// Life Skills grouping configuration
const LIFE_SKILLS_GROUPS = [
  {
    id: 'money-finance',
    name: '💰 Money & Finance',
    keywords: ['money', 'paycheck', 'counting', 'cashier', 'finance', 'budget', 'bank', 'saving']
  },
  {
    id: 'employment',
    name: '💼 Employment',
    keywords: ['job', 'employment', 'workplace', 'career', 'resume', 'interview', 'work skills', 'independent living']
  },
  {
    id: 'nutrition-shopping',
    name: '🍎 Nutrition & Shopping',
    keywords: ['nutrition', 'grocery', 'food', 'meal', 'cooking', 'shopping', 'diet', 'health']
  }
];

const OTHER_GROUP = {
  id: 'other',
  name: '📋 Other'
};

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function readText(p) {
  return await fs.readFile(p, 'utf8');
}

async function readHtmlTitle(indexHtmlPath) {
  try {
    const html = await readText(indexHtmlPath);
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!m) return null;
    const t = decodeEntities(m[1].trim());
    return t || null;
  } catch {
    return null;
  }
}

function isPresentationDirName(name) {
  return /^presentation-\d+$/i.test(name);
}

function presNum(name) {
  const m = String(name).match(/presentation-(\d+)/i);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

function niceFromId(id) {
  const s = String(id || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Assign presentations to groups based on keyword matching
 */
function groupPresentations(presentations) {
  // Initialize groups map
  const groupsMap = new Map();
  
  // Assign each presentation to first matching group
  for (const pres of presentations) {
    const nameLower = (pres.name || '').toLowerCase();
    let assigned = false;
    
    for (const groupDef of LIFE_SKILLS_GROUPS) {
      // Check if any keyword matches (case-insensitive partial match)
      const matches = groupDef.keywords.some(keyword => nameLower.includes(keyword.toLowerCase()));
      if (matches) {
        if (!groupsMap.has(groupDef.id)) {
          groupsMap.set(groupDef.id, {
            id: groupDef.id,
            name: groupDef.name,
            presentationIds: []
          });
        }
        groupsMap.get(groupDef.id).presentationIds.push(pres.id);
        assigned = true;
        break; // First match wins
      }
    }
    
    // If no match, assign to "Other" group
    if (!assigned) {
      if (!groupsMap.has(OTHER_GROUP.id)) {
        groupsMap.set(OTHER_GROUP.id, {
          id: OTHER_GROUP.id,
          name: OTHER_GROUP.name,
          presentationIds: []
        });
      }
      groupsMap.get(OTHER_GROUP.id).presentationIds.push(pres.id);
    }
  }
  
  // Convert map to array, preserving order of group definitions
  const groups = [];
  for (const groupDef of LIFE_SKILLS_GROUPS) {
    if (groupsMap.has(groupDef.id)) {
      groups.push(groupsMap.get(groupDef.id));
    }
  }
  // Add "Other" group at the end if it exists
  if (groupsMap.has(OTHER_GROUP.id)) {
    groups.push(groupsMap.get(OTHER_GROUP.id));
  }
  
  return groups;
}

async function safeReadJson(p) {
  try {
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildExistingMaps(existing) {
  const unitNameById = new Map();
  const presNameByUrl = new Map();

  const sections = existing?.sections;
  if (!Array.isArray(sections)) return { unitNameById, presNameByUrl };

  for (const sec of sections) {
    const units = sec?.units;
    if (!Array.isArray(units)) continue;
    for (const u of units) {
      if (u?.id && u?.name) unitNameById.set(String(u.id), String(u.name));
      const pres = u?.presentations;
      if (!Array.isArray(pres)) continue;
      for (const p of pres) {
        if (p?.url && p?.name) presNameByUrl.set(String(p.url), String(p.name));
      }
    }
  }
  return { unitNameById, presNameByUrl };
}

/**
 * Extract presentations from site-state.json for a given category ID
 */
function extractPresentationsFromSiteState(siteState, categoryId) {
  const category = siteState?.categories?.[categoryId];
  if (!category) return [];

  const titles = category.titles || [];
  const links = category.links || [];
  const presentations = [];

  for (let i = 0; i < Math.min(titles.length, links.length); i++) {
    const title = String(titles[i] || '').trim();
    const link = String(links[i] || '').trim();
    
    // Skip empty entries
    if (!title || !link) continue;

    // Extract presentation ID from link (e.g., "/presentations/lost-in-kragdon-ah/presentation-01/" -> "presentation-01")
    const match = link.match(/presentation-(\d+)/i);
    const id = match ? `presentation-${match[1]}` : `presentation-${String(i + 1).padStart(2, '0')}`;

    presentations.push({ id, name: title, url: link });
  }

  return presentations;
}

/**
 * Merge presentations from site-state into existing unit data
 */
function mergePresentationsFromSiteState(existingPresentations, siteStatePresentations) {
  // Create a map of existing presentations by URL
  const existingByUrl = new Map();
  for (const p of existingPresentations) {
    existingByUrl.set(p.url, p);
  }

  // Add or update presentations from site-state
  for (const p of siteStatePresentations) {
    if (!existingByUrl.has(p.url)) {
      existingPresentations.push(p);
    } else {
      // Update name if site-state has a better title
      const existing = existingByUrl.get(p.url);
      const oldGeneric = /^presentation\s+\d+$/i.test(existing.name || '') || existing.name.toLowerCase() === 'open';
      if (oldGeneric && p.name) {
        existing.name = p.name;
      }
    }
  }

  // Sort by presentation number
  existingPresentations.sort((a, b) => presNum(a.id) - presNum(b.id));
  
  return existingPresentations;
}

async function listDirs(dir) {
  try {
    const items = await fs.readdir(dir, { withFileTypes: true });
    return items.filter(d => d.isDirectory()).map(d => d.name);
  } catch {
    return [];
  }
}

async function scanUnit(unitId, unitAbsDir, urlPrefix, maps) {
  const dirs = (await listDirs(unitAbsDir)).filter(isPresentationDirName);
  dirs.sort((a, b) => presNum(a) - presNum(b));

  const presentations = [];
  for (const d of dirs) {
    const indexHtml = path.join(unitAbsDir, d, 'index.html');
    if (!(await exists(indexHtml))) continue;

    const url = `${urlPrefix}/${unitId}/${d}/`.replace(/\/{2,}/g, '/');
    const id = d.toLowerCase();

    let name = maps.presNameByUrl.get(url) || null;
    // Prefer <title> when the old name is generic or missing
    const old = (name || '').trim();
    const generic = /^presentation\s+\d+$/i.test(old) || old.toLowerCase() === 'open' || old === '';
    if (generic) {
      const title = await readHtmlTitle(indexHtml);
      if (title) name = title;
    }
    if (!name) name = niceFromId(d);

    presentations.push({ id, name, url });
  }

  const unitName = maps.unitNameById.get(unitId) || niceFromId(unitId);
  return { id: unitId, name: unitName, presentations };
}

async function scanLanguageArts(maps, unitsData, siteState) {
  const unitIds = await listDirs(LANG_DIR);
  unitIds.sort((a, b) => a.localeCompare(b));

  // Build unit map by folder name for lookup
  const unitByFolderName = new Map();
  if (unitsData?.units) {
    for (const u of unitsData.units) {
      if (
        u.section === 'language-arts' &&
        u.id !== 'toolkit' &&
        (u.status || 'active') === 'active'
      ) {
        // Extract folder name from baseOut (e.g., "presentations/lost-in-kragdon-ah" -> "lost-in-kragdon-ah")
        const folder = u.baseOut.split('/').pop();
        unitByFolderName.set(folder, u);
      }
    }
  }

  const units = [];
  const processedIds = new Set();

  // First, scan filesystem units
  for (const unitId of unitIds) {
    // Skip toolkit - it's handled separately in the sidebar
    if (unitId === 'language-arts-toolkit') continue;

    // Only active, registered collections belong in current discovery.
    const unitMeta = unitByFolderName.get(unitId);
    if (!unitMeta) continue;

    const abs = path.join(LANG_DIR, unitId);
    const u = await scanUnit(unitId, abs, '/presentations', maps);
    
    // Apply the canonical registry title.
    if (unitMeta.title) {
      u.name = unitMeta.title;
    }

    // Merge presentations from site-state if available
    if (unitMeta && siteState?.categories?.[unitMeta.id]) {
      const siteStatePres = extractPresentationsFromSiteState(siteState, unitMeta.id);
      if (siteStatePres.length > 0) {
        u.presentations = mergePresentationsFromSiteState(u.presentations, siteStatePres);
      }
    }

    if (u.presentations.length > 0) {
      units.push(u);
      processedIds.add(unitId);
    }
  }

  // Second, check for units in units.json that weren't found by filesystem scan
  for (const [folderName, unitMeta] of unitByFolderName.entries()) {
    if (processedIds.has(folderName)) continue;
    
    // Check if site-state has presentations for this unit
    if (siteState?.categories?.[unitMeta.id]) {
      const siteStatePres = extractPresentationsFromSiteState(siteState, unitMeta.id);
      if (siteStatePres.length > 0) {
        // Create unit from site-state data
        const unit = {
          id: folderName,
          name: unitMeta.title,
          presentations: siteStatePres
        };
        units.push(unit);
      }
    }
  }

  units.sort((a, b) => {
    const aMeta = unitByFolderName.get(a.id) || {};
    const bMeta = unitByFolderName.get(b.id) || {};
    const aOrder = Number.isFinite(Number(aMeta.sortOrder)) ? Number(aMeta.sortOrder) : 0;
    const bOrder = Number.isFinite(Number(bMeta.sortOrder)) ? Number(bMeta.sortOrder) : 0;

    if (aOrder !== bOrder) return aOrder - bOrder;

    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  return { name: 'LANGUAGE ARTS', units };
}

async function scanLifeSkills(maps, unitsData, siteState) {
  const lifeUnit = unitsData?.units?.find(u => u.id === 'life');

  if (lifeUnit && (lifeUnit.status || 'active') !== 'active') {
    return { name: 'LIFE SKILLS', units: [] };
  }

  // Life Skills is a single unit, presentations live directly under /life-skills/presentations/presentation-XX/
  const dirs = (await listDirs(LIFE_DIR)).filter(isPresentationDirName);
  dirs.sort((a, b) => presNum(a) - presNum(b));

  const presentations = [];
  for (const d of dirs) {
    const indexHtml = path.join(LIFE_DIR, d, 'index.html');
    if (!(await exists(indexHtml))) continue;

    const url = `/life-skills/presentations/${d.toLowerCase()}/`;
    const id = d.toLowerCase();

    let name = maps.presNameByUrl.get(url) || null;
    const old = (name || '').trim();
    const generic = /^presentation\s+\d+$/i.test(old) || old.toLowerCase() === 'open' || old === '';
    if (generic) {
      const title = await readHtmlTitle(indexHtml);
      if (title) name = title;
    }
    if (!name) name = niceFromId(d);

    presentations.push({ id, name, url });
  }

  // Merge presentations from site-state
  if (siteState?.categories?.life) {
    const siteStatePres = extractPresentationsFromSiteState(siteState, 'life');
    if (siteStatePres.length > 0) {
      mergePresentationsFromSiteState(presentations, siteStatePres);
    }
  }

  // Get canonical name from units.json
  let unitName = maps.unitNameById.get('life-skills') || 'Life Skills';
  if (lifeUnit && lifeUnit.title) {
    unitName = lifeUnit.title;
  }

  // Generate groups for Life Skills presentations
  const groups = groupPresentations(presentations);

  const unit = {
    id: 'life-skills',
    name: unitName,
    groups, // Add groups array
    presentations
  };

  const units = unit.presentations.length > 0 ? [unit] : [];
  return { name: 'LIFE SKILLS', units };
}

async function main() {
  const existing = await safeReadJson(OUT_PATH);
  const maps = buildExistingMaps(existing);

  // Load additional data sources
  const unitsData = await safeReadJson(UNITS_JSON);
  const siteState = await safeReadJson(SITE_STATE_JSON);

  const sections = [];
  if (await exists(LANG_DIR)) sections.push(await scanLanguageArts(maps, unitsData, siteState));
  if (await exists(LIFE_DIR)) sections.push(await scanLifeSkills(maps, unitsData, siteState));

  const out = {
    version: 1,
    generatedAt: stableGeneratedAt(),
    sections
  };

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');

  console.log(`✅ Generated: ${path.relative(process.cwd(), OUT_PATH)}`);
}

main().catch((e) => {
  console.error('❌ generate-lessons-index failed:', e && e.stack ? e.stack : e);
  process.exit(1);
});
