import fs from 'node:fs/promises';
import path from 'node:path';

const SITE_DIR = path.join(process.cwd(), 'site');
const OUT_PATH = path.join(SITE_DIR, 'assets', 'content', 'lessons-index.json');

const LANG_DIR = path.join(SITE_DIR, 'presentations');
const LIFE_DIR = path.join(SITE_DIR, 'life-skills', 'presentations');

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

async function scanLanguageArts(maps) {
  const unitIds = await listDirs(LANG_DIR);
  unitIds.sort((a, b) => a.localeCompare(b));

  const units = [];
  for (const unitId of unitIds) {
    const abs = path.join(LANG_DIR, unitId);
    const u = await scanUnit(unitId, abs, '/presentations', maps);
    if (u.presentations.length > 0) units.push(u); // hide empty categories
  }
  return { name: 'LANGUAGE ARTS', units };
}

async function scanLifeSkills(maps) {
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

  const unit = {
    id: 'life-skills',
    name: maps.unitNameById.get('life-skills') || 'Life Skills',
    presentations
  };

  const units = unit.presentations.length > 0 ? [unit] : [];
  return { name: 'LIFE SKILLS', units };
}

async function main() {
  const existing = await safeReadJson(OUT_PATH);
  const maps = buildExistingMaps(existing);

  const sections = [];
  if (await exists(LANG_DIR)) sections.push(await scanLanguageArts(maps));
  if (await exists(LIFE_DIR)) sections.push(await scanLifeSkills(maps));

  const out = {
    version: 1,
    generatedAt: new Date().toISOString(),
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
