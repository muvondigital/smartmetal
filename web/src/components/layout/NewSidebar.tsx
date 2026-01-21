/**
 * Sidebar Navigation Component
 * 
 * Modern sidebar with icon-only compact mode.
 * Features:
 * - Gradient slate background for professional look
 * - Active state highlighting with rounded background
 * - Hover tooltips for navigation labels
 * - Separated main and secondary navigation sections
 */

import { Link, useLocation } from 'react-router-dom';
import { navItems, NavItem } from './sidebarConfig';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import { UserMenu } from '../UserMenu';
import { useAuth } from '../../contexts/AuthContext';

export function NewSidebar() {
  const location = useLocation();
  const currentPath = location.pathname;
  const { user } = useAuth();

  const mainItems = navItems.filter(item => item.section === 'main');
  const secondaryItems = navItems.filter(item => item.section === 'secondary');

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      // Dashboard is active for root, /dashboard, and /pricing-runs/* (since they're accessed from dashboard)
      return currentPath === '/dashboard' || currentPath === '/' || currentPath.startsWith('/pricing-runs');
    }
    return currentPath.startsWith(href);
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-[72px] bg-gradient-to-b from-slate-900 to-slate-800 border-r border-slate-700/50 flex flex-col z-50">
      {/* Logo / Brand Section */}
      <div className="h-16 flex items-center justify-center border-b border-slate-700/50">
        <div className="w-10 h-10 bg-teal-500 rounded-xl flex items-center justify-center">
          <span className="text-white font-bold text-lg">N</span>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 py-4 flex flex-col gap-3 px-3 overflow-y-auto">
        <TooltipProvider delayDuration={0}>
          {mainItems.map(item => (
            <SidebarNavItem
              key={item.key}
              item={item}
              isActive={isActive(item.href)}
            />
          ))}
        </TooltipProvider>
      </nav>

      {/* Secondary Navigation */}
      <div className="py-4 flex flex-col gap-3 px-3 border-t border-slate-700/50">
        <TooltipProvider delayDuration={0}>
          {secondaryItems.map(item => (
            <SidebarNavItem
              key={item.key}
              item={item}
              isActive={isActive(item.href)}
            />
          ))}
        </TooltipProvider>
      </div>

      {/* User Profile Section */}
      <div className="h-16 flex items-center justify-center border-t border-slate-700/50">
        <UserMenu
          userName={user?.name || 'User'}
          userEmail={user?.email}
        >
          <button className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center hover:bg-slate-500 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-800">
            <span className="text-white text-sm font-medium">
              {user?.name
                ? user.name
                    .split(' ')
                    .map(n => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)
                : 'U'}
            </span>
          </button>
        </UserMenu>
      </div>
    </aside>
  );
}

interface SidebarNavItemProps {
  item: NavItem;
  isActive: boolean;
}

function SidebarNavItem({ item, isActive }: SidebarNavItemProps) {
  const Icon = item.icon;
  const isDisabled = item.comingSoon;

  // If coming soon, render as disabled button instead of link
  if (isDisabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="
              relative w-full h-12 flex items-center justify-center rounded-xl
              text-slate-400 opacity-50 cursor-not-allowed
            "
          >
            <Icon className="w-5 h-5" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>{item.label} (Coming soon)</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={item.href}
          className={`
            relative w-full h-12 flex items-center justify-center rounded-xl transition-all
            ${isActive
              ? 'bg-teal-500/10 text-teal-400'
              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/50'
            }
          `}
        >
          <Icon className={`w-5 h-5 ${isActive ? 'w-6 h-6' : ''}`} />
          {isActive && (
            <div className="absolute left-0 w-1 h-8 bg-teal-500 rounded-r-full" />
          )}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">
        <p>{item.label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

