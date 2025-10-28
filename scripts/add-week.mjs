#!/usr/bin/env node
/**
 * Add a new week presentation to A Door Into Time series
 * 
 * Usage:
 *   node scripts/add-week.mjs --root "REINISCHCLASSROOM P U B L I S H E R/LANGUAGE ARTS/A Door Into Time " --week 10 --title "Week 10 Presentation"
 * 
 * Required arguments:
 *   --root: Path to the presentation directory (must contain presentations.json)
 *   --week: Week number (integer)
 * 
 * Optional arguments:
 *   --title: Title for the week (defaults to "Week {n} Presentation")
 *   --summary: Summary text (defaults to empty string)
 *   --date: Date in YYYY-MM-DD format (defaults to today)
 *   --slug: Slug for the week folder (defaults to "week-XX")
 *   --page: Relative path to the week page (defaults to "{slug}/index.html")
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = process.cwd();

// Parse command line arguments
function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        parsed[key] = value;
        i++;
      }
    }
  }
  return parsed;
}

// Format date as YYYY-MM-DD
function getToday() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Pad week number to 2 digits
function padWeek(week) {
  return String(week).padStart(2, '0');
}

// Check if file exists
async function fileExists(filepath) {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  
  // Validate required arguments
  if (!args.root) {
    console.error('Error: --root argument is required');
    console.error('Example: node scripts/add-week.mjs --root "REINISCHCLASSROOM P U B L I S H E R/LANGUAGE ARTS/A Door Into Time " --week 10');
    process.exit(1);
  }
  
  if (!args.week) {
    console.error('Error: --week argument is required');
    console.error('Example: node scripts/add-week.mjs --root "REINISCHCLASSROOM P U B L I S H E R/LANGUAGE ARTS/A Door Into Time " --week 10');
    process.exit(1);
  }
  
  const weekNum = parseInt(args.week, 10);
  if (isNaN(weekNum) || weekNum < 1) {
    console.error('Error: --week must be a positive integer');
    process.exit(1);
  }
  
  // Build parameters with defaults
  const slug = args.slug || `week-${padWeek(weekNum)}`;
  const title = args.title || `Week ${weekNum} Presentation`;
  const date = args.date || getToday();
  const summary = args.summary || '';
  const page = args.page || `${slug}/index.html`;
  const hero = `${slug}/img/hero.webp`;
  const images = [`${slug}/img/bg-1.webp`, `${slug}/img/bg-2.webp`];
  
  const rootDir = path.resolve(ROOT, args.root);
  const presentationsPath = path.join(rootDir, 'presentations.json');
  const weekDir = path.join(rootDir, slug);
  const weekIndexPath = path.join(weekDir, 'index.html');
  const weekMetaPath = path.join(weekDir, 'meta.json');
  const weekImgDir = path.join(weekDir, 'img');
  const gitkeepPath = path.join(weekImgDir, '.gitkeep');
  
  // Verify root directory exists
  try {
    await fs.access(rootDir);
  } catch {
    console.error(`Error: Root directory does not exist: ${rootDir}`);
    process.exit(1);
  }
  
  // Load or initialize presentations.json
  let presentations = { series: 'A Door Into Time', items: [] };
  if (await fileExists(presentationsPath)) {
    try {
      const content = await fs.readFile(presentationsPath, 'utf8');
      presentations = JSON.parse(content);
    } catch (error) {
      console.error(`Error reading presentations.json: ${error.message}`);
      process.exit(1);
    }
  }
  
  // Upsert the week entry
  const newItem = {
    week: weekNum,
    title,
    date,
    slug,
    summary,
    page,
    hero,
    images
  };
  
  const existingIndex = presentations.items.findIndex(item => item.week === weekNum);
  if (existingIndex >= 0) {
    console.log(`Updating existing Week ${weekNum} entry in presentations.json`);
    presentations.items[existingIndex] = newItem;
  } else {
    console.log(`Adding new Week ${weekNum} entry to presentations.json`);
    presentations.items.push(newItem);
  }
  
  // Sort items by week ascending
  presentations.items.sort((a, b) => a.week - b.week);
  
  // Write presentations.json
  await fs.writeFile(
    presentationsPath,
    JSON.stringify(presentations, null, 2) + '\n',
    'utf8'
  );
  console.log(`✓ Updated ${presentationsPath}`);
  
  // Create week directory if it doesn't exist
  await fs.mkdir(weekDir, { recursive: true });
  console.log(`✓ Created directory ${weekDir}`);
  
  // Create img directory
  await fs.mkdir(weekImgDir, { recursive: true });
  console.log(`✓ Created directory ${weekImgDir}`);
  
  // Create .gitkeep if it doesn't exist
  if (!(await fileExists(gitkeepPath))) {
    await fs.writeFile(gitkeepPath, '', 'utf8');
    console.log(`✓ Created ${gitkeepPath}`);
  }
  
  // Create meta.json if it doesn't exist
  if (!(await fileExists(weekMetaPath))) {
    const meta = {
      title,
      date,
      summary,
      page: 'index.html',
      hero: 'img/hero.webp',
      images: ['img/bg-1.webp', 'img/bg-2.webp']
    };
    await fs.writeFile(
      weekMetaPath,
      JSON.stringify(meta, null, 2) + '\n',
      'utf8'
    );
    console.log(`✓ Created ${weekMetaPath}`);
  } else {
    console.log(`  Skipped ${weekMetaPath} (already exists)`);
  }
  
  // Create index.html if it doesn't exist
  if (!(await fileExists(weekIndexPath))) {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 2rem;
      max-width: 800px;
      margin: 0 auto;
    }
    code {
      background: #f4f4f4;
      padding: 0.2rem 0.4rem;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p>Drop your background images into <code>img/</code> and replace this page with your actual presentation markup.</p>
</body>
</html>
`;
    await fs.writeFile(weekIndexPath, html, 'utf8');
    console.log(`✓ Created ${weekIndexPath}`);
  } else {
    console.log(`  Skipped ${weekIndexPath} (already exists)`);
  }
  
  console.log('\nDone! Week scaffolding complete.');
  console.log(`\nNext steps:`);
  console.log(`  1. Add images to: ${weekImgDir}/`);
  console.log(`  2. Edit presentation: ${weekIndexPath}`);
  console.log(`  3. View at: ${path.join(args.root, 'index.html')}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
