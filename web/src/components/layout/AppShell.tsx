/**
 * AppShell Layout Component
 * 
 * Main layout wrapper that combines Sidebar and TopBar.
 * Provides the foundational structure for all pages in the app.
 * 
 * Layout structure:
 * - Fixed sidebar on the left (72px width)
 * - Main content area with top bar and scrollable content
 */

import { ReactNode } from 'react';
import { NewSidebar } from './NewSidebar';
import { TopBar } from './TopBar';
import DemoBanner from './DemoBanner';
import { useAuth } from '../../contexts/AuthContext';

interface AppShellProps {
  children: ReactNode;
  title: string;
}

export default function AppShell({ children, title }: AppShellProps) {
  const { tenant } = useAuth();
  const isDemo = tenant?.is_demo === true;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar - Fixed left navigation */}
      <NewSidebar />
      
      {/* Main Content Area - Offset by sidebar width */}
      <div className="ml-[72px]">
        {/* Top Bar - Sticky header */}
        <TopBar title={title} />
        
        {/* Demo Banner - Shows for demo tenants only */}
        <DemoBanner isDemo={isDemo} />
        
        {/* Page Content - Scrollable area */}
        <main className="min-h-[calc(100vh-4rem)]">
          {children}
        </main>
      </div>
    </div>
  );
}

