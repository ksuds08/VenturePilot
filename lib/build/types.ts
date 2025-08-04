export interface BuildPayload {
  ideaId: string;
  ideaSummary: {
    name: string;
    description: string;
  };
  branding: any;
  plan?: string;
  messages: { role: string; content: string }[];
}
