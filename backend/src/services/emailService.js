const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const approvalRules = require('../config/approvalRules');
const notificationRules = require('../config/notificationRules');

/**
 * Email Service
 * Handles sending emails for approval workflow and notifications
 */

// Create transporter (configure via environment variables)
let transporter = null;

function getTransporter() {
  if (transporter) {
    return transporter;
  }

  // For development, use a test account or configure SMTP
  // In production, use real SMTP credentials
  const emailConfig = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  };

  // If no SMTP credentials, use ethereal.email for testing
  if (!emailConfig.auth.user || !emailConfig.auth.pass) {
    console.warn('⚠️  SMTP credentials not configured. Emails will be logged but not sent.');
    console.warn('   Set SMTP_USER and SMTP_PASSWORD environment variables to enable email sending.');
    return null; // Will log emails instead of sending
  }

  transporter = nodemailer.createTransport(emailConfig);
  return transporter;
}

/**
 * Loads an email template
 * @param {string} templateName - Name of the template file
 * @param {Object} variables - Variables to replace in template
 * @returns {string} Rendered HTML
 */
function loadTemplate(templateName, variables = {}) {
  const templatePath = path.join(__dirname, '../templates', `${templateName}.html`);

  try {
    let template = fs.readFileSync(templatePath, 'utf8');

    // Replace variables in template
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      template = template.replace(regex, value || '');
    }

    return template;
  } catch (error) {
    console.error(`Error loading email template ${templateName}:`, error);
    // Return a simple fallback template
    return `
      <html>
        <body>
          <h2>${variables.subject || 'Notification'}</h2>
          <p>${variables.message || 'You have a new notification.'}</p>
        </body>
      </html>
    `;
  }
}

/**
 * Sends an email
 * @param {Object} options - Email options
 * @param {string|Array} options.to - Recipient email(s)
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} options.text - Plain text content (optional)
 * @param {Object} options.tenant - Optional tenant object with is_demo flag (for demo mode safety)
 * @returns {Promise<Object>} Send result
 */
async function sendEmail({ to, subject, html, text, tenant = null }) {
  // Demo mode safety: Suppress real emails for demo tenants
  if (tenant && tenant.is_demo === true) {
    const tenantCode = tenant.code || 'UNKNOWN';
    console.log(`[EMAIL] Demo tenant (code: ${tenantCode}) – email suppressed.`);
    console.log('   To:', Array.isArray(to) ? to.join(', ') : to);
    console.log('   Subject:', subject);
    console.log('   Preview:', (text || html.replace(/<[^>]*>/g, '')).substring(0, 200) + '...');
    return {
      success: true, // Return success to avoid breaking callers
      message: 'Email suppressed (demo tenant)',
      messageId: null,
      suppressed: true,
    };
  }

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@muvondigital.com',
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    html,
    text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
  };

  const emailTransporter = getTransporter();

  if (!emailTransporter) {
    // Log email instead of sending (development mode)
    console.log('📧 Email (not sent - SMTP not configured):');
    console.log('   To:', mailOptions.to);
    console.log('   Subject:', mailOptions.subject);
    console.log('   Preview:', mailOptions.text.substring(0, 200) + '...');
    return {
      success: false,
      message: 'Email logged (SMTP not configured)',
      messageId: null,
    };
  }

  try {
    const info = await emailTransporter.sendMail(mailOptions);
    console.log('📧 Email sent:', info.messageId);
    return {
      success: true,
      message: 'Email sent successfully',
      messageId: info.messageId,
    };
  } catch (error) {
    console.error('❌ Error sending email:', error);
    throw error;
  }
}

/**
 * Sends approval request email to approvers
 * @param {Object} params - Email parameters
 * @returns {Promise<Object>} Send result
 */
async function sendApprovalRequestEmail({ approverEmail, approverName, pricingRunId, rfqTitle, clientName, submittedBy, submittedAt, totalPrice, itemCount, tenant = null }) {
  const subject = `Approval Required: ${rfqTitle || 'Pricing Run'}`;

  const html = loadTemplate('email-approval-request', {
    approverName: approverName || 'Manager',
    rfqTitle: rfqTitle || 'Pricing Run',
    clientName: clientName || 'Client',
    submittedBy: submittedBy || 'Sales Rep',
    submittedAt: submittedAt ? new Date(submittedAt).toLocaleString() : new Date().toLocaleString(),
    totalPrice: totalPrice ? `$${parseFloat(totalPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A',
    itemCount: itemCount || 0,
    pricingRunId,
    approvalUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/approvals/${pricingRunId}`,
  });

  return sendEmail({
    to: approverEmail,
    subject,
    html,
    tenant,
  });
}

/**
 * Sends approval notification email to submitter
 * @param {Object} params - Email parameters
 * @returns {Promise<Object>} Send result
 */
