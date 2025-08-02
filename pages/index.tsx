import { useRef, useState, useEffect } from "react";
import Layout from "../components/layout";
import { motion } from "framer-motion";
import ChatAssistant from "../components/ChatAssistant";
import Image from "next/image";

/**
 * Landing page with scroll-to-chat and safe streaming trigger.
 */
export default function LandingPage() {
  const chatRef = useRef<HTMLDivElement | null>(null);
  const [startGreeting, setStartGreeting] = useState<() => void>(() => {});
  const [scrollToChat, setScrollToChat] = useState(false);

  useEffect(() => {
    if (scrollToChat && chatRef.current) {
      chatRef.current.scrollIntoView({ behavior: "smooth" });
      setScrollToChat(false);

      // Wait for startGreeting to be set, then trigger it
      const tryStart = () => {
        const isReady =
          startGreeting && startGreeting.toString() !== "() => {}";

        if (isReady) {
          console.log("✅ startGreeting is ready. Triggering stream.");
          startGreeting();
        } else {
          console.log("⏳ Waiting for startGreeting to be available...");
          setTimeout(tryStart, 100);
        }
      };

      tryStart();
    }
  }, [scrollToChat, startGreeting]);

  useEffect(() => {
    console.log("📥 startGreeting registered:", startGreeting.toString());
  }, [startGreeting]);

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
              onClick={() => {
                console.log("🖱️ Launch button clicked. Scrolling...");
                setScrollToChat(true);
              }}
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
          <ChatAssistant
            onInitGreeting={(starter) => {
              console.log("📦 onInitGreeting received from ChatAssistant");
              setStartGreeting(() => starter);
            }}
          />
        </section>
      </>
    </Layout>
  );
}