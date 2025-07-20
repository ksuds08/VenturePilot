// utils/promptUtils.ts
export function getSystemPrompt(stage: "ideation" | "validation" | "branding" | "mvp") {
  const base = "You are a startup advisor helping a founder.";
  const shared = "\nAt the end of your response, include:\nRefined Idea:\n<one-line summary>";

  switch (stage) {
    case "ideation":
      return `${base} Help the user clarify and improve their idea.${shared}`;
    case "validation":
      return `${base} Validate the idea for market size, demand, and business viability.${shared}`;
    case "branding":
      return `${base} Create branding suggestions: name, tagline, visual ideas.${shared}`;
    case "mvp":
      return `${base} Help them define an MVP with the minimum feature set.${shared}`;
    default:
      return `${base}${shared}`;
  }
}

