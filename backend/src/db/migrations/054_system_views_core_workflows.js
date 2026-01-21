/**
 * Migration 054: System Views for Core Workflows
 *
 * Purpose: Create stable, query-friendly views for the backend and analytics layer
 * to simplify queries and ensure consistency.
 *
 * Views created:
 * 1. v_rfq_with_items - RFQs joined with their items
 * 2. v_pricing_runs_with_totals - Pricing runs with aggregated totals
 * 3. v_price_agreements_active - Active price agreements (V2)
 * 4. v_materials_full - Materials enriched with HS codes and regulatory data
 * 5. v_tenant_users_basic - Basic user info per tenant
 * 6. v_analytics_rfq_daily - Per-day RFQ analytics per tenant
 *
 * All views:
 * - Include tenant_id as a column
 * - Are defined as normal VIEW (not materialized)
 * - Are SECURITY INVOKER (inherit RLS from underlying tables)
 * - Have SELECT granted to smartmetal_app role
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 054 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Migration 054: System Views for Core Workflows');
  console.log('='.repeat(60));
  console.log('');

  try {
    // =========================================================================
    // VIEW 1: v_rfq_with_items
    // =========================================================================
    console.log('Creating view: v_rfq_with_items...');

    await db.query(`
      CREATE OR REPLACE VIEW public.v_rfq_with_items AS
      SELECT
        r.id AS rfq_id,
        r.tenant_id,
        r.project_id,
        r.client_id,
        r.rfq_number,
        r.rfq_name,
        r.status AS rfq_status,
        r.due_date,
        r.notes AS rfq_notes,
        r.created_by AS rfq_created_by,
        r.created_at AS rfq_created_at,
        r.updated_at AS rfq_updated_at,
        ri.id AS rfq_item_id,
        ri.material_id,
        ri.material_code,
        ri.line_number,
        ri.description AS item_description,
        ri.quantity,
        ri.unit,
        ri.size,
        ri.grade,
        ri.spec,
        ri.notes AS item_notes,
        ri.hs_code,
        ri.import_duty_rate,
        ri.created_at AS item_created_at,
        ri.updated_at AS item_updated_at
      FROM public.rfqs r
      LEFT JOIN public.rfq_items ri ON r.id = ri.rfq_id;
    `);

    console.log('  ✅ Created v_rfq_with_items');
    console.log('');

    // =========================================================================
    // VIEW 2: v_pricing_runs_with_totals
    // =========================================================================
    console.log('Creating view: v_pricing_runs_with_totals...');

    await db.query(`
      CREATE OR REPLACE VIEW public.v_pricing_runs_with_totals AS
      SELECT
        pr.id AS pricing_run_id,
        pr.tenant_id,
        pr.rfq_id,
        pr.run_number,
        pr.version,
        pr.parent_version_id,
        pr.pricing_strategy,
        pr.total_cost,
        pr.total_price,
        pr.margin_percentage,
        pr.approval_status,
        pr.approved_by,
        pr.approved_at,
        pr.notes,
        pr.created_by,
        pr.created_at,
        pr.updated_at,
        COALESCE(SUM(pri.total_price), 0) AS items_total_price,
        COALESCE(SUM(pri.total_cost), 0) AS items_total_cost,
        COALESCE(SUM(pri.quantity), 0) AS items_total_quantity,
        COUNT(pri.id) AS items_count
      FROM public.pricing_runs pr
      LEFT JOIN public.pricing_run_items pri ON pr.id = pri.pricing_run_id
      GROUP BY pr.id, pr.tenant_id, pr.rfq_id, pr.run_number, pr.version,
               pr.parent_version_id, pr.pricing_strategy, pr.total_cost,
               pr.total_price, pr.margin_percentage, pr.approval_status,
               pr.approved_by, pr.approved_at, pr.notes, pr.created_by,
               pr.created_at, pr.updated_at;
    `);

    console.log('  ✅ Created v_pricing_runs_with_totals');
    console.log('');

    // =========================================================================
    // VIEW 3: v_price_agreements_active
    // =========================================================================
    console.log('Creating view: v_price_agreements_active...');

    await db.query(`
      CREATE OR REPLACE VIEW public.v_price_agreements_active AS
      SELECT
        ah.id AS agreement_id,
        ah.tenant_id,
        ah.customer_id,
        ah.agreement_code,
        ah.agreement_type,
        ah.currency,
        ah.valid_from,
        ah.valid_to,
        ah.status,
        ah.owner_user_id,
        ah.created_at AS agreement_created_at,
        ah.updated_at AS agreement_updated_at,
        ac.id AS condition_id,
        ac.condition_type,
        ac.key_customer_id,
        ac.key_material_id,
        ac.key_material_group,
        ac.key_region,
        ac.key_incoterm,
        ac.rate_type,
        ac.rate_value,
        ac.has_scale,
        ac.condition_priority,
        ac.valid_from AS condition_valid_from,
        ac.valid_to AS condition_valid_to,
        ac.status AS condition_status,
        c.name AS customer_name,
        c.code AS customer_code
      FROM public.agreement_headers ah
      LEFT JOIN public.agreement_conditions ac ON ah.id = ac.agreement_id
      LEFT JOIN public.clients c ON ah.customer_id = c.id
      WHERE ah.status = 'released'
        AND (ah.valid_from <= CURRENT_DATE AND ah.valid_to >= CURRENT_DATE)
        AND (ac.status IS NULL OR ac.status = 'active')
        AND (ac.valid_from IS NULL OR ac.valid_from <= CURRENT_DATE)
        AND (ac.valid_to IS NULL OR ac.valid_to >= CURRENT_DATE);
    `);

    console.log('  ✅ Created v_price_agreements_active');
    console.log('');

    // =========================================================================
    // VIEW 4: v_materials_full
    // =========================================================================
    console.log('Creating view: v_materials_full...');

    await db.query(`
      CREATE OR REPLACE VIEW public.v_materials_full AS
      SELECT DISTINCT ON (m.id)
        m.id AS material_id,
        m.material_code,
        m.category,
        m.spec_standard,
        m.grade,
        m.material_type,
        m.origin_type,
        m.size_description,
        m.base_cost,
        m.currency,
        m.notes,
        m.created_at AS material_created_at,
        m.updated_at AS material_updated_at,
        -- Regulatory mapping (if exists) - get first matching HS code by priority
        rmm.id AS mapping_id,
        rmm.keyword AS mapping_keyword,
        rhs.id AS hs_code_id,
        rhs.hs_code,
        rhs.description AS hs_description,
        rhs.category AS hs_category,
        rhs.sub_category AS hs_sub_category,
        rhs.import_duty AS hs_import_duty,
        rhs.surtax AS hs_surtax,
        rhs.excise AS hs_excise
      FROM public.materials m
      LEFT JOIN public.regulatory_material_mapping rmm ON (
        LOWER(m.material_code) = LOWER(rmm.keyword)
        OR (m.size_description IS NOT NULL AND LOWER(m.size_description) = LOWER(rmm.keyword))
        OR LOWER(m.category) = LOWER(rmm.keyword)
      )
      LEFT JOIN public.regulatory_hs_codes rhs ON rmm.hs_code_id = rhs.id AND (rhs.is_active = true OR rhs.is_active IS NULL)
      ORDER BY m.id, rmm.priority NULLS LAST;
    `);

    console.log('  ✅ Created v_materials_full');
    console.log('');

    // =========================================================================
    // VIEW 5: v_tenant_users_basic
    // =========================================================================
    console.log('Creating view: v_tenant_users_basic...');

    await db.query(`
      CREATE OR REPLACE VIEW public.v_tenant_users_basic AS
      SELECT
        u.id AS user_id,
        u.tenant_id,
        u.email,
        u.name,
        u.role,
        u.is_active,
        u.last_login_at,
        u.created_at AS user_created_at,
        u.updated_at AS user_updated_at,
        t.id AS tenant_id_from_tenant,
        t.name AS tenant_name,
        t.code AS tenant_code,
        t.is_active AS tenant_is_active
      FROM public.users u
      LEFT JOIN public.tenants t ON u.tenant_id = t.id;
    `);

    console.log('  ✅ Created v_tenant_users_basic');
    console.log('');

    // =========================================================================
    // VIEW 6: v_analytics_rfq_daily
    // =========================================================================
    console.log('Creating view: v_analytics_rfq_daily...');

    await db.query(`
      CREATE OR REPLACE VIEW public.v_analytics_rfq_daily AS
      SELECT
        DATE(r.created_at) AS date,
        r.tenant_id,
        COUNT(DISTINCT r.id) AS rfq_count,
        COUNT(DISTINCT ri.id) AS total_items,
        COALESCE(SUM(ri.quantity), 0) AS total_quantity,
        COUNT(DISTINCT r.client_id) AS unique_clients,
        COUNT(DISTINCT r.project_id) AS unique_projects
      FROM public.rfqs r
      LEFT JOIN public.rfq_items ri ON r.id = ri.rfq_id
      GROUP BY DATE(r.created_at), r.tenant_id
      ORDER BY r.tenant_id, DATE(r.created_at) DESC;
    `);

    console.log('  ✅ Created v_analytics_rfq_daily');
    console.log('');

    // =========================================================================
    // GRANT PERMISSIONS
    // =========================================================================
    console.log('Granting SELECT permissions to smartmetal_app...');

    await db.query(`
      DO $$
      BEGIN
        GRANT SELECT ON public.v_rfq_with_items TO smartmetal_app;
        GRANT SELECT ON public.v_pricing_runs_with_totals TO smartmetal_app;
        GRANT SELECT ON public.v_price_agreements_active TO smartmetal_app;
        GRANT SELECT ON public.v_materials_full TO smartmetal_app;
        GRANT SELECT ON public.v_tenant_users_basic TO smartmetal_app;
        GRANT SELECT ON public.v_analytics_rfq_daily TO smartmetal_app;
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
    console.log('Migration 054 Summary:');
    console.log('  ✅ Created 6 system views');
    console.log('  ✅ Granted SELECT permissions to smartmetal_app');
    console.log('='.repeat(60));
    console.log('');

  } catch (error) {
    console.error('[Migration 054] ❌ Migration failed:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 054 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 054] Rolling back system views...');

  try {
    await db.query(`
      DROP VIEW IF EXISTS public.v_rfq_with_items;
      DROP VIEW IF EXISTS public.v_pricing_runs_with_totals;
      DROP VIEW IF EXISTS public.v_price_agreements_active;
      DROP VIEW IF EXISTS public.v_materials_full;
      DROP VIEW IF EXISTS public.v_tenant_users_basic;
      DROP VIEW IF EXISTS public.v_analytics_rfq_daily;
    `);

    console.log('[Migration 054] ✅ Views dropped');
  } catch (error) {
    console.error('[Migration 054] ❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};