async function sendApprovalNotificationEmail({ submitterEmail, submitterName, pricingRunId, rfqTitle, clientName, approverName, approvedAt, approvalNotes, tenant = null }) {
  const subject = `Approved: ${rfqTitle || 'Pricing Run'}`;

  const html = loadTemplate('email-quote-approved', {
    submitterName: submitterName || 'Sales Rep',
    rfqTitle: rfqTitle || 'Pricing Run',
    clientName: clientName || 'Client',
    approverName: approverName || 'Manager',
    approvedAt: approvedAt ? new Date(approvedAt).toLocaleString() : new Date().toLocaleString(),
    approvalNotes: approvalNotes || 'No notes provided',
    pricingRunId,
    viewUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/pricing-runs/${pricingRunId}`,
  });

  return sendEmail({
    to: submitterEmail,
    subject,
    html,
    tenant,
  });
}

/**
 * Sends rejection notification email to submitter
 * @param {Object} params - Email parameters
 * @returns {Promise<Object>} Send result
 */
async function sendRejectionNotificationEmail({ submitterEmail, submitterName, pricingRunId, rfqTitle, clientName, rejectorName, rejectedAt, rejectionReason, tenant = null }) {
  const subject = `Rejected: ${rfqTitle || 'Pricing Run'}`;

  const html = loadTemplate('email-quote-rejected', {
    submitterName: submitterName || 'Sales Rep',
    rfqTitle: rfqTitle || 'Pricing Run',
    clientName: clientName || 'Client',
    rejectorName: rejectorName || 'Manager',
    rejectedAt: rejectedAt ? new Date(rejectedAt).toLocaleString() : new Date().toLocaleString(),
    rejectionReason: rejectionReason || 'No reason provided',
    pricingRunId,
    viewUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/pricing-runs/${pricingRunId}`,
  });

  return sendEmail({
    to: submitterEmail,
    subject,
    html,
    tenant,
  });
}

/**
 * Sends quote sent notification email
 * @param {Object} params - Email parameters
 * @returns {Promise<Object>} Send result
 */
async function sendQuoteSentEmail({ recipientEmail, recipientName, pricingRunId, rfqTitle, clientName, sentBy, sentAt, tenant = null }) {
  const subject = `Quote Sent: ${rfqTitle || 'Pricing Run'}`;

  const html = loadTemplate('email-quote-sent', {
    recipientName: recipientName || 'Team Member',
    rfqTitle: rfqTitle || 'Pricing Run',
    clientName: clientName || 'Client',
    sentBy: sentBy || 'Sales Rep',
    sentAt: sentAt ? new Date(sentAt).toLocaleString() : new Date().toLocaleString(),
    pricingRunId,
    viewUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/pricing-runs/${pricingRunId}`,
  });

  return sendEmail({
    to: recipientEmail,
    subject,
    html,
    tenant,
  });
}

/**
 * Sends backup approver notification email
 * @param {Object} params - Email parameters
 * @returns {Promise<Object>} Send result
 */
async function sendBackupApproverNotificationEmail({ approverEmail, approverName, pricingRunId, rfqTitle, clientName, approvalLevel, slaDeadline, tenant = null }) {
  const subject = `URGENT: Backup Approval Required - ${rfqTitle || 'Pricing Run'}`;

  const html = loadTemplate('email-backup-approver', {
    approverName: approverName || 'Approver',
    rfqTitle: rfqTitle || 'Pricing Run',
    clientName: clientName || 'Client',
    approvalLevel: approvalLevel || 'Approval',
    slaDeadline: slaDeadline ? new Date(slaDeadline).toLocaleString() : 'N/A',
    pricingRunId,
    approvalUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/approvals/${pricingRunId}`,
  });

  return sendEmail({
    to: approverEmail,
    subject,
    html,
    tenant,
  });
}

/**
 * Sends escalation notification email
 * @param {Object} params - Email parameters
 * @returns {Promise<Object>} Send result
 */
