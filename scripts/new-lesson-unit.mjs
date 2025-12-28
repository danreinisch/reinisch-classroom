import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const title = args.find(a => !a.startsWith('-'));
const section = (() => {
  const i = args.indexOf('--section');
  return i >= 0 ? (args[i + 1] || 'language-arts') : 'language-arts';
})();
const withPresentation = args.includes('--with-presentation');

if (!title) {
  console.error('Usage: node scripts/new-lesson-unit.mjs "Book Title" --section language-arts [--with-presentation]');
  process.exit(1);
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const SITE_DIR = path.join(process.cwd(), 'site');
const unitId = slugify(title);
const base =
  section === 'life-skills'
    ? path.join(SITE_DIR, 'life-skills')
    : path.join(SITE_DIR, 'presentations', unitId);

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function main() {
  if (section === 'life-skills') {
    console.error('❌ Life Skills is already a single unit. Use presentations slots there (presentation-01, etc.).');
    process.exit(1);
  }

  await ensureDir(base);

  if (withPresentation) {
    const presDir = path.join(base, 'presentation-01');
    await ensureDir(presDir);

    const indexPath = path.join(presDir, 'index.html');
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title} — Presentation 1</title>
</head>
<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0b1220;color:#e8eefc;padding:2rem;">
  <h1>${title}</h1>
  <p>This is a placeholder Presentation 1. Replace with your real deck/page when ready.</p>
  <p><a href="/" style="color:#7dd3fc;">Home</a></p>
</body>
</html>
`;
    await fs.writeFile(indexPath, html, 'utf8');
    console.log(`✅ Created unit + placeholder: site/presentations/${unitId}/presentation-01/index.html`);
  } else {
    console.log(`✅ Created unit folder: site/presentations/${unitId}/`);
    console.log('   (It will NOT appear in Lessons until at least one presentation-* folder exists.)');
    console.log('   Add one with: node scripts/new-lesson-unit.mjs "<Title>" --with-presentation');
  }
}

main().catch((e) => {
  console.error('❌ new-lesson-unit failed:', e && e.stack ? e.stack : e);
  process.exit(1);
});
