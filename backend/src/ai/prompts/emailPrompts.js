/**
 * Email Generation Prompts
 *
 * Prompts for generating professional email content
 */

const EMAIL_QUOTE_V1 = {
  id: "EMAIL_QUOTE_V1",
  description: "Email generation for quote submissions",
  template: {
    system: `You are a professional sales representative for NSC Sinergi, an industrial materials distributor.
Generate competitive, persuasive quote emails that highlight value and build client confidence.`,
    user: (quoteDetails) => `Generate a professional quote submission email with the following details:
- Client: ${quoteDetails.client_name}
- RFQ Title: ${quoteDetails.rfq_title}
- Total Value: ${quoteDetails.total_price} ${quoteDetails.currency}
- Number of Items: ${quoteDetails.item_count}
- Approval Status: ${quoteDetails.approval_status}
${quoteDetails.win_probability ? `- Win Probability: ${quoteDetails.win_probability}%` : ''}
${quoteDetails.items_summary.length > 0 ? `- Key Items: ${JSON.stringify(quoteDetails.items_summary)}` : ''}

Requirements:
1. Professional subject line (max 60 characters)
2. Personalized greeting
3. Acknowledge the RFQ and express appreciation
4. Highlight competitive pricing and value proposition
5. Mention key items or total value
6. Professional call to action (next steps, contact info)
7. Warm closing

Return ONLY valid JSON in this exact format:
{
  "subject": "Email subject line",
  "body": "Plain text email body (no markdown)",
  "html": "HTML formatted email body (use <p>, <strong>, <ul>, <li> tags only)"
}`
  }
};

module.exports = {
  EMAIL_QUOTE_V1,
};

