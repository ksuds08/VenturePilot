import { useState } from 'react';
import axios from 'axios';
import Nav from '../components/Nav';
import { loadIdea } from '../utils/ideaStore';
import { loadIdeaId } from '../utils/ideaIdStore';

export default function MVP() {
  const [idea] = useState(loadIdea());
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const generateMVP = async () => {
    const ideaId = loadIdeaId();
    if (!idea || !ideaId) {
      setResult({ error: 'Missing idea or ideaId. Go back to Idea step.' });
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(
        'https://venturepilot-api.promptpulse.workers.dev/mvp',
        { idea, ideaId }
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
