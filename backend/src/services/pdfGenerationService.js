const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { getPricingRunById } = require('./pricingService');
// Price agreements removed (de-engineered)

/**
 * PDF Generation Service
 * Generates professional PDF documents for pricing runs and price agreements
 */

/**
 * Format currency
 */
function formatCurrency(amount, currency = 'USD') {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Format date
 */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Add NSC Sinergi branding header to PDF
 */
function addBrandingHeader(doc, title) {
  // Company header with blue background
  doc
    .fillColor('#1e40af')
    .rect(0, 0, doc.page.width, 80)
    .fill();

  // Company name
  doc
    .fillColor('#ffffff')
    .fontSize(20)
    .font('Helvetica-Bold')
    .text('NSC SINERGI SDN BHD', 50, 25);

  // Tagline
  doc
    .fontSize(10)
    .font('Helvetica')
    .text('Industrial Materials & Equipment Supply', 50, 50);

  // Document title on right
  doc
    .fontSize(16)
    .font('Helvetica-Bold')
    .text(title, doc.page.width - 300, 35, {
      width: 250,
      align: 'right',
    });

  // Reset to black
  doc.fillColor('#000000');

  // Move below header
  doc.moveDown(4);
}

/**
 * Build a client-friendly description from material data
 * @param {Object} item - Pricing run item with material details
 * @returns {string} Human-readable description
 */
function buildClientFriendlyDescription(item) {
  // If we have a category, use it to build a proper description
  if (item.category) {
    const category = item.category.toUpperCase();

    // Handle different material categories
    if (category.includes('BEAM') || category.includes('STRUCTURAL')) {
      return `Structural Steel Beam`;
    } else if (category.includes('PIPE')) {
      return `Carbon Steel Pipe`;
    } else if (category.includes('FLANGE')) {
      return `Steel Flange`;
    } else if (category.includes('PLATE')) {
      return `Steel Plate`;
    } else if (category.includes('FITTING')) {
      return `Pipe Fitting`;
    } else {
      // Generic material type
      return item.category.charAt(0).toUpperCase() + item.category.slice(1).toLowerCase();
    }
  }

  // Fallback to RFQ description or material code
  return item.rfq_item_description || item.material_code || 'Material';
}

/**
 * Build specification information for the item
 * @param {Object} item - Pricing run item with material details
 * @returns {string} Formatted specification details
 */
function buildSpecificationInfo(item) {
  const specs = [];

  // Add size/dimension information based on material type
  if (item.beam_type && item.beam_depth_mm) {
    specs.push(`\nSize: ${item.beam_type} ${item.beam_depth_mm}mm`);
  } else if (item.od_mm && item.wall_thickness_mm) {
    specs.push(`\nSize: ${item.od_mm}mm OD × ${item.wall_thickness_mm}mm WT`);
  } else if (item.size_description) {
    specs.push(`\nSize: ${item.size_description}`);
  } else if (item.material_code) {
    specs.push(`\nSize: ${item.material_code}`);
  }

  // Add standard and grade if available
  if (item.spec_standard && item.grade) {
    specs.push(`\nStandard: ${item.spec_standard}, Grade ${item.grade}`);
  } else if (item.spec_standard) {
    specs.push(`\nStandard: ${item.spec_standard}`);
  } else if (item.grade) {
    specs.push(`\nGrade: ${item.grade}`);
  }

  return specs.join('');
}

/**
 * Group items by category for MTO-style formatting
 * @param {Array} items - Array of pricing run items
 * @returns {Object} Items grouped by category with metadata
 */
function groupItemsByCategory(items) {
  const grouped = {};

  items.forEach(item => {
    const category = item.category || item.rfq_item_category || 'UNCATEGORIZED';
    const categoryKey = category.toUpperCase();

    if (!grouped[categoryKey]) {
      grouped[categoryKey] = {
        name: categoryKey,
        items: [],
        subtotal: 0
      };
    }

    grouped[categoryKey].items.push(item);
    grouped[categoryKey].subtotal += (item.total_price || 0);
  });

  return grouped;
}

/**
 * Calculate text height for multi-line content
 * @param {Object} doc - PDFKit document instance
 * @param {string} text - Text content
 * @param {number} width - Width constraint
 * @param {number} fontSize - Font size (optional, uses current if not provided)
 * @returns {number} Height in points
 */
function calculateTextHeight(doc, text, width, fontSize) {
  // Simply calculate height using current document font settings
  // The font size should already be set before calling this function
  return doc.heightOfString(text || '', { width: width });
}

/**
 * Add footer to PDF
 */
function addFooter(doc, pageNumber) {
  const pageHeight = doc.page.height;

  doc
    .fontSize(8)
    .fillColor('#666666')
    .text(
      'NSC Sinergi Sdn Bhd | Tel: +60 3-XXXX XXXX | Email: sales@nscsinergi.com',
      50,
      pageHeight - 50,
      {
        width: doc.page.width - 100,
        align: 'center',
      }
    );

  doc
    .fontSize(8)
    .text(`Page ${pageNumber}`, 50, pageHeight - 30, {
      width: doc.page.width - 100,
      align: 'center',
    });

  // Reset color
  doc.fillColor('#000000');
}

/**
 * Generate PDF for a pricing run (Quote/Proposal)
 * @param {Object} params - Parameters object
 * @param {string} params.tenantId - Tenant UUID (required)
 * @param {string} params.pricingRunId - Pricing run UUID
 * @param {string} outputPath - Optional output path. If not provided, returns buffer
 * @returns {Promise<Buffer|string>} PDF buffer or file path
 */
async function generatePricingRunPDF({ tenantId, pricingRunId }, outputPath = null) {
  // Validate tenantId is required
  if (!tenantId) {
    throw new Error('tenantId is required for generatePricingRunPDF');
  }

  // Validate pricingRunId is required
  if (!pricingRunId || pricingRunId.trim() === '') {
    throw new Error('pricingRunId is required and cannot be empty');
  }

  const pricingRun = await getPricingRunById(pricingRunId, tenantId);

  if (!pricingRun) {
    throw new Error('Pricing run not found');
  }

  return new Promise((resolve, reject) => {
    try {
      // Use landscape orientation for MTO documents (>50 items)
      const isMTO = (pricingRun.items || []).length > 50;

      const doc = new PDFDocument({
        size: 'A4',
        layout: isMTO ? 'landscape' : 'portrait',
        margins: {
          top: 100,
          bottom: 80,
          left: 40,
          right: 40,
        },
      });

      const chunks = [];

      // Collect PDF data
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {
        const result = Buffer.concat(chunks);
        if (outputPath) {
          fs.writeFileSync(outputPath, result);
          resolve(outputPath);
        } else {
          resolve(result);
        }
      });

      doc.on('error', reject);

      // Add branding header
      addBrandingHeader(doc, 'PRICE QUOTATION');

      // Quote metadata
      const quoteRef = `NSC/QT/${new Date().getFullYear()}/${pricingRunId.slice(0, 8).toUpperCase()}`;
      const quoteDate = formatDate(pricingRun.created_at);

      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('QUOTATION DETAILS', { underline: true });

      doc.moveDown(0.5);

      doc
        .fontSize(10)
        .font('Helvetica')
        .text(`Reference: ${quoteRef}`, { continued: false })
        .text(`Date: ${quoteDate}`)
        .text(`RFQ: ${pricingRun.rfq_title || 'Untitled RFQ'}`)
        .text(`Status: ${pricingRun.status || 'Draft'}`.toUpperCase());

      doc.moveDown(1);

      // Client information
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('CLIENT INFORMATION', { underline: true });

      doc.moveDown(0.5);

      doc
        .fontSize(10)
        .font('Helvetica')
        .text(`Client: ${pricingRun.client_name || 'N/A'}`)
        .text(`Project: ${pricingRun.project_name || 'N/A'}`)
        .text(`Contact: ${pricingRun.client_contact_email || 'N/A'}`);

      doc.moveDown(1.5);

      // Introduction
      doc
        .fontSize(10)
        .font('Helvetica')
        .text(
          `Dear Sir/Madam,\n\nWe are pleased to submit our quotation for the following materials as per your request:`,
          { align: 'left' }
        );

      doc.moveDown(1);

      // Line items table
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('ITEM SCHEDULE', { underline: true });

      doc.moveDown(0.5);

      // Determine column widths based on document orientation
      const pageWidth = doc.page.width;
      const marginLeft = 40;
      const marginRight = 40;
      const availableWidth = pageWidth - marginLeft - marginRight;

      const colWidths = isMTO ? {
        // MTO format (landscape) - preserve original line numbers
        lineNo: 60,
        description: availableWidth - 60 - 50 - 35 - 50 - 75 - 80,  // Dynamic width
        qty: 50,
        unit: 35,
        origin: 50,
        unitPrice: 75,
        total: 80,
      } : {
        // Standard format (portrait)
        no: 25,
        description: 170,
        qty: 40,
        unit: 35,
        origin: 50,
        unitPrice: 65,
        total: 75,
      };

      const drawTableRow = (y, lineNo, description, qty, unit, origin, unitPrice, total, isHeader = false, isSubtotal = false) => {
        const font = isHeader || isSubtotal ? 'Helvetica-Bold' : 'Helvetica';
        const fontSize = isHeader ? 9 : 8;
        const bgColor = isSubtotal ? '#f0f0f0' : null;

        // Draw background for subtotal rows
        if (bgColor) {
          doc.fillColor(bgColor).rect(marginLeft, y - 2, availableWidth, 18).fill();
          doc.fillColor('#000000');
        }

        // Set font and size BEFORE calculating height
        doc.font(font).fontSize(fontSize);

        let xPos = marginLeft;

        // Line number column (MTO format uses wider column for alphanumeric)
        const lineNoWidth = isMTO ? colWidths.lineNo : colWidths.no;
        doc.text(lineNo, xPos, y, { width: lineNoWidth, align: isMTO ? 'left' : 'center' });
        xPos += lineNoWidth;

        // Description column (calculate height for multi-line content)
        // Font is already set above, so calculateTextHeight uses current settings
        const descWidth = isMTO ? colWidths.description : colWidths.description;
        const descHeight = calculateTextHeight(doc, description, descWidth);
        doc.text(description, xPos, y, { width: descWidth });
        xPos += descWidth;

        doc.text(qty, xPos, y, { width: colWidths.qty, align: 'right' });
        xPos += colWidths.qty;

        doc.text(unit, xPos, y, { width: colWidths.unit, align: 'center' });
        xPos += colWidths.unit;

        doc.text(origin, xPos, y, { width: colWidths.origin, align: 'center' });
        xPos += colWidths.origin;

        doc.text(unitPrice, xPos, y, { width: colWidths.unitPrice, align: 'right' });
        xPos += colWidths.unitPrice;

        doc.text(total, xPos, y, { width: colWidths.total, align: 'right' });

        // Return next Y position based on content height
        const rowPadding = isHeader ? 5 : 8;
        return y + Math.max(descHeight, 12) + rowPadding;
      };

      // Draw header row
      const tableTop = doc.y;
      let currentY = tableTop;
      currentY = drawTableRow(
        currentY,
        isMTO ? 'Line No.' : 'No.',
        'Description',
        'Qty',
        'Unit',
        'Origin',
        'Unit Price',
        'Total',
        true,
        false
      );

      // Draw separator line
      doc
        .strokeColor('#cccccc')
        .lineWidth(1)
        .moveTo(marginLeft, currentY - 3)
        .lineTo(pageWidth - marginRight, currentY - 3)
        .stroke();

      const currency = pricingRun.currency || 'USD';

      if (isMTO) {
        // MTO format: Group by category with section headers and subtotals
        const groupedItems = groupItemsByCategory(pricingRun.items || []);

        for (const [categoryKey, categoryData] of Object.entries(groupedItems)) {
          // Check if we need a new page for section header
          if (currentY > doc.page.height - 180) {
            doc.addPage();
            currentY = 100;
          }

          currentY += 5;

          // Section header
          doc
            .fillColor('#1e40af')
            .rect(marginLeft, currentY - 2, availableWidth, 20)
            .fill();

          doc
            .fillColor('#ffffff')
            .fontSize(10)
            .font('Helvetica-Bold')
            .text(categoryData.name, marginLeft + 5, currentY + 3);

          doc.fillColor('#000000');
          currentY += 25;

          // Draw items in this category
          for (const item of categoryData.items) {
            // Check if we need a new page
            if (currentY > doc.page.height - 150) {
              doc.addPage();
              currentY = 100;
            }

            // Build description
            let description = buildClientFriendlyDescription(item);
            const specInfo = buildSpecificationInfo(item);
            const materialCode = item.material_code ? `\nRef: ${item.material_code}` : '';

            // Get origin
            const origin = item.material_origin_type || item.origin_type || 'TBD';

            // Use original line number from RFQ or fall back to sequential
            const lineNumber = item.rfq_item_line_number || item.line_number || String(item.id);

            currentY = drawTableRow(
              currentY,
              String(lineNumber),
              description + specInfo + materialCode,
              String(item.quantity || 0),
              item.rfq_item_unit || item.unit || 'pcs',
              origin,
              formatCurrency(item.unit_price, currency),
              formatCurrency(item.total_price, currency),
              false,
              false
            );
          }

          // Section subtotal
          currentY += 5;
          currentY = drawTableRow(
            currentY,
            '',
            `${categoryData.name} SUBTOTAL`,
            '',
            '',
            '',
            '',
            formatCurrency(categoryData.subtotal, currency),
            false,
            true
          );

          currentY += 10;
        }
      } else {
        // Standard format: Simple sequential list
        let lineNumber = 1;

        for (const item of pricingRun.items || []) {
          // Check if we need a new page
          if (currentY > doc.page.height - 150) {
            doc.addPage();
            currentY = 100;
          }

          // Build description
          let description = buildClientFriendlyDescription(item);
          const specInfo = buildSpecificationInfo(item);
          const materialCode = item.material_code ? `\nRef: ${item.material_code}` : '';

          // Get origin
          const origin = item.material_origin_type || item.origin_type || 'TBD';

          currentY = drawTableRow(
            currentY,
            String(lineNumber),
            description + specInfo + materialCode,
            String(item.quantity || 0),
            item.rfq_item_unit || item.unit || 'pcs',
            origin,
            formatCurrency(item.unit_price, currency),
            formatCurrency(item.total_price, currency),
            false,
            false
          );

          lineNumber++;
        }
      }

      // Draw separator line before totals
      const rightColumnX = marginLeft + (isMTO ? colWidths.lineNo : colWidths.no) +
                          colWidths.description + colWidths.qty + colWidths.unit + colWidths.origin;

      doc
        .strokeColor('#000000')
        .lineWidth(2)
        .moveTo(rightColumnX, currentY)
        .lineTo(pageWidth - marginRight, currentY)
        .stroke();

      currentY += 15;

      // Subtotal, Tax, and Total breakdown
      const valueColumnX = rightColumnX + colWidths.unitPrice;

      // Subtotal
      doc
        .fontSize(10)
        .font('Helvetica')
        .text(
          'Subtotal:',
          rightColumnX,
          currentY,
          { width: colWidths.unitPrice, align: 'right' }
        )
        .text(
          formatCurrency(pricingRun.subtotal || pricingRun.total_price, currency),
          valueColumnX,
          currentY,
          { width: colWidths.total, align: 'right' }
        );

      currentY += 20;

      // Tax (if applicable)
      if (pricingRun.tax_amount && pricingRun.tax_amount > 0) {
        const taxPercentage = ((pricingRun.tax_rate || 0) * 100).toFixed(1);
        const taxLabel = pricingRun.tax_type || 'Tax';

        doc
          .fontSize(10)
          .font('Helvetica')
          .text(
            `${taxLabel} (${taxPercentage}%):`,
            rightColumnX,
            currentY,
            { width: colWidths.unitPrice, align: 'right' }
          )
          .text(
            formatCurrency(pricingRun.tax_amount, currency),
            valueColumnX,
            currentY,
            { width: colWidths.total, align: 'right' }
          );

        currentY += 20;
      }

      // Separator line before total
      doc
        .strokeColor('#000000')
        .lineWidth(1)
        .moveTo(rightColumnX, currentY)
        .lineTo(doc.page.width - 50, currentY)
        .stroke();

      currentY += 10;

      // Grand Total
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text(
          'TOTAL:',
          rightColumnX,
          currentY,
          { width: colWidths.unitPrice, align: 'right' }
        )
        .text(
          formatCurrency(pricingRun.total_with_tax || pricingRun.total_price, currency),
          valueColumnX,
          currentY,
          { width: colWidths.total, align: 'right' }
        );

      currentY += 40;

      // Commercial terms
      if (currentY > doc.page.height - 200) {
        doc.addPage();
        currentY = 100;
      }

      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('COMMERCIAL TERMS', 50, currentY, { underline: true });

      currentY = doc.y + 10;

      doc
        .fontSize(10)
        .font('Helvetica')
        .text('• Delivery: CIF/FOB (To be confirmed)', 50, currentY)
        .text('• Payment: 30% deposit, 70% before delivery')
        .text('• Lead Time: 8-12 weeks ex-mill (subject to confirmation)')
        .text('• Validity: 60 days from quotation date')
        .text('• Currency: ' + currency);

      doc.moveDown(1);

      // Technical compliance
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('TECHNICAL COMPLIANCE', { underline: true });

      doc.moveDown(0.5);

      doc
        .fontSize(10)
        .font('Helvetica')
        .text('• All materials supplied with Mill Test Certificates (MTC 3.1)')
        .text('• Third-party inspection available upon request')
        .text('• Materials comply with specified standards and specifications');

      doc.moveDown(1.5);

      // Closing
      doc
        .fontSize(10)
        .font('Helvetica')
        .text(
          'We trust you find our quotation in order and look forward to your valued confirmation.',
          { align: 'left' }
        );

      doc.moveDown(2);

      doc
        .fontSize(10)
        .font('Helvetica')
        .text('Yours faithfully,\n\nNSC SINERGI SDN BHD', { align: 'left' });

      doc.moveDown(3);

      doc.text('_____________________\nAuthorized Signatory', { align: 'left' });

      // Add footer
      addFooter(doc, 1);

      // Finalize PDF
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  generatePricingRunPDF,
};
