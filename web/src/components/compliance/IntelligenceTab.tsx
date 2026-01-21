/**
 * Intelligence Tab - Phase 8 Compliance Center
 * 
 * Regulatory intelligence and learning suggestions
 */

import { Brain, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { useNavigate } from 'react-router-dom';

export default function IntelligenceTab() {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border-indigo-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-indigo-900 dark:text-indigo-100">
            <Brain className="h-6 w-6" />
            Regulatory Intelligence
          </CardTitle>
          <CardDescription className="text-indigo-700 dark:text-indigo-300">
            View learning insights, classification suggestions, and system intelligence from Phase 6.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                The Regulatory Intelligence page shows:
              </p>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-indigo-600" />
                  Learning suggestions from user behavior
                </li>
                <li className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-indigo-600" />
                  Low confidence classifications
                </li>
                <li className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-indigo-600" />
                  Manual override patterns
                </li>
                <li className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-indigo-600" />
                  Recommended keyword mappings
                </li>
              </ul>
            </div>
            <div>
              <Button
                size="lg"
                onClick={() => navigate('/regulatory-intelligence')}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                View Intelligence Dashboard
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-gray-600">Learning Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--</div>
            <p className="text-sm text-gray-600 mt-1">Captured this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-gray-600">Pending Suggestions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--</div>
            <p className="text-sm text-gray-600 mt-1">Awaiting review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-gray-600">Approved Mappings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--</div>
            <p className="text-sm text-gray-600 mt-1">Applied to system</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

