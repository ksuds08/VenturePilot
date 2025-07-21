// components/ChatAssistant.tsx


import React, { useEffect, useState } from "react";
import ChatPanel from "./ChatPanel";
import SummaryPanel from "./SummaryPanel";
import { sendToAssistant } from "../lib/assistantClient";


interface Message {
  role: string;
  content: string;
}


export default function ChatAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [ideaId, setIdeaId] = useState<string | null>(null);
  const [ideaTitle, setIdeaTitle] = useState<string>("");
  const [deployment, setDeployment] = useState<{ repoUrl: string; pagesUrl: string } | null>(null);


  useEffect(() => {
    if (messages.length === 0) {
      // Initiate assistant conversation
      const welcome: Message = { role: "assistant", content: "Hi! Let's turn your startup idea into a working product. What's your idea?" };
      setMessages([welcome]);
    }
  }, []);


  const extractLabeledCodeBlocks = (markdown: string): Record<string, string> => {
    const regex = /```([\w\-/\.]+)\n([\s\S]*?)```/g;
    const files: Record<string, string> = {};
    let match;
    while ((match = regex.exec(markdown)) !== null) {
      const [, filename, content] = match;
      files[filename.trim()] = content.trim();
    }
    return files;
  };


  const handleSend = async (input: string) => {
    const userMsg: Message = { role: "user", content: input };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setLoading(true);


    const res = await sendToAssistant(updated);
    const assistantMsg: Message = { role: "assistant", content: res.reply };
    setMessages([...updated, assistantMsg]);
    setLoading(false);


    if (!ideaId && res.refinedIdea) {
      const id = crypto.randomUUID();
      setIdeaId(id);
      setIdeaTitle(res.refinedIdea);
    }


    // Try to extract code blocks and deploy if files present
    const files = extractLabeledCodeBlocks(res.reply);
    if (Object.keys(files).length > 0 && ideaId) {
      const deployRes = await fetch("https://venturepilot-api.promptpulse.workers.dev/mvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: ideaTitle, ideaId, files }),
      });
      const data = await deployRes.json();
      setDeployment(data);
    }
  };


  return (
    <div className="max-w-screen-lg mx-auto p-4 h-screen overflow-hidden">
      <div className="flex flex-col md:flex-row gap-4 h-full">
        <div className="md:w-1/2 w-full h-full border border-gray-300 dark:border-slate-700 rounded-xl flex flex-col overflow-hidden">
          <ChatPanel messages={messages} onSend={handleSend} loading={loading} />
        </div>
        <div className="md:w-1/2 w-full h-full border border-gray-300 dark:border-slate-700 rounded-xl overflow-y-auto">
          <SummaryPanel refinedIdea={ideaTitle} deployment={deployment} />
        </div>
      </div>
    </div>
  );
}

