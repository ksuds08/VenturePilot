import { useState } from "react";
import { SunIcon, MoonIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false);

  return (
    <div className={clsx("font-sans bg-white text-slate-900 min-h-screen", dark && "dark bg-slate-900 text-slate-100 transition-colors")}>
      <header className="flex items-center justify-between px-6 py-4 shadow-soft">
        <div className="text-2xl font-bold tracking-tight">VenturePilot</div>
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
