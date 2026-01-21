// MUVOS Platform – SmartMetal CPQ runs on Muvon Unified Commercial Operating System
//
// This service operates within the MUVOS commercial operating system.
// SmartMetal is the AI-powered CPQ execution layer running on MUVOS.
//
// SmartMetal CPQ - A product from Muvon Digital, an innovation arm of Muvon Energy
// Developed by Muvon Digital, the innovation arm of Muvon Energy.
// Copyright (c) 2025 Muvon Energy. All rights reserved.
// Proprietary & Confidential — Not for distribution.

const { withTenantContext, withTenantTransaction } = require('../db/tenantContext');
const emailService = require('./emailService');
const pricingService = require('./pricingService');
const approvalConfig = require('../config/approvalRules'); // NSC simple approval config
const approvalAuditService = require('./approvalAuditService');
const { log } = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

const WORKFLOW_ERROR_CODE = 'WORKFLOW_CONTRACT_VIOLATION';
function workflowViolation(message, details = {}) {
  return new AppError(message, 400, WORKFLOW_ERROR_CODE, details);
}

/**
 * Approval Service
 * Handles approval workflow for pricing runs
 */

/**
 * Submits a pricing run for approval
 * @param {string} pricingRunId - Pricing run UUID
 * @param {Object} submitter - Submitter information
 * @param {string} tenantId - Tenant UUID (required)
 * @param {Object} [context] - Optional context with correlationId
 * @param {Object} [tenant] - Optional tenant object with is_demo flag (for demo mode safety)
 * @returns {Promise<Object>} Submission result
 */
