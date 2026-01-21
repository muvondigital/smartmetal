/**
 * HS Code Seed Generator
 * 
 * Converts raw HS Code markdown files into a normalized JSON seed file.
 * 
 * This script:
 * - Reads all .md files from backend/data/hs_codes_raw
 * - Parses markdown tables to extract HS codes, descriptions, and duty rates
 * - Normalizes and deduplicates the data
 * - Outputs backend/src/db/seeds/data/hs_codes_seed.json
 * 
 * Usage:
 *   node scripts/tools/generateHsCodesSeed.js
 *   OR
 *   npm run generate:hs-seed
 */

const fs = require('fs').promises;
const path = require('path');

// Constants
const RAW_DIR = path.join(__dirname, '..', '..', 'data', 'hs_codes_raw');
const OUTPUT_DIR = path.join(__dirname, '..', '..', 'src', 'db', 'seeds', 'data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'hs_codes_seed.json');

/**
 * Extract category from filename
 * Example: "smartmetal_hs_code_pipes.md" -> "pipes"
 */
function extractCategory(filename) {
  const baseName = path.basename(filename, '.md');
  // Remove "smartmetal_hs_code_" prefix if present
  const category = baseName.replace(/^smartmetal_hs_code_/i, '').toLowerCase();
  return category;
}

/**
 * Parse duty rate string to number
 * Handles formats like: "5%", "5 %", "5.0%", "0", "0%", "Free"
 */
function parseDutyRate(dutyString) {
  if (!dutyString || typeof dutyString !== 'string') {
    return 0;
  }

  const normalized = dutyString.trim().toLowerCase();
  
  // Handle "free" or empty
  if (normalized === 'free' || normalized === '' || normalized === 'n/a') {
    return 0;
  }

  // Remove % and whitespace, then parse
  const cleaned = normalized.replace(/%/g, '').trim();
  const parsed = parseFloat(cleaned);
  
  if (isNaN(parsed)) {
    return 0;
  }
  
  return parsed;
}

/**
 * Normalize description text
 */
function normalizeDescription(desc) {
  if (!desc || typeof desc !== 'string') {
    return '';
  }
  // Trim and collapse multiple spaces
  return desc.trim().replace(/\s+/g, ' ');
}

/**
 * Normalize HS code
 */
function normalizeHsCode(hsCode) {
  if (!hsCode || typeof hsCode !== 'string') {
    return '';
  }
  // Trim, remove markdown bold markers (**), and remove quotes
  return hsCode.trim()
    .replace(/\*\*/g, '') // Remove markdown bold markers
    .replace(/^["']|["']$/g, ''); // Remove quotes
}

/**
 * Find column indices in header row
 */
function findColumnIndices(headerRow) {
  const cells = headerRow.split('|').map(c => c.trim().toLowerCase());
  
  let hsCodeIdx = -1;
  let descIdx = -1;
  let dutyIdx = -1;
  
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (hsCodeIdx === -1 && (cell.includes('hs code') || cell.includes('hs_code') || cell === 'code')) {
      hsCodeIdx = i;
    }
    if (descIdx === -1 && (cell.includes('description') || cell.includes('desc'))) {
      descIdx = i;
    }
    if (dutyIdx === -1 && (cell.includes('duty') || cell.includes('rate') || cell.includes('import duty'))) {
      dutyIdx = i;
    }
  }
  
  return { hsCodeIdx, descIdx, dutyIdx };
}

/**
 * Check if a line is a table separator row
 */
function isSeparatorRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) {
    return false;
  }
  // Separator rows typically have multiple dashes
  return /^\|[\s\-:]+\|/.test(trimmed);
}

/**
 * Parse a markdown file and extract HS code entries
 */
async function parseMarkdownFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.split('\n');
  
  const category = extractCategory(path.basename(filePath));
  const entries = [];
  
  let inTable = false;
  let headerRow = null;
  let columnIndices = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) {
      continue;
    }
    
    // Check if this is a table row
    if (line.startsWith('|')) {
      // Check if it's a separator row
      if (isSeparatorRow(line)) {
        if (headerRow && !columnIndices) {
          // We found the separator after the header, so parse the header
          columnIndices = findColumnIndices(headerRow);
          inTable = true;
        }
        continue;
      }
      
      // Check if this looks like a header row (contains column names)
      if (!inTable && !headerRow) {
        const lowerLine = line.toLowerCase();
        if (lowerLine.includes('hs code') || lowerLine.includes('description') || lowerLine.includes('duty') || lowerLine.includes('import duty')) {
          headerRow = line;
          continue;
        }
      }
      
      // If we're in a table and have column indices, parse data rows
      if (inTable && columnIndices) {
        const cells = line.split('|').map(c => c.trim());
        
        // Skip if not enough cells
        if (cells.length < 2) {
          continue;
        }
        
        const hsCode = normalizeHsCode(cells[columnIndices.hsCodeIdx] || '');
        const description = normalizeDescription(cells[columnIndices.descIdx] || '');
        const dutyString = cells[columnIndices.dutyIdx] || '';
        
        // Skip if HS code is missing or invalid
        if (!hsCode) {
          continue;
        }
        
        // Skip placeholder codes (containing "xxxx" or similar)
        if (hsCode.toLowerCase().includes('xxxx') || hsCode.toLowerCase().includes('xxx')) {
          continue;
        }
        
        entries.push({
          hs_code: hsCode,
          description: description || hsCode, // Fallback to HS code if description is empty
          category: category,
          default_import_duty_rate: parseDutyRate(dutyString)
        });
      }
    } else {
      // Non-table line - reset table state if we encounter a new section
      if (line.startsWith('#') || line.startsWith('---')) {
        inTable = false;
        headerRow = null;
        columnIndices = null;
      }
    }
  }
  
  return entries;
}

