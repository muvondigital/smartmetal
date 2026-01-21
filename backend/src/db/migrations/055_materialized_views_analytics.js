/**
 * Migration 055: Materialized Views for Analytics
 *
 * Purpose: Create materialized views for heavy dashboard queries and analytics.
 * These views are pre-aggregated for fast reads and can be refreshed periodically.
 *
 * Materialized views created:
 * 1. mv_analytics_rfq_daily - Backed by v_analytics_rfq_daily
 * 2. mv_analytics_pricing_margins - Per-tenant aggregation of margins, costs, and volumes
 *
 * All materialized views:
 * - Include tenant_id as a column
 * - Have indexes on common filter columns (tenant_id, date)
 * - Have SELECT granted to smartmetal_app role
 * - Can be refreshed via: REFRESH MATERIALIZED VIEW CONCURRENTLY mv_name;
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 055 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Migration 055: Materialized Views for Analytics');
  console.log('='.repeat(60));
  console.log('');

  try {
    // =========================================================================
    // MATERIALIZED VIEW 1: mv_analytics_rfq_daily
    // =========================================================================
    console.log('Creating materialized view: mv_analytics_rfq_daily...');

    await db.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_analytics_rfq_daily AS
      SELECT * FROM public.v_analytics_rfq_daily;
    `);

    // Create indexes on materialized view
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_mv_analytics_rfq_daily_tenant_date
      ON public.mv_analytics_rfq_daily (tenant_id, date DESC);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_mv_analytics_rfq_daily_date
      ON public.mv_analytics_rfq_daily (date DESC);
    `);

    console.log('  ✅ Created mv_analytics_rfq_daily with indexes');
    console.log('');

    // =========================================================================
    // MATERIALIZED VIEW 2: mv_analytics_pricing_margins
    // =========================================================================
    console.log('Creating materialized view: mv_analytics_pricing_margins...');

    await db.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_analytics_pricing_margins AS
      SELECT
        pr.tenant_id,
        DATE(pr.created_at) AS date,
        COUNT(DISTINCT pr.id) AS pricing_run_count,
        COUNT(DISTINCT pr.rfq_id) AS unique_rfq_count,
        COUNT(DISTINCT pri.id) AS total_items_priced,
        COALESCE(SUM(pr.total_cost), 0) AS total_cost_all_runs,
        COALESCE(SUM(pr.total_price), 0) AS total_price_all_runs,
        COALESCE(SUM(pr.total_price - pr.total_cost), 0) AS total_margin_all_runs,
        COALESCE(AVG(pr.margin_percentage), 0) AS avg_margin_percentage,
        COALESCE(SUM(pri.total_cost), 0) AS items_total_cost,
        COALESCE(SUM(pri.total_price), 0) AS items_total_price,
        COALESCE(SUM(pri.quantity), 0) AS items_total_quantity,
        COUNT(DISTINCT CASE WHEN pr.approval_status = 'approved' THEN pr.id END) AS approved_runs_count,
        COUNT(DISTINCT CASE WHEN pr.approval_status = 'pending' THEN pr.id END) AS pending_runs_count,
        COUNT(DISTINCT CASE WHEN pr.approval_status = 'rejected' THEN pr.id END) AS rejected_runs_count
      FROM public.pricing_runs pr
      LEFT JOIN public.pricing_run_items pri ON pr.id = pri.pricing_run_id
      GROUP BY pr.tenant_id, DATE(pr.created_at)
      ORDER BY pr.tenant_id, DATE(pr.created_at) DESC;
    `);

    // Create indexes on materialized view
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_mv_analytics_pricing_margins_tenant_date
      ON public.mv_analytics_pricing_margins (tenant_id, date DESC);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_mv_analytics_pricing_margins_date
      ON public.mv_analytics_pricing_margins (date DESC);
    `);

    console.log('  ✅ Created mv_analytics_pricing_margins with indexes');
    console.log('');

    // =========================================================================
    // GRANT PERMISSIONS
    // =========================================================================
    console.log('Granting SELECT permissions to smartmetal_app...');

    await db.query(`
      DO $$
      BEGIN
        GRANT SELECT ON public.mv_analytics_rfq_daily TO smartmetal_app;
        GRANT SELECT ON public.mv_analytics_pricing_margins TO smartmetal_app;
      EXCEPTION
        WHEN undefined_object THEN
          -- smartmetal_app role may not exist yet, that's okay
          RAISE NOTICE 'smartmetal_app role does not exist yet, skipping grants';
      END;
      $$;
    `);

    console.log('  ✅ Granted SELECT permissions');
    console.log('');

    console.log('='.repeat(60));
    console.log('Migration 055 Summary:');
    console.log('  ✅ Created 2 materialized views');
    console.log('  ✅ Created indexes on materialized views');
    console.log('  ✅ Granted SELECT permissions to smartmetal_app');
    console.log('');
    console.log('Note: Materialized views need to be refreshed periodically.');
    console.log('      Use: REFRESH MATERIALIZED VIEW CONCURRENTLY mv_name;');
    console.log('='.repeat(60));
    console.log('');

  } catch (error) {
    console.error('[Migration 055] ❌ Migration failed:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 055 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 055] Rolling back materialized views...');

  try {
    await db.query(`
      DROP MATERIALIZED VIEW IF EXISTS public.mv_analytics_rfq_daily;
      DROP MATERIALIZED VIEW IF EXISTS public.mv_analytics_pricing_margins;
    `);

    console.log('[Migration 055] ✅ Materialized views dropped');
  } catch (error) {
    console.error('[Migration 055] ❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};

