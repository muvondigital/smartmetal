/**
 * MUVOS Platform Branding Configuration
 *
 * Single source of truth for platform and product branding.
 * All branding text throughout the frontend must reference these constants.
 */

export const BRANDING = {
  // Platform branding
  PLATFORM_NAME: 'MUVOS',
  PLATFORM_FULL_NAME: 'Muvon Unified Commercial Operating System',

  // Product branding
  PRODUCT_NAME: 'SmartMetal',
  PRODUCT_DESCRIPTION: 'SmartMetal is the AI-Powered CPQ and Pricing Layer running on MUVOS',

  // Combined branding
  PRODUCT_WITH_PLATFORM: 'SmartMetal on MUVOS',

  // UI text
  APP_TITLE: 'SmartMetal on MUVOS',
  LOGIN_SUBTITLE: 'AI-Powered CPQ on the MUVOS Platform',
  FOOTER_TEXT: 'MUVOS Platform | SmartMetal CPQ',
} as const;

export default BRANDING;
