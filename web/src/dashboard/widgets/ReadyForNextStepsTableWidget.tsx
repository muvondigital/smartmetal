/**
 * Ready for Next Steps Table Widget
 *
 * Displays approved quotes ready for next action.
 * Part of SmartMetal Dashboard Framework.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { ScrollArea } from '../../components/ui/scroll-area';
import { DataTable, Quote } from '../../components/dashboard/DataTable';
import { getRfqs } from '../../api/client';
import { getDisplayRfqCode } from '../../lib/rfqUtils';

export function ReadyForNextStepsTableWidget() {
  const navigate = useNavigate();
  const [data, setData] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const rfqs = await getRfqs();

      // Transform and filter data
      const transformedData: Quote[] = rfqs
        .filter((r: any) => r.status === 'approved')
        .map((rfq: any) => ({
          id: rfq.id,
          name: rfq.title || rfq.customer_name || getDisplayRfqCode(rfq),
          revision: 'v1.0',
          customer: rfq.customer_name || 'N/A',
          customer_name: rfq.customer_name,
          total: rfq.total || 0,
          status: (rfq.status || 'draft').toLowerCase(),
          createdOn: rfq.created_at || new Date().toISOString(),
          created_at: rfq.created_at,
          approvedOn: rfq.approved_at || rfq.created_at, // Use approved_at if available, fallback to created_at
          nextAction: 'Review',
        }))
        .slice(0, 5);

      setData(transformedData);
    } catch (err) {
      console.error('Failed to load ready for next steps:', err);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { key: 'name', label: 'Quote / Agreement Name' },
    { key: 'revision', label: 'Revision' },
    { key: 'customer', label: 'Customer' },
    { key: 'total', label: 'Total' },
    { key: 'approvedOn', label: 'Approved On' },
    {
      key: 'nextAction',
      label: 'Next Action',
      render: (item: Quote) => (
        <Button size="sm" variant="outline" className="gap-2 text-teal-600 border-teal-200 hover:bg-teal-50">
          {item.nextAction || 'Review'}
          <ArrowRight className="w-3 h-3" />
        </Button>
      ),
    },
  ];

  const handleRowClick = (item: Quote) => {
    if (item.id) {
      navigate(`/pricing-runs/${item.id}`);
    }
  };

  return (
    <Card className="flex flex-col h-full overflow-hidden">
      <div className="flex-none px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <h3 className="text-slate-900 font-semibold">Ready for Next Steps</h3>
        <Button variant="ghost" size="sm" className="text-teal-600 hover:text-teal-700">
          View All
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-6">
          {loading ? (
            <div className="text-center py-8 text-slate-600">Loading...</div>
          ) : (
            <DataTable
              data={data}
              columns={columns}
              onRowClick={handleRowClick}
            />
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}