async function sendEscalationNotificationEmail({ pricingRunId, rfqTitle, clientName, level, slaDeadline, escalatedTo, tenant = null }) {
  const subject = `Escalation: ${rfqTitle || 'Pricing Run'} - ${level} Approval SLA Expired`;

  const html = loadTemplate('email-escalation', {
    rfqTitle: rfqTitle || 'Pricing Run',
    clientName: clientName || 'Client',
    level: level || 'Approval',
    slaDeadline: slaDeadline ? new Date(slaDeadline).toLocaleString() : 'N/A',
    escalatedTo: escalatedTo || 'Next Level',
    pricingRunId,
    viewUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/approvals/${pricingRunId}`,
  });

  // Send to escalation notification recipients if configured
  // Try notification rules first, fall back to approval rules
  let recipients = [];

  try {
    const overdueRecipient = notificationRules.getOverdueRecipient();
    if (overdueRecipient) {
      recipients = [overdueRecipient];
    }
  } catch (error) {
    console.warn('Could not get overdue recipient from notification rules:', error);
  }

  // Fall back to approval rules escalation recipients
  if (recipients.length === 0) {
    recipients = approvalRules.escalation.notificationRecipients || [];
  }

  if (recipients.length === 0) {
    console.warn('⚠️  No escalation notification recipients configured');
    return { success: false, message: 'No recipients configured' };
  }

  const results = [];
  for (const recipient of recipients) {
    try {
      const result = await sendEmail({
        to: recipient,
        subject,
        html,
        tenant,
      });
      results.push({ recipient, success: result.success });
    } catch (error) {
      console.error(`Error sending escalation email to ${recipient}:`, error);
      results.push({ recipient, success: false, error: error.message });
    }
  }

  return {
    success: results.some(r => r.success),
    results,
  };
}

/**
 * Sends contract expiring notification
 * @param {Object} params - Email parameters
 * @returns {Promise<Object>} Send result
 */
async function sendContractExpiringNotification({ agreementId, clientName, daysUntilExpiry, agreementDetails, tenant = null }) {
  const recipient = notificationRules.getContractExpiryRecipient();
  const subject = `Contract Expiring Soon: ${clientName} - ${daysUntilExpiry} days`;

  const html = `
    <html>
      <body>
        <h2>Contract Expiring Soon</h2>
        <p>The following contract is expiring soon and may require renewal:</p>
        <ul>
          <li><strong>Client:</strong> ${clientName}</li>
          <li><strong>Days Until Expiry:</strong> ${daysUntilExpiry}</li>
          <li><strong>Agreement ID:</strong> ${agreementId}</li>
          <li><strong>Details:</strong> ${agreementDetails || 'N/A'}</li>
        </ul>
        <p>Please review and prepare renewal as needed.</p>
      </body>
    </html>
  `;

  return sendEmail({
    to: recipient,
    subject,
    html,
    tenant,
  });
}

/**
 * Sends LME movement notification
 * @param {Object} params - Email parameters
 * @returns {Promise<Object>} Send result
 */
async function sendLmeMovementNotification({ commodity, movementPercent, currentPrice, suggestion, tenant = null }) {
  const recipient = notificationRules.getLmeMovementRecipient();
  const subject = `LME Movement Alert: ${commodity} - ${movementPercent > 0 ? '+' : ''}${movementPercent.toFixed(2)}%`;

  const html = `
    <html>
      <body>
        <h2>LME Movement Notification</h2>
        <p>Significant LME price movement detected:</p>
        <ul>
          <li><strong>Commodity:</strong> ${commodity}</li>
          <li><strong>Movement:</strong> ${movementPercent > 0 ? '+' : ''}${movementPercent.toFixed(2)}%</li>
          <li><strong>Current Price:</strong> $${currentPrice.toLocaleString()}/ton</li>
        </ul>
        <p><strong>Suggestion:</strong> ${suggestion}</p>
        <p>Please review pricing agreements that may be affected.</p>
      </body>
    </html>
  `;

  return sendEmail({
    to: recipient,
    subject,
    html,
    tenant,
  });
}

/**
 * Sends renewal draft ready notification
 * @param {Object} params - Email parameters
 * @returns {Promise<Object>} Send result
 */
async function sendRenewalDraftReadyNotification({ count, draftsList, tenant = null }) {
  const recipient = notificationRules.getRenewalDraftRecipient();
  const subject = `Renewal Drafts Ready: ${count} agreement(s)`;

  const draftsHtml = draftsList
    .map(draft => `<li>${draft.clientName} - ${draft.agreementId}</li>`)
    .join('');

  const html = `
    <html>
      <body>
        <h2>Renewal Drafts Ready</h2>
        <p>${count} renewal draft(s) have been generated and are ready for review:</p>
        <ul>
          ${draftsHtml}
        </ul>
        <p>Please review and send to clients as appropriate.</p>
      </body>
    </html>
  `;

  return sendEmail({
    to: recipient,
    subject,
    html,
    tenant,
  });
}

/**
 * Sends supplier price list update notification
 * @param {Object} params - Email parameters
 * @returns {Promise<Object>} Send result
 */
async function sendSupplierPriceListNotification({ supplierName, updateDate, itemCount, tenant = null }) {
  const recipient = notificationRules.getSupplierPriceListRecipient();
  const subject = `Supplier Price List Updated: ${supplierName}`;

  const html = `
    <html>
      <body>
        <h2>Supplier Price List Updated</h2>
        <p>A supplier has updated their price list:</p>
        <ul>
          <li><strong>Supplier:</strong> ${supplierName}</li>
          <li><strong>Update Date:</strong> ${updateDate}</li>
          <li><strong>Items Updated:</strong> ${itemCount}</li>
        </ul>
        <p>Please review the updated prices and adjust agreements as needed.</p>
      </body>
    </html>
  `;

  return sendEmail({
    to: recipient,
    subject,
    html,
    tenant,
  });
}

module.exports = {
  sendEmail,
  sendApprovalRequestEmail,
  sendApprovalNotificationEmail,
  sendRejectionNotificationEmail,
  sendQuoteSentEmail,
  sendBackupApproverNotificationEmail,
  sendEscalationNotificationEmail,
  sendContractExpiringNotification,
  sendLmeMovementNotification,
  sendRenewalDraftReadyNotification,
  sendSupplierPriceListNotification,
  getTransporter,
};

