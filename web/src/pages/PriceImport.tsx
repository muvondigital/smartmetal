/**
 * Price Import Page
 * 
 * Bulk price import from CSV files with preview and review
 * Part of Phase 2: Manufacturer Price Management System
 */

import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Upload, FileText, CheckCircle, AlertCircle, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '../components/ui/alert';
import { Skeleton } from '../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { getRecentPriceChanges, getPriceChangeStats } from '../services/priceImportApi';
import { formatCurrency } from '../lib/formatters';
import { request as apiRequest, requestMultipart } from '../api/client';
import { isAuthError } from '../lib/errorUtils';

interface PriceChangePreview {
  material_id: string;
  material_code: string;
  category: string;
  name: string;
  current_base_cost: number;
  new_base_cost: number;
  change_amount: number;
  change_percentage: number | null;
  effective_date: string;
  notes: string;
  source: string;
}

interface PreviewResponse {
  preview: {
    totalRecords: number;
    materialsFound: Array<any>;
    materialsNotFound: Array<{ material_code: string; base_cost: number }>;
    priceChanges: PriceChangePreview[];
    unchanged: Array<any>;
    errors: Array<{ row: number; material_code?: string; error: string }>;
  };
  summary: {
    total: number;
    found: number;
    notFound: number;
    willUpdate: number;
    unchanged: number;
    errors: number;
  };
}

type Step = 1 | 2 | 3;