async function submitForApproval(pricingRunId, submitter, tenantId, context = {}, tenant = null) {
  // Validate tenantId is provided and is a valid UUID
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('tenantId is required and must be a valid UUID');
  }

  // Basic UUID format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tenantId)) {
    throw new Error(`Invalid tenantId format: ${tenantId}. Please ensure NSC tenant exists in database. Run migrations: npm run migrate`);
  }

  const logContext = {
    correlationId: context.correlationId,
    tenantId,
    pricingRunId,
    operation: 'approval_submission_start',
  };
  log.logInfo('Approval submission started', logContext);

  // Normalize submitter.name to ensure it's always set (required for database NOT NULL constraints)
  if (!submitter.name || submitter.name.trim() === '') {
    submitter.name = submitter.email?.split('@')[0] || submitter.id || 'Unknown User';
  }

  return await withTenantTransaction(tenantId, async (db) => {

  // Get pricing run (verify tenant)
  const pricingRun = await db.query(
    `SELECT pr.*, r.status as rfq_status
     FROM pricing_runs pr
     JOIN rfqs r ON pr.rfq_id = r.id
     WHERE pr.id = $1 AND r.tenant_id = $2
     FOR UPDATE`,
    [pricingRunId, tenantId]
  );

  if (pricingRun.rows.length === 0) {
    throw new Error('Pricing run not found');
  }

    const run = pricingRun.rows[0];

    // Enforce workflow contract: only current runs on active RFQs can enter approval
    if (!run.is_current) {
    throw workflowViolation(
      'Only the current pricing run can be submitted for approval.',
      {
        pricing_run_id: pricingRunId,
        rfq_id: run.rfq_id,
        current_run_status: run.approval_status,
        is_current: run.is_current,
      }
    );
  }

  if (run.rfq_status === 'won' || run.rfq_status === 'lost') {
    throw workflowViolation(
      'Cannot submit for approval because the RFQ is already marked as won or lost.',
      {
        pricing_run_id: pricingRunId,
        rfq_id: run.rfq_id,
        rfq_status: run.rfq_status,
      }
    );
  }

  // Check if already submitted/approved
  if (run.approval_status === 'approved') {
    throw workflowViolation(
      'Cannot submit for approval because this pricing run is already approved.',
      {
        pricing_run_id: pricingRunId,
        rfq_id: run.rfq_id,
        current_run_status: run.approval_status,
      }
    );
  }

  if (run.approval_status === 'pending_approval') {
    throw workflowViolation(
      'Cannot submit for approval because this pricing run is already pending approval.',
      {
        pricing_run_id: pricingRunId,
        rfq_id: run.rfq_id,
        current_run_status: run.approval_status,
      }
    );
  }

  // Simplified approval - skip AI auto-approval and regulatory checks

    // Get full pricing run details for approval path determination
    let pricingRunDetails = null;
    try {
      pricingRunDetails = await pricingService.getPricingRunById(pricingRunId, tenantId);
    } catch (error) {
      log.logWarn('Failed to fetch full pricing run details for approval path', {
        pricingRunId,
        tenantId,
        operation: 'get_pricing_run_for_approval_path',
        error: error.message
      });
      // Continue with basic run data from database query
    }

    if (!run.is_locked) {
      throw workflowViolation(
        'Pricing run must be locked before submission for approval.',
        {
          pricing_run_id: pricingRunId,
          rfq_id: run.rfq_id,
          is_locked: run.is_locked,
        }
      );
    }

    // NSC simple approval: Always goes to GM (Sales07)
    // No multi-level routing - single approver for all quotes
    const approvalPath = {
      levels: [{ level: 1, name: 'General Manager', approver: approvalConfig.approver }],
      slaDeadlines: { sales: null } // No SLA enforcement
    };
    console.log(`📋 Approval path determined: ${approvalConfig.approver.name} (GM)`);

    // Manual approval required - queue for approval
    const salesSlaDeadline = null; // No SLA for NSC

    // Use normalized submitter.name (already normalized at function start)
    const submitterName = submitter.name; // This is guaranteed to be set after normalization

    // Update pricing run status with approval path
    await db.query(
      `UPDATE pricing_runs
       SET approval_status = 'pending_approval',
           approval_level = 1,
           submitted_for_approval_at = NOW(),
           submitted_by = $1,
           sales_submitted_at = NOW(),
           sales_sla_deadline = $2,
           approval_path = $3
       WHERE id = $4`,
      [
        submitterName,
        salesSlaDeadline,
        JSON.stringify(approvalPath),
        pricingRunId
      ]
    );

    // Ensure submitter.name is provided (required for approval_history.actor_name NOT NULL constraint)
    const actorName = submitter.name?.trim() || submitter.email?.split('@')[0] || submitter.id || 'Unknown User';
    
    console.log('[APPROVAL DEBUG] Creating approval history entry:', {
      pricingRunId,
      actorName,
      actorEmail: submitter.email || null,
      notes: submitter.notes || 'Submitted for approval',
      previousStatus: run.approval_status,
      newStatus: 'pending_approval',
    });
    
    // Create approval history entry
    try {
      await db.query(
        `INSERT INTO approval_history
          (pricing_run_id, action, actor_name, actor_email, notes, previous_status, new_status, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          pricingRunId,
          'submitted',
          actorName,
          submitter.email || null,
          submitter.notes || 'Submitted for approval',
          run.approval_status,
          'pending_approval',
          tenantId,
        ]
      );
    } catch (dbError) {
      console.error('[APPROVAL DEBUG] Database error inserting approval_history:', {
        code: dbError.code,
        message: dbError.message,
        detail: dbError.detail,
        constraint: dbError.constraint,
        column: dbError.column,
      });
      throw dbError;
    }

    // Log to immutable audit trail
    await approvalAuditService.logApprovalEvent({
      eventType: 'status_change',
      pricingRunId,
      actor: {
        id: submitter.id || submitter.email,
        name: submitter.name,
        email: submitter.email,
        role: 'sales',
      },
      previousState: {
        status: run.approval_status,
        level: null,
        approver: null,
      },
      newState: {
        status: 'pending_approval',
        level: 1,
        approver: null,
      },
      notes: submitter.notes || 'Submitted for approval',
      metadata: aiAssessment ? {
        risk_score: aiAssessment.risk_score,
        risk_level: aiAssessment.risk_level,
        recommendation: aiAssessment.recommendation,
        approval_path: approvalPath,
      } : { approval_path: approvalPath },
      isAutomated: false,
      requiresReview: true,
      correlationId: context.correlationId,
      tenantId,
    });

    // Get approver (NSC: always GM)
    const salesApprovers = [approvalConfig.approver];

    // Get pricing run details for email (if not already fetched)
    if (!pricingRunDetails) {
      try {
        pricingRunDetails = await pricingService.getPricingRunById(pricingRunId, tenantId);
      } catch (error) {
        log.logWarn('Failed to fetch pricing run details for email notification', {
          pricingRunId,
          tenantId,
          operation: 'get_pricing_run_for_email',
          error: error.message
        });
        // Continue with null - email template should handle gracefully
      }
    }

    // Send email notifications to Sales approvers
    const emailResults = [];
    for (const approver of salesApprovers) {
      if (approver.email) {
        try {
          const emailResult = await emailService.sendApprovalRequestEmail({
            approverEmail: approver.email,
            approverName: approver.name,
            pricingRunId,
            rfqTitle: pricingRunDetails?.rfq_title || 'Pricing Run',
            clientName: pricingRunDetails?.client_name || 'Client',
            submittedBy: submitter.name,
            submittedAt: new Date().toISOString(),
            totalPrice: pricingRunDetails?.total_price,
            itemCount: pricingRunDetails?.items?.length || 0,
            approvalLevel: 'Sales',
            slaDeadline: salesSlaDeadline ? salesSlaDeadline.toISOString() : null,
            tenant,
          });
          emailResults.push({ approver: approver.email, success: emailResult.success });
        } catch (error) {
          log.logError('Failed to send approval request email', error, {
            pricingRunId,
            tenantId,
            approverEmail: approver.email,
            operation: 'send_approval_email'
          });
          emailResults.push({ approver: approver.email, success: false, error: error.message });
        }
      }
    }

    return {
      pricing_run_id: pricingRunId,
      approval_status: 'pending_approval',
      approval_level: 1,
      approval_path: approvalPath,
      submitted_at: new Date().toISOString(),
      submitted_by: submitter.name,
      message: `Submitted for approval. Routing: ${approvalPath.levels.map(l => l.name).join(' → ')}. Notification sent to ${salesApprovers.length} Sales approver(s).`,
      notified_approvers: salesApprovers,
      email_results: emailResults,
    };
  });
}

/**
 * Approves a pricing run at the current approval level
 * @param {string} pricingRunId - Pricing run UUID
 * @param {Object} approver - Approver information
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<Object>} Approval result
 */
async function approvePricingRun(pricingRunId, approver, tenantId, tenant = null) {
  return await withTenantTransaction(tenantId, async (db) => {

  // Get pricing run (verify tenant)
  const pricingRun = await db.query(
    `SELECT pr.*, r.status as rfq_status
     FROM pricing_runs pr
     JOIN rfqs r ON pr.rfq_id = r.id
     WHERE pr.id = $1 AND r.tenant_id = $2
     FOR UPDATE`,
    [pricingRunId, tenantId]
  );

  if (pricingRun.rows.length === 0) {
    throw new Error('Pricing run not found');
  }

  const run = pricingRun.rows[0];

  if (!run.is_current) {
    throw workflowViolation(
      'Only the current pricing run can be approved.',
      {
        pricing_run_id: pricingRunId,
        rfq_id: run.rfq_id,
        current_run_status: run.approval_status,
        is_current: run.is_current,
      }
    );
  }

  if (run.rfq_status === 'won' || run.rfq_status === 'lost') {
    throw workflowViolation(
      'Cannot approve pricing run because the RFQ is already marked as won or lost.',
      {
        pricing_run_id: pricingRunId,
        rfq_id: run.rfq_id,
        rfq_status: run.rfq_status,
      }
    );
  }

  // Check if pending approval OR already approved (allow re-approval for quote candidates)
  if (run.approval_status !== 'pending_approval' && run.approval_status !== 'approved') {
    throw workflowViolation(
      `Cannot approve: Pricing run status is '${run.approval_status}', not 'pending_approval' or 'approved'`,
      {
        pricing_run_id: pricingRunId,
        rfq_id: run.rfq_id,
        current_run_status: run.approval_status,
      }
    );
  }

  // If already approved, skip status update but still create quote candidate
  const alreadyApproved = run.approval_status === 'approved';

  // CRITICAL FIX: Managers and Admins can bypass multi-level approval and approve directly
  // Check if approver has manager or admin role (passed from route handler via req.user.role)
  const approverRole = approver.role || null;
  const canBypassLevels = (approverRole === 'manager' || approverRole === 'admin');

  const currentLevel = run.approval_level || 1;
  let approvalPath = null;
  if (run.approval_path) {
    try {
      // Only parse if it looks like valid JSON (starts with { or [)
      const trimmed = run.approval_path.trim();
      if (trimmed && (trimmed.startsWith('{') || trimmed.startsWith('['))) {
        approvalPath = JSON.parse(trimmed);
      } else {
        console.warn(`Invalid approval_path format for pricing run ${pricingRunId}: ${trimmed.substring(0, 50)}`);
      }
    } catch (parseError) {
      console.error(`Failed to parse approval_path for pricing run ${pricingRunId}:`, parseError.message);
      // Continue with null approvalPath - the approval can still proceed
    }
  }

  try {
    const now = new Date();
    let nextLevel = null;
    let updateQuery = '';
    let updateParams = [];
    let newStatus = 'pending_approval';
    let finalApproved = false;

    // Handle approval at current level
    if (currentLevel === 1) {
      // BYPASS CHECK: If approver is manager/admin, skip all levels and approve directly
      if (canBypassLevels) {
        console.log(`[APPROVAL] Manager/Admin bypass: ${approver.name || approver.email} approving directly (role: ${approverRole})`);
        finalApproved = true;
        newStatus = 'approved';
        updateQuery = `
          UPDATE pricing_runs
          SET sales_approved_by = $1,
              sales_approved_at = $2,
              approval_level = 4,
              approval_status = 'approved',
              approved_at = $2,
              approved_by = $1,
              notes = $3
          WHERE id = $4
        `;
        updateParams = [approver.name || approver.id, now, approver.notes || null, pricingRunId];
      } else {
        // Sales approval (for sales_rep role)
        updateQuery = `
          UPDATE pricing_runs
          SET sales_approved_by = $1,
              sales_approved_at = $2,
              approval_level = $3
          WHERE id = $4
        `;
        updateParams = [approver.name || approver.id, now, 2, pricingRunId];

        // Check if procurement is required
        if (approvalPath && approvalPath.requiresProcurement) {
        nextLevel = 2;
        const procurementSlaDeadline = approvalPath.slaDeadlines.procurement 
          ? new Date(approvalPath.slaDeadlines.procurement) 
          : null;
        updateQuery = `
          UPDATE pricing_runs
          SET sales_approved_by = $1,
              sales_approved_at = $2,
              approval_level = $3,
              procurement_submitted_at = $2,
              procurement_sla_deadline = $4
          WHERE id = $5
        `;
        updateParams = [approver.name || approver.id, now, 2, procurementSlaDeadline, pricingRunId];
      } else if (approvalPath && approvalPath.requiresManagement) {
        // Skip procurement, go to management
        nextLevel = 3;
        const managementSlaDeadline = approvalPath.slaDeadlines.management 
          ? new Date(approvalPath.slaDeadlines.management) 
          : null;
        updateQuery = `
          UPDATE pricing_runs
          SET sales_approved_by = $1,
              sales_approved_at = $2,
              approval_level = $3,
              management_submitted_at = $2,
              management_sla_deadline = $4
          WHERE id = $5
        `;
        updateParams = [approver.name || approver.id, now, 3, managementSlaDeadline, pricingRunId];
      } else {
        // No more levels, fully approved
        finalApproved = true;
        newStatus = 'approved';
        updateQuery = `
          UPDATE pricing_runs
          SET sales_approved_by = $1,
              sales_approved_at = $2,
              approval_level = 4,
              approval_status = 'approved',
              approved_at = $2,
              approved_by = $1,
              notes = $3
          WHERE id = $4
        `;
        updateParams = [approver.name || approver.id, now, approver.notes || null, pricingRunId];
        }
      }
    } else if (currentLevel === 2) {
      // Procurement approval
      updateQuery = `
        UPDATE pricing_runs
        SET procurement_approved_by = $1,
            procurement_approved_at = $2,
            approval_level = $3
        WHERE id = $4
      `;
      updateParams = [approver.name || approver.id, now, 3, pricingRunId];
      
      // Check if management is required
      if (approvalPath && approvalPath.requiresManagement) {
        nextLevel = 3;
        const managementSlaDeadline = approvalPath.slaDeadlines.management 
          ? new Date(approvalPath.slaDeadlines.management) 
          : null;
        updateQuery = `
          UPDATE pricing_runs
          SET procurement_approved_by = $1,
              procurement_approved_at = $2,
              approval_level = $3,
              management_submitted_at = $2,
              management_sla_deadline = $4
          WHERE id = $5
        `;
        updateParams = [approver.name || approver.id, now, 3, managementSlaDeadline, pricingRunId];
      } else {
        // No more levels, fully approved
        finalApproved = true;
        newStatus = 'approved';
        updateQuery = `
          UPDATE pricing_runs
          SET procurement_approved_by = $1,
              procurement_approved_at = $2,
              approval_level = 4,
              approval_status = 'approved',
              approved_at = $2,
              approved_by = $1,
              notes = $3
          WHERE id = $4
        `;
        updateParams = [approver.name || approver.id, now, approver.notes || null, pricingRunId];
      }
    } else if (currentLevel === 3) {
      // Management approval - final level
      finalApproved = true;
      newStatus = 'approved';
      updateQuery = `
        UPDATE pricing_runs
        SET management_approved_by = $1,
            management_approved_at = $2,
            approval_level = 4,
            approval_status = 'approved',
            approved_at = $2,
            approved_by = $1,
            notes = $3
        WHERE id = $4
      `;
      updateParams = [approver.name || approver.id, now, approver.notes || null, pricingRunId];
    }

    // Define levelName and approverName BEFORE the if block (needed later)
    const levelName = currentLevel === 1 ? 'Sales' : currentLevel === 2 ? 'Procurement' : 'Management';
    const approverName = approver.name?.trim() || approver.email?.split('@')[0] || approver.id || 'Unknown Approver';

    // Skip UPDATE if already approved (just create quote candidate)
    if (!alreadyApproved) {
      await db.query(updateQuery, updateParams);

      // Create approval history entry
      await db.query(
        `INSERT INTO approval_history
          (pricing_run_id, action, actor_name, actor_email, notes, previous_status, new_status, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          pricingRunId,
          finalApproved ? 'approved' : `approved_level_${currentLevel}`,
          approverName,
          approver.email || null,
          `${levelName} approval: ${approver.notes || 'Approved'}`,
          'pending_approval',
          newStatus,
          tenantId,
        ]
      );

      // Update RFQ status to 'quoted' when pricing run is fully approved
      if (finalApproved) {
        await db.query(
          `UPDATE rfqs
           SET status = 'quoted', updated_at = NOW()
           WHERE id = $1 AND tenant_id = $2`,
          [run.rfq_id, tenantId]
        );
        console.log(`✅ Updated RFQ ${run.rfq_id} status to 'quoted' after pricing run approval`);

        // Create quote candidate (bridge to quote candidates dashboard)
        // User can manually convert candidate to other formats if needed
        try {
          await createQuoteCandidate(pricingRunId, tenantId, db);
          console.log(`✅ Created quote candidate for pricing run ${pricingRunId}`);
        } catch (candidateErr) {
          console.error('[QuoteCandidate] Failed to create quote candidate after approval', {
            error: candidateErr.message,
            pricingRunId,
            tenantId,
          });
          // Don't fail the approval if quote candidate creation fails
          // Can be created manually later if needed
        }

        // Assistant documents feature removed
      }
    } else {
      console.log(`Pricing run ${pricingRunId} already approved, skipping status update, creating quote candidate...`);
      // Force finalApproved flag for quote candidate creation
      finalApproved = true;

      // Even if already approved, ensure RFQ status is set to 'quoted'
      // (in case it wasn't updated in a previous approval)
      await db.query(
        `UPDATE rfqs
         SET status = 'quoted', updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2 AND status != 'quoted'`,
        [run.rfq_id, tenantId]
      );

      // Create quote candidate for already-approved pricing run
      // User can manually convert candidate to other formats if needed
      try {
        await createQuoteCandidate(pricingRunId, tenantId, db);
        console.log(`✅ Created quote candidate for already-approved pricing run ${pricingRunId}`);
      } catch (candidateErr) {
        console.error('[QuoteCandidate] Failed to create quote candidate for already-approved run', {
          error: candidateErr.message,
          pricingRunId,
          tenantId,
        });
        // Don't fail if quote candidate creation fails
      }

      // Assistant documents feature removed
    }

    // Log to immutable audit trail
    await approvalAuditService.logApprovalEvent({
      eventType: finalApproved ? 'status_change' : 'level_change',
      pricingRunId,
      actor: {
        id: (approver.id && approver.id.trim()) || approver.email || null,
        name: approver.name,
        email: approver.email,
        role: levelName.toLowerCase(),
      },
      previousState: {
        status: 'pending_approval',
        level: currentLevel,
        approver: null,
      },
      newState: {
        status: newStatus,
        level: finalApproved ? 4 : nextLevel || currentLevel,
        approver: approver.name,
      },
      notes: `${levelName} approval: ${approver.notes || 'Approved'}`,
      metadata: {
        approval_level: levelName,
        fully_approved: finalApproved,
        next_level: nextLevel,
      },
      isAutomated: false,
      requiresReview: false,
      tenantId,
    });

    // Get pricing run details and submitter info for email
    let pricingRunDetails = null;
    let submitterEmail = null;
    let submitterName = null;
    try {
      pricingRunDetails = await pricingService.getPricingRunById(pricingRunId, tenantId);
      
      // Get submitter email from approval history
      const submitterResult = await db.query(
        `SELECT actor_name, actor_email FROM approval_history
         WHERE pricing_run_id = $1 AND action = 'submitted'
         ORDER BY created_at DESC LIMIT 1`,
        [pricingRunId]
      );
      
      if (submitterResult.rows.length > 0) {
        submitterName = submitterResult.rows[0].actor_name;
        submitterEmail = submitterResult.rows[0].actor_email;
      }
    } catch (error) {
      console.error('Error fetching pricing run details for email:', error);
    }

    const emailResults = [];

    // If fully approved, notify submitter
    if (finalApproved) {
      // Send approval notification email
      if (submitterEmail) {
        try {
          const emailResult = await emailService.sendApprovalNotificationEmail({
            submitterEmail,
            submitterName: submitterName || 'Sales Rep',
            pricingRunId,
            rfqTitle: pricingRunDetails?.rfq_title || 'Pricing Run',
            clientName: pricingRunDetails?.client_name || 'Client',
            approverName: approver.name,
            approvedAt: new Date().toISOString(),
            approvalNotes: approver.notes || null,
            tenant,
          });
          emailResults.push({ recipient: submitterEmail, success: emailResult.success });
        } catch (error) {
          console.error('Error sending approval notification email:', error);
          emailResults.push({ recipient: submitterEmail, success: false, error: error.message });
        }
      }
    } else if (nextLevel) {
      // NSC: No multi-level approval, so this code path shouldn't execute
      // Keeping for database schema compatibility but won't be used
      const nextLevelApprovers = [approvalConfig.approver];
      const levelName = 'General Manager';
      const slaDeadline = approvalPath?.slaDeadlines 
        ? (nextLevel === 2 ? approvalPath.slaDeadlines.procurement : approvalPath.slaDeadlines.management)
        : null;

      for (const nextApprover of nextLevelApprovers) {
        if (nextApprover.email) {
          try {
            const emailResult = await emailService.sendApprovalRequestEmail({
              approverEmail: nextApprover.email,
              approverName: nextApprover.name,
              pricingRunId,
              rfqTitle: pricingRunDetails?.rfq_title || 'Pricing Run',
              clientName: pricingRunDetails?.client_name || 'Client',
              submittedBy: approver.name,
              submittedAt: new Date().toISOString(),
              totalPrice: pricingRunDetails?.total_price,
              itemCount: pricingRunDetails?.items?.length || 0,
              approvalLevel: levelName,
              slaDeadline: slaDeadline,
              tenant,
            });
            emailResults.push({ approver: nextApprover.email, success: emailResult.success });
          } catch (error) {
            console.error(`Error sending email to ${nextApprover.email}:`, error);
            emailResults.push({ approver: nextApprover.email, success: false, error: error.message });
          }
        }
      }
    }

    const message = finalApproved
      ? 'Pricing run fully approved. Notification sent to submitter.'
      : `${levelName} approval completed. Advanced to next level. Notification sent to ${nextLevel === 2 ? 'Procurement' : 'Management'} approvers.`;

    return {
      pricing_run_id: pricingRunId,
      approval_status: newStatus,
      approval_level: finalApproved ? 4 : nextLevel || currentLevel,
      approved_at: finalApproved ? new Date().toISOString() : null,
      approved_by: finalApproved ? approver.name : null,
      approval_notes: approver.notes || null,
      message,
      email_results: emailResults,
      next_level: nextLevel,
      fully_approved: finalApproved,
    };
  } catch (error) {
    console.error('Error in approval logic:', error);
    throw error;
  }
  });
}

