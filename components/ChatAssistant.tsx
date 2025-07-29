import ChatPanel from "../ChatPanel";
import useChatStages from "../../hooks/useChatStages";

/**
 * Props accepted by the ChatAssistant component. A single optional
 * callback can be provided which is invoked when the very first
 * conversation is initialised.
 */
type ChatAssistantProps = {
  onReady?: () => void;
};

/**
 * The ChatAssistant ties together the presentation of the chat panels
 * with the underlying stateful logic defined in `useChatStages`. It
 * forwards callbacks and data down to child components and ensures
 * scroll behaviour is preserved. Splitting the state logic into a
 * custom hook keeps this component declarative and easy to follow.
 */
export default function ChatAssistant({ onReady }: ChatAssistantProps) {
  const {
    ideas,
    activeIdeaId,
    setActiveIdeaId,
    loading,
    messageEndRef,
    handleSend,
  } = useChatStages(onReady);

  const activeIdea = ideas.find((i) => i.id === activeIdeaId);

  return (
    <div className="flex flex-col gap-8 mt-6 px-2">
      <div className="flex flex-col w-full">
        {ideas.map((idea) => (
          <div key={idea.id} className="mb-6">
            <ChatPanel
              messages={idea.messages}
              onSend={(msg) => {
                setActiveIdeaId(idea.id);
                handleSend(msg);
              }}
              loading={loading && idea.id === activeIdeaId}
              idea={idea}
              isActive={idea.id === activeIdeaId}
              onClick={() => setActiveIdeaId(idea.id)}
              disabled={idea.locked}
            />
          </div>
        ))}
        <div ref={messageEndRef} />
      </div>
      {/* All summaries are now integrated into the chat via interactive messages. */}
    </div>
  );
}