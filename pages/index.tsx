import Layout from "../components/layout";
import { motion } from "framer-motion";
import ChatAssistant from "../components/ChatAssistant";

export default function LandingPage() {
  return (
    <Layout>
      <>
        {/* Hero Section */}
        <section className="flex flex-col items-center text-center gap-6 py-16 px-4">
          <motion.h1
            className="text-5xl md:text-6xl font-extrabold leading-tight text-slate-900 dark:text-white"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            Your AI Co-Founder for Startups
          </motion.h1>
          <motion.p
            className="text-xl md:text-2xl max-w-2xl text-slate-700 dark:text-slate-300"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            Instantly generate your business plan, branding, and MVP demo — all powered by AI.
          </motion.p>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <button
              onClick={() =>
                document.getElementById("start")?.scrollIntoView({ behavior: "smooth" })
              }
              className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-8 py-3 rounded-2xl text-lg shadow-lg font-semibold hover:scale-105 hover:shadow-xl transition-all duration-200"
            >
              Launch Your Startup Now
            </button>
          </motion.div>
        </section>

        {/* Onboarding Assistant Section */}
        <section id="start" className="py-12">
          <h2 className="text-3xl font-bold mb-6 text-center text-slate-900 dark:text-white">
            Your AI Co-Founder Is Ready
          </h2>
          <ChatAssistant />
        </section>
      </>
    </Layout>
  );
}
