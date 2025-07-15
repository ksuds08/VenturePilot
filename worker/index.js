import { ideaHandler }     from './handlers/idea.js';
import { validateHandler } from './handlers/validate.js';
import { mvpHandler }      from './handlers/mvp.js';
import { deployHandler }   from './handlers/deploy.js';
import { brandHandler }    from './handlers/brand.js';
import { launchHandler }   from './handlers/launch.js';
import { feedbackHandler } from './handlers/feedback.js';
import { opsHandler }      from './handlers/ops.js';

export default {
  async fetch(request, env, ctx) {
    const url  = new URL(request.url);
    const path = url.pathname.replace(/^\/+/, '');

    switch (path) {
      case 'idea':      return ideaHandler(request, env);
      case 'validate':  return validateHandler(request, env);
      case 'mvp':       return mvpHandler(request, env);
      case 'deploy':    return deployHandler(request, env);
      case 'brand':     return brandHandler(request, env);
      case 'launch':    return launchHandler(request, env);
      case 'feedback':  return feedbackHandler(request, env);
      case 'ops':       return opsHandler(request, env);
      default:
        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    }
  }
};
