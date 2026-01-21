/**
 * NSC Notification Rules Configuration
 *
 * Based on "NSC Notification & Intelligence Configuration Form (Filled).docx"
 *
 * Centralizes notification recipients and frequencies for:
 * - RFQ / Pricing notifications
 * - Renewal / LME notifications
 * - Supplier / Logistics notifications
 *
 * DO NOT MODIFY without NSC approval.
 * Last Updated: December 2025
 */

/**
 * RFQ and Pricing Notifications (Section 2.1)
 */
const rfqPricingNotifications = {
  // New RFQ created
  newRfqCreated: {
    recipients: [
      'Sales01@nscsinergi.com.my',
      'Sales02@nscsinergi.com.my',
      'Sales04@nscsinergi.com.my'
    ],
    backup: 'Sales07@nscsinergi.com.my',
    frequency: 'IMMEDIATE',
    notes: 'Notify primary sales team when new RFQ is created'
  },

  // RFQ below margin threshold
  rfqBelowMarginThreshold: {
    recipients: ['Sales07@nscsinergi.com.my'],
    backup: null,
    frequency: 'IMMEDIATE',
    notes: 'Notify supervisor when margin falls below threshold'
  },

  // RFQ pending approval
  rfqPendingApproval: {
    recipients: ['Sales07@nscsinergi.com.my'],
    backup: null,
    frequency: 'IMMEDIATE',
    notes: 'Notify approver when quote requires approval'
  },

  // RFQ overdue
  rfqOverdue: {
    recipients: ['Sales07@nscsinergi.com.my'],
    backup: null,
    frequency: 'DAILY',
    notes: 'Notify supervisor of overdue RFQs (threshold defined in code)'
  }
};

/**
 * Renewal and LME Notifications (Section 2.2)
 */
const renewalLmeNotifications = {
  // Contract expiring soon
  contractExpiringSoon: {
    recipient: 'Sales01@nscsinergi.com.my',
    frequency: 'DAILY',
    notes: 'Daily notification of contracts expiring within threshold period'
  },

  // LME movement triggers adjustment
  lmeMovementTriggersAdjustment: {
    recipient: 'Sales01@nscsinergi.com.my',
    frequency: 'WEEKLY',
    notes: 'Weekly notification when LME movements suggest price adjustments'
  },

  // Renewal email drafts ready
  renewalEmailDraftsReady: {
    recipient: 'Sales01@nscsinergi.com.my',
    frequency: 'MONTHLY',
    notes: 'Monthly notification when renewal email drafts are generated'
  }
};

/**
 * Supplier and Logistics Notifications (Section 2.3)
 */
const supplierLogisticsNotifications = {
  // New freight rate updates
  newFreightRateUpdates: {
    recipient: 'Sales03@nscsinergi.com.my',
    frequency: 'IMMEDIATE',
    notes: 'Notify logistics coordinator of freight rate changes'
  },

  // Supplier price list updated
  supplierPriceListUpdated: {
    recipient: 'Sales01@nscsinergi.com.my',
    frequency: 'IMMEDIATE',
    notes: 'Notify pricing lead when supplier price lists are updated'
  },

  // Duty or HS code changes
  dutyOrHsCodeChanges: {
    recipient: 'Sales03@nscsinergi.com.my',
    frequency: 'IMMEDIATE',
    notes: 'Notify logistics coordinator of duty/HS code changes'
  }
};

/**
 * Get recipients for a notification type
 * @param {string} category - Notification category (rfq_pricing, renewal_lme, supplier_logistics)
 * @param {string} eventType - Specific event type
 * @returns {Array|string|null} Recipients (array or single recipient or null)
 */
function getNotificationRecipients(category, eventType) {
  let config = null;

  switch (category) {
    case 'rfq_pricing':
      config = rfqPricingNotifications[eventType];
      break;
    case 'renewal_lme':
      config = renewalLmeNotifications[eventType];
      break;
    case 'supplier_logistics':
      config = supplierLogisticsNotifications[eventType];
      break;
    default:
      return null;
  }

  if (!config) {
    return null;
  }

  // Return recipients (array) or recipient (single) or null
  return config.recipients || config.recipient || null;
}

