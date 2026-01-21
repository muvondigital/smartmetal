/**
 * TopBar Component
 * 
 * Application header that sits above the main content area.
 * Features:
 * - Page title/breadcrumb on the left
 * - Global search in center (placeholder)
 * - Quick actions on the right
 */

import { Search, Plus } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Link, useLocation } from 'react-router-dom';

interface TopBarProps {
  title: string;
}

export function TopBar({ title }: TopBarProps) {
  const location = useLocation();
  const path = location.pathname;

  const isOnDashboard = path === '/dashboard';

  const handleOpenQuickEstimate = () => {
    window.dispatchEvent(new Event('open-qee'));
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center gap-4 px-6 sticky top-0 z-40">
      {/* Left: Page Title */}
      <div className="flex items-center gap-4">
        <h1 className="text-slate-900 font-semibold text-lg">{title}</h1>
      </div>

      {/* Center: Global Search */}
      <div className="flex-1 max-w-xl mx-8">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            type="text"
            placeholder="Search quotes, customers, products..."
            className="pl-10 bg-slate-50 border-slate-200"
          />
        </div>
      </div>

      {/* Right: Quick Actions */}
      <div className="flex items-center gap-3 ml-auto">
        {isOnDashboard && (
          <Button size="sm" variant="outline" onClick={handleOpenQuickEstimate}>
            Quick Estimate
          </Button>
        )}
      </div>
    </header>
  );
}

