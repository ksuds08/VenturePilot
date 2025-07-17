import Link from 'next/link';

export default function Nav() {
  return (
    <nav className="bg-gray-900 text-white py-4 shadow-md">
      <div className="container mx-auto flex gap-6">
        <Link href="/" passHref>
          <a className="hover:text-blue-400">Idea</a>
        </Link>
        <Link href="/validate" passHref>
          <a className="hover:text-blue-400">Validate</a>
        </Link>
        <Link href="/brand" passHref>
          <a className="hover:text-blue-400">Brand</a>
        </Link>
      </div>
    </nav>
  );
}
