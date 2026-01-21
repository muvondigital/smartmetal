/**
 * SectionNavigator Component
 *
 * Displays document sections/categories with item counts.
 * Allows navigation between sections for MTO documents.
 * Part of the SmartMetal Extraction Preview system.
 */

import { List, Square, Circle, Package, Layers, Cable, Box } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import type { ExtractionSection } from '../../types/extraction';
import { cn } from '../../lib/utils';

interface SectionNavigatorProps {
  sections: ExtractionSection[];
  activeSection: string | null;
  onSectionChange: (sectionId: string) => void;
}

// Map section names to icons
function getSectionIcon(name: string) {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('steel') || lowerName.includes('material')) {
    return <Square className="w-4 h-4" />;
  }
  if (lowerName.includes('cable') && lowerName.includes('ladder')) {
    return <Layers className="w-4 h-4" />;
  }
  if (lowerName.includes('cable')) {
    return <Cable className="w-4 h-4" />;
  }
  if (lowerName.includes('junction') || lowerName.includes('box')) {
    return <Box className="w-4 h-4" />;
  }
  if (lowerName.includes('pipe') || lowerName.includes('fitting')) {
    return <Circle className="w-4 h-4" />;
  }
  return <Package className="w-4 h-4" />;
}

export function SectionNavigator({
  sections,
  activeSection,
  onSectionChange,
}: SectionNavigatorProps) {
  // If no sections, show "All Items" as default
  const displaySections =
    sections.length > 0
      ? sections
      : [{ id: 'all', name: 'All Items', itemCount: 0 }];

  return (
    <Card className="shadow-sm">
      <CardHeader className="px-5 py-4 border-b border-slate-200">
        <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <List className="w-4 h-4 text-slate-500" />
          Sections
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        <div className="flex flex-col gap-1">
          {displaySections.map((section) => {
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                onClick={() => onSectionChange(section.id)}
                className={cn(
                  'flex items-center justify-between px-3 py-2.5 rounded-lg transition-all',
                  'border border-transparent hover:bg-slate-50',
                  isActive && 'bg-teal-50 border-teal-200 hover:bg-teal-50'
                )}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      'w-8 h-8 rounded-md flex items-center justify-center',
                      isActive ? 'bg-teal-100 text-teal-600' : 'bg-slate-100 text-slate-600'
                    )}
                  >
                    {getSectionIcon(section.name)}
                  </div>
                  <span
                    className={cn(
                      'text-[13px] font-medium',
                      isActive ? 'text-teal-700' : 'text-slate-700'
                    )}
                  >
                    {section.name}
                  </span>
                </div>
                <span
                  className={cn(
                    'text-xs font-semibold px-2 py-0.5 rounded-full',
                    isActive
                      ? 'bg-teal-200 text-teal-700'
                      : 'bg-slate-100 text-slate-500'
                  )}
                >
                  {section.itemCount}
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
