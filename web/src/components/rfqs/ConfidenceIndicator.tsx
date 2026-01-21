/**
 * ConfidenceIndicator Component
 * 
 * Visual indicator for confidence scores (0-100%).
 * Uses color coding: green (high), yellow (medium), red (low).
 */

interface ConfidenceIndicatorProps {
  score: number
  size?: 'small' | 'medium' | 'large'
  showLabel?: boolean
}

export function ConfidenceIndicator({
  score,
  size = 'medium',
  showLabel = true,
}: ConfidenceIndicatorProps) {
  // Clamp score between 0 and 100
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)))

  // Determine color based on score
  const getColorClass = (score: number) => {
    if (score >= 80) return 'bg-green-100 text-green-800 border-green-300'
    if (score >= 60) return 'bg-yellow-100 text-yellow-800 border-yellow-300'
    if (score >= 40) return 'bg-orange-100 text-orange-800 border-orange-300'
    return 'bg-red-100 text-red-800 border-red-300'
  }

  // Size classes
  const sizeClasses = {
    small: 'text-xs px-2 py-0.5',
    medium: 'text-sm px-2.5 py-1',
    large: 'text-base px-3 py-1.5',
  }

  const colorClass = getColorClass(clampedScore)

  return (
    <div className="flex items-center gap-2">
      {/* Score Badge */}
      <span
        className={`inline-flex items-center font-semibold rounded border ${sizeClasses[size]} ${colorClass}`}
      >
        {clampedScore}%
      </span>

      {/* Progress Bar (optional, for larger displays) */}
      {size !== 'small' && (
        <div className="flex-1 max-w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              clampedScore >= 80
                ? 'bg-green-500'
                : clampedScore >= 60
                ? 'bg-yellow-500'
                : clampedScore >= 40
                ? 'bg-orange-500'
                : 'bg-red-500'
            }`}
            style={{ width: `${clampedScore}%` }}
          />
        </div>
      )}

      {/* Label */}
      {showLabel && size !== 'small' && (
        <span className="text-xs text-gray-500">
          {clampedScore >= 80
            ? 'High'
            : clampedScore >= 60
            ? 'Medium'
            : clampedScore >= 40
            ? 'Low'
            : 'Very Low'}
        </span>
      )}
    </div>
  )
}

