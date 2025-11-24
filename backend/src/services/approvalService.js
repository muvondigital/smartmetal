const { connectDb } = require('../db/supabaseClient');
const emailService = require('./emailService');
const pricingService = require('./pricingService');

/**
 * Approval Service
 * Handles approval workflow for pricing runs
 */

/**
 * Submits a pricing run for approval
 * @param {string} pricingRunId - Pricing run UUID
 * @param {Object} submitter - Submitter information
 * @returns {Promise<Object>} Submission result
 */
async function submitForApproval(pricingRunId, submitter) {
  const db = await connectDb();

  // Get pricing run
  const pricingRun = await db.query(
    'SELECT * FROM pricing_runs WHERE id = $1',
    [pricingRunId]
  );

  if (pricingRun.rows.length === 0) {
    throw new Error('Pricing run not found');
  }

  const run = pricingRun.rows[0];

  // Check if already submitted/approved
  if (run.approval_status === 'approved') {
    throw new Error('Cannot submit for approval: Pricing run is already approved');
  }

  if (run.approval_status === 'pending_approval') {
    throw new Error('Cannot submit for approval: Pricing run is already pending approval');
  }

  await db.query('BEGIN');

  try {
    // Update pricing run status
    await db.query(
      `UPDATE pricing_runs
       SET approval_status = 'pending_approval',
           submitted_for_approval_at = NOW(),
           submitted_by = $1
       WHERE id = $2`,
      [submitter.name || submitter.id, pricingRunId]
    );

    // Create approval history entry
    await db.query(
      `INSERT INTO approval_history
        (pricing_run_id, action, actor_name, actor_email, notes, previous_status, new_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        pricingRunId,
        'submitted',
        submitter.name,
        submitter.email || null,
        submitter.notes || 'Submitted for approval',
        run.approval_status,
        'pending_approval',
      ]
    );

    await db.query('COMMIT');

    // Get approvers (users who can approve)
    const approvers = await db.query(
      'SELECT name, email FROM users WHERE can_approve = true'
    );

    // Get pricing run details for email
    let pricingRunDetails = null;
    try {
      pricingRunDetails = await pricingService.getPricingRunById(pricingRunId);
    } catch (error) {
      console.error('Error fetching pricing run details for email:', error);
    }

    // Send email notifications to approvers
    const emailResults = [];
    for (const approver of approvers.rows) {
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
          });
          emailResults.push({ approver: approver.email, success: emailResult.success });
        } catch (error) {
          console.error(`Error sending email to ${approver.email}:`, error);
          emailResults.push({ approver: approver.email, success: false, error: error.message });
        }
      }
    }

    return {
      pricing_run_id: pricingRunId,
      approval_status: 'pending_approval',
      submitted_at: new Date().toISOString(),
      submitted_by: submitter.name,
      message: `Submitted for approval. Notification sent to ${approvers.rows.length} manager(s).`,
      notified_approvers: approvers.rows,
      email_results: emailResults,
    };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

/**
 * Approves a pricing run
 * @param {string} pricingRunId - Pricing run UUID
 * @param {Object} approver - Approver information
 * @returns {Promise<Object>} Approval result
 */
async function approvePricingRun(pricingRunId, approver) {
  const db = await connectDb();

  // Get pricing run
  const pricingRun = await db.query(
    'SELECT * FROM pricing_runs WHERE id = $1',
    [pricingRunId]
  );

  if (pricingRun.rows.length === 0) {
    throw new Error('Pricing run not found');
  }

  const run = pricingRun.rows[0];

  // Check if pending approval
  if (run.approval_status !== 'pending_approval') {
    throw new Error(`Cannot approve: Pricing run status is '${run.approval_status}', not 'pending_approval'`);
  }

  await db.query('BEGIN');

  try {
    // Update pricing run status
    await db.query(
      `UPDATE pricing_runs
       SET approval_status = 'approved',
           approved_at = NOW(),
           approved_by = $1,
           approval_notes = $2
       WHERE id = $3`,
      [approver.name || approver.id, approver.notes || null, pricingRunId]
    );

    // Create approval history entry
    await db.query(
      `INSERT INTO approval_history
        (pricing_run_id, action, actor_name, actor_email, notes, previous_status, new_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        pricingRunId,
        'approved',
        approver.name,
        approver.email || null,
        approver.notes || 'Approved',
        'pending_approval',
        'approved',
      ]
    );

    await db.query('COMMIT');

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
        emailResult = await emailService.sendApprovalNotificationEmail({
          submitterEmail,
          submitterName: submitterName || 'Sales Rep',
          pricingRunId,
          rfqTitle: pricingRunDetails?.rfq_title || 'Pricing Run',
          clientName: pricingRunDetails?.client_name || 'Client',
          approverName: approver.name,
          approvedAt: new Date().toISOString(),
          approvalNotes: approver.notes || null,
        });
      } catch (error) {
        console.error('Error sending approval notification email:', error);
        emailResult = { success: false, error: error.message };
      }
    }

    return {
      pricing_run_id: pricingRunId,
      approval_status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: approver.name,
      approval_notes: approver.notes || null,
      message: 'Pricing run approved successfully. Notification sent to submitter.',
      email_sent: emailResult?.success || false,
    };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

