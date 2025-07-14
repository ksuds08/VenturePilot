import Link from 'next/link';

export default function Nav() {
  return (
    <nav style={{ marginBottom: '1rem' }}>
      <Link href="/">Idea</Link> |{' '}
      <Link href="/validate">Validate</Link> |{' '}
      <Link href="/brand">Brand</Link>
    </nav>
  );
}
