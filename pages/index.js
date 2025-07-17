import { useState } from 'react';
import axios from 'axios';
import Link from 'next/link';
import Nav from '../components/Nav';
import { saveIdea, loadIdea } from '../utils/ideaStore';
import { saveIdeaId } from '../utils/ideaIdStore';

export default function Home() {
  const [prompt, setPrompt] = useState(loadIdea());
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const res = await axios.post(
        'https://venturepilot-api.promptpulse.workers.dev/idea',
        { prompt }
      );
      // res.data = { ideaId, aiResponse }
      saveIdea(prompt);
      saveIdeaId(res.data.ideaId);
      setResponse(res.data.aiResponse);
    } catch (err) {
      setResponse({ error: err.message });
    } finally {
      setLoading(false);
    }

  }
return (
  <main className="min-h-screen bg-gray-100 py-12">
    <div className="container mx-auto max-w-2xl p-6 bg-white rounded-lg shadow">
      <Nav />
      <h1 className="text-3xl font-bold mb-4">VenturePilot – Idea Generator</h1>
      <textarea
        className="w-full border border-gray-300 rounded p-3 mb-4"
        rows={4}
        placeholder="Describe your SaaS idea..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />

      <button
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50"
        onClick={submit}
        disabled={loading}
      >
        {loading ? 'Generating...' : 'Generate'}
      </button>

      {response && (
        <>
          <pre className="whitespace-pre-wrap bg-gray-100 p-4 my-4 rounded">
            {JSON.stringify(response, null, 2)}
          </pre>
          <Link href="/validate">
            <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded">
              Next: Validate
            </button>
          </Link>
        </>
      )}
    </div>
  </main>
);
}
