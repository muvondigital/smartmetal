/**
 * ExtractionProgressSteps Component
 *
 * Visual progress indicator for extraction workflow.
 * Part of the SmartMetal Extraction Preview system.
 */

import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';

type StepStatus = 'completed' | 'active' | 'pending';

interface Step {
  number: number;
  label: string;
  status: StepStatus;
}

interface ExtractionProgressStepsProps {
  currentStep: 1 | 2 | 3;
}

export function ExtractionProgressSteps({ currentStep }: ExtractionProgressStepsProps) {
  const steps: Step[] = [
    {
      number: 1,
      label: 'Upload Document',
      status: currentStep > 1 ? 'completed' : currentStep === 1 ? 'active' : 'pending',
    },
    {
      number: 2,
      label: 'AI Extraction',
      status: currentStep > 2 ? 'completed' : currentStep === 2 ? 'active' : 'pending',
    },
    {
      number: 3,
      label: 'Review & Create',
      status: currentStep === 3 ? 'active' : 'pending',
    },
  ];

  return (
    <div className="flex items-center justify-center gap-0 py-5 px-6 bg-white rounded-xl border border-slate-200 shadow-sm">
      {steps.map((step, index) => (
        <div key={step.number} className="flex items-center">
          {/* Step Circle + Label */}
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all',
                step.status === 'completed' && 'bg-teal-500 text-white',
                step.status === 'active' &&
                  'bg-teal-500 text-white ring-4 ring-teal-100',
                step.status === 'pending' && 'bg-slate-200 text-slate-500'
              )}
            >
              {step.status === 'completed' ? (
                <Check className="w-4 h-4" strokeWidth={3} />
              ) : (
                step.number
              )}
            </div>
            <span
              className={cn(
                'text-sm font-medium',
                step.status === 'active' && 'text-slate-900',
                step.status === 'completed' && 'text-slate-600',
                step.status === 'pending' && 'text-slate-500'
              )}
            >
              {step.label}
            </span>
          </div>

          {/* Connector */}
          {index < steps.length - 1 && (
            <div
              className={cn(
                'w-20 h-0.5 mx-4',
                step.status === 'completed'
                  ? 'bg-teal-500'
                  : step.status === 'active'
                  ? 'bg-gradient-to-r from-teal-500 to-slate-200'
                  : 'bg-slate-200'
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}
