const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

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
 * @returns {Promise<Object>} Send result
 */
async function sendEmail({ to, subject, html, text }) {
  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@nscpricer.com',
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
async function sendApprovalRequestEmail({ approverEmail, approverName, pricingRunId, rfqTitle, clientName, submittedBy, submittedAt, totalPrice, itemCount }) {
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
  });
}

/**
 * Sends approval notification email to submitter
 * @param {Object} params - Email parameters
 * @returns {Promise<Object>} Send result
 */
async function sendApprovalNotificationEmail({ submitterEmail, submitterName, pricingRunId, rfqTitle, clientName, approverName, approvedAt, approvalNotes }) {
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
  });
}

/**
 * Sends rejection notification email to submitter
 * @param {Object} params - Email parameters
 * @returns {Promise<Object>} Send result
 */
async function sendRejectionNotificationEmail({ submitterEmail, submitterName, pricingRunId, rfqTitle, clientName, rejectorName, rejectedAt, rejectionReason }) {
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
  });
}

/**
 * Sends quote sent notification email
 * @param {Object} params - Email parameters
 * @returns {Promise<Object>} Send result
 */
async function sendQuoteSentEmail({ recipientEmail, recipientName, pricingRunId, rfqTitle, clientName, sentBy, sentAt }) {
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
  });
}

module.exports = {
  sendEmail,
  sendApprovalRequestEmail,
  sendApprovalNotificationEmail,
  sendRejectionNotificationEmail,
  sendQuoteSentEmail,
  getTransporter,
};

