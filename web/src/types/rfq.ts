/**
 * RFQ Types
 * 
 * Extended type definitions for RFQ items with HS code support
 */

import { RfqItem } from './index';
import { HsMatchSource } from './regulatory';

export interface RfqItemWithHs extends RfqItem {
  hs_code: string | null;
  import_duty_rate: number | null;
  import_duty_amount: number | null;
  hs_match_source: HsMatchSource;
  hs_confidence: number | null;
}