/**
 * Deduplicate entries, preferring better data
 */
function deduplicateEntries(entries) {
  const map = new Map();
  const categoryCounts = {};
  
  for (const entry of entries) {
    const existing = map.get(entry.hs_code);
    
    if (!existing) {
      // New entry
      map.set(entry.hs_code, entry);
      categoryCounts[entry.category] = (categoryCounts[entry.category] || 0) + 1;
    } else {
      // Duplicate - merge intelligently
      let merged = { ...existing };
      let changed = false;
      
      // Prefer non-empty description
      if (!existing.description && entry.description) {
        merged.description = entry.description;
        changed = true;
      } else if (existing.description && !entry.description) {
        // Keep existing description
      } else if (entry.description && entry.description.length > existing.description.length) {
        // Prefer longer description
        merged.description = entry.description;
        changed = true;
      }
      
      // Prefer non-zero duty rate if they differ
      if (existing.default_import_duty_rate === 0 && entry.default_import_duty_rate !== 0) {
        merged.default_import_duty_rate = entry.default_import_duty_rate;
        changed = true;
      } else if (existing.default_import_duty_rate !== 0 && entry.default_import_duty_rate !== 0) {
        // If both non-zero, prefer the lower (more conservative)
        if (entry.default_import_duty_rate < existing.default_import_duty_rate) {
          merged.default_import_duty_rate = entry.default_import_duty_rate;
          changed = true;
        }
      }
      
      // Prefer more specific category (keep existing for now, but log if different)
      if (existing.category !== entry.category) {
        console.log(`Duplicate HS ${entry.hs_code}: category ${existing.category} → ${entry.category} (keeping ${existing.category})`);
      }
      
      if (changed) {
        map.set(entry.hs_code, merged);
        console.log(`Duplicate HS ${entry.hs_code}: merged (duty: ${existing.default_import_duty_rate} → ${merged.default_import_duty_rate})`);
      }
    }
  }
  
  return Array.from(map.values());
}

/**
 * Main function
 */
async function generateHsCodesSeed() {
  try {
    console.log('='.repeat(60));
    console.log('HS CODE SEED GENERATOR');
    console.log('='.repeat(60));
    console.log('');
    
    // Check if raw directory exists
    try {
      await fs.access(RAW_DIR);
    } catch (error) {
      throw new Error(`Raw directory not found: ${RAW_DIR}`);
    }
    
    // Read all markdown files
    const files = await fs.readdir(RAW_DIR);
    const mdFiles = files.filter(f => f.endsWith('.md'));
    
    if (mdFiles.length === 0) {
      throw new Error(`No markdown files found in ${RAW_DIR}`);
    }
    
    console.log(`Found ${mdFiles.length} markdown file(s):`);
    mdFiles.forEach(f => console.log(`  - ${f}`));
    console.log('');
    
    // Parse all files
    console.log('Parsing markdown files...');
    const allEntries = [];
    
    for (const file of mdFiles) {
      const filePath = path.join(RAW_DIR, file);
      const entries = await parseMarkdownFile(filePath);
      console.log(`  ✓ ${file}: ${entries.length} entries`);
      allEntries.push(...entries);
    }
    
    console.log(`\nTotal entries before deduplication: ${allEntries.length}`);
    
    // Deduplicate
    console.log('Deduplicating entries...');
    const uniqueEntries = deduplicateEntries(allEntries);
    console.log(`Total entries after deduplication: ${uniqueEntries.length}`);
    console.log('');
    
    // Sort by HS code
    uniqueEntries.sort((a, b) => a.hs_code.localeCompare(b.hs_code));
    
    // Count by category
    const categoryCounts = {};
    for (const entry of uniqueEntries) {
      categoryCounts[entry.category] = (categoryCounts[entry.category] || 0) + 1;
    }
    
    // Ensure output directory exists
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    
    // Write JSON file
    console.log(`Writing ${OUTPUT_FILE}...`);
    await fs.writeFile(
      OUTPUT_FILE,
      JSON.stringify(uniqueEntries, null, 2),
      'utf8'
    );
    
    console.log('');
    console.log('='.repeat(60));
    console.log('✅ GENERATION COMPLETE');
    console.log('='.repeat(60));
    console.log('');
    console.log(`Generated: ${OUTPUT_FILE}`);
    console.log(`Total HS codes: ${uniqueEntries.length}`);
    console.log('');
    console.log('Category counts:');
    const sortedCategories = Object.keys(categoryCounts).sort();
    for (const cat of sortedCategories) {
      console.log(`  ${cat}: ${categoryCounts[cat]}`);
    }
    console.log('');
    
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('='.repeat(60));
    console.error('❌ GENERATION FAILED');
    console.error('='.repeat(60));
    console.error('');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    }
    console.error('');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  generateHsCodesSeed();
}

module.exports = { generateHsCodesSeed };

