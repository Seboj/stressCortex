/**
 * Test control routes — REST endpoints for starting, stopping, and querying test runs.
 *
 * POST /api/test/start  — Start a new test run (202 Accepted)
 * POST /api/test/stop   — Stop the running test (200 OK)
 * GET  /api/test/status — Query current test status (200 OK)
 */

import type { FastifyInstance } from 'fastify';
import { testController } from '../test-controller.js';

export async function testRoutes(fastify: FastifyInstance): Promise<void> {
  /** Start a new test run */
  fastify.post<{
    Body: { numConversations: number; turnsPerConversation: number; concurrency: number };
  }>('/api/test/start', async (request, reply) => {
    const { numConversations, turnsPerConversation, concurrency } = request.body;
    try {
      await testController.start({ numConversations, turnsPerConversation, concurrency });
      return reply.status(202).send({ status: 'started' });
    } catch {
      return reply.status(409).send({ error: 'Test already running' });
    }
  });

  /** Stop the running test gracefully */
  fastify.post('/api/test/stop', async (_request, reply) => {
    await testController.stop();
    return reply.status(200).send({ status: 'stopping' });
  });

  /** Get the current test lifecycle status */
  fastify.get('/api/test/status', async (_request, reply) => {
    return reply.status(200).send({ status: testController.getStatus() });
  });
}
