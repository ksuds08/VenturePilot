import { useState } from 'react';
import axios from 'axios';
import Link from 'next/link';
import Nav from '../components/Nav';
import { saveIdea, loadIdea } from '../utils/ideaStore';

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
      setResponse(res.data);
      saveIdea(prompt);
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
        style=https://operator.chatgpt.com/c/687521cc36d08190b9030e4234ab24fe#cua_citation-%20width:%20'100%'%20
        placeholder="Describe your SaaS idea..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />

      <button
        style=https://operator.chatgpt.com/c/687521cc36d08190b9030e4234ab24fe#cua_citation-%20marginTop:%20'1rem',%20padding:%20'0.5rem%201rem'%20
        onClick={submit}
        disabled={loading}
      >
        {loading ? 'Generating…' : 'Generate'}
      </button>

      {response && (
        <>
          <pre
            style=https://operator.chatgpt.com/c/687521cc36d08190b9030e4234ab24fe#cua_citation-%20%20%20%20%20%20%20%20%20%20%20%20%20%20marginTop:%20'2rem',%20%20%20%20%20%20%20%20%20%20%20%20%20%20background:%20'#f5f5f5',%20%20%20%20%20%20%20%20%20%20%20%20%20%20padding:%20'1rem',%20%20%20%20%20%20%20%20%20%20%20%20%20%20whiteSpace:%20'pre-wrap',%20%20%20%20%20%20%20%20%20%20%20%20%20%20wordBreak:%20'break-word',%20%20%20%20%20%20%20%20%20%20%20%20
          >
            {JSON.stringify(response, null, 2)}
          </pre>
          <Link href="/validate">
            <button style=https://operator.chatgpt.com/c/687521cc36d08190b9030e4234ab24fe#cua_citation-%20marginTop:%20'1rem'%20>Next: Validate</button>
          </Link>
        </>
      )}
    </main>
  );
}
