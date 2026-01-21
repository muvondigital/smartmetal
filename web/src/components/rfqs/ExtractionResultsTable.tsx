/**
 * ExtractionResultsTable Component
 * 
 * Displays OCR extraction results in a structured table format.
 * Shows pages, tables detected, and extracted text preview.
 */

import type { StructuredOcr } from '../../types'

interface ExtractionResultsTableProps {
  ocrData: StructuredOcr
}

export function ExtractionResultsTable({ ocrData }: ExtractionResultsTableProps) {
  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-gray-50 rounded-md">
          <p className="text-sm text-gray-600">Pages detected:</p>
          <p className="text-2xl font-bold text-gray-900">{ocrData.rawPages}</p>
        </div>
        <div className="p-4 bg-gray-50 rounded-md">
          <p className="text-sm text-gray-600">Tables detected:</p>
          <p className="text-2xl font-bold text-gray-900">{ocrData.tables.length}</p>
        </div>
      </div>

      {/* Extracted Text Preview */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">Extracted Text Preview</h3>
        <div className="p-4 bg-gray-50 rounded-md max-h-64 overflow-y-auto">
          <pre className="text-xs text-gray-700 whitespace-pre-wrap">
            {ocrData.text.substring(0, 2000)}
            {ocrData.text.length > 2000 && '...'}
          </pre>
        </div>
      </div>

      {/* Table Preview */}
      {ocrData.tables.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Table Preview</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-gray-200">
              <thead className="bg-gray-100">
                {ocrData.tables[0].rows[0] && (
                  <tr>
                    {ocrData.tables[0].rows[0].map((cell, idx) => (
                      <th key={idx} className="px-4 py-2 border border-gray-300 text-left">
                        {cell || `Column ${idx + 1}`}
                      </th>
                    ))}
                  </tr>
                )}
              </thead>
              <tbody>
                {ocrData.tables[0].rows.slice(1, 6).map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    {row.map((cell, colIdx) => (
                      <td key={colIdx} className="px-4 py-2 border border-gray-300">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {ocrData.tables[0].rows.length > 6 && (
              <p className="text-xs text-gray-500 mt-2">
                Showing first 5 data rows of {ocrData.tables[0].rows.length - 1} total
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

