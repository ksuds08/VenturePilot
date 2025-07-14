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
        style=https://operator.chatgpt.com/c/687521cc36d08190b9030e4234ab24fe#cua_citation-%20width:%20'100%'%20
        placeholder="Paste your SaaS idea..."
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
      />

      <button
        onClick={runBrand}
        disabled={loading}
        style=https://operator.chatgpt.com/c/687521cc36d08190b9030e4234ab24fe#cua_citation-%20marginTop:%20'1rem',%20padding:%20'0.5rem%201rem'%20
      >
        {loading ? 'Branding…' : 'Generate Brand'}
      </button>

      {result && (
        <pre
          style=https://operator.chatgpt.com/c/687521cc36d08190b9030e4234ab24fe#cua_citation-%20%20%20%20%20%20%20%20%20%20%20%20marginTop:%20'2rem',%20%20%20%20%20%20%20%20%20%20%20%20background:%20'#f5f5f5',%20%20%20%20%20%20%20%20%20%20%20%20padding:%20'1rem',%20%20%20%20%20%20%20%20%20%20%20%20whiteSpace:%20'pre-wrap',%20%20%20%20%20%20%20%20%20%20%20%20wordBreak:%20'break-word',%20%20%20%20%20%20%20%20%20%20
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  );
}
