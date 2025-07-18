# VenturePilot

VenturePilot is an autonomous AI startup generator that helps users go from idea to launched microbusiness or SaaS tool with minimal human intervention.

## Features
- Idea validation and planning
- MVP generation and deployment (Glide, Softr, GitHub + Render)
- Branding and monetization setup (Gumroad, Stripe)
- Landing page creation and deployment
- Launch promotion across Product Hunt, Reddit, X/LinkedIn, email
- Feedback collection, analytics, and iterative improvements
- User governance, subscription tiers, and white-label support

## Architecture
- **Frontend**: Chat-style UI and dashboard (Glide/Bubble/React)
- **Custom GPT**: Core planner with Cloudflare Worker tool calls
- **Cloudflare Workers**: Tool endpoints for build, deploy, launch, refine
- **Integrations**: GitHub, Render, Glide, Softr, Gumroad, Stripe, DALL·E

## Repository Structure
```
/worker        # Cloudflare Worker code
/frontend      # React/Tailwind or Glide config
/templates     # Starter app templates
/landing       # Landing page boilerplate
```
### Current Status: Transitioning from Validation to Branding

We’ve completed the idea validation phase (market surveys, competitor analysis, and early user interviews). We’re now focusing on branding: generating names, taglines, color palettes, and visual assets before moving on to monetization.
*
