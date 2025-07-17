import Layout from "..//ayout";
import { motion } from "framer-motion";

const startupData = {
  name: "Solopreneur CRM",
  logo: "/logo.png", // Replace with logo path
  branding: "Minimal, blue & white, clean font.",
  mvp: "No-code CRM app preview",
  deployStatus: "Ready to deploy",
  nextSteps: ["Pick a domain", "Launch MVP", "Automate post-launch"],
};

export default function ResultsDashboard() {
  return (
    <Layout>
      <section className="grid md:grid-cols-2 gap-8">
        <motion.div className="bg-white dark:bg-slate-800 rounded-2xl shadow-soft p-8 flex flex-col items-center" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <img src={startupData.logo} alt="Logo" className="w-20 h-20 rounded-xl mb-4" />
          <h2 className="text-3xl font-extrabold mb-2">{startupData.name}</h2>
          <p className="text-slate-500 dark:text-slate-400 text-center mb-2">{startupData.branding}</p>
          <span className="inline-block px-3 py-1 bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-200 rounded-xl text-sm mb-4">{startupData.deployStatus}</span>
          <div className="w-full h-32 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center mb-2">
            <span className="text-slate-400">[MVP preview here]</span>
          </div>
        </motion.div>
        <motion.div className="bg-white dark:bg-slate-800 rounded-2xl shadow-soft p-8 flex flex-col gap-4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h3 className="text-xl font-bold mb-2">Next Steps</h3>
          <ol className="list-decimal ml-6 text-slate-600 dark:text-slate-300">
            {startupData.nextSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <button className="mt-8 bg-gradient-to-r from-blue-500 to-purple-500 text-white px-8 py-3 rounded-2xl text-lg shadow-soft font-semibold hover:scale-105 hover:shadow-lg transition-all duration-200">
            Deploy Now
          </button>
        </motion.div>
      </section>
    </Layout>
  );
}