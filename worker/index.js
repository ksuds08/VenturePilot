// SPDX-License-Identifier: MIT
// Entry point for the VenturePilot Cloudflare Worker.

import { ideaHandler }      from './handlers/idea.js';
import { validateHandler }  from './handlers/validate.js';
import { brandHandler }     from './handlers/brand.js';
import { assistantHandler } from './handlers/assistant.js';
import { mvpHandler }       from './handlers/mvp.js';
import { generateHandler }  from './handlers/generate.js';

export default {
  async fetch(request, env, ctx) {
    // 🌍 Bind secrets to globalThis so they're accessible in shared modules
    globalThis.PAT_GITHUB = env.PAT_GITHUB;
    globalThis.GITHUB_USERNAME = env.GITHUB_USERNAME;
    globalThis.GITHUB_ORG = env.GITHUB_ORG;
    globalThis.CF_API_TOKEN = env.CF_API_TOKEN;
    globalThis.CF_ACCOUNT_ID = env.CF_ACCOUNT_ID;
    globalThis.CF_PAGES_PROJECT = env.CF_PAGES_PROJECT;

    // Handle preflight CORS requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    const url  = new URL(request.url);
    const path = url.pathname.replace(/^\/+/, '');

    switch (path) {
      case '':
        return new Response('VenturePilot API is running', {
          headers: {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*'
          }
        });
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
        return generateHandler(request, env);
      default:
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
    }
  },
};