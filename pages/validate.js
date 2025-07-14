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

  useEffect(() => setIdea(loadIdea()), []);

  const runValidate = async () => {
    const ideaId = loadIdeaId();
    if (!idea.trim() || !ideaId) return;
    setLoading(true);
    try {
      const res = await axios.post(
        'https://venturepilot-api.promptpulse.workers.dev/validate',
        { idea, ideaId }
      );
      setResult(res.data);
      saveIdea(idea);
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <Nav />
      <h1>Idea Validation</h1>

      <textarea
        rows={4}
        placeholder="Paste your SaaS idea..."
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
      />

      <button onClick={runValidate} disabled={loading}>
        {loading ? 'Validating…' : 'Validate'}
      </button>

      {result && (
        <>
          <pre>{JSON.stringify(result, null, 2)}</pre>
          <Link href="/brand">
            <button>Next: Brand</button>
          </Link>
        </>
      )}
    </main>
  );
}
