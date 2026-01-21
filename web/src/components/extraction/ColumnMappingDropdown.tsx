/**
 * ColumnMappingDropdown Component
 *
 * Dropdown for changing column field mappings in extraction preview.
 * Part of the SmartMetal Extraction Preview system.
 */

import { ChevronDown, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Button } from '../ui/button';
import type { FieldMappingType, FieldMappingOption } from '../../types/extraction';
import { FIELD_MAPPING_OPTIONS } from '../../types/extraction';
import { cn } from '../../lib/utils';

interface ColumnMappingDropdownProps {
  currentMapping: FieldMappingType;
  onMappingChange: (newMapping: FieldMappingType) => void;
  disabled?: boolean;
}

export function ColumnMappingDropdown({
  currentMapping,
  onMappingChange,
  disabled = false,
}: ColumnMappingDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-6 px-2 text-[11px] font-medium gap-1',
            'bg-white border border-slate-200 rounded',
            'hover:border-teal-400 hover:bg-teal-50',
            'focus:outline-none focus:ring-1 focus:ring-teal-400',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          Map
          <ChevronDown className="w-3 h-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {FIELD_MAPPING_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onMappingChange(option.value)}
            className={cn(
              'flex items-center justify-between cursor-pointer',
              currentMapping === option.value && 'bg-teal-50'
            )}
          >
            <div className="flex flex-col">
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-xs text-slate-500">{option.description}</span>
            </div>
            {currentMapping === option.value && (
              <Check className="w-4 h-4 text-teal-600" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
