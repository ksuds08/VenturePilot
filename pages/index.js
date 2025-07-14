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
  };

  return (
    <main>
      <Nav />
      <h1>VenturePilot – Idea Generator</h1>

      <textarea
        rows={4}
        placeholder="Describe your SaaS idea..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />

      <button onClick={submit} disabled={loading}>
        {loading ? 'Generating…' : 'Generate'}
      </button>

      {response && (
        <>
          <pre>{JSON.stringify(response, null, 2)}</pre>
          <Link href="/validate">
            <button>Next: Validate</button>
          </Link>
        </>
      )}
    </main>
  );
}
