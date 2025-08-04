export interface Branding {
  name?: string;
  tagline?: string;
  palette?: {
    primary?: string;
    secondary?: string;
  };
  colors?: string[];
  logoUrl?: string;
  logoDesc?: string;
}

export interface BuildPayload {
  ideaId: string;
  ideaSummary: {
    name: string;
    description: string;
  };
  branding: Branding;
  plan?: string;
  messages: { role: string; content: string }[];
}