export default function PriceImport() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step state
  const [currentStep, setCurrentStep] = useState<Step>(1);

  // Preview state
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [effectiveDate, setEffectiveDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [source, setSource] = useState<'manufacturer_feed' | 'manual_update' | 'lme_adjustment'>('manufacturer_feed');

  // Apply state
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<any>(null);

  // File handling
  const handleFileSelect = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Invalid file type', {
        description: 'Please upload a CSV file',
      });
      return;
    }
    setSelectedFile(file);
    setError(null);
    setPreview(null);
    setCurrentStep(1);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  // Step 1: Upload and Preview
  const handlePreview = async () => {
    if (!selectedFile) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('effective_date', effectiveDate);
      formData.append('source', source);

      const data = await requestMultipart<PreviewResponse>('/price-import/preview', formData);
      setPreview(data);
      setCurrentStep(2);
    } catch (err) {
      if (isAuthError(err)) {
        navigate('/login');
        return;
      }
      const errorMessage = err instanceof Error ? err.message : 'Failed to preview price changes';
      setError(errorMessage);
      toast.error('Preview failed', {
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Apply Changes
  const handleApply = async () => {
    if (!preview || !preview.preview.priceChanges || preview.preview.priceChanges.length === 0) {
      toast.error('No changes to apply');
      return;
    }

    setApplying(true);
    setError(null);

    try {
      const data = await apiRequest<any>('/price-import/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceChanges: preview.preview.priceChanges.map(change => ({
            ...change,
            currency: 'USD',
          })),
          effective_date: effectiveDate,
          source: source,
        }),
      });
      setApplyResult(data);
      setCurrentStep(3);
      
      toast.success('Price changes applied successfully', {
        description: `${data.results.updated} materials updated`,
      });
    } catch (err) {
      if (isAuthError(err)) {
        navigate('/login');
        return;
      }
      const errorMessage = err instanceof Error ? err.message : 'Failed to apply price changes';
      setError(errorMessage);
      toast.error('Apply failed', {
        description: errorMessage,
      });
    } finally {
      setApplying(false);
    }
  };

  const formatChange = (change: number | null) => {
    if (change === null || change === undefined) return 'N/A';
    const sign = change > 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  };

  const getChangeColor = (change: number | null) => {
    if (change === null || change === undefined) return 'text-slate-600';
    if (change > 0) return 'text-green-600';
    if (change < 0) return 'text-red-600';
    return 'text-slate-600';
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Import Manufacturer Prices</h1>
        <p className="text-sm text-gray-600">
          Upload a CSV file with material prices to update the catalog and track price history.
        </p>
      </div>

      {/* Step Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-center space-x-4">
          {[1, 2, 3].map((step) => (
            <div key={step} className="flex items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                  currentStep === step
                    ? 'bg-blue-600 text-white'
                    : currentStep > step
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                {currentStep > step ? '✓' : step}
              </div>
              <span
                className={`ml-2 text-sm font-medium ${
                  currentStep === step ? 'text-blue-600' : 'text-gray-500'
                }`}
              >
                {step === 1 ? 'Upload CSV' : step === 2 ? 'Preview Changes' : 'Apply & Complete'}
              </span>
              {step < 3 && (
                <div
                  className={`w-12 h-0.5 mx-4 ${
                    currentStep > step ? 'bg-green-500' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: Upload */}
      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Price CSV File</CardTitle>
            <CardDescription>
              CSV format: material_code, base_cost, currency, effective_date, notes, source
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* File Upload Area */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className={`border-2 border-dashed rounded-lg p-8 text-center ${
                selectedFile
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              {selectedFile ? (
                <div>
                  <FileText className="w-12 h-12 mx-auto text-blue-600 mb-3" />
                  <p className="text-gray-700 font-medium">{selectedFile.name}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {(selectedFile.size / 1024).toFixed(2)} KB
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedFile(null)}
                    className="mt-4"
                  >
                    Remove file
                  </Button>
                </div>
              ) : (
                <div>
                  <Upload className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                  <p className="text-gray-600 mb-2">Drag and drop your CSV file here</p>
                  <p className="text-sm text-gray-500 mb-4">or</p>
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    variant="default"
                  >
                    Browse Files
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Supported: CSV files only
                  </p>
                </div>
              )}
            </div>

            {/* Import Options */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="effective-date">Effective Date</Label>
                <Input
                  id="effective-date"
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="source">Price Source</Label>
                <select
                  id="source"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  value={source}
                  onChange={(e) => setSource(e.target.value as any)}
                >
                  <option value="manufacturer_feed">Manufacturer Feed</option>
                  <option value="manual_update">Manual Update</option>
                  <option value="lme_adjustment">LME Adjustment</option>
                </select>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end">
              <Button
                onClick={handlePreview}
                disabled={!selectedFile || loading}
              >
                {loading ? 'Processing...' : 'Preview Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Preview */}
      {currentStep === 2 && preview && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{preview.summary.total}</div>
                <p className="text-xs text-gray-600 mt-1">Total Records</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-green-600">{preview.summary.found}</div>
                <p className="text-xs text-gray-600 mt-1">Materials Found</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-blue-600">{preview.summary.willUpdate}</div>
                <p className="text-xs text-gray-600 mt-1">Will Update</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-amber-600">{preview.summary.notFound}</div>
                <p className="text-xs text-gray-600 mt-1">Not Found</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-red-600">{preview.summary.errors}</div>
                <p className="text-xs text-gray-600 mt-1">Errors</p>
              </CardContent>
            </Card>
          </div>

          {/* Materials Not Found */}
          {preview.preview.materialsNotFound.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                  Materials Not Found ({preview.preview.materialsNotFound.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {preview.preview.materialsNotFound.map((item, idx) => (
                    <div key={idx} className="text-sm text-gray-600">
                      {item.material_code}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Price Changes Preview */}
          {preview.preview.priceChanges.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Price Changes Preview ({preview.preview.priceChanges.length} materials)</CardTitle>
                <CardDescription>
                  Review the changes before applying. All changes will be logged to price history.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material Code</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Current Price</TableHead>
                        <TableHead>New Price</TableHead>
                        <TableHead>Change</TableHead>
                        <TableHead>Change %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.preview.priceChanges.map((change, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-sm">{change.material_code}</TableCell>
                          <TableCell>{change.category}</TableCell>
                          <TableCell>{formatCurrency(change.current_base_cost)}</TableCell>
                          <TableCell className="font-semibold">
                            {formatCurrency(change.new_base_cost)}
                          </TableCell>
                          <TableCell
                            className={change.change_amount > 0 ? 'text-green-600' : change.change_amount < 0 ? 'text-red-600' : 'text-gray-600'}
                          >
                            {change.change_amount > 0 ? '+' : ''}
                            {formatCurrency(change.change_amount)}
                          </TableCell>
                          <TableCell className={getChangeColor(change.change_percentage)}>
                            {change.change_percentage !== null ? (
                              <div className="flex items-center gap-1">
                                {change.change_percentage > 0 ? (
                                  <TrendingUp className="w-4 h-4" />
                                ) : change.change_percentage < 0 ? (
                                  <TrendingDown className="w-4 h-4" />
                                ) : null}
                                {formatChange(change.change_percentage)}
                              </div>
                            ) : (
                              'N/A'
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Errors */}
          {preview.preview.errors.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-600">
                  <AlertCircle className="w-5 h-5" />
                  Errors ({preview.preview.errors.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {preview.preview.errors.map((error, idx) => (
                    <div key={idx} className="text-sm text-red-600">
                      Row {error.row}: {error.error}
                      {error.material_code && ` (${error.material_code})`}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => setCurrentStep(1)}
            >
              Back
            </Button>
            <Button
              onClick={handleApply}
              disabled={preview.preview.priceChanges.length === 0 || applying}
            >
              {applying ? 'Applying...' : `Apply ${preview.preview.priceChanges.length} Changes`}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Success */}
      {currentStep === 3 && applyResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Price Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>Success!</AlertTitle>
              <AlertDescription>
                Successfully updated {applyResult.results.updated} material prices.
                All changes have been logged to price history.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Materials Updated</p>
                <p className="text-2xl font-bold">{applyResult.results.updated}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">History Entries Created</p>
                <p className="text-2xl font-bold">{applyResult.results.historyEntries}</p>
              </div>
            </div>

            {applyResult.results.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Some errors occurred</AlertTitle>
                <AlertDescription>
                  {applyResult.results.errors.length} materials failed to update. Check the logs for details.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-4">
              <Button
                variant="outline"
                onClick={() => {
                  setCurrentStep(1);
                  setSelectedFile(null);
                  setPreview(null);
                  setApplyResult(null);
                }}
              >
                Import Another File
              </Button>
              <Button
                onClick={() => navigate('/dashboard')}
              >
                Go to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

