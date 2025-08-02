import { useRef, useState, useEffect } from "react";
import Layout from "../components/layout";
import { motion } from "framer-motion";
import ChatAssistant from "../components/ChatAssistant";
import Image from "next/image";

/**
 * Hook to track if an element is in view using IntersectionObserver
 */
function useInView(ref: React.RefObject<HTMLElement>, offset = 0) {
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
      },
      {
        rootMargin: `${offset}px`,
      }
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref, offset]);

  return isInView;
}

/**
 * Landing page with scroll-to-chat and streaming greeting trigger.
 */
export default function LandingPage() {
  const chatRef = useRef<HTMLDivElement | null>(null);
  const isChatInView = useInView(chatRef);
  const [startGreeting, setStartGreeting] = useState<() => void>(() => {});
  const [shouldScroll, setShouldScroll] = useState(false);

  useEffect(() => {
    if (shouldScroll && chatRef.current) {
      chatRef.current.scrollIntoView({ behavior: "smooth" });
      setShouldScroll(false);
    }
  }, [shouldScroll, chatRef]);

  useEffect(() => {
    if (isChatInView) {
      startGreeting();
    }
  }, [isChatInView, startGreeting]);

  return (
    <Layout>
      <>
        {/* Hero Section */}
        <section className="relative flex flex-col items-center text-center gap-6 py-12 px-4">
          {/* Large faint watermark */}
          <div className="absolute inset-0 flex justify-center">
            <Image
              src="/hero-watermark.png"
              alt="Decorative swirl"
              width={350}
              height={350}
              className="opacity-10 mt-[-3rem] pointer-events-none select-none"
            />
          </div>
          <motion.h1
            className="relative text-5xl md:text-6xl font-extrabold leading-tight text-slate-900 dark:text-white"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            Launch Your Startup on AI Wings
          </motion.h1>
          <motion.p
            className="relative text-xl md:text-2xl max-w-2xl text-slate-700 dark:text-slate-300"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            Instantly build your business plan, brand, and working MVP with your AI co‑founder.
          </motion.p>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <button
              onClick={() => setShouldScroll(true)}
              className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-8 py-3 rounded-2xl text-lg shadow-lg font-semibold hover:scale-105 hover:shadow-xl transition-all duration-200"
            >
              Launch Your Startup Now
            </button>
          </motion.div>
        </section>

        {/* Onboarding Assistant Section */}
        <section ref={chatRef} id="start" className="py-12">
          <h2 className="text-3xl font-bold mb-6 text-center text-slate-900 dark:text-white">
            Your AI Co-Founder Is Ready
          </h2>
          <ChatAssistant onInitGreeting={(starter) => setStartGreeting(() => starter)} />
        </section>
      </>
    </Layout>
  );
}