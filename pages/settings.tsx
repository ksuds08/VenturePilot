import Layout from "../components/layout";

const deployTargets = ["Glide", "GitHub", "Render"];
const automations = [
  { label: "LLC Formation", checked: true },
  { label: "Accounting Setup", checked: false },
  { label: "Metrics Tracking", checked: false },
];

export default function StartupSettings() {
  return (
    <Layout>
      <section className="max-w-2xl mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-soft p-8">
        <h2 className="text-3xl font-bold mb-6">Startup Settings</h2>
        <form className="space-y-6">
          <div>
            <label className="block text-lg font-semibold mb-2">Name</label>
            <input className="w-full px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 outline-none focus:ring-2 focus:ring-blue-400" placeholder="Startup Name" />
          </div>
          <div>
            <label className="block text-lg font-semibold mb-2">Logo</label>
            <input type="file" className="w-full" />
          </div>
          <div>
            <label className="block text-lg font-semibold mb-2">Domain</label>
            <input className="w-full px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 outline-none focus:ring-2 focus:ring-blue-400" placeholder="yourstartup.com" />
          </div>
          <div>
            <label className="block text-lg font-semibold mb-2">Deploy Target</label>
            <select className="w-full px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700">
              {deployTargets.map((t, i) => <option key={i}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-lg font-semibold mb-2">Post-Launch Automations</label>
            <div className="flex flex-col gap-2">
              {automations.map((a, i) => (
                <label key={i} className="inline-flex items-center gap-2">
                  <input type="checkbox" defaultChecked={a.checked} className="rounded-md border-slate-300 text-blue-500 focus:ring-2 focus:ring-blue-400" />
                  <span>{a.label}</span>
                </label>
              ))}
            </div>
          </div>
          <button className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white py-3 rounded-xl font-bold hover:scale-105 transition-all">Save Settings</button>
        </form>
      </section>
    </Layout>
  );
}
