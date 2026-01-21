/**
 * Table Filtering Utility for Chunked Extraction
 * 
 * Filters tables based on page ranges to reduce prompt size in chunked extraction.
 * This prevents sending all tables to every chunk, significantly reducing token usage.
 */

/**
 * Filter tables that fall within a page range (with overlap buffer)
 * @param {Array} tables - Array of table objects with pageNumbers property
 * @param {number} startPage - Starting page of chunk (1-indexed)
 * @param {number} endPage - Ending page of chunk (1-indexed)
 * @param {number} overlapBuffer - Pages to include before/after chunk for overlap (default: 2)
 * @returns {Array} Filtered array of tables
 */
function filterTablesByPageRange(tables, startPage, endPage, overlapBuffer = 2) {
  if (!tables || tables.length === 0) {
    return [];
  }

  // Expand range slightly to catch tables that might span chunk boundaries
  const expandedStartPage = Math.max(1, startPage - overlapBuffer);
  const expandedEndPage = endPage + overlapBuffer;

  return tables.filter(table => {
    // Tables have pageNumbers array: [pageNumber] or [startPage, endPage]
    if (!table.pageNumbers || table.pageNumbers.length === 0) {
      // If no page info, include it (conservative approach)
      // But in practice, tables should always have pageNumbers from Document AI
      return true;
    }

    // Get the primary page number (first in array)
    const tablePage = table.pageNumbers[0];
    
    // Include table if its page falls within the expanded range
    return tablePage >= expandedStartPage && tablePage <= expandedEndPage;
  });
}

/**
 * Extract table section from prompt and rebuild with filtered tables
 * This is used when we need to filter tables in an already-built prompt
 * 
 * @param {string} prompt - Full prompt text with TABLES DETECTED section
 * @param {Array} allTables - All tables from structured data
 * @param {number} startPage - Starting page of chunk
 * @param {number} endPage - Ending page of chunk
 * @returns {string} Prompt with filtered tables section
 */
function rebuildPromptWithFilteredTables(prompt, allTables, startPage, endPage) {
  // Filter tables for this chunk
  const filteredTables = filterTablesByPageRange(allTables, startPage, endPage);
  
  // Find the TABLES DETECTED section in the prompt
  const tablesSectionRegex = /## TABLES DETECTED:[\s\S]*?(?=\n\n##|\n\nDOCUMENT TEXT:|$)/;
  const tablesMatch = prompt.match(tablesSectionRegex);
  
  if (!tablesMatch) {
    // No tables section found, return original prompt
    return prompt;
  }

  // Rebuild tables section with filtered tables
  let newTablesSection = '\n\n## TABLES DETECTED:\n\n';
  newTablesSection += `NOTE: Tables filtered for pages ${startPage}-${endPage} (showing ${filteredTables.length} of ${allTables.length} tables)\n`;
  newTablesSection += 'Only tables from the current page range are shown.\n\n';
  newTablesSection += 'WARNING: Table detection did not identify line-item tables automatically.\n';
  newTablesSection += 'You must manually identify which table(s) contain line items and extract ALL rows.\n';
  newTablesSection += 'Look for tables with Item/No columns and Description/Detail columns.\n\n';
  newTablesSection += 'IGNORE these table types (already filtered, but double-check):\n';
  newTablesSection += '- VDRL tables (headers: "Document No.", "Document Title", "VDRL Code")\n';
  newTablesSection += '- Revision tables (headers: "Rev.", "Approved by", "Date")\n';
  newTablesSection += '- Approval matrices (headers: "Approved by", "Prepared by", "Checked by")\n\n';
  
  filteredTables.forEach((table, idx) => {
    newTablesSection += `Table ${idx + 1} (${table.rowCount || 0} rows × ${table.columnCount || 0} columns`;
    if (table.pageNumbers && table.pageNumbers.length > 0) {
      newTablesSection += `, page ${table.pageNumbers[0]}`;
    }
    newTablesSection += `):\n`;
    
    // Show first few rows to help identify structure
    if (table.rows && table.rows.length > 0) {
      const previewRows = Math.min(10, table.rows.length);
      table.rows.slice(0, previewRows).forEach((row, rowIdx) => {
        newTablesSection += `Row ${rowIdx + 1}: ${JSON.stringify(row)}\n`;
      });
      if (table.rows.length > previewRows) {
        newTablesSection += `... (${table.rows.length - previewRows} more rows)\n`;
      }
    }
    newTablesSection += '\n';
  });
  
  newTablesSection += '\nCRITICAL: Extract ALL rows from line-item tables. Do NOT skip any rows.\n';
  newTablesSection += 'If you find a table with Item numbers (1, 2, 3...), extract every single row.\n';

  // Replace the tables section in the prompt
  const newPrompt = prompt.replace(tablesSectionRegex, newTablesSection);
  
  return newPrompt;
}

module.exports = {
  filterTablesByPageRange,
  rebuildPromptWithFilteredTables
};

