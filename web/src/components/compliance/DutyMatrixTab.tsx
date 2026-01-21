/**
 * Duty Matrix Tab - Phase 8 Compliance Center
 * 
 * View and manage versioned trade agreement matrices
 */

import { useEffect, useState } from 'react';
import { Globe, Calendar } from 'lucide-react';
import { Badge } from '../ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { request as apiRequest } from '../../api/client';
import { Skeleton } from '../ui/skeleton';
import { Alert, AlertDescription } from '../ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

interface AgreementVersion {
  version: string;
  effective_from: string;
  effective_to: string | null;
  description: string;
  rates: Record<string, number>;
}

interface Agreement {
  agreement: string;
  versions: AgreementVersion[];
}

export default function DutyMatrixTab() {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgreement, setSelectedAgreement] = useState<string>('');

  useEffect(() => {
    loadAgreements();
  }, []);

  const loadAgreements = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiRequest('/regulatory/versioned-agreements');
      
      if (response.success) {
        const agreementsList = response.agreements || [];
        setAgreements(agreementsList);
        if (agreementsList.length > 0) {
          setSelectedAgreement(agreementsList[0].agreement);
        }
      } else {
        setError(response.error || 'Failed to load versioned agreements');
      }
    } catch (err) {
      setError('Failed to load versioned agreements');
      console.error('Error loading agreements:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info Card */}
      <Card className="bg-gradient-to-r from-green-50 to-teal-50 dark:from-green-900/20 dark:to-teal-900/20 border-green-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-green-900 dark:text-green-100">
            <Globe className="h-5 w-5" />
            Trade Agreement Rate Matrices
          </CardTitle>
          <CardDescription className="text-green-700 dark:text-green-300">
            Versioned preferential duty rates for trade agreements. Each agreement can have multiple versions over time.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Agreement Tabs */}
      <Tabs value={selectedAgreement} onValueChange={setSelectedAgreement}>
        <TabsList>
          {agreements.map((agreement) => (
            <TabsTrigger key={agreement.agreement} value={agreement.agreement}>
              {agreement.agreement}
            </TabsTrigger>
          ))}
        </TabsList>

        {agreements.map((agreement) => (
          <TabsContent key={agreement.agreement} value={agreement.agreement} className="mt-4">
            <div className="space-y-6">
              {agreement.versions.map((version) => (
                <Card key={version.version}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">Version {version.version}</CardTitle>
                        <CardDescription className="mt-1">{version.description}</CardDescription>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="h-4 w-4" />
                        <span>{new Date(version.effective_from).toLocaleDateString()}</span>
                        <span>→</span>
                        <span>{version.effective_to ? new Date(version.effective_to).toLocaleDateString() : 'Current'}</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>HS Code</TableHead>
                            <TableHead>Duty Rate (%)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(version.rates).length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={2} className="text-center text-gray-500 py-4">
                                No rates defined
                              </TableCell>
                            </TableRow>
                          ) : (
                            Object.entries(version.rates).map(([hsCode, rate]) => (
                              <TableRow key={hsCode}>
                                <TableCell className="font-mono font-semibold">{hsCode}</TableCell>
                                <TableCell>
                                  <Badge variant={rate === 0 ? 'default' : 'secondary'}>
                                    {rate}%
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="mt-2 text-sm text-gray-600">
                      {Object.keys(version.rates).length} HS codes configured
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Summary */}
      <div className="text-sm text-gray-600">
        {agreements.length} trade agreements configured with{' '}
        {agreements.reduce((sum, a) => sum + a.versions.length, 0)} total versions
      </div>
    </div>
  );
}

