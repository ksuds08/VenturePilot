import { useState } from "react";
import { SunIcon, MoonIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import Image from "next/image";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false);

  return (
    <div
      className={clsx(
        "font-sans bg-white text-slate-900 min-h-screen",
        dark && "dark bg-slate-900 text-slate-100 transition-colors"
      )}
    >
      <header className="flex items-center justify-between px-6 py-4 shadow-soft">
        {/* Logo and brand name */}
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
        {/* Dark mode toggle */}
        <button
          className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition"
          onClick={() => setDark(!dark)}
          aria-label="Toggle dark mode"
        >
          {dark ? <SunIcon className="w-6 h-6" /> : <MoonIcon className="w-6 h-6" />}
        </button>
      </header>
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}