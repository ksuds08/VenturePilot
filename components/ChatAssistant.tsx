import type { VentureStage as StageType } from "../types";
import ChatPanel from "./ChatPanel";
import RefinedIdeaCard from "./RefinedIdeaCard";
import ValidationSummary from "./ValidationSummary";
import useChatStages from "../hooks/useChatStages";

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
    openPanels,
    togglePanel,
    messageEndRef,
    panelRef,
    handleSend,
    handleAdvanceStage,
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

      {activeIdea && (
        <div className="w-full space-y-4" ref={panelRef}>
          {activeIdea.takeaways?.refinedIdea && (
            <div
              className={`rounded border border-gray-200 p-2 ${
                activeIdea.currentStage === "ideation" || openPanels.ideation
                  ? "bg-blue-100"
                  : "bg-blue-50"
              }`}
            >
              <div
                className="font-medium mb-1 flex items-center justify-between cursor-pointer"
                onClick={() => togglePanel("ideation")}
              >
                <span>Idea</span>
                <span className="text-gray-400">
                  {activeIdea.currentStage === "ideation" || openPanels.ideation
                    ? "▲"
                    : "▼"}
                </span>
              </div>
              {(activeIdea.currentStage === "ideation" || openPanels.ideation) && (
                <RefinedIdeaCard
                  name={activeIdea.takeaways.refinedIdea.name}
                  description={activeIdea.takeaways.refinedIdea.description}
                  onConfirm={() =>
                    handleAdvanceStage(activeIdea.id, "validation" as StageType)
                  }
                  onEdit={() => {
                    setActiveIdeaId(activeIdea.id);
                    messageEndRef.current?.scrollIntoView({
                      behavior: "smooth",
                    });
                  }}
                />
              )}
            </div>
          )}

          {activeIdea.takeaways?.validationSummary && (
            <div
              className={`rounded border border-gray-200 p-2 ${
                activeIdea.currentStage === "validation" || openPanels.validation
                  ? "bg-blue-100"
                  : "bg-blue-50"
              }`}
            >
              <div
                className="font-medium mb-1 flex items-center justify-between cursor-pointer"
                onClick={() => togglePanel("validation")}
              >
                <span>Validation</span>
                <span className="text-gray-400">
                  {activeIdea.currentStage === "validation" || openPanels.validation
                    ? "▲"
                    : "▼"}
                </span>
              </div>
              {(activeIdea.currentStage === "validation" || openPanels.validation) && (
                <ValidationSummary
                  summary={activeIdea.takeaways.validationSummary}
                  fullText={activeIdea.validation}
                  onContinue={() =>
                    handleAdvanceStage(activeIdea.id, "branding" as StageType)
                  }
                  onRestart={() => {
                    setActiveIdeaId(activeIdea.id);
                    messageEndRef.current?.scrollIntoView({
                      behavior: "smooth",
                    });
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}