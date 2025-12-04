

// web/src/lib/personas.ts
// Lightweight persona catalog + helpers for Sparring MVP

export type Persona = {
  id: string;
  name: string;
  difficulty: 'Easy' | 'Normal' | 'Hard' | 'Nightmare';
  opener: string;             // first buyer message
  replyTemplates: string[];   // rotating buyer replies
  scoringWeights: {
    intro: number;
    discovery: number;
    objection: number;
    close: number;
    voice: number;
  };
  xpAward?: number;           // default XP when session ends with this persona
  notes?: string;
};

export const PERSONAS: Persona[] = [
  {
    id: 'price_sensitive',
    name: 'Price‑Sensitive Buyer',
    difficulty: 'Normal',
    opener: "Hey — quick one: your price looks higher than what we’re paying now. Why should we switch?",
    replyTemplates: [
      "Hmm… that still sounds pricey. Can you justify the ROI in month one?",
      "We’ve got a vendor already. Unless you can beat price or prove value, it’s tough.",
      "Budget is tight this quarter. Is there any flexibility or phased rollout?",
    ],
    scoringWeights: { intro: 1, discovery: 2, objection: 3, close: 2, voice: 2 },
    xpAward: 25,
    notes: "Focus on ROI, total cost, and quick wins. Expect price objections.",
  },
  {
    id: 'indecisive',
    name: 'Indecisive Prospect',
    difficulty: 'Easy',
    opener: "I’m not sure. We’ve looked at a few tools and I’m torn. What makes you different?",
    replyTemplates: [
      "I need more clarity. How would this fit our workflow?",
      "We’ve had false starts before — I don’t want to waste time.",
      "Maybe. What would next steps even look like?",
    ],
    scoringWeights: { intro: 1, discovery: 3, objection: 2, close: 2, voice: 2 },
    xpAward: 20,
    notes: "Disarm, clarify goals, reduce friction, paint crisp next steps.",
  },
  {
    id: 'silent_type',
    name: 'The Silent Type',
    difficulty: 'Hard',
    opener: "…",
    replyTemplates: [
      "(long pause) Sorry, was multitasking.",
      "Yeah.",
      "Can you email me?",
    ],
    scoringWeights: { intro: 1, discovery: 2, objection: 2, close: 3, voice: 3 },
    xpAward: 35,
    notes: "You drive the call. Use great questions and summarise to re‑engage.",
  },
];

export function getPersona(id?: string | null): Persona {
  const fallback = PERSONAS[0];
  if (!id) return fallback;
  return PERSONAS.find(p => p.id === id) ?? fallback;
}