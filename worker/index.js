// SPDX-License-Identifier: MIT
// Entry point for the VenturePilot Cloudflare Worker.  This module
// dispatches incoming HTTP requests to the appropriate handler based
// on the URL pathname.  Each handler is implemented in its own
// module under `worker/handlers` to keep the codebase modular and
// maintainable.  Additional endpoints can be added by importing
// further handlers and extending the switch statement below.

import { ideaHandler }      from './handlers/idea.js';
import { validateHandler }  from './handlers/validate.js';
import { brandHandler }     from './handlers/brand.js';
import { assistantHandler } from './handlers/assistant.js';
import { mvpHandler }       from './handlers/mvp.js';
import { generateHandler }  from './handlers/generate.js';

export default {
  async fetch(request, env, ctx) {
    // Handle preflight CORS requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    }
    const url  = new URL(request.url);
    const path = url.pathname.replace(/^\/+/,'');
    switch (path) {
      case '':
        return new Response('VenturePilot API is running', { headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' } });
      case 'idea':
        return ideaHandler(request, env);
      case 'validate':
        return validateHandler(request, env);
      case 'brand':
        return brandHandler(request, env);
      case 'assistant':
        return assistantHandler(request, env);
      case 'mvp':
        return mvpHandler(request, env);
      case 'generate':
        // Internal route used to offload long‑running generation tasks
        return generateHandler(request, env);
      default:
        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }
  },
};
