import { useState, useEffect } from 'react';
import axios from 'axios';
import Nav from '../components/Nav';
import { loadIdea } from '../utils/ideaStore';
import { loadIdeaId } from '../utils/ideaIdStore';

export default function Brand() {
  const [branding, setBranding] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchBranding = async () => {
      const ideaId = loadIdeaId();
      const idea = loadIdea();

      if (!ideaId || !idea?.title) {
        setError("No idea found.");
        return;
      }

      setLoading(true);
      try {
        const res = await axios.post(
          'https://venturepilot-api.promptpulse.workers.dev/brand',
          { idea: idea.title, ideaId: ideaId },
          { headers: { 'Content-Type': 'application/json' } }
        );

        if (!res?.data) throw new Error("No data returned from branding API");
        setBranding(res.data);
      } catch (err) {
        console.error("Branding error:", err);
        setError(err?.response?.data?.error || err.message || "Branding failed");
      } finally {
        setLoading(false);
      }
    };

    fetchBranding();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white">
      <Nav />
      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-4">Branding Results</h1>

        {loading && <p>Generating branding...</p>}

        {error && <p className="text-red-500">Error: {error}</p>}

        {branding && (
          <div className="space-y-4 mt-4">
            <div><strong>Name:</strong> {branding.name}</div>
            <div><strong>Tagline:</strong> {branding.tagline}</div>
            <div><strong>Colors:</strong>
              <div className="flex gap-2 mt-1">
                {branding.colors?.map((c) => (
                  <div
                    key={c}
                    className="w-6 h-6 rounded-full border"
                    style={{ backgroundColor: c }}
                    title={c}
                  ></div>
                ))}
              </div>
            </div>
            {branding.logoDesc && (
              <div><strong>Logo Prompt:</strong> {branding.logoDesc}</div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

