import { promises as fs } from 'node:fs';
import path from 'node:path';

function pad2(n) { return String(n).padStart(2, '0'); }

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i];
    const v = args[i + 1];
    if (!k?.startsWith('--')) continue;
    out[k.slice(2)] = v;
  }
  if (!out.root) throw new Error('--root is required (e.g. REINISCHCLASSROOM P U B L I S H E R/LANGUAGE ARTS/A Door Into Time )');
  if (!out.week) throw new Error('--week is required (number)');
  out.week = Number(out.week);
  if (!out.title) out.title = `Week ${out.week} Presentation`;
  if (!out.date) out.date = new Date().toISOString().slice(0, 10);
  out.slug = out.slug || `week-${pad2(out.week)}`;
  if (!out.page) out.page = `${out.slug}/index.html`;
  return out;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJSON(file, fallback) {
  try { const txt = await fs.readFile(file, 'utf8'); return JSON.parse(txt); } catch { return fallback; }
}

async function writeJSON(file, obj) {
  const txt = JSON.stringify(obj, null, 2) + '\n';
  await fs.writeFile(file, txt, 'utf8');
}

async function main() {
  const opts = parseArgs();
  const root = opts.root;
  const slug = opts.slug;
  const weekDir = path.join(root, slug);

  await ensureDir(weekDir);
  await ensureDir(path.join(weekDir, 'img'));

  // .gitkeep for img folder
  const gitkeepPath = path.join(weekDir, 'img', '.gitkeep');
  try {
    await fs.access(gitkeepPath);
  } catch {
    await fs.writeFile(gitkeepPath, '', 'utf8');
  }

  // meta.json (create if missing)
  const metaPath = path.join(weekDir, 'meta.json');
  let meta = await readJSON(metaPath, null);
  if (!meta) {
    meta = { title: opts.title, date: opts.date, summary: opts.summary || '', page: path.basename(opts.page), hero: 'img/hero.webp', images: [] };
    await writeJSON(metaPath, meta);
  }

  // presentations.json upsert
  const presPath = path.join(root, 'presentations.json');
  const base = await readJSON(presPath, { series: 'A Door Into Time', items: [] });
  const newItem = { week: opts.week, title: opts.title, date: opts.date, slug, summary: opts.summary || '', page: `${slug}/index.html`, hero: `${slug}/img/hero.webp`, images: [] };
  const idx = base.items.findIndex(it => Number(it.week) === Number(opts.week));
  if (idx >= 0) base.items[idx] = newItem; else base.items.push(newItem);
  base.items.sort((a, b) => a.week - b.week);
  await writeJSON(presPath, base);

  // Week placeholder page (create if missing)
  const weekIndexPath = path.join(weekDir, 'index.html');
  try { await fs.access(weekIndexPath); } catch {
    const html = `<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${opts.title}</title>\n<style>body{font-family:system-ui;margin:2rem;line-height:1.45}</style>\n</head><body>\n<h1>${opts.title}</h1>\n<p>Replace this page with your presentation HTML, or link/redirect to a PDF/Slides.</p>\n</body></html>`;
    await fs.writeFile(weekIndexPath, html, 'utf8');
  }

  console.log(`✓ Week ${opts.week} scaffolded at ${weekDir}`);
  console.log(`✓ Updated ${presPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
