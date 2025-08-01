// hooks/useIdeaLifecycle.ts
import type { VentureStage as StageType } from "../types";
import { GREETING } from "../constants/messages";

export function initializeIdea(id: string, greeting: string) {
  return {
    id,
    title: "",
    messages: [
      {
        role: "assistant",
        content: greeting,
      },
    ],
    locked: false,
    currentStage: "ideation" as StageType,
    takeaways: {},
  };
}

export function updateIdea(
  setIdeas: React.Dispatch<React.SetStateAction<any[]>>,
  id: string,
  updates: any
) {
  setIdeas((prev) =>
    prev.map((i) =>
      i.id === id
        ? {
            ...i,
            ...(typeof updates === "function" ? updates(i) : updates),
          }
        : i
    )
  );
}