/**
 * Rejects a pricing run
 * @param {string} pricingRunId - Pricing run UUID
 * @param {Object} rejector - Rejector information
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<Object>} Rejection result
 */
async function rejectPricingRun(pricingRunId, rejector, tenantId, tenant = null) {
  return await withTenantTransaction(tenantId, async (db) => {

  if (!rejector.rejection_reason) {
    throw new Error('rejection_reason is required when rejecting a pricing run');
  }

  // Get pricing run (verify tenant)
  const pricingRun = await db.query(
    `SELECT pr.* FROM pricing_runs pr
     JOIN rfqs r ON pr.rfq_id = r.id
     WHERE pr.id = $1 AND r.tenant_id = $2`,
    [pricingRunId, tenantId]
  );

  if (pricingRun.rows.length === 0) {
    throw new Error('Pricing run not found');
  }

  const run = pricingRun.rows[0];

  // Check if pending approval
  if (run.approval_status !== 'pending_approval') {
    throw new Error(`Cannot reject: Pricing run status is '${run.approval_status}', not 'pending_approval'`);
  }

  try {
    // Update pricing run status to rejected
    await db.query(
      `UPDATE pricing_runs
       SET approval_status = 'rejected',
           approved_by = $1,
           rejection_reason = $2
       WHERE id = $3`,
      [rejector.name || rejector.id, rejector.rejection_reason, pricingRunId]
    );

    // CRITICAL: Also update the RFQ status to rejected
    // This ensures the RFQ list shows the correct status
    await db.query(
      `UPDATE rfqs
       SET status = 'rejected'
       WHERE id = (SELECT rfq_id FROM pricing_runs WHERE id = $1)`,
      [pricingRunId]
    );

    // Create approval history entry
    const rejectorName = rejector.name?.trim() || rejector.email?.split('@')[0] || rejector.id || 'Unknown Rejector';
    await db.query(
      `INSERT INTO approval_history
        (pricing_run_id, action, actor_name, actor_email, notes, previous_status, new_status, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        pricingRunId,
        'rejected',
        rejectorName,
        rejector.email || null,
        rejector.rejection_reason,
        'pending_approval',
        'rejected',
        tenantId,
      ]
    );

    // Log to immutable audit trail
    await approvalAuditService.logApprovalEvent({
      eventType: 'status_change',
      pricingRunId,
      actor: {
        id: rejector.id || rejector.email,
        name: rejector.name,
        email: rejector.email,
        role: 'approver', // Could be sales, procurement, or management
      },
      previousState: {
        status: 'pending_approval',
        level: run.approval_level,
        approver: null,
      },
      newState: {
        status: 'rejected',
        level: null,
        approver: rejector.name,
      },
      notes: rejector.rejection_reason,
      metadata: {
        rejection_reason: rejector.rejection_reason,
      },
      isAutomated: false,
      requiresReview: true,
      tenantId,
    });

    // Get pricing run details and submitter info for email
    let pricingRunDetails = null;
    let submitterEmail = null;
    let submitterName = null;
    try {
      pricingRunDetails = await pricingService.getPricingRunById(pricingRunId);

      // Get submitter email from approval history
      const submitterResult = await db.query(
        `SELECT actor_name, actor_email FROM approval_history
         WHERE pricing_run_id = $1 AND action = 'submitted'
         ORDER BY created_at DESC LIMIT 1`,
        [pricingRunId]
      );

      if (submitterResult.rows.length > 0) {
        submitterName = submitterResult.rows[0].actor_name;
        submitterEmail = submitterResult.rows[0].actor_email;
      }
    } catch (error) {
      console.error('Error fetching pricing run details for email:', error);
    }

    // Send email notification to submitter
    let emailResult = null;
    if (submitterEmail) {
      try {
        emailResult = await emailService.sendRejectionNotificationEmail({
          submitterEmail,
          submitterName: submitterName || 'Sales Rep',
          pricingRunId,
          rfqTitle: pricingRunDetails?.rfq_title || 'Pricing Run',
          clientName: pricingRunDetails?.client_name || 'Client',
          rejectorName: rejector.name,
          rejectedAt: new Date().toISOString(),
          rejectionReason: rejector.rejection_reason,
          tenant,
        });
      } catch (error) {
        console.error('Error sending rejection notification email:', error);
        emailResult = { success: false, error: error.message };
      }
    }

    return {
      pricing_run_id: pricingRunId,
      approval_status: 'rejected',
      rejected_at: new Date().toISOString(),
      rejected_by: rejector.name,
      rejection_reason: rejector.rejection_reason,
      message: 'Pricing run rejected. Status returned to rejected. Notification sent to submitter.',
      email_sent: emailResult?.success || false,
    };
  } catch (error) {
    console.error('Error in rejection logic:', error);
    throw error;
  }
  });
}

/**
 * Gets all pending approvals
 * @param {Object} options - Filter options
 * @param {string} options.tenantId - Tenant UUID (required)
 * @returns {Promise<Object>} Pending approvals
 */
async function getPendingApprovals(options = {}) {
  const { tenantId, sort = 'oldest', limit = 50 } = options;

  // Enhanced validation and logging
  console.log('[APPROVALS] getPendingApprovals called with:', {
    tenantId,
    tenantIdType: typeof tenantId,
    tenantIdLength: tenantId ? tenantId.length : 0,
    sort,
    limit,
  });

  if (!tenantId || tenantId === '' || typeof tenantId !== 'string') {
    const error = new Error('tenantId is required and must be a valid UUID string');
    console.error('[APPROVALS] Validation failed:', { tenantId, options });
    throw error;
  }

  // Trim whitespace
  const cleanTenantId = tenantId.trim();
  if (cleanTenantId === '') {
    const error = new Error('tenantId cannot be empty or whitespace');
    console.error('[APPROVALS] Tenant ID is whitespace only');
    throw error;
  }

  // Use the earliest submission timestamp as the submitted_at for sorting and day calculation
  const submittedAtField = 'COALESCE(pr.sales_submitted_at, pr.procurement_submitted_at, pr.management_submitted_at, pr.created_at)';
  const orderBy = sort === 'newest' ? `${submittedAtField} DESC` : `${submittedAtField} ASC`;

  // Fixed N+1 query: Use LEFT JOIN and aggregation instead of subqueries
  try {
    console.log('[APPROVALS] Executing query with:', {
      cleanTenantId,
      limit,
      orderBy,
      submittedAtField,
    });

    const result = await withTenantContext(cleanTenantId, async (db) => {
      return db.query(
        `SELECT
          pr.id as pricing_run_id,
          pr.rfq_id,
          r.rfq_name as rfq_title,
          c.name as client_name,
          p.name as project_name,
          pr.total_price,
          ${submittedAtField} as submitted_at,
          pr.created_by as submitted_by,
          pr.approval_level,
          pr.sales_sla_deadline,
          pr.procurement_sla_deadline,
          pr.management_sla_deadline,
          pr.sla_expired,
          pr.escalated,
          pr.backup_approver_assigned,
          EXTRACT(DAY FROM NOW() - ${submittedAtField}) as days_pending,
          COALESCE(item_stats.item_count, 0) as item_count,
          COALESCE(item_stats.avg_margin, 0) as avg_margin
        FROM pricing_runs pr
        JOIN rfqs r ON pr.rfq_id = r.id
        JOIN projects p ON r.project_id = p.id
        JOIN clients c ON p.client_id = c.id
        LEFT JOIN (
          SELECT
            pricing_run_id,
            COUNT(*) as item_count,
            AVG((unit_price - unit_cost) / NULLIF(unit_cost, 0)) as avg_margin
          FROM pricing_run_items
          GROUP BY pricing_run_id
        ) item_stats ON item_stats.pricing_run_id = pr.id
        WHERE pr.approval_status = 'pending_approval'
          AND r.tenant_id = $1
        ORDER BY ${orderBy}
        LIMIT $2`,
        [cleanTenantId, limit]
      );
    });

    console.log('[APPROVALS] Query successful, found', result.rows.length, 'pending approvals');
    return {
      pending_approvals: result.rows.map(row => ({
        ...row,
        total_price: parseFloat(row.total_price),
        avg_margin: row.avg_margin ? parseFloat(row.avg_margin) : 0,
        days_pending: parseInt(row.days_pending) || 0,
        item_count: parseInt(row.item_count),
        approval_level: parseInt(row.approval_level) || 1,
        sla_expired: row.sla_expired || false,
        escalated: row.escalated || false,
        backup_approver_assigned: row.backup_approver_assigned || false,
      })),
      total_pending: result.rows.length,
    };
  } catch (error) {
    console.error('[APPROVALS] Query failed:', {
      error: error.message,
      code: error.code,
      detail: error.detail,
      cleanTenantId,
      limit,
    });
    throw error;
  }
}

/**
 * Gets approval history for a pricing run
 * @param {string} pricingRunId - Pricing run UUID
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<Object>} Approval history
 */
async function getApprovalHistory(pricingRunId, tenantId) {
  // Validate pricingRunId before making database call
  if (!pricingRunId || pricingRunId === '') {
    console.warn('[Approval Service] getApprovalHistory called with empty pricingRunId');
    return {
      pricing_run_id: pricingRunId,
      current_status: null,
      history: [],
    };
  }

  // Basic UUID format validation (8-4-4-4-12 hex pattern)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(pricingRunId)) {
    console.warn('[Approval Service] getApprovalHistory called with invalid UUID format:', pricingRunId);
    return {
      pricing_run_id: pricingRunId,
      current_status: null,
      history: [],
    };
  }

  return await withTenantContext(tenantId, async (db) => {
    // Get current status (verify tenant)
    const statusResult = await db.query(
      `SELECT pr.approval_status FROM pricing_runs pr
       JOIN rfqs r ON pr.rfq_id = r.id
       WHERE pr.id = $1 AND r.tenant_id = $2`,
      [pricingRunId, tenantId]
    );

    if (statusResult.rows.length === 0) {
      throw new Error('Pricing run not found');
    }

    // Get history
    const historyResult = await db.query(
      `SELECT * FROM approval_history
       WHERE pricing_run_id = $1
       ORDER BY created_at ASC`,
      [pricingRunId]
    );

    return {
      pricing_run_id: pricingRunId,
      current_status: statusResult.rows[0].approval_status,
      history: historyResult.rows,
    };
  });
}

/**
 * Gets approval queue for a specific approver
 * @param {string} approverEmail - Approver email
 * @param {Object} options - Filter options
 * @param {string} options.tenantId - Tenant UUID (required)
 * @returns {Promise<Object>} Approval queue
 */
async function getMyApprovalQueue(approverEmail, options = {}) {
  // For now, just return pending approvals
  // In future, could filter by assigned approver
  return getPendingApprovals(options);
}

/**
 * Marks a pricing run as sent to client
 * @param {string} pricingRunId - Pricing run UUID
 * @param {Object} sender - Sender information
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<Object>} Result
 */
async function markQuoteAsSent(pricingRunId, sender, tenantId, tenant = null) {
  return await withTenantTransaction(tenantId, async (db) => {

  // Get pricing run (verify tenant)
  const pricingRun = await db.query(
    `SELECT pr.* FROM pricing_runs pr
     JOIN rfqs r ON pr.rfq_id = r.id
     WHERE pr.id = $1 AND r.tenant_id = $2`,
    [pricingRunId, tenantId]
  );

  if (pricingRun.rows.length === 0) {
    throw new Error('Pricing run not found');
  }

  const run = pricingRun.rows[0];

  // Check if approved
  if (run.approval_status !== 'approved') {
    throw new Error(`Cannot send quote: Pricing run status is '${run.approval_status}', must be 'approved'`);
  }
  try {
    // Update pricing run status
    await db.query(
      `UPDATE pricing_runs
       SET approval_status = 'sent_to_client'
       WHERE id = $1`,
      [pricingRunId]
    );

    // Create approval history entry
    const senderName = sender.name?.trim() || sender.email?.split('@')[0] || sender.id || 'Unknown Sender';
    await db.query(
      `INSERT INTO approval_history
        (pricing_run_id, action, actor_name, actor_email, notes, previous_status, new_status, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        pricingRunId,
        'sent_to_client',
        senderName,
        sender.email || null,
        sender.notes || 'Quote sent to client',
        'approved',
        'sent_to_client',
        tenantId,
      ]
    );

    // Get pricing run details for email
    let pricingRunDetails = null;
    try {
      pricingRunDetails = await pricingService.getPricingRunById(pricingRunId, tenantId);
    } catch (error) {
      console.error('Error fetching pricing run details for email:', error);
    }

    // Send email notifications (to team members who might want to know)
    // In a real system, you might want to notify the sales team or manager
    const emailResults = [];
    
    // Get submitter email if available
    const submitterResult = await db.query(
      `SELECT actor_name, actor_email FROM approval_history
       WHERE pricing_run_id = $1 AND action = 'submitted'
       ORDER BY created_at DESC LIMIT 1`,
      [pricingRunId]
    );

    if (submitterResult.rows.length > 0 && submitterResult.rows[0].actor_email) {
      try {
        const emailResult = await emailService.sendQuoteSentEmail({
          recipientEmail: submitterResult.rows[0].actor_email,
          recipientName: submitterResult.rows[0].actor_name,
          pricingRunId,
          rfqTitle: pricingRunDetails?.rfq_title || 'Pricing Run',
          clientName: pricingRunDetails?.client_name || 'Client',
          sentBy: sender.name,
          sentAt: new Date().toISOString(),
          tenant,
        });
        emailResults.push({ recipient: submitterResult.rows[0].actor_email, success: emailResult.success });
      } catch (error) {
        console.error('Error sending quote sent email:', error);
        emailResults.push({ recipient: submitterResult.rows[0].actor_email, success: false, error: error.message });
      }
    }

    return {
      pricing_run_id: pricingRunId,
      approval_status: 'sent_to_client',
      sent_at: new Date().toISOString(),
      sent_by: sender.name,
      message: 'Quote marked as sent to client.',
      email_results: emailResults,
    };
  } catch (error) {
    console.error('Error in send quote logic:', error);
    throw error;
  }
  });
}

/**
 * Checks and enforces SLA deadlines for pending approvals
 * Should be called periodically (e.g., via cron job)
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<Object>} SLA enforcement results
 */
async function enforceSLA(tenantId, context = {}) {
  const logContext = {
    correlationId: context.correlationId,
    tenantId,
    operation: 'sla_enforcement_start',
  };
  log.logInfo('SLA enforcement started', logContext);
  return await withTenantContext(tenantId, async (db) => {
    const now = new Date();
    const results = {
      slaExpired: [],
      escalated: [],
      backupAssigned: [],
      errors: []
    };

    // Get approval config once for the tenant
    const { getApprovalConfig } = require('../config/tenantConfig');
    const approvalConfig = await getApprovalConfig(tenantId);

    try {
      // Find pricing runs with expired SLAs (tenant-scoped)
      const expiredSlaQuery = await db.query(`
        SELECT pr.id, pr.approval_level, pr.sales_sla_deadline, pr.procurement_sla_deadline, 
               pr.management_sla_deadline, pr.escalated, pr.backup_approver_assigned
        FROM pricing_runs pr
        JOIN rfqs r ON pr.rfq_id = r.id
        WHERE r.tenant_id = $1
          AND pr.approval_status = 'pending_approval'
          AND (
            (pr.sales_sla_deadline IS NOT NULL AND pr.sales_sla_deadline < $2) OR
            (pr.procurement_sla_deadline IS NOT NULL AND pr.procurement_sla_deadline < $2) OR
            (pr.management_sla_deadline IS NOT NULL AND pr.management_sla_deadline < $2)
          )
      `, [tenantId, now]);

      for (const run of expiredSlaQuery.rows) {
        try {
          const level = run.approval_level || 1;
          let slaDeadline = null;
          let levelName = '';

          if (level === 1 && run.sales_sla_deadline) {
            slaDeadline = new Date(run.sales_sla_deadline);
            levelName = 'Sales';
          } else if (level === 2 && run.procurement_sla_deadline) {
            slaDeadline = new Date(run.procurement_sla_deadline);
            levelName = 'Procurement';
          } else if (level === 3 && run.management_sla_deadline) {
            slaDeadline = new Date(run.management_sla_deadline);
            levelName = 'Management';
          }

          if (slaDeadline && slaDeadline < now) {
            results.slaExpired.push({
              pricing_run_id: run.id,
              level: level,
              level_name: levelName,
              sla_deadline: slaDeadline.toISOString()
            });

            // Mark SLA as expired
            await db.query(
              `UPDATE pricing_runs SET sla_expired = true WHERE id = $1`,
              [run.id]
            );

            // Check if needs backup approver (24h idle) - use tenant config
            const hoursSinceDeadline = (now - slaDeadline) / (1000 * 60 * 60);
            if (hoursSinceDeadline >= approvalConfig.sla.backupApprover.idleHours && !run.backup_approver_assigned) {
              // NSC: No backup approver concept - GM is sole approver
              const backupApprover = null;
              if (backupApprover) {
                await db.query(
                  `UPDATE pricing_runs 
                   SET backup_approver_assigned = true,
                       backup_approver_assigned_at = $1,
                       backup_approver_email = $2
                   WHERE id = $3`,
                  [now, backupApprover.email, run.id]
                );

                results.backupAssigned.push({
                  pricing_run_id: run.id,
                  level: level,
                  backup_approver: backupApprover
                });

                // Send notification to backup approver
                try {
                  const pricingRunDetails = await pricingService.getPricingRunById(run.id, tenantId);
                  await emailService.sendBackupApproverNotificationEmail({
                    approverEmail: backupApprover.email,
                    approverName: backupApprover.name,
                    pricingRunId: run.id,
                    rfqTitle: pricingRunDetails?.rfq_title || 'Pricing Run',
                    clientName: pricingRunDetails?.client_name || 'Client',
                    approvalLevel: levelName,
                    slaDeadline: slaDeadline.toISOString(),
                    tenant: null, // TODO: Fetch tenant for background jobs
                  });
                } catch (error) {
                  console.error(`Error sending backup approver email for ${run.id}:`, error);
                }
              }
            }

            // Escalate if enabled and not already escalated
            if (approvalConfig.escalation.enabled && approvalConfig.escalation.escalateAfterSlaExpires && !run.escalated) {
              await db.query(
                `UPDATE pricing_runs 
                 SET escalated = true,
                     escalated_at = $1,
                     escalated_to = $2
                 WHERE id = $3`,
                [now, `Level ${level + 1}`, run.id]
              );

              results.escalated.push({
                pricing_run_id: run.id,
                level: level,
                escalated_to: `Level ${level + 1}`
              });

              // Send escalation notification
              try {
                const pricingRunDetails = await pricingService.getPricingRunById(run.id, tenantId);
                await emailService.sendEscalationNotificationEmail({
                  pricingRunId: run.id,
                  rfqTitle: pricingRunDetails?.rfq_title || 'Pricing Run',
                  clientName: pricingRunDetails?.client_name || 'Client',
                  level: levelName,
                  slaDeadline: slaDeadline.toISOString(),
                  escalatedTo: `Level ${level + 1}`,
                  tenant: null, // TODO: Fetch tenant for background jobs
                });
              } catch (error) {
                console.error(`Error sending escalation email for ${run.id}:`, error);
              }
            }
          }
        } catch (error) {
          console.error(`Error processing SLA for pricing run ${run.id}:`, error);
          results.errors.push({
            pricing_run_id: run.id,
            error: error.message
          });
        }
      }
    } catch (error) {
      console.error('Error enforcing SLA:', error);
      log.logError('SLA enforcement failed', error, {
        ...logContext,
        operation: 'sla_enforcement_error',
      });
      throw error;
    }

    log.logInfo('SLA enforcement completed', {
      ...logContext,
      operation: 'sla_enforcement_end',
      slaExpired: results.slaExpired.length,
      escalated: results.escalated.length,
      backupAssigned: results.backupAssigned.length,
      errors: results.errors.length,
    });

    return results;
  });
}

/**
 * Gets approval statistics
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<Object>} Approval statistics
 */
async function getApprovalStatistics(tenantId) {
  return await withTenantContext(tenantId, async (db) => {
    const stats = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE pr.approval_status = 'pending_approval' AND pr.is_current = true) as pending_count,
        COUNT(*) FILTER (WHERE pr.approval_status = 'approved' AND pr.is_current = true) as approved_count,
        COUNT(*) FILTER (WHERE pr.approval_status = 'rejected' AND pr.is_current = true) as rejected_count,
        COUNT(*) FILTER (WHERE pr.approval_status = 'sent_to_client' AND pr.is_current = true) as sent_count,
        COUNT(*) FILTER (WHERE pr.sla_expired = true AND pr.is_current = true) as sla_expired_count,
        COUNT(*) FILTER (WHERE pr.escalated = true AND pr.is_current = true) as escalated_count,
        AVG(EXTRACT(EPOCH FROM (pr.approved_at - COALESCE(pr.sales_submitted_at, pr.procurement_submitted_at, pr.management_submitted_at, pr.created_at))) / 3600)
          FILTER (WHERE pr.approved_at IS NOT NULL AND COALESCE(pr.sales_submitted_at, pr.procurement_submitted_at, pr.management_submitted_at) IS NOT NULL AND pr.is_current = true) as avg_approval_time_hours
      FROM pricing_runs pr
      JOIN rfqs r ON pr.rfq_id = r.id
      WHERE r.tenant_id = $1
        AND COALESCE(pr.sales_submitted_at, pr.procurement_submitted_at, pr.management_submitted_at) IS NOT NULL
    `, [tenantId]);

    return {
      pending: parseInt(stats.rows[0].pending_count) || 0,
      approved: parseInt(stats.rows[0].approved_count) || 0,
      rejected: parseInt(stats.rows[0].rejected_count) || 0,
      sent: parseInt(stats.rows[0].sent_count) || 0,
      sla_expired: parseInt(stats.rows[0].sla_expired_count) || 0,
      escalated: parseInt(stats.rows[0].escalated_count) || 0,
      avg_approval_time_hours: parseFloat(stats.rows[0].avg_approval_time_hours) || 0,
    };
  });
}

/**
 * Creates a quote candidate from an approved pricing run
 * This bridges approved quotes to the quote candidates dashboard
 * @param {string} pricingRunId - Pricing run UUID
 * @param {string} tenantId - Tenant UUID (required)
 * @param {Object} db - Database client (optional, will create if not provided)
 * @returns {Promise<Object>} Created quote candidate
 */
async function createQuoteCandidate(pricingRunId, tenantId, db = null) {
  if (!db) {
    return await withTenantTransaction(tenantId, async (client) => {
      return createQuoteCandidate(pricingRunId, tenantId, client);
    });
  }

  // Get pricing run details with tenant verification
  const pricingRunResult = await db.query(
    `SELECT pr.*, r.id as rfq_id, c.id as client_id, c.name as client_name
     FROM pricing_runs pr
     JOIN rfqs r ON pr.rfq_id = r.id
     LEFT JOIN projects p ON r.project_id = p.id
     LEFT JOIN clients c ON p.client_id = c.id
     WHERE pr.id = $1 AND r.tenant_id = $2 AND pr.approval_status = 'approved'`,
    [pricingRunId, tenantId]
  );

  if (pricingRunResult.rows.length === 0) {
    throw new Error('Pricing run not found or not approved');
  }

  const pricingRun = pricingRunResult.rows[0];

  // Check if candidate already exists
  const existingCandidate = await db.query(
    `SELECT id FROM quote_candidates WHERE pricing_run_id = $1`,
    [pricingRunId]
  );

  if (existingCandidate.rows.length > 0) {
    console.log(`Quote candidate already exists for pricing run ${pricingRunId}`);
    return existingCandidate.rows[0];
  }

  // Create quote candidate
  const candidateResult = await db.query(
    `INSERT INTO quote_candidates (
      tenant_id,
      pricing_run_id,
      rfq_id,
      client_id,
      customer_name,
      total_value,
      approved_at,
      status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      tenantId,
      pricingRunId,
      pricingRun.rfq_id,
      pricingRun.client_id,
      pricingRun.client_name,
      pricingRun.total_price,
      pricingRun.approved_at || new Date(),
      'pending'
    ]
  );

  return candidateResult.rows[0];
}

module.exports = {
  submitForApproval,
  approvePricingRun,
  rejectPricingRun,
  markQuoteAsSent,
  getPendingApprovals,
  getApprovalHistory,
  getMyApprovalQueue,
  getApprovalStatistics,
  enforceSLA,
  createQuoteCandidate,
};
