import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Package,
  Building2,
  Truck,
  Settings,
  Activity,
  Shield,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../../lib/utils'

interface NavItem {
  key: string
  label: string
  href: string
  icon: LucideIcon
  section: 'main' | 'settings'
}

const navItems: NavItem[] = [
  // Main Navigation
  {
    key: 'dashboard',
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    section: 'main',
  },
  {
    key: 'clients',
    label: 'Clients',
    href: '/clients',
    icon: Building2,
    section: 'main',
  },
  {
    key: 'materials',
    label: 'Materials',
    href: '/materials',
    icon: Package,
    section: 'main',
  },
  {
    key: 'suppliers',
    label: 'Suppliers',
    href: '/suppliers',
    icon: Truck,
    section: 'main',
  },
  {
    key: 'users',
    label: 'Users',
    href: '/users',
    icon: Users,
    section: 'main',
  },
  {
    key: 'system-health',
    label: 'System Health',
    href: '/system-health',
    icon: Activity,
    section: 'main',
  },
  // Settings Section
  {
    key: 'tenant-settings',
    label: 'Tenant Settings',
    href: '/settings/tenant',
    icon: Settings,
    section: 'settings',
  },
  {
    key: 'pricing-rules',
    label: 'Pricing Rules',
    href: '/settings/pricing-rules',
    icon: Shield,
    section: 'settings',
  },
  {
    key: 'approval-rules',
    label: 'Approval Rules',
    href: '/settings/approval-rules',
    icon: Shield,
    section: 'settings',
  },
]

export default function AdminSidebar() {
  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">System Management</p>
      </div>
      
      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">
            Main
          </h2>
          <div className="space-y-1">
            {navItems
              .filter(item => item.section === 'main')
              .map(item => (
                <NavLink
                  key={item.key}
                  to={item.href}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-50'
                    )
                  }
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </NavLink>
              ))}
          </div>
        </div>

        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">
            Settings
          </h2>
          <div className="space-y-1">
            {navItems
              .filter(item => item.section === 'settings')
              .map(item => (
                <NavLink
                  key={item.key}
                  to={item.href}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-50'
                    )
                  }
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </NavLink>
              ))}
          </div>
        </div>
      </nav>
    </aside>
  )
}

