export type VentureStage =
  | "ideation"
  | "validation"
  | "branding"
  | "mvp"
  | "generatePlan";

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export interface BrandingDetails {
  name: string;
  tagline: string;
  colors: string[];
  logoDesc: string;
}

export interface Idea {
  id: string;
  title: string;
  messages: AssistantMessage[];
  currentStage: VentureStage;
  takeaways: {
    refinedIdea?: string;
    validationSummary?: string;
    branding?: BrandingDetails;
    finalPlan?: string;
  };
  locked?: boolean;
  repoUrl?: string;
  pagesUrl?: string;
  deployed?: boolean;
}

