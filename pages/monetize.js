import Nav from "../components/Nav";

export default function Monetize() {
  return (
    <>
      <Nav />
      <main className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold mb-6">Monetization Options</h1>

        <div className="space-y-6">
          <section className="p-6 bg-white dark:bg-slate-800 rounded shadow">
            <h2 className="text-lg font-semibold mb-2">Branding Pack</h2>
            <p className="text-sm mb-4">
              Download high‑res logos, color palette, and typography guidelines.
            </p>
            <button className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">
              Buy for $29
            </button>
          </section>

          <section className="p-6 bg-white dark:bg-slate-800 rounded shadow">
            <h2 className="text-lg font-semibold mb-2">Domain Purchase</h2>
            <p className="text-sm mb-4">
              Secure your .com via our registrar partner.
            </p>
            <button className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">
              Check Availability
            </button>
          </section>
        </div>
      </main>
    </>
  );
}
