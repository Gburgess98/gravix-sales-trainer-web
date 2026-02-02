// src/lib/healthToAssignment.ts
export function mapHealthToAssignment(health: {
  status: "cold" | "warm" | "hot";
  score: number;
}) {
  switch (health.status) {
    case "hot":
      return {
        type: "close",
        title: "Close / book decision",
        dueInDays: 1,
        importance: "critical",
      };

    case "warm":
      return {
        type: "follow_up",
        title: "Follow up / proposal",
        dueInDays: 2,
        importance: "important",
      };

    case "cold":
    default:
      return {
        type: "intro",
        title: "Intro call + discovery",
        dueInDays: 3,
        importance: "normal",
      };
  }
}