import { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';
import Nav from '../components/Nav';
import { saveIdea, loadIdea } from '../utils/ideaStore';

export default function Validate() {
  const [idea, setIdea] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => setIdea(loadIdea()), []);

  const runValidate = async () => {
    if (!idea.trim()) return;
    setLoading(true);
    try {
      const res = await axios.post(
        'https://venturepilot-api.promptpulse.workers.dev/validate',
        { idea }
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
 <main style=https://operator.chatgpt.com/c/687521cc36d08190b9030e4234ab24fe#cua_citation-%20maxWidth:%20600,%20margin:%20'2rem%20auto',%20fontFamily:%20'sans-serif'%20>      <Nav />
      <h1>Idea Validation</h1>

      <textarea
        rows={4}
        style=https://operator.chatgpt.com/c/687521cc36d08190b9030e4234ab24fe#cua_citation-%20width:%20'100%'%20
        placeholder="Paste your SaaS idea..."
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
      />

      <button
        onClick={runValidate}
        disabled={loading}
        style=https://operator.chatgpt.com/c/687521cc36d08190b9030e4234ab24fe#cua_citation-%20marginTop:%20'1rem',%20padding:%20'0.5rem%201rem'%20
      >
        {loading ? 'Validating…' : 'Validate'}
      </button>

      {result && (
        <>
          <pre
            style=https://operator.chatgpt.com/c/687521cc36d08190b9030e4234ab24fe#cua_citation-%20%20%20%20%20%20%20%20%20%20%20%20%20%20marginTop:%20'2rem',%20%20%20%20%20%20%20%20%20%20%20%20%20%20background:%20'#f5f5f5',%20%20%20%20%20%20%20%20%20%20%20%20%20%20padding:%20'1rem',%20%20%20%20%20%20%20%20%20%20%20%20%20%20whiteSpace:%20'pre-wrap',%20%20%20%20%20%20%20%20%20%20%20%20%20%20wordBreak:%20'break-word',%20%20%20%20%20%20%20%20%20%20%20%20
          >
            {JSON.stringify(result, null, 2)}
          </pre>
          <Link href="/brand">
            <button style=https://operator.chatgpt.com/c/687521cc36d08190b9030e4234ab24fe#cua_citation-%20marginTop:%20'1rem'%20>Next: Brand</button>
          </Link>
        </>
      )}
    </main>
  );
}
