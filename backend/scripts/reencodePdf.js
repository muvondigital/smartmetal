const fs = require('fs').promises;
const path = require('path');
const { PDFDocument } = require('pdf-lib');

async function reencodePdf(inputPath, outputPath) {
  const inputBuffer = await fs.readFile(inputPath);
  const pdfDoc = await PDFDocument.load(inputBuffer, { ignoreEncryption: true });
  const outputBytes = await pdfDoc.save({ useObjectStreams: false });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, outputBytes);
}

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!inputPath || !outputPath) {
    console.error('Usage: node backend/scripts/reencodePdf.js <input_pdf> <output_pdf>');
    process.exit(1);
  }

  try {
    await reencodePdf(path.resolve(inputPath), path.resolve(outputPath));
    console.log(`Re-encoded PDF saved to: ${outputPath}`);
  } catch (error) {
    console.error('Failed to re-encode PDF:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
