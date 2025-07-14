import { useState } from 'react';
import axios from 'axios';
import Nav from '../components/Nav';
import { loadIdea } from '../utils/ideaStore';

export default function MVP() {
  const [idea] = useState(loadIdea());
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const generateMVP = async () => {
    if (!idea) return;
    setLoading(true);
    try {
      const res = await axios.post(
        'https://venturepilot-api.promptpulse.workers.dev/mvp',
        { idea, ideaId: 'demo-id' } // Replace with real ideaId later
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
      <h1>MVP Generator</h1>

      <button onClick={generateMVP} disabled={loading}>
        {loading ? 'Generating…' : 'Deploy MVP'}
      </button>

      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </main>
  );
}
