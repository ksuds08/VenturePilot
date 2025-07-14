import { useState } from 'react';
import axios from 'axios';

export default function Home() {
  const [prompt, setPrompt] = useState('');
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
      setResponse(res.data);
    } catch (err) {
      setResponse({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ maxWidth: 600, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>VenturePilot – Idea Generator</h1>

      <textarea
        rows={4}
        style={{ width: '100%' }}
        placeholder="Describe your SaaS idea..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />

      <button
        style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}
        onClick={submit}
        disabled={loading}
      >
        {loading ? 'Generating…' : 'Generate'}
      </button>

      {response && (
        <pre
          style={{
            marginTop: '2rem',
            background: '#f5f5f5',
            padding: '1rem',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}
        >
          {JSON.stringify(response, null, 2)}
        </pre>
      )}
    </main>
  );
}
