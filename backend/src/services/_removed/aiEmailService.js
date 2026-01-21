const { callGPT4, callGPT4JSON } = require('./gcp/genaiClient');
const emailService = require('./emailService');
const { getPrompt } = require('../ai/prompts');
const { logInfo, logError } = require('../utils/logger');

/**
 * AI Email Generation Service - Stage 9: Intelligence and Automation
 *
 * Uses GPT-4o to generate professional email content for:
 * - Quote submissions
 * - Client communications
 *
 * TODO: Implement actual AI email generation logic
 * - Generate professional email content using GPT-4o
 * - Personalize based on client history
 * - Attach PDF automatically
 * - Integrate with approval workflow
 */

/**
 * Generate email content for quote submission
 * @param {Object} pricingRun - Pricing run data
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Generated email content
 */
async function generateQuoteEmail(pricingRun, options = {}) {
  try {
    // Gather quote context
    const quoteDetails = {
      client_name: pricingRun.client_name || 'Valued Client',
      rfq_title: pricingRun.rfq_title || 'Your RFQ',
      total_price: pricingRun.total_price,
      currency: pricingRun.currency || 'USD',
      item_count: pricingRun.items?.length || 0,
      approval_status: pricingRun.approval_status || 'pending',
      win_probability: pricingRun.predicted_win_probability || null,
      items_summary: pricingRun.items?.slice(0, 5).map(item => ({
        description: item.description || item.material_name,
        quantity: item.quantity,
        unit_price: item.unit_price
      })) || []
    };

    // Build prompt for GPT-4o
    const promptDef = getPrompt('EMAIL_QUOTE_V1');
    const messages = [
      { 
        role: 'system', 
        content: promptDef.template.system 
      },
      { 
        role: 'user', 
        content: typeof promptDef.template.user === 'function'
          ? promptDef.template.user(quoteDetails)
          : promptDef.template.user
      }
    ];

    logInfo('email_quote_ai_call_start', {
      promptId: promptDef.id,
      clientName: quoteDetails.client_name
    });

    // Call GPT-4o
    const response = await callGPT4JSON(messages, {
      temperature: 0.7,
      maxTokens: 1000
    });

    logInfo('email_quote_ai_call_end', {
      promptId: promptDef.id
    });

    // Validate response structure
    if (!response.subject || !response.body || !response.html) {
      throw new Error('Invalid response structure from GPT-4o');
    }

    return {
      subject: response.subject,
      body: response.body,
      html: response.html
    };
  } catch (error) {
    logError('email_quote_ai_call_error', error, {
      promptId: 'EMAIL_QUOTE_V1'
    });
    console.error('Error generating quote email with GPT-4o:', error);
    return generateFallbackQuoteEmail(pricingRun);
  }
}

/**
 * Send AI-generated email with PDF attachment
 * @param {string} to - Recipient email
 * @param {Object} emailContent - Generated email content
 * @param {string} pdfPath - Path to PDF attachment (optional)
 * @param {string} template - Email template name for logging (optional)
 * @returns {Promise<Object>} Send result
 */
async function sendAIEmail(to, emailContent, pdfPath = null, template = 'unknown') {
  // Phase A.1: Email service not yet configured - logging instead of sending
  // TODO: Integrate with email service (Phase B+)
  // Should:
  // 1. Use emailService to send email
  // 2. Attach PDF if provided
  // 3. Track email delivery
  // 4. Log email event

  try {
    const emailOptions = {
      to,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.body,
      attachments: pdfPath ? [{ path: pdfPath }] : []
    };

    // Phase A.1: Log structured message when email would have been sent
    const logMessage = `EMAIL_NOT_CONFIGURED: Skipped sending ${template} template to ${to}`;
    logInfo('email_not_sent', {
      template,
      recipient: to,
      subject: emailContent.subject,
      has_attachment: !!pdfPath,
      reason: 'EMAIL_SERVICE_NOT_CONFIGURED',
      phase: 'A.1'
    });
    console.log(`📧 ${logMessage} (Subject: "${emailContent.subject}")`);
    
    // TODO: Uncomment when email service is configured (Phase B+)
    // const result = await emailService.sendEmail(emailOptions);
    
    return {
      success: false, // Changed to false to indicate email was not actually sent
      message_id: null,
      sent_at: null,
      skipped: true,
      reason: 'EMAIL_SERVICE_NOT_CONFIGURED',
      log_message: logMessage
    };
  } catch (error) {
    console.error('Error preparing AI email:', error);
    logError('email_preparation_error', error, {
      template,
      recipient: to
    });
    throw error;
  }
}

/**
 * Fallback email generators (template-based, no AI)
 */
function generateFallbackQuoteEmail(pricingRun) {
  return {
    subject: `Quote for ${pricingRun.rfq_title || 'Your RFQ'}`,
    body: `Dear ${pricingRun.client_name || 'Valued Client'},

Please find attached the quote details.

Best regards,
NSC Sinergi Team`,
    html: `<p>Dear ${pricingRun.client_name || 'Valued Client'},</p>
<p>Please find attached the quote details.</p>
<p>Best regards,<br>NSC Sinergi Team</p>`
  };
}

module.exports = {
  generateQuoteEmail,
  sendAIEmail
};

