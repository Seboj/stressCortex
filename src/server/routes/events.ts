/**
 * SSE events route — GET /api/events
 *
 * Registers a text/event-stream endpoint that pushes batched event-bus updates
 * to connected browser clients. The connection stays open until the client
 * disconnects. Events are batched at 200ms intervals by SseBridge.
 *
 * SSE message format (batch of events as JSON array):
 *   data: [{"type":"conversation:turn:complete",...},{"type":"test:lifecycle",...}]\n\n
 */

import type { FastifyInstance } from 'fastify';
import { sseBridge } from '../sse-bridge.js';

export async function eventsRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/events', async (_request, reply) => {
    // Set SSE headers directly on the raw Node.js response
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Register this client with the SSE bridge for batched event delivery
    sseBridge.addClient(reply.raw);

    // Block the handler — connection stays open until the client disconnects.
    // The promise resolves when the 'close' event fires on the raw response.
    await new Promise<void>((resolve) => {
      reply.raw.on('close', resolve);
    });
  });
}
