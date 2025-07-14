import { useState } from 'react';
import axios from 'axios';

export default function Brand() {
  const [idea, setIdea] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const runBrand = async () => {
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
    <main style={{ maxWidth: 600, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>Brand Generator</h1>
      <textarea
        rows={4}
        style={{ width: '100%' }}
        placeholder="Paste your SaaS idea..."
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
      />
      <button onClick={runBrand} disabled={loading} style={{ marginTop: '1rem' }}>
        {loading ? 'Branding…' : 'Generate Brand'}
      </button>
      {result && (
        <pre style={{ marginTop: '2rem', background: '#f5f5f5', padding: '1rem' }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  );
}