/**
 * Get backup recipient for a notification type
 * @param {string} category - Notification category
 * @param {string} eventType - Specific event type
 * @returns {string|null} Backup recipient or null
 */
function getBackupRecipient(category, eventType) {
  let config = null;

  switch (category) {
    case 'rfq_pricing':
      config = rfqPricingNotifications[eventType];
      break;
    case 'renewal_lme':
      config = renewalLmeNotifications[eventType];
      break;
    case 'supplier_logistics':
      config = supplierLogisticsNotifications[eventType];
      break;
    default:
      return null;
  }

  return config?.backup || null;
}

/**
 * Get notification frequency for a notification type
 * @param {string} category - Notification category
 * @param {string} eventType - Specific event type
 * @returns {string|null} Frequency (IMMEDIATE, DAILY, WEEKLY, MONTHLY) or null
 */
function getNotificationFrequency(category, eventType) {
  let config = null;

  switch (category) {
    case 'rfq_pricing':
      config = rfqPricingNotifications[eventType];
      break;
    case 'renewal_lme':
      config = renewalLmeNotifications[eventType];
      break;
    case 'supplier_logistics':
      config = supplierLogisticsNotifications[eventType];
      break;
    default:
      return null;
  }

  return config?.frequency || 'IMMEDIATE';
}

/**
 * Helper: Get all recipients for RFQ creation event
 * @returns {Array} Array of recipient emails
 */
function getNewRfqRecipients() {
  return rfqPricingNotifications.newRfqCreated.recipients;
}

/**
 * Helper: Get margin threshold notification recipient
 * @returns {string} Recipient email
 */
function getMarginThresholdRecipient() {
  return rfqPricingNotifications.rfqBelowMarginThreshold.recipients[0];
}

/**
 * Helper: Get approval notification recipient
 * @returns {string} Recipient email
 */
function getApprovalRecipient() {
  return rfqPricingNotifications.rfqPendingApproval.recipients[0];
}

/**
 * Helper: Get overdue notification recipient
 * @returns {string} Recipient email
 */
function getOverdueRecipient() {
  return rfqPricingNotifications.rfqOverdue.recipients[0];
}

/**
 * Helper: Get contract expiry notification recipient
 * @returns {string} Recipient email
 */
function getContractExpiryRecipient() {
  return renewalLmeNotifications.contractExpiringSoon.recipient;
}

/**
 * Helper: Get LME movement notification recipient
 * @returns {string} Recipient email
 */
function getLmeMovementRecipient() {
  return renewalLmeNotifications.lmeMovementTriggersAdjustment.recipient;
}

/**
 * Helper: Get renewal draft notification recipient
 * @returns {string} Recipient email
 */
function getRenewalDraftRecipient() {
  return renewalLmeNotifications.renewalEmailDraftsReady.recipient;
}

/**
 * Helper: Get freight rate update notification recipient
 * @returns {string} Recipient email
 */
function getFreightRateRecipient() {
  return supplierLogisticsNotifications.newFreightRateUpdates.recipient;
}

/**
 * Helper: Get supplier price list notification recipient
 * @returns {string} Recipient email
 */
function getSupplierPriceListRecipient() {
  return supplierLogisticsNotifications.supplierPriceListUpdated.recipient;
}

/**
 * Helper: Get duty/HS code change notification recipient
 * @returns {string} Recipient email
 */
function getDutyHsCodeRecipient() {
  return supplierLogisticsNotifications.dutyOrHsCodeChanges.recipient;
}

module.exports = {
  // Raw configuration objects
  rfqPricingNotifications,
  renewalLmeNotifications,
  supplierLogisticsNotifications,

  // General helper functions
  getNotificationRecipients,
  getBackupRecipient,
  getNotificationFrequency,

  // Specific helper functions
  getNewRfqRecipients,
  getMarginThresholdRecipient,
  getApprovalRecipient,
  getOverdueRecipient,
  getContractExpiryRecipient,
  getLmeMovementRecipient,
  getRenewalDraftRecipient,
  getFreightRateRecipient,
  getSupplierPriceListRecipient,
  getDutyHsCodeRecipient
};
