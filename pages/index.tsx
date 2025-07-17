import Layout from "../Layout";
import { motion } from "framer-motion";


export default function LandingPage() {
  return (
    <Layout>
      {/* Hero Section */}
      <section className="flex flex-col items-center text-center gap-6 py-16">
        <motion.h1
          className="text-5xl md:text-6xl font-extrabold leading-tight"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        >
          Your AI Co-Founder for Startups
        </motion.h1>
        <motion.p
          className="text-xl md:text-2xl max-w-2xl"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        >
          Instantly generate your business plan, branding, and MVP demo — all powered by AI.
        </motion.p>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <button className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-8 py-3 rounded-2xl text-lg shadow-soft font-semibold hover:scale-105 hover:shadow-lg transition-all duration-200">
            Launch Your Startup Now
          </button>
        </motion.div>
        {/* Demo Animation Placeholder */}
        <div className="w-full max-w-3xl h-64 bg-slate-100 dark:bg-slate-800 rounded-xl shadow-inner flex items-center justify-center mt-8">
          <span className="text-slate-400">[Demo animation coming soon]</span>
        </div>
      </section>

      {/* Testimonials, Pricing, FAQ */}
      </section>

      <section className="py-8">
        <h2 className="text-3xl font-bold mb-6 text-center">Pricing Plans</h2>
        <div className="flex flex-col md:flex-row justify-center gap-8">
          {/* Pricing Cards */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-soft p-8 flex-1">
            <h3 className="text-xl font-semibold mb-2">Starter</h3>
            <p className="text-3xl font-bold mb-4">$0<span className="text-base font-normal">/mo</span></p>
            <ul className="text-slate-600 dark:text-slate-400 mb-6">
              <li>AI Business Plan</li>
              <li>Branding Toolkit</li>
              <li>Community Access</li>
            </ul>
            <button className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white py-3 rounded-xl font-bold hover:scale-105 transition-all">Get Started</button>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-soft p-8 flex-1 border-2 border-blue-500">
            <h3 className="text-xl font-semibold mb-2">Pro</h3>
            <p className="text-3xl font-bold mb-4">$39<span className="text-base font-normal">/mo</span></p>
            <ul className="text-slate-600 dark:text-slate-400 mb-6">
              <li>Everything in Starter</li>
              <li>MVP Generation</li>
              <li>Deploy to Glide/GitHub/Render</li>
              <li>Priority Support</li>
            </ul>
            <button className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white py-3 rounded-xl font-bold hover:scale-105 transition-all">Upgrade</button>
          </div>
        </div>
      </section>

      <section className="py-12">
        <h2 className="text-3xl font-bold mb-6 text-center">Frequently Asked Questions</h2>
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="bg-slate-100 dark:bg-slate-800 rounded-xl px-6 py-4">
            <p className="font-semibold">How does VenturePilot work?</p>
            <p className="text-slate-600 dark:text-slate-400">Describe your idea, and we’ll generate the plan, branding, and MVP for you.</p>
          </div>
          <div className="bg-slate-100 dark:bg-slate-800 rounded-xl px-6 py-4">
            <p className="font-semibold">Can I export my MVP?</p>
            <p className="text-slate-600 dark:text-slate-400">Yes! Deploy to Glide, GitHub, or Render, or download source code.</p>
          </div>
        </div>
      </section>
    </Layout>
  );
}
