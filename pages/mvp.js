import { useState } from 'react';
import axios from 'axios';
import Nav from '../components/Nav';
import { loadIdea } from '../utils/ideaStore';
import { loadIdeaId } from '../utils/ideaIdStore';

export default function MVP() {
  const [idea] = useState(loadIdea());
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateMVP = async () => {
    const ideaId = loadIdeaId();
    if (!idea || !ideaId) {
      setError('Missing idea or ideaId. Go back to Idea step.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(
        'https://venturepilot-api.promptpulse.workers.dev/mvp',
        { idea: idea.title, ideaId },
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (!res?.data) throw new Error('No data returned from MVP API');
      setResult(res.data);
    } catch (err) {
      console.error('MVP error:', err);
      setError(err?.response?.data?.error || err.message || 'MVP generation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white">
      <Nav />
      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-4">MVP Generator</h1>

        <button
          onClick={generateMVP}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Generating…' : 'Deploy MVP'}
        </button>

        {error && <p className="text-red-500 mt-4">Error: {error}</p>}

        {result && (
          <div className="mt-4 p-4 bg-white dark:bg-slate-800 border rounded">
            <h2 className="text-lg font-semibold mb-2">MVP Deployment Result</h2>
            <pre className="whitespace-pre-wrap break-words text-sm">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
      </main>
    </div>
  );
}
