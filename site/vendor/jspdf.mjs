// Vendored jsPDF library (stub)
// Package: jspdf
// Version: 2.5.1 (recommended)
// Source: https://github.com/parallax/jsPDF
// License: MIT
//
// INSTALLATION INSTRUCTIONS:
// ===========================
// This is a placeholder file. To complete the jsPDF integration, follow these steps:
//
// OPTION 1: Using CDN (Recommended)
// ----------------------------------
// 1. Download the jsPDF ESM build from a CDN:
//    wget https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.es.min.js -O jspdf.mjs
//    
//    OR use this alternative:
//    wget https://unpkg.com/jspdf@2.5.1/dist/jspdf.es.min.js -O jspdf.mjs
//
// 2. Replace this file with the downloaded jspdf.mjs
//
// OPTION 2: Using npm
// -------------------
// 1. Install jsPDF: npm install jspdf@2.5.1
// 2. Copy from node_modules: cp node_modules/jspdf/dist/jspdf.es.min.js jspdf.mjs
// 3. Replace this file with jspdf.mjs
//
// OPTION 3: Manual Download
// -------------------------
// 1. Visit: https://github.com/parallax/jsPDF/releases
// 2. Download the ESM build (jspdf.es.min.js) from version 2.5.1
// 3. Replace this file with the downloaded file
//
// VERIFICATION:
// After installation, verify the export works by checking:
// - The file should export a default jsPDF class
// - The file size should be ~300-500 KB (minified)
// - The PDF export button in the gradebook should generate PDF files
//
// For now, this exports a minimal stub that throws an error if used.
// The gradebook will fall back to the browser print dialog.

export class jsPDF {
  constructor() {
    throw new Error('PDF export is not yet configured. Please use the CSV export or browser print instead. Contact your administrator to enable PDF export.');
  }
}

export default jsPDF;
