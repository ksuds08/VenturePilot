
VenturePilot
VenturePilot is an AI-first startup cofounder that helps creators and solopreneurs go from idea to launch — validating concepts, generating MVPs, building brands, and deploying apps with minimal effort.
“Give it your idea, and VenturePilot returns your startup.”

✨ Core Features
Guided AI Chat – drives users through validation → branding → MVP generation


OpenAI Assistant-powered – uses gpt-4o with function calling & streaming


Brand Generation – uses gpt-image-1 to generate logo concepts


Frontend + Worker Deployment – Cloudflare Pages + Workers


Live MVP Deployment – pushes working code (frontend + API) to GitHub + Cloudflare



🧠 How It Works
1. 🧪 Refine Your Idea
Users describe a business idea in natural language. VenturePilot extracts:
Problem / Audience


Unique value prop


Suggested stack / architecture


2. 🎨 Generate Branding
The brand step uses OpenAI’s gpt-image-1 to generate logos:
// worker/handlers/brand.js
const res = await fetch("https://api.openai.com/v1/images/generations", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-image-1",
    prompt: parsed.logoDesc,
    n: 1,
    size: "1024x1024",
  }),
});
Resulting URL is stored as logoUrl and returned in branding results.
3. ⚙️ MVP Generator
Automatically creates full working MVPs (static HTML + API backend)


Builds: index.html, API routes, and deployment config


Deploys to GitHub & Cloudflare via API



🛠️ Tech Stack
Layer
Tech
Chat Engine
OpenAI gpt-4o Assistant API
Image Gen
OpenAI gpt-image-1
Frontend
Next.js + Tailwind + ReactMarkdown
Backend
Cloudflare Worker (API + routing)
Deployment
GitHub + Cloudflare Pages


🧑‍💻 Local Setup
git clone https://github.com/ksuds08/VenturePilot.git
cd VenturePilot
npm install
Required 
.env
 Variables
OPENAI_API_KEY=your_openai_key
CF_API_TOKEN=your_cloudflare_token
GITHUB_PAT=your_github_token

🧪 Scripts
npm run dev – run Next.js locally


npm run build – build for production


npm run lint – lint all files



🗂 Project Structure
/components         → React UI components
/pages              → Next.js routes
/worker/handlers    → Cloudflare Worker API handlers
/worker/utils       → Branding, OpenAI fetch logic, router builder
/lib                → OpenAI SDK + assistant functions

✅ Status
ESM imports updated (remark-gfm)


gpt-image-1 model used for brand generation


esmExternals: 'loose' configured for Next.js


Assistant orchestrates idea → brand → MVP


Worker deploys complete app to Pages+Functions



📬 Contributing
Pull requests welcome. Please keep PRs scoped and code readable.
Future enhancements: AI roadmap generation, domain + LLC assistant, end-to-end launch suite.

©️ License
MIT © 2025 PromptPulse.io




