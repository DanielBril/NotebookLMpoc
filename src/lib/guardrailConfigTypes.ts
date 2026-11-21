export type GroundingStrictnessMode = "strict" | "balanced" | "permissive";

export interface GuardrailConfig {
  strictnessMode: GroundingStrictnessMode;
  enableLayer1OutOfScope: boolean;
  enableLayer4MicroClassifier: boolean;
  enableLayer4OutputCanary: boolean;
  allowGeneralDocOverviews: boolean;
  customAllowTerms: string[];
  customBlockTerms: string[];
  customSystemGuidance: string;
}

export const DEFAULT_GUARDRAIL_CONFIG: GuardrailConfig = {
  strictnessMode: "balanced",
  enableLayer1OutOfScope: true,
  enableLayer4MicroClassifier: true,
  enableLayer4OutputCanary: true,
  allowGeneralDocOverviews: true,
  customAllowTerms: [],
  customBlockTerms: [],
  customSystemGuidance: "",
};
