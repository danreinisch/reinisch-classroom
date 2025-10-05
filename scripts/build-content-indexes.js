#!/usr/bin/env node
/**
 * Build JSON indexes for multiple collections so pages can auto-list items.
 * Collections:
 *  - Language Arts:           site/language-arts/modules/         -> /language-arts/modules.json
 *  - Life Skills:             site/life-skills/modules/           -> /life-skills/modules.json
 *  - Math Toolkit:            site/math-toolkit/modules/          -> /site/math-toolkit/modules.json
 *  - Language Arts Toolkit:   site/language-arts-toolkit/modules/ -> /site/language-arts-toolkit/modules.json
 *
 * Module structure:
 *  - Folder with index.html (preferred): <collection>/<slug>/index.html
 *  - Single HTML file (supported):       <collection>/<name>.html
 * Recommended alongside module:
 *  - thumbnail.(png|jpg|jpeg|webp)
 *  - card.json with { title, description, thumbnail }
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const ROOT = process.cwd();

const collections = [
  {
    name: 'language-arts',
    dir: path.join(ROOT, 'site', 'language-arts', 'modules'),
    out: path.join(ROOT, 'language-arts', 'modules.json'),
    urlBase: '/language-arts/modules/',
  },
  {
    name: 'life-skills',
    dir: path.join(ROOT, 'site', 'life-skills', 'modules'),
    out: path.join(ROOT, 'life-skills', 'modules.json'),
    urlBase: '/life-skills/modules/',
  },
  {
    name: 'math-toolkit',
    dir: path.join(ROOT, 'site', 'math-toolkit', 'modules'),
    out: path.join(ROOT, 'site', 'math-toolkit', 'modules.json'),
    urlBase: '/site/math-toolkit/modules/',
  },
  {
    name: 'language-arts-toolkit',
    dir: path.join(ROOT, 'site', 'language-arts-toolkit', 'modules'),
    out: path.join(ROOT, 'site', 'language-arts-toolkit', 'modules.json'),
    urlBase: '/site/language-arts-toolkit/modules/',
  },
];

function humanize(name) {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function getFirst(text, regex) {
  const m = regex.exec(text);
  return m ? (m[1] || m[2] || '').trim() : '';
}

async function exists(p) {
  try { await fsp.access(p, fs.constants.F_OK); return true; }
  catch { return false; }
}

async function readCardJson(dirPath) {
  const p = path.join(dirPath, 'card.json');
  if (!(await exists(p))) return {};
  try { return JSON.parse(await fsp.readFile(p, 'utf8')) || {}; }
  catch { return {}; }
}

async function extractFromHtml(filePath) {
  const html = await fsp.readFile(filePath, 'utf8');
  const title = getFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    getFirst(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
    getFirst(html, /<p[^>]*>([\s\S]*?)<\/p>/i).replace(/<[^>]+>/g, '').trim();
  const ogImage = getFirst(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  return { title: title.trim(), description: description.trim(), ogImage: ogImage.trim() };
}

async function findLocalThumb(dirPath) {
  for (const f of ['thumbnail.png', 'thumbnail.jpg', 'thumbnail.jpeg', 'thumbnail.webp']) {
    const p = path.join(dirPath, f);
    if (await exists(p)) return f;
  }
  return '';
}

async function scanCollection({ dir, urlBase }) {
  const result = [];
  let entries = [];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }

  for (const ent of entries) {
    try {
      if (ent.isFile() && /\.(html?)$/i.test(ent.name)) {
        const filePath = path.join(dir, ent.name);
        const stat = await fsp.stat(filePath);
        const meta = await extractFromHtml(filePath);
        const card = await readCardJson(dir);
        const url = urlBase + encodeURIComponent(ent.name);
        const title = (card.title || meta.title || humanize(ent.name)).trim();
        const desc = (card.description || meta.description || '').trim();
        const thumb = card.thumbnail || meta.ogImage || (await findLocalThumb(dir));
        result.push({
          title,
          description: desc,
          url,
          slug: ent.name.replace(/\.(html?)$/i, ''),
          thumbnail: thumb ? (thumb.startsWith('http') ? thumb : (urlBase + thumb)) : '',
          lastModified: stat.mtime.toISOString(),
        });
      }

      if (ent.isDirectory()) {
        const idx = path.join(dir, ent.name, 'index.html');
        if (await exists(idx)) {
          const stat = await fsp.stat(idx);
          const meta = await extractFromHtml(idx);
          const card = await readCardJson(path.join(dir, ent.name));
          const url = urlBase + encodeURIComponent(ent.name) + '/';
          const title = (card.title || meta.title || humanize(ent.name)).trim();
          const desc = (card.description || meta.description || '').trim();
          let thumb = card.thumbnail || meta.ogImage;
          if (!thumb) {
            const localThumb = await findLocalThumb(path.join(dir, ent.name));
            thumb = localThumb ? (url + localThumb) : '';
          } else if (!/^https?:\/\//i.test(thumb)) {
            thumb = url + thumb;
          }
          result.push({
            title,
            description: desc,
            url,
            slug: ent.name,
            thumbnail: thumb || '',
            lastModified: stat.mtime.toISOString(),
          });
        }
      }
    } catch (e) {
      console.warn('Skipping entry due to error:', ent.name, e.message);
    }
  }

  result.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
  return result;
}

async function writeJson(p, obj) {
  await fsp.mkdir(path.dirname(p), { recursive: true });
  const json = JSON.stringify(obj, null, 2) + '\n';
  let prev = '';
  try { prev = await fsp.readFile(p, 'utf8'); } catch {}
  if (prev !== json) {
    await fsp.writeFile(p, json, 'utf8');
    console.log('Wrote', p);
  } else {
    console.log('No changes to', p);
  }
}

async function main() {
  for (const col of collections) {
    const modules = await scanCollection(col);
    await writeJson(col.out, { modules });
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});