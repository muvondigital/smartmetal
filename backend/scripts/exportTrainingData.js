/**
 * Export Training Data for AI Pricing Model
 * 
 * Exports historical pricing runs with outcomes for training/analysis
 * Usage: node backend/scripts/exportTrainingData.js [output_file.json]
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDb } = require('../src/db/supabaseClient');
const fs = require('fs').promises;
const path = require('path');

async function exportTrainingData(outputFile = null) {
  const db = await connectDb();
  const outputPath = outputFile || path.join(__dirname, '../data/training_data.json');

  console.log('📊 Exporting training data from database...');

  try {
    // Query historical pricing runs with outcomes
    const result = await db.query(`
      SELECT
        pr.id,
        pr.total_price,
        pr.outcome,
        pr.created_at,
        pr.approval_status,
        pr.won_lost_date,
        pr.won_lost_notes,
        pr.competitor_price,
        
        -- Client info
        c.id as client_id,
        c.name as client_name,
        c.lifetime_value,
        
        -- RFQ info
        r.id as rfq_id,
        r.title as rfq_title,
        
        -- Item statistics
        COUNT(pri.id) as item_count,
        AVG(pri.unit_price) as avg_unit_price,
        AVG(pri.base_cost) as avg_base_cost,
        AVG(CASE 
          WHEN pri.base_cost > 0 
          THEN ((pri.unit_price - pri.base_cost) / pri.base_cost * 100)
          ELSE NULL 
        END) as avg_margin_pct,
        STDDEV(CASE 
          WHEN pri.base_cost > 0 
          THEN ((pri.unit_price - pri.base_cost) / pri.base_cost * 100)
          ELSE NULL 
        END) as margin_stddev,
        
        -- Material categories
        COUNT(DISTINCT m.category) as material_categories_count,
        STRING_AGG(DISTINCT m.category, ', ') as material_categories,
        
        -- Pricing method distribution
        COUNT(DISTINCT pri.pricing_method) as pricing_methods_count,
        COUNT(*) FILTER (WHERE pri.pricing_method = 'agreement') as agreement_items_count,
        COUNT(*) FILTER (WHERE pri.pricing_method = 'rule_based') as rule_based_items_count
        
      FROM pricing_runs pr
      JOIN rfqs r ON pr.rfq_id = r.id
      JOIN projects p ON r.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      LEFT JOIN pricing_run_items pri ON pr.id = pri.pricing_run_id
      LEFT JOIN materials m ON pri.material_id = m.id
      WHERE pr.outcome IS NOT NULL 
        AND pr.outcome IN ('won', 'lost')
      GROUP BY pr.id, c.id, c.name, c.lifetime_value, r.id, r.title
      ORDER BY pr.created_at DESC
    `);

    const pricingRuns = result.rows;

    console.log(`✅ Found ${pricingRuns.length} completed pricing runs with outcomes`);

    // Calculate additional features for each run
    const enrichedData = await Promise.all(
      pricingRuns.map(async (run) => {
        // Get client's historical win rate
        const clientHistoryResult = await db.query(`
          SELECT
            COUNT(*) FILTER (WHERE outcome = 'won') as won_count,
            COUNT(*) FILTER (WHERE outcome = 'lost') as lost_count,
            COUNT(*) FILTER (WHERE outcome IS NOT NULL) as total_completed,
            AVG(total_price) FILTER (WHERE outcome = 'won') as avg_won_price,
            MAX(created_at) FILTER (WHERE outcome = 'won') as last_won_date
          FROM pricing_runs pr2
          JOIN rfqs r2 ON pr2.rfq_id = r2.id
          JOIN projects p2 ON r2.project_id = p2.id
          WHERE p2.client_id = $1
            AND pr2.created_at < $2
        `, [run.client_id, run.created_at]);

        const clientHistory = clientHistoryResult.rows[0] || {};
        const clientWinRate = clientHistory.total_completed > 0
          ? parseFloat(clientHistory.won_count) / parseFloat(clientHistory.total_completed)
          : 0.5;

        // Calculate days since last order
        const lastWonDate = clientHistory.last_won_date;
        const daysSinceLastOrder = lastWonDate
          ? Math.floor((new Date(run.created_at) - new Date(lastWonDate)) / (1000 * 60 * 60 * 24))
          : null;

        // Extract temporal features
        const createdDate = new Date(run.created_at);
        const month = createdDate.getMonth() + 1;
        const quarter = Math.ceil(month / 3);
        const dayOfWeek = createdDate.getDay();

        return {
          ...run,
          features: {
            // Quote features
            total_value: parseFloat(run.total_price || 0),
            item_count: parseInt(run.item_count || 0),
            avg_margin_pct: parseFloat(run.avg_margin_pct || 0),
            margin_stddev: parseFloat(run.margin_stddev || 0),
            
            // Client features
            client_lifetime_value: parseFloat(run.lifetime_value || 0),
            client_win_rate: clientWinRate,
            client_order_count: parseInt(clientHistory.won_count || 0),
            days_since_last_order: daysSinceLastOrder,
            
            // Material features
            material_categories_count: parseInt(run.material_categories_count || 0),
            material_categories: run.material_categories || '',
            
            // Temporal features
            quarter: `Q${quarter}`,
            month: month,
            day_of_week: dayOfWeek,
            year: createdDate.getFullYear(),
            
            // Pricing method features
            agreement_items_pct: run.item_count > 0
              ? (parseInt(run.agreement_items_count || 0) / parseInt(run.item_count)) * 100
              : 0
          },
          outcome: run.outcome,
          outcome_date: run.won_lost_date,
          outcome_notes: run.won_lost_notes
        };
      })
    );

    // Create output directory if it doesn't exist
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });

    // Write to file
    await fs.writeFile(outputPath, JSON.stringify(enrichedData, null, 2), 'utf8');

    console.log(`✅ Exported ${enrichedData.length} records to: ${outputPath}`);

    // Print summary statistics
    const wonCount = enrichedData.filter(r => r.outcome === 'won').length;
    const lostCount = enrichedData.filter(r => r.outcome === 'lost').length;
    const winRate = enrichedData.length > 0 ? (wonCount / enrichedData.length) * 100 : 0;

    console.log('\n📈 Summary Statistics:');
    console.log(`   Total records: ${enrichedData.length}`);
    console.log(`   Won: ${wonCount} (${winRate.toFixed(1)}%)`);
    console.log(`   Lost: ${lostCount} (${(100 - winRate).toFixed(1)}%)`);
    console.log(`   Average value: $${(enrichedData.reduce((sum, r) => sum + (r.total_value || 0), 0) / enrichedData.length).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
    console.log(`   Average margin: ${(enrichedData.reduce((sum, r) => sum + (r.features.avg_margin_pct || 0), 0) / enrichedData.length).toFixed(2)}%`);

    return enrichedData;
  } catch (error) {
    console.error('❌ Export failed:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  const outputFile = process.argv[2] || null;
  exportTrainingData(outputFile)
    .then(() => {
      console.log('\n✅ Export completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Export failed:', error);
      process.exit(1);
    });
}

module.exports = { exportTrainingData };

