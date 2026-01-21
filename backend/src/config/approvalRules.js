/**
 * Simplified Approval Configuration for NSC
 *
 * Reality: NSC uses single approver (GM: Sales07)
 * Database supports multi-level (future-proof), but UI shows 1-level
 */

module.exports = {
  // Single approver for NSC
  approver: {
    name: 'Abdillah Abd Malek',
    position: 'General Manager',
    email: 'Sales07@nscsinergi.com.my',
    phone: '+60123772950',
    role: 'manager'
  },

  // Approval required for all quotes
  requireApproval: true,

  // Audit trail enabled (who approved, when, why)
  auditTrail: true,

  // Comments optional (but recommended for rejections)
  requireComment: false,

  // Email notification when quote approved
  emailNotification: {
    enabled: true,
    recipients: ['Sales07@nscsinergi.com.my']
  }
};
