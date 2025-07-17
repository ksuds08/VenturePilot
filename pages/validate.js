import { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';
import Nav from '../components/Nav';
import { saveIdea, loadIdea } from '../utils/ideaStore';
import { loadIdeaId } from '../utils/ideaIdStore';

export default function Validate() {
  const [idea, setIdea] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => setIdea(loadIdea()), []);

  const runValidate = async () => {
    const ideaId = loadIdeaId();
    if (!idea.trim() || !ideaId) {
      setError('Missing idea or ideaId.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await axios.post(
        'https://venturepilot-api.promptpulse.workers.dev/validate',
        { idea, ideaId },
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (!res?.data) throw new Error('No data returned from validation API');
      setResult(res.data);
      saveIdea(idea);
    } catch (err) {
      console.error('Validation error:', err);
      setError(err?.response?.data?.error || err.message || 'Validation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white">
      <Nav />
      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-4">Idea Validation</h1>

        <textarea
          rows={4}
          placeholder="Paste your SaaS idea..."
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          className="w-full p-2 border rounded dark:bg-slate-800 dark:text-white"
        />

        <button
          onClick={runValidate}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 mt-4 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Validating…' : 'Validate'}
        </button>

        {error && <p className="text-red-500 mt-4">Error: {error}</p>}

        {result && (
          <div className="mt-6 p-4 bg-white dark:bg-slate-800 border rounded">
            <h2 className="text-lg font-semibold mb-2">Validation Result</h2>
            <pre className="whitespace-pre-wrap break-words text-sm">{JSON.stringify(result, null, 2)}</pre>
            <Link href="/brand">
              <button className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">
                Next: Brand
              </button>
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}

