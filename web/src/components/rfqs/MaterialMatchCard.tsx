/**
 * MaterialMatchCard Component
 * 
 * Displays material match information for a line item.
 * Shows the matched material code, confidence score, and reason.
 * Allows selecting from multiple matches if available.
 */

import { useState } from 'react'
import type { MatchedMaterial } from '../../types'
import { ConfidenceIndicator } from './ConfidenceIndicator'

interface MaterialMatchCardProps {
  lineNumber: string | null
  description: string
  matchedMaterials: MatchedMaterial[]
  onSelectMaterial?: (materialIndex: number) => void
}

export function MaterialMatchCard({
  lineNumber,
  description,
  matchedMaterials,
  onSelectMaterial,
}: MaterialMatchCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!matchedMaterials || matchedMaterials.length === 0) {
    return (
      <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">
              Line {lineNumber || 'N/A'}: {description.substring(0, 50)}
              {description.length > 50 && '...'}
            </p>
            <p className="text-xs text-gray-500 mt-1">No material matches found</p>
          </div>
          <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">
            No Match
          </span>
        </div>
      </div>
    )
  }

  const primaryMatch = matchedMaterials[0]
  const hasMultipleMatches = matchedMaterials.length > 1

  return (
    <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-gray-500">Line {lineNumber || 'N/A'}</span>
            {hasMultipleMatches && (
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                {matchedMaterials.length} matches
              </span>
            )}
          </div>
          <p className="text-sm text-gray-900 font-medium">{description}</p>
        </div>
        <ConfidenceIndicator score={primaryMatch.score} />
      </div>

      {/* Primary Match */}
      <div className="mb-3 p-3 bg-blue-50 rounded-md border border-blue-200">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">
              {primaryMatch.material_code || 'N/A'}
            </p>
            {primaryMatch.reason && (
              <p className="text-xs text-gray-600 mt-1">{primaryMatch.reason}</p>
            )}
          </div>
          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-medium">
            Selected
          </span>
        </div>
      </div>

      {/* Additional Matches */}
      {hasMultipleMatches && (
        <div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            {isExpanded ? 'Hide' : 'Show'} {matchedMaterials.length - 1} other match{matchedMaterials.length - 1 > 1 ? 'es' : ''}
          </button>

          {isExpanded && (
            <div className="mt-2 space-y-2">
              {matchedMaterials.slice(1).map((material, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-gray-50 rounded-md border border-gray-200 hover:bg-gray-100 cursor-pointer transition-colors"
                  onClick={() => onSelectMaterial && onSelectMaterial(idx + 1)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {material.material_code || 'N/A'}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <ConfidenceIndicator score={material.score} size="small" />
                        {material.reason && (
                          <p className="text-xs text-gray-500">{material.reason}</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectMaterial && onSelectMaterial(idx + 1)
                      }}
                      className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                    >
                      Select
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

