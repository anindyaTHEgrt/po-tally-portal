/**
 * extractPdfText.js
 *
 * Drop-in replacement for pdf-parse that uses pdf2json (pure JS, zero native
 * dependencies, works on any OS without installing anything extra).
 *
 * Why pdf2json instead of pdf-parse?
 *   pdf-parse embeds an old PDF.js that crashes on Salesforce-generated PDFs
 *   with "bad XRef entry".  pdf2json uses a different PDF renderer that handles
 *   these files correctly, and it also preserves column spacing — exactly what
 *   parseSalesforcePO.js needs to split multi-column table rows reliably.
 *
 * Installation (one-time):
 *   npm install pdf2json
 *
 * Usage:
 *   const { extractPdfText } = require("./extractPdfText");
 *
 *   // from a Buffer (e.g. multer memoryStorage)
 *   const text = await extractPdfText({ buffer: req.file.buffer });
 *
 *   // from a file path on disk
 *   const text = await extractPdfText({ filePath: "/uploads/myPO.pdf" });
 */

const PDFParser = require("pdf2json");
const fs        = require("fs");
const os        = require("os");
const path      = require("path");

/**
 * @param {{ filePath?: string, buffer?: Buffer }} source
 * @returns {Promise<string>}  layout-preserving plain text (spaces used for alignment)
 */
function extractPdfText({ filePath, buffer } = {}) {
    if (!filePath && !buffer) {
        return Promise.reject(new Error("extractPdfText: provide either filePath or buffer"));
    }

    return new Promise((resolve, reject) => {
        // pdf2json only accepts file paths, so write a temp file when given a Buffer
        let tmpFile = null;

        if (!filePath) {
            tmpFile = path.join(
                os.tmpdir(),
                `po_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`
            );
            try {
                fs.writeFileSync(tmpFile, buffer);
            } catch (err) {
                return reject(new Error(`extractPdfText: could not write temp file — ${err.message}`));
            }
            filePath = tmpFile;
        }

        const cleanup = () => {
            if (tmpFile) {
                try { fs.unlinkSync(tmpFile); } catch (_) { /* ignore */ }
            }
        };

        // Second arg `true` = preserve raw text (no URL-encoding of special chars)
        const parser = new PDFParser(null, 1);

        parser.on("pdfParser_dataReady", () => {
            const text = parser.getRawTextContent();
            cleanup();
            resolve(text);
        });

        parser.on("pdfParser_dataError", (err) => {
            cleanup();
            reject(new Error(`extractPdfText: pdf2json error — ${err.parserError || err}`));
        });

        parser.loadPDF(filePath);
    });
}

module.exports = { extractPdfText };