/**
 * Rejects a pricing run
 * @param {string} pricingRunId - Pricing run UUID
 * @param {Object} rejector - Rejector information
 * @returns {Promise<Object>} Rejection result
 */
async function rejectPricingRun(pricingRunId, rejector) {
  const db = await connectDb();

  if (!rejector.rejection_reason) {
    throw new Error('rejection_reason is required when rejecting a pricing run');
  }

  // Get pricing run
  const pricingRun = await db.query(
    'SELECT * FROM pricing_runs WHERE id = $1',
    [pricingRunId]
  );

  if (pricingRun.rows.length === 0) {
    throw new Error('Pricing run not found');
  }

  const run = pricingRun.rows[0];

  // Check if pending approval
  if (run.approval_status !== 'pending_approval') {
    throw new Error(`Cannot reject: Pricing run status is '${run.approval_status}', not 'pending_approval'`);
  }

  await db.query('BEGIN');

  try {
    // Update pricing run status back to draft
    await db.query(
      `UPDATE pricing_runs
       SET approval_status = 'rejected',
           approved_by = $1,
           rejection_reason = $2
       WHERE id = $3`,
      [rejector.name || rejector.id, rejector.rejection_reason, pricingRunId]
    );

    // Create approval history entry
    await db.query(
      `INSERT INTO approval_history
        (pricing_run_id, action, actor_name, actor_email, notes, previous_status, new_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        pricingRunId,
        'rejected',
        rejector.name,
        rejector.email || null,
        rejector.rejection_reason,
        'pending_approval',
        'rejected',
      ]
    );

    await db.query('COMMIT');

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
    await db.query('ROLLBACK');
    throw error;
  }
}

/**
 * Gets all pending approvals
 * @param {Object} options - Filter options
 * @returns {Promise<Object>} Pending approvals
 */
async function getPendingApprovals(options = {}) {
  const db = await connectDb();

  const { sort = 'oldest', limit = 50 } = options;
  const orderBy = sort === 'newest' ? 'pr.submitted_for_approval_at DESC' : 'pr.submitted_for_approval_at ASC';

  const result = await db.query(
    `SELECT
      pr.id as pricing_run_id,
      pr.rfq_id,
      r.title as rfq_title,
      c.name as client_name,
      p.name as project_name,
      pr.total_price,
      pr.currency,
      pr.submitted_for_approval_at as submitted_at,
      pr.submitted_by,
      EXTRACT(DAY FROM NOW() - pr.submitted_for_approval_at) as days_pending,
      (SELECT COUNT(*) FROM pricing_run_items WHERE pricing_run_id = pr.id) as item_count,
      (SELECT AVG((unit_price - base_cost) / NULLIF(base_cost, 0))
       FROM pricing_run_items WHERE pricing_run_id = pr.id) as avg_margin
    FROM pricing_runs pr
    JOIN rfqs r ON pr.rfq_id = r.id
    JOIN projects p ON r.project_id = p.id
    JOIN clients c ON p.client_id = c.id
    WHERE pr.approval_status = 'pending_approval'
    ORDER BY ${orderBy}
    LIMIT $1`,
    [limit]
  );

  return {
    pending_approvals: result.rows.map(row => ({
      ...row,
      total_price: parseFloat(row.total_price),
      avg_margin: row.avg_margin ? parseFloat(row.avg_margin) : 0,
      days_pending: parseInt(row.days_pending) || 0,
      item_count: parseInt(row.item_count),
    })),
    total_pending: result.rows.length,
  };
}

/**
 * Gets approval history for a pricing run
 * @param {string} pricingRunId - Pricing run UUID
 * @returns {Promise<Object>} Approval history
 */
async function getApprovalHistory(pricingRunId) {
  const db = await connectDb();

  // Get current status
  const statusResult = await db.query(
    'SELECT approval_status FROM pricing_runs WHERE id = $1',
    [pricingRunId]
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
}

/**
 * Gets approval queue for a specific approver
 * @param {string} approverEmail - Approver email
 * @param {Object} options - Filter options
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
 * @returns {Promise<Object>} Result
 */
async function markQuoteAsSent(pricingRunId, sender) {
  const db = await connectDb();

  // Get pricing run
  const pricingRun = await db.query(
    'SELECT * FROM pricing_runs WHERE id = $1',
    [pricingRunId]
  );

  if (pricingRun.rows.length === 0) {
    throw new Error('Pricing run not found');
  }

  const run = pricingRun.rows[0];

  // Check if approved
  if (run.approval_status !== 'approved') {
    throw new Error(`Cannot send quote: Pricing run status is '${run.approval_status}', must be 'approved'`);
  }

  await db.query('BEGIN');

  try {
    // Update pricing run status
    await db.query(
      `UPDATE pricing_runs
       SET approval_status = 'sent_to_client'
       WHERE id = $1`,
      [pricingRunId]
    );

    // Create approval history entry
    await db.query(
      `INSERT INTO approval_history
        (pricing_run_id, action, actor_name, actor_email, notes, previous_status, new_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        pricingRunId,
        'sent_to_client',
        sender.name,
        sender.email || null,
        sender.notes || 'Quote sent to client',
        'approved',
        'sent_to_client',
      ]
    );

    await db.query('COMMIT');

    // Get pricing run details for email
    let pricingRunDetails = null;
    try {
      pricingRunDetails = await pricingService.getPricingRunById(pricingRunId);
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
    await db.query('ROLLBACK');
    throw error;
  }
}

/**
 * Gets approval statistics
 * @returns {Promise<Object>} Approval statistics
 */
async function getApprovalStatistics() {
  const db = await connectDb();

  const stats = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE approval_status = 'pending_approval') as pending_count,
      COUNT(*) FILTER (WHERE approval_status = 'approved') as approved_count,
      COUNT(*) FILTER (WHERE approval_status = 'rejected') as rejected_count,
      COUNT(*) FILTER (WHERE approval_status = 'sent_to_client') as sent_count,
      AVG(EXTRACT(EPOCH FROM (approved_at - submitted_for_approval_at)) / 3600)
        FILTER (WHERE approved_at IS NOT NULL AND submitted_for_approval_at IS NOT NULL) as avg_approval_time_hours
    FROM pricing_runs
    WHERE submitted_for_approval_at IS NOT NULL
  `);

  return {
    pending: parseInt(stats.rows[0].pending_count) || 0,
    approved: parseInt(stats.rows[0].approved_count) || 0,
    rejected: parseInt(stats.rows[0].rejected_count) || 0,
    sent: parseInt(stats.rows[0].sent_count) || 0,
    avg_approval_time_hours: parseFloat(stats.rows[0].avg_approval_time_hours) || 0,
  };
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
};
