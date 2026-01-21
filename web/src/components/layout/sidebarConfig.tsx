/**
 * Sidebar Navigation Configuration
 *
 * Defines all navigation items with their icons, labels, and routes.
 * Uses lucide-react for modern, consistent iconography.
 *
 * Vendavo-style B2B CPQ Navigation:
 * - Primary nav: Core pricing and quoting workflows
 * - Secondary nav: Settings and admin functions
 */

import {
  LayoutDashboard,
  Package,
  FileText,
  CheckCircle,
  Settings,
  type LucideIcon,
} from 'lucide-react';
// Removed: LineChart, Bot, TrendingUp, Handshake (de-engineered Analytics, Assistant, LME, Price Agreements)

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  section: 'main' | 'secondary';
  comingSoon?: boolean;
}

export const navItems: NavItem[] = [
  // Primary Navigation - Core CPQ Workflows
  {
    key: 'dashboard',
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    section: 'main',
  },
  {
    key: 'rfqs',
    label: 'Commercial Requests',
    href: '/rfqs',
    icon: FileText,
    section: 'main',
  },
  {
    key: 'materials',
    label: 'Materials Catalog',
    href: '/materials',
    icon: Package,
    section: 'main',
  },
  {
    key: 'approvals',
    label: 'Approvals',
    href: '/approvals',
    icon: CheckCircle,
    section: 'main',
  },
  // Removed: LME Prices, Analytics, Assistant, Price Agreements (de-engineered features)

  // Secondary Navigation - Settings & Admin
  {
    key: 'settings',
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    section: 'secondary',
    comingSoon: true,
  },
];

