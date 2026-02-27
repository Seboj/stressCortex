/**
 * PDF report generator using pdfkit.
 *
 * Combines TestSummary metrics with LLM-generated analysis narratives
 * into a professional, formatted PDF document.
 */

import PDFDocument from 'pdfkit';
import type { TestSummary } from '../types/metrics.js';
import type { ReportAnalysis } from './prompt.js';

const BLUE = '#2563eb';
const DARK_GRAY = '#374151';
const LIGHT_GRAY = '#6b7280';
const PAGE_MARGIN = 50;
const MAX_CONV_ROWS = 50;

/**
 * Generate a PDF report buffer from test summary and LLM analysis.
 */
export async function generateReportPdf(
  summary: TestSummary,
  analysis: ReportAnalysis,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
      bufferPages: true,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - PAGE_MARGIN * 2;

    // ── Title ──────────────────────────────────────────────────────
    doc.fontSize(22).fillColor(BLUE).font('Helvetica-Bold')
      .text('StressCortex Performance Report', { align: 'center' });
    doc.moveDown(0.3);

    const testDate = new Date(summary.startTime).toLocaleString();
    doc.fontSize(10).fillColor(LIGHT_GRAY).font('Helvetica')
      .text(`Generated: ${new Date().toLocaleString()}  |  Test run: ${testDate}`, { align: 'center' });
    doc.moveDown(1.5);

    // ── Executive Summary ──────────────────────────────────────────
    sectionHeading(doc, 'Executive Summary');
    narrativeText(doc, analysis.executiveSummary);
    doc.moveDown(1);

    // ── Key Metrics Table ──────────────────────────────────────────
    sectionHeading(doc, 'Key Metrics');
    const durationSec = (summary.durationMs / 1000).toFixed(1);
    const errorRate = summary.throughput.totalRequests > 0
      ? ((summary.totalErrors / summary.throughput.totalRequests) * 100).toFixed(1)
      : '0.0';

    const metrics: [string, string][] = [
      ['Test Duration', `${durationSec}s`],
      ['Conversations', `${summary.conversationsCompleted}/${summary.conversationsTotal} completed`],
      ['Errored Conversations', `${summary.conversationsErrored}`],
      ['Throughput (req/s)', summary.throughput.requestsPerSecond.toFixed(2)],
      ['Throughput (tokens/s)', summary.throughput.tokensPerSecond.toFixed(0)],
      ['Total Requests', `${summary.throughput.totalRequests}`],
      ['Total Tokens', `${summary.totalPromptTokens + summary.totalCompletionTokens}`],
      ['Error Rate', `${errorRate}%`],
    ];

    drawKeyValueTable(doc, metrics, pageWidth);
    doc.moveDown(1);

    // ── Latency Analysis ───────────────────────────────────────────
    checkPageBreak(doc, 200);
    sectionHeading(doc, 'Latency Analysis');

    const latencyRows: [string, string][] = [
      ['P50', `${summary.latencyPercentiles.p50.toFixed(0)}ms`],
      ['P95', `${summary.latencyPercentiles.p95.toFixed(0)}ms`],
      ['P99', `${summary.latencyPercentiles.p99.toFixed(0)}ms`],
    ];
    drawKeyValueTable(doc, latencyRows, pageWidth);
    doc.moveDown(0.5);
    narrativeText(doc, analysis.latencyTrends);
    doc.moveDown(1);

    // ── Token Growth ───────────────────────────────────────────────
    checkPageBreak(doc, 200);
    sectionHeading(doc, 'Token Usage');

    const tokenRows: [string, string][] = [
      ['Prompt Tokens', `${summary.totalPromptTokens}`],
      ['Completion Tokens', `${summary.totalCompletionTokens}`],
      ['Total Tokens', `${summary.totalPromptTokens + summary.totalCompletionTokens}`],
    ];
    drawKeyValueTable(doc, tokenRows, pageWidth);

    if (summary.perConversationTokens.length > 0) {
      doc.moveDown(0.5);
      doc.fontSize(9).fillColor(DARK_GRAY).font('Helvetica-Bold')
        .text('Per-Conversation Token Breakdown:');
      doc.moveDown(0.3);

      const convTokenData = summary.perConversationTokens.slice(0, MAX_CONV_ROWS);
      for (const c of convTokenData) {
        checkPageBreak(doc, 15);
        const totalP = c.turns.reduce((a, t) => a + t.promptTokens, 0);
        const totalC = c.turns.reduce((a, t) => a + t.completionTokens, 0);
        doc.fontSize(8).fillColor(LIGHT_GRAY).font('Helvetica')
          .text(`  Conv ${c.conversationId}: ${totalP} prompt + ${totalC} completion = ${totalP + totalC} total (${c.turns.length} turns)`);
      }
      if (summary.perConversationTokens.length > MAX_CONV_ROWS) {
        doc.fontSize(8).fillColor(LIGHT_GRAY).font('Helvetica-Oblique')
          .text(`  ... and ${summary.perConversationTokens.length - MAX_CONV_ROWS} more conversations`);
      }
    }

    doc.moveDown(0.5);
    narrativeText(doc, analysis.tokenGrowth);
    doc.moveDown(1);

    // ── Error Analysis ─────────────────────────────────────────────
    checkPageBreak(doc, 150);
    sectionHeading(doc, 'Error Analysis');

    const errorEntries = Object.entries(summary.errorBreakdown)
      .filter(([, count]) => count > 0);

    if (errorEntries.length > 0) {
      const errorRows: [string, string][] = errorEntries.map(([type, count]) => [type, `${count}`]);
      errorRows.push(['Total Errors', `${summary.totalErrors}`]);
      drawKeyValueTable(doc, errorRows, pageWidth);
    } else {
      doc.fontSize(10).fillColor(DARK_GRAY).font('Helvetica')
        .text('No errors recorded during this test run.');
    }

    doc.moveDown(0.5);
    narrativeText(doc, analysis.errorAnalysis);
    doc.moveDown(1);

    // ── Performance Analysis ───────────────────────────────────────
    checkPageBreak(doc, 120);
    sectionHeading(doc, 'Performance Analysis');
    narrativeText(doc, analysis.performanceAnalysis);
    doc.moveDown(1);

    // ── Recommendations ────────────────────────────────────────────
    checkPageBreak(doc, 120);
    sectionHeading(doc, 'Recommendations');
    narrativeText(doc, analysis.recommendations);
    doc.moveDown(1);

    // ── Footer on each page ────────────────────────────────────────
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor(LIGHT_GRAY).font('Helvetica')
        .text(
          `StressCortex Report  |  Page ${i + 1} of ${totalPages}`,
          PAGE_MARGIN,
          doc.page.height - 30,
          { align: 'center', width: pageWidth },
        );
    }

    doc.end();
  });
}

