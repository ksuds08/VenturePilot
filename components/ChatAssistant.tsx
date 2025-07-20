// components/ChatAssistant.tsx
import ChatPanel from "./ChatPanel";
import SummaryPanel from "./SummaryPanel";
import { sendToAssistant } from "../lib/assistantClient";

export default function ChatAssistant() {
  const [ideas, setIdeas] = useState([]);
  const [activeIdeaId, setActiveIdeaId] = useState(null);
  const [loading, setLoading] = useState(false);
  const activeIdea = ideas.find((i) => i.id === activeIdeaId);

  const updateIdea = (id, updates) => {
    setIdeas((prev) => prev.map((i) => i.id === id ? { ...i, ...updates } : i));
  };

  const handleSend = async (content) => {
    if (!activeIdea) {
      const id = uuidv4();
      const newIdea = { id, title: content, messages: [{ role: "user", content }], locked: false, currentStage: "ideation", takeaways: {} };
      setIdeas((prev) => [...prev, newIdea]);
      setActiveIdeaId(id);
      return;
    }

    setLoading(true);
    const newMessages = [...activeIdea.messages, { role: "user", content }];
    const { reply, refinedIdea } = await sendToAssistant(newMessages, activeIdea.currentStage);
    updateIdea(activeIdea.id, {
      messages: [...newMessages, { role: "assistant", content: reply }],
      takeaways: { ...activeIdea.takeaways, refinedIdea }
    });
    setLoading(false);
  };

  const handleAdvanceStage = (id) => {
    const stageOrder = ["ideation", "validation", "branding", "mvp"];
    const current = ideas.find((i) => i.id === id);
    const nextIndex = Math.min(stageOrder.indexOf(current.currentStage) + 1, stageOrder.length - 1);
    updateIdea(id, { currentStage: stageOrder[nextIndex] });
  };

  return (
    <div className="max-w-screen-lg mx-auto p-4 h-screen overflow-hidden flex flex-col lg:flex-row gap-4">
      <div className="lg:w-1/2 w-full border rounded-xl flex flex-col h-full">
        <ChatPanel messages={activeIdea?.messages ?? []} onSend={handleSend} loading={loading} />
      </div>
      <div className="lg:w-1/2 w-full h-full overflow-y-auto rounded-xl border p-4">
        {activeIdea && (
          <SummaryPanel idea={activeIdea} onAdvanceStage={() => handleAdvanceStage(activeIdea.id)} />
        )}
      </div>
    </div>
  );
}

