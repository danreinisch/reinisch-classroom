#!/usr/bin/env node

/**
 * add-week.mjs
 * 
 * Upserts a week entry in presentations.json and scaffolds the week directory.
 * 
 * Usage:
 *   node scripts/add-week.mjs --root "REINISCHCLASSROOM P U B L I S H E R/LANGUAGE ARTS/A Door Into Time " --week 10 --title "Week 10 - Chapter 29-31 - Advanced Writing Techniques"
 * 
 * Required arguments:
 *   --root: Path to the presentation series directory (must include trailing space if present in actual path)
 *   --week: Week number (integer)
 * 
 * Optional arguments:
 *   --title: Week title (defaults to "Week {n} Presentation")
 *   --summary: Short description
 *   --date: Date in YYYY-MM-DD format (defaults to today)
 *   --slug: Custom slug (defaults to week-XX with zero-padding)
 *   --page: Custom page path (defaults to {slug}/index.html)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command-line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        console.error(`Missing value for argument: ${args[i]}`);
        process.exit(1);
      }
      parsed[key] = value;
      i++;
    }
  }
  
  return parsed;
}

// Format date as YYYY-MM-DD
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Main function
async function main() {
  const args = parseArgs();
  
  // Validate required arguments
  if (!args.root) {
    console.error('Error: --root is required');
    console.error('Usage: node scripts/add-week.mjs --root "path/to/series" --week N [options]');
    process.exit(1);
  }
  
  if (!args.week) {
    console.error('Error: --week is required');
    console.error('Usage: node scripts/add-week.mjs --root "path/to/series" --week N [options]');
    process.exit(1);
  }
  
  const weekNum = parseInt(args.week, 10);
  if (isNaN(weekNum) || weekNum < 1) {
    console.error('Error: --week must be a positive integer');
    process.exit(1);
  }
  
  // Set defaults
  const slug = args.slug || `week-${String(weekNum).padStart(2, '0')}`;
  const title = args.title || `Week ${weekNum} Presentation`;
  const date = args.date || formatDate(new Date());
  const summary = args.summary || '';
  const page = args.page || `${slug}/index.html`;
  const hero = `${slug}/img/hero.webp`;
  const images = [
    `${slug}/img/bg-1.webp`,
    `${slug}/img/bg-2.webp`
  ];
  
  // Construct absolute paths
  const repoRoot = path.resolve(__dirname, '..');
  const seriesDir = path.resolve(repoRoot, args.root);
  const presentationsFile = path.join(seriesDir, 'presentations.json');
  const weekDir = path.join(seriesDir, slug);
  const weekIndexFile = path.join(weekDir, 'index.html');
  const weekMetaFile = path.join(weekDir, 'meta.json');
  const weekImgDir = path.join(weekDir, 'img');
  const gitkeepFile = path.join(weekImgDir, '.gitkeep');
  
  console.log(`Adding Week ${weekNum} to ${args.root}`);
  console.log(`Slug: ${slug}`);
  console.log(`Title: ${title}`);
  console.log(`Date: ${date}`);
  
  // Check if series directory exists
  try {
    await fs.access(seriesDir);
  } catch (error) {
    console.error(`Error: Series directory does not exist: ${seriesDir}`);
    process.exit(1);
  }
  
  // Load or create presentations.json
  let presentations;
  try {
    const content = await fs.readFile(presentationsFile, 'utf-8');
    presentations = JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('presentations.json not found, creating new file...');
      presentations = {
        series: path.basename(seriesDir),
        items: []
      };
    } else {
      console.error('Error reading presentations.json:', error.message);
      process.exit(1);
    }
  }
  
  // Upsert the week entry
  const existingIndex = presentations.items.findIndex(item => item.week === weekNum);
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
  
  if (existingIndex >= 0) {
    console.log(`Updating existing Week ${weekNum} entry...`);
    presentations.items[existingIndex] = newItem;
  } else {
    console.log(`Adding new Week ${weekNum} entry...`);
    presentations.items.push(newItem);
  }
  
  // Sort items by week ascending
  presentations.items.sort((a, b) => a.week - b.week);
  
  // Write presentations.json
  await fs.writeFile(presentationsFile, JSON.stringify(presentations, null, 2) + '\n', 'utf-8');
  console.log(`✓ Updated ${presentationsFile}`);
  
  // Create week directory if it doesn't exist
  try {
    await fs.mkdir(weekDir, { recursive: true });
    console.log(`✓ Created directory ${weekDir}`);
  } catch (error) {
    console.log(`Directory ${weekDir} already exists`);
  }
  
  // Create img directory
  try {
    await fs.mkdir(weekImgDir, { recursive: true });
    console.log(`✓ Created directory ${weekImgDir}`);
  } catch (error) {
    console.log(`Directory ${weekImgDir} already exists`);
  }
  
  // Create .gitkeep if it doesn't exist
  try {
    await fs.access(gitkeepFile);
    console.log(`img/.gitkeep already exists`);
  } catch (error) {
    await fs.writeFile(gitkeepFile, '', 'utf-8');
    console.log(`✓ Created ${gitkeepFile}`);
  }
  
  // Create meta.json if it doesn't exist
  try {
    await fs.access(weekMetaFile);
    console.log(`meta.json already exists, not overwriting`);
  } catch (error) {
    const metaContent = {
      title,
      date,
      summary,
      page: 'index.html',
      hero: 'img/hero.webp',
      images: [
        'img/bg-1.webp',
        'img/bg-2.webp'
      ]
    };
    await fs.writeFile(weekMetaFile, JSON.stringify(metaContent, null, 2) + '\n', 'utf-8');
    console.log(`✓ Created ${weekMetaFile}`);
  }
  
  // Create index.html if it doesn't exist
  try {
    await fs.access(weekIndexFile);
    console.log(`index.html already exists, not overwriting`);
  } catch (error) {
    const indexContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 2rem auto;
      padding: 2rem;
      line-height: 1.6;
    }
    code {
      background: #f4f4f4;
      padding: 0.2rem 0.4rem;
      border-radius: 3px;
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p>Drop your background images into <code>img/</code> and replace this page with your actual presentation markup.</p>
</body>
</html>
`;
    await fs.writeFile(weekIndexFile, indexContent, 'utf-8');
    console.log(`✓ Created ${weekIndexFile}`);
  }
  
  console.log('\n✅ Week successfully added!');
  console.log(`\nNext steps:`);
  console.log(`1. Add images to ${slug}/img/`);
  console.log(`2. Update ${slug}/index.html with your presentation content`);
}

// Run main function
main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
