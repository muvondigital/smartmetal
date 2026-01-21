/**
 * Compliance Center - Phase 8
 * 
 * Centralized admin UI for managing all regulatory data:
 * - HS Codes
 * - Global Keyword Mappings
 * - Tenant-Specific Mappings
 * - Versioned Duty Rules
 * - Versioned Agreement Matrix
 * - Regulatory Intelligence
 */

import { useState } from 'react';
import { 
  FileText, 
  BookOpen, 
  Globe, 
  Building2, 
  Scale, 
  Shield, 
  Brain,
  ChevronRight
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import HsCodeLibraryTab from '../components/compliance/HsCodeLibraryTab';
import GlobalMappingsTab from '../components/compliance/GlobalMappingsTab';
import TenantMappingsTab from '../components/compliance/TenantMappingsTab';
import DutyRulesTab from '../components/compliance/DutyRulesTab';
import DutyMatrixTab from '../components/compliance/DutyMatrixTab';
import IntelligenceTab from '../components/compliance/IntelligenceTab';

export default function ComplianceCenter() {
  const [activeTab, setActiveTab] = useState('hs-codes');

  const tabs = [
    {
      id: 'hs-codes',
      label: 'HS Codes',
      icon: FileText,
      description: 'Harmonized System code library',
      component: HsCodeLibraryTab,
    },
    {
      id: 'global-mappings',
      label: 'Global Mappings',
      icon: Globe,
      description: 'Global keyword to HS code mappings',
      component: GlobalMappingsTab,
    },
    {
      id: 'tenant-mappings',
      label: 'Tenant Mappings',
      icon: Building2,
      description: 'Tenant-specific keyword mappings',
      component: TenantMappingsTab,
    },
    {
      id: 'duty-rules',
      label: 'Duty Rules',
      icon: Scale,
      description: 'Versioned duty rules and conditions',
      component: DutyRulesTab,
    },
    {
      id: 'duty-matrix',
      label: 'Duty Matrix',
      icon: Shield,
      description: 'Trade agreement rate matrices',
      component: DutyMatrixTab,
    },
    {
      id: 'intelligence',
      label: 'Intelligence',
      icon: Brain,
      description: 'Learning insights and suggestions',
      component: IntelligenceTab,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Compliance Center
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Manage regulatory data and classifications
              </p>
            </div>
            <Badge variant="outline" className="text-sm">
              Phase 8
            </Badge>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* Tab Navigation */}
          <TabsList className="grid w-full grid-cols-6 mb-6">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center gap-2"
              >
                <tab.icon className="h-4 w-4" />
                <span className="hidden lg:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Tab Descriptions */}
          <div className="mb-6">
            {tabs.map((tab) => (
              activeTab === tab.id && (
                <Card key={tab.id} className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-3">
                    <tab.icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <div>
                      <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                        {tab.label}
                      </h3>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        {tab.description}
                      </p>
                    </div>
                  </div>
                </Card>
              )
            ))}
          </div>

          {/* Tab Content */}
          {tabs.map((tab) => {
            const Component = tab.component;
            return (
              <TabsContent key={tab.id} value={tab.id} className="mt-0">
                <Component />
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </div>
  );
}

