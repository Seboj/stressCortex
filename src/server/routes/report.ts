/**
 * Report generation route — POST /api/report/generate
 *
 * Receives a TestSummary from the client, calls the Cortex LLM for
 * narrative analysis, generates a PDF, and returns it as a download.
 *
 * Uses a non-instrumented OpenAI client to avoid event bus side effects.
 */

import type { FastifyInstance } from 'fastify';
import OpenAI from 'openai';
import { validateConfig } from '../../core/config.js';
import { buildReportPrompt, parseReportResponse, generateReportPdf } from '../../report/index.js';
import type { TestSummary } from '../../types/metrics.js';

export async function reportRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: { summary: TestSummary } }>(
    '/api/report/generate',
    async (request, reply) => {
      const { summary } = request.body;

      if (!summary) {
        return reply.status(400).send({ error: 'Missing summary in request body' });
      }

      try {
        // Non-instrumented OpenAI client — no event bus emissions
        const config = validateConfig();
        const client = new OpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseUrl,
          maxRetries: 0,
          timeout: 60_000,
        });

        const prompt = buildReportPrompt(summary);

        const response = await client.chat.completions.create({
          model: config.model,
          messages: [{ role: 'user', content: prompt }],
        });

        const content = response.choices[0]?.message?.content ?? '';
        const analysis = parseReportResponse(content);

        const pdfBuffer = await generateReportPdf(summary, analysis);

        const filename = `stresscortex-report-${new Date().toISOString().slice(0, 10)}.pdf`;

        return reply
          .header('Content-Type', 'application/pdf')
          .header('Content-Disposition', `attachment; filename="${filename}"`)
          .header('Content-Length', pdfBuffer.length)
          .send(pdfBuffer);
      } catch (err) {
        fastify.log.error(err, 'Report generation failed');
        const message = err instanceof Error ? err.message : 'Unknown error';
        return reply.status(500).send({ error: `Report generation failed: ${message}` });
      }
    },
  );
}
