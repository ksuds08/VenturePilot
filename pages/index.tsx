import { useRef, useEffect } from "react";
import Layout from "../components/layout";
import ChatAssistant from "../components/ChatAssistant";

/**
 * Landing page now opens directly into the assistant.
 * The greeting is auto-streamed and chat is auto-scrolled into view.
 */
export default function LandingPage() {
  const chatRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  return (
    <Layout>
      <section ref={chatRef} id="start" className="py-12">
        <h2 className="text-3xl font-bold mb-6 text-center text-slate-900 dark:text-white">
          Your AI Co-Founder Is Ready
        </h2>
        <ChatAssistant
          onInitGreeting={(starter) => {
            starter(); // 🚀 Immediately trigger greeting stream on page load
          }}
        />
      </section>
    </Layout>
  );
}