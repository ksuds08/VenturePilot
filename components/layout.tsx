import { useState } from "react";
import Image from "next/image";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false);

  return (
    <div className={`min-h-screen ${dark ? "dark" : ""}`}>
      <header className="flex items-center justify-between px-6 py-4 shadow-soft">
        {/* Brand logo and name */}
        <div className="flex items-center">
          <Image
            src="/logo-launchwing.png"
            alt="LaunchWing logo"
            width={40}
            height={40}
            className="mr-2"
          />
          <span className="text-2xl font-bold tracking-tight">LaunchWing</span>
        </div>

        {/* Existing dark mode toggle can remain unchanged */}
        <button onClick={() => setDark(!dark)}>
          {dark ? "Light Mode" : "Dark Mode"}
        </button>
      </header>
      <main>{children}</main>
    </div>
  );
}