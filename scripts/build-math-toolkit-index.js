#!/usr/bin/env node
/**
 * Generate site/math-toolkit/modules.json by scanning site/math-toolkit/modules/
 * Supports:
 *  - Single HTML files: site/math-toolkit/modules/*.html
 *  - Subfolders with index.html: site/math-toolkit/modules/<slug>/index.html
 * Extracts:
 *  - title: <title> or derived from name
 *  - description: <meta name="description" content="..."> or first <p> text
 *  - thumbnail: <meta property="og:image" ...>, or thumbnail.(png|jpg|jpeg|webp) next to the HTML
 *  - lastModified: file mtime
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const ROOT = process.cwd();
const MODULES_DIR = path.join(ROOT, 'site', 'math-toolkit', 'modules');
const OUTPUT_PATH = path.join(ROOT, 'site', 'math-toolkit', 'modules.json');

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

async function fileExists(p) {
  try { await fsp.access(p, fs.constants.F_OK); return true; }
  catch { return false; }
}

async function extractFromHtml(filePath) {
  const html = await fsp.readFile(filePath, 'utf8');

  const title = getFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i);

  const description = getFirst(
    html,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i
  ) || getFirst(html, /<p[^>]*>([\s\S]*?)<\/p>/i).replace(/<[^>]+>/g, '').trim();

  const ogImage = getFirst(
    html,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i
  );

  return { title: (title || '').trim(), description: (description || '').trim(), ogImage: (ogImage || '').trim() };
}

async function findThumbnail(basedir) {
  const cand = ['thumbnail.png', 'thumbnail.jpg', 'thumbnail.jpeg', 'thumbnail.webp'];
  for (const f of cand) {
    const p = path.join(basedir, f);
    if (await fileExists(p)) return f;
  }
  return '';
}

async function scan() {
  const result = [];
  let entries = [];
  try {
    entries = await fsp.readdir(MODULES_DIR, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }

  for (const ent of entries) {
    try {
      if (ent.isFile() && \/\.html?$/i.test(ent.name)) {
        const filePath = path.join(MODULES_DIR, ent.name);
        const stat = await fsp.stat(filePath);
        const meta = await extractFromHtml(filePath);

        const url = `./modules/${encodeURIComponent(ent.name)}`;
        const title = meta.title || humanize(ent.name);
        const desc = meta.description || '';
        const thumb = meta.ogImage || (await findThumbnail(MODULES_DIR));
        result.push({
          title,
          description: desc,
          url,
          slug: ent.name.replace(/\.html?$/i, ''),
          thumbnail: thumb ? `./modules/${thumb}` : '',
          lastModified: stat.mtime.toISOString()
        });
      }

      if (ent.isDirectory()) {
        const idx = path.join(MODULES_DIR, ent.name, 'index.html');
        if (await fileExists(idx)) {
          const stat = await fsp.stat(idx);
          const meta = await extractFromHtml(idx);

          const url = `./modules/${encodeURIComponent(ent.name)}/`;
          const title = meta.title || humanize(ent.name);
          const desc = meta.description || '';
          let thumb = meta.ogImage;
          if (!thumb) {
            const localThumb = await findThumbnail(path.join(MODULES_DIR, ent.name));
            thumb = localThumb ? `./modules/${encodeURIComponent(ent.name)}/${localThumb}` : '';
          }
          result.push({
            title,
            description: desc,
            url,
            slug: ent.name,
            thumbnail: thumb || '',
            lastModified: stat.mtime.toISOString()
          });
        }
      }
    } catch (e) {
      console.warn('Skipping entry due to error:', ent.name, e.message);
    }
  }

  // Sort newest first
  result.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
  return result;
}

async function main() {
  const modules = await scan();
  const payload = { modules };
  const json = JSON.stringify(payload, null, 2) + '\n';

  await fsp.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });

  let prev = '';
  try { prev = await fsp.readFile(OUTPUT_PATH, 'utf8'); } catch {}
  if (prev !== json) {
    await fsp.writeFile(OUTPUT_PATH, json, 'utf8');
    console.log(`Wrote ${OUTPUT_PATH} with ${modules.length} modules.`);
  } else {
    console.log('No changes to modules.json');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});