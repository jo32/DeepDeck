export const EXPRESSION_OPTIONS = [
  { id: "auto", label: "Auto" },
  { id: "neutral", label: "Neutral" },
  { id: "suspicious", label: "怀疑" },
  { id: "thinking", label: "Thinking" },
  { id: "doing", label: "Doing" },
  { id: "happy", label: "Happy" },
  { id: "sleepy", label: "Sleepy" },
  { id: "surprised", label: "Surprised" },
] as const;

export type OrbExpression = (typeof EXPRESSION_OPTIONS)[number]["id"];
