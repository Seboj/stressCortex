/**
 * Fastify server factory for StressCortex.
 *
 * Creates and configures the Fastify app:
 * - CORS for local dev (permissive)
 * - REST API routes (test control)
 * - SSE events route
 * - Static file serving for compiled React SPA
 * - SPA fallback (index.html for client-side routing)
 */

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import path from 'path';
import { testRoutes } from './routes/test.js';
import { eventsRoute } from './routes/events.js';

export async function createServer() {
  const fastify = Fastify({ logger: false });

  // Permissive CORS for local dev — dashboard connects from Vite dev server (port 5173)
  await fastify.register(fastifyCors, { origin: true });

  // REST API routes for test control
  await fastify.register(testRoutes);

  // SSE endpoint for pushing live event-bus updates to the dashboard
  await fastify.register(eventsRoute);

  // Serve compiled React SPA from client/dist
  const clientDistPath = path.join(import.meta.dirname, '../../client/dist');
  await fastify.register(fastifyStatic, {
    root: clientDistPath,
    prefix: '/',
  });

  // SPA fallback: serve index.html for any route not matched by API or static files
  fastify.setNotFoundHandler(async (_request, reply) => {
    return reply.sendFile('index.html');
  });

  return fastify;
}
