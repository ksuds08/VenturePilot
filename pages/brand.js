import { useState, useEffect } from 'react';
import axios from 'axios';
import Nav from '../components/Nav';
import { loadIdea } from '../utils/ideaStore';

export default function Brand() {
  const [idea, setIdea] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => setIdea(loadIdea()), []);

  const runBrand = async () => {
    if (!idea.trim()) return;
    setLoading(true);
    try {
      const res = await axios.post(
        'https://venturepilot-api.promptpulse.workers.dev/brand',
        { idea }
      );
      setResult(res.data);
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <Nav />
      <h1>Brand Generator</h1>

      <textarea
        rows={4}
        placeholder="Paste your SaaS idea..."
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
      />

      <button onClick={runBrand} disabled={loading}>
        {loading ? 'Branding…' : 'Generate Brand'}
      </button>

      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </main>
  );
}