// ── Helpers ──────────────────────────────────────────────────────────

function sectionHeading(doc: PDFKit.PDFDocument, title: string): void {
  doc.fontSize(14).fillColor(BLUE).font('Helvetica-Bold').text(title);
  doc.moveDown(0.4);
}

function narrativeText(doc: PDFKit.PDFDocument, text: string): void {
  doc.fontSize(10).fillColor(DARK_GRAY).font('Helvetica').text(text, {
    lineGap: 2,
    width: doc.page.width - PAGE_MARGIN * 2,
  });
}

function drawKeyValueTable(
  doc: PDFKit.PDFDocument,
  rows: [string, string][],
  pageWidth: number,
): void {
  const labelWidth = pageWidth * 0.5;

  for (const [label, value] of rows) {
    checkPageBreak(doc, 18);
    const y = doc.y;
    doc.fontSize(9).fillColor(LIGHT_GRAY).font('Helvetica')
      .text(label, PAGE_MARGIN, y, { width: labelWidth });
    doc.fontSize(9).fillColor(DARK_GRAY).font('Helvetica-Bold')
      .text(value, PAGE_MARGIN + labelWidth, y, { width: pageWidth - labelWidth });
    doc.y = y + 16;
  }
}

function checkPageBreak(doc: PDFKit.PDFDocument, requiredSpace: number): void {
  if (doc.y + requiredSpace > doc.page.height - PAGE_MARGIN - 40) {
    doc.addPage();
  }
}
