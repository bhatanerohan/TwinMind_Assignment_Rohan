/**
 * Synthetic transcripts for the prompt eval harness.
 *
 * Ported from Prabhakar Elavala's eval-prompts.ts (5 transcripts × 8 chunks each).
 * Original speaker names stripped and replaced with [YOU] / [OTHER] prefixes to
 * match our /api/suggest/route.ts transcript format. Role assignments chosen to
 * exercise both host and guest framings across meeting types.
 *
 * Each transcript covers ~4 minutes at one chunk per ~30s.
 */

import type { MeetingType, UserRole } from "../../src/lib/types";

export interface EvalTranscript {
  id: string;
  label: string;
  meetingType: MeetingType;
  userRole: UserRole;
  chunks: string[];
}

// user = SDR / Rep (host)
export const SALES_TRANSCRIPT: EvalTranscript = {
  id: "sales",
  label: "Sales Call",
  meetingType: "sales",
  userRole: "host",
  chunks: [
    "[OTHER] Thanks for jumping on. We're evaluating three vendors right now, including Notion and Airtable, and you're the third.",
    "[OTHER] Our biggest concern is honestly data sovereignty — our CEO flagged it last week, she wants everything in EU regions.",
    "[OTHER] Our budget decision needs to be finalized before end of Q3, so roughly six weeks from now.",
    "[YOU] Totally hear you. We're actually one of the fastest growing databases on GitHub — 70k stars and counting.",
    "[YOU] On data residency, we support EU-only deployment, all your data stays in Frankfurt or Dublin — your choice.",
    "[OTHER] OK, but your pricing page only shows USD. Can you share the actual numbers for a 50-seat workspace with EU hosting?",
    "[YOU] I'll send those over. Most customers in your range land somewhere between twelve and eighteen thousand annually.",
    "[OTHER] And how does that compare to your Notion integration story? We're already running Notion for docs.",
  ],
};

// user = Interviewer (host)
export const INTERVIEW_TRANSCRIPT: EvalTranscript = {
  id: "interview",
  label: "Job Interview (Interviewer speaking)",
  meetingType: "interview",
  userRole: "host",
  chunks: [
    "[YOU] So tell me about yourself — what's your background and what are you looking for next?",
    "[OTHER] I've been a backend engineer for about seven years, mostly Python and Go, lots of distributed systems work at my last two companies.",
    "[YOU] Cool. What's the biggest technical challenge you've faced recently?",
    "[OTHER] Honestly, scaling issues. We had some scaling issues that we worked through as a team.",
    "[YOU] Can you be more specific? What kind of scale, what did you actually change?",
    "[OTHER] Uh, it was read-heavy traffic, and we added some caching. I don't remember the exact numbers.",
    "[YOU] OK. And what interests you about this role specifically?",
    "[OTHER] I saw you're doing a lot with real-time systems and that's something I want to go deeper on.",
  ],
};

// user = Alex (host)
export const TECHNICAL_TRANSCRIPT: EvalTranscript = {
  id: "technical",
  label: "Technical Discussion (REST → GraphQL migration)",
  meetingType: "technical",
  userRole: "host",
  chunks: [
    "[YOU] So we ran the GraphQL pilot for a month on the search endpoints and saw 40% latency improvement.",
    "[OTHER] 40% is huge. Was that p50 or p99?",
    "[YOU] That was p50. p99 was only 12% better, which honestly surprised me.",
    "[OTHER] Did you account for the N+1 query risk? DataLoader helps but it's not free.",
    "[YOU] Yeah we used DataLoader, and we're caching at the resolver level with Redis.",
    "[OTHER] OK so the question is, do we migrate everything or keep REST for the write paths?",
    "[OTHER] I'd keep REST for writes. GraphQL mutations are where most of the operational pain comes from.",
    "[YOU] Agreed. Also we need to think about schema stitching vs federation before we commit.",
  ],
};

// user = Candidate (guest)
export const NEGOTIATION_TRANSCRIPT: EvalTranscript = {
  id: "negotiation",
  label: "Salary Negotiation (Candidate speaking)",
  meetingType: "other",
  userRole: "guest",
  chunks: [
    "[OTHER] So we're excited to move forward with an offer. Before we finalize, what range were you thinking?",
    "[YOU] Based on my research and my current comp, I was thinking around 150K base.",
    "[OTHER] I really appreciate you sharing. Unfortunately our band for this level tops out at 130K.",
    "[YOU] Hmm. That's a meaningful gap. Can you tell me more about the band structure?",
    "[OTHER] Sure — we have 5 levels, and this role is L3. L4 starts at 140 but requires more senior scope.",
    "[YOU] Is there flexibility on equity, or signing, if base is fixed?",
    "[OTHER] Equity is generally fixed per level. Signing bonuses we can sometimes negotiate, usually 10-15K.",
    "[OTHER] We also do annual merit reviews in March, so there's a path for growth inside the band.",
  ],
};

// user = Sam (facilitator / host)
export const BRAINSTORM_TRANSCRIPT: EvalTranscript = {
  id: "brainstorm",
  label: "Product Brainstorm (Onboarding AI)",
  meetingType: "planning",
  userRole: "host",
  chunks: [
    "[YOU] OK, quick brainstorm. How can we make onboarding less painful? Current drop-off is 60% at step 3.",
    "[OTHER] What if we added AI to the onboarding flow? Like an assistant that just talks you through it.",
    "[YOU] Interesting. What would that actually look like in the UI?",
    "[OTHER] I don't know, like a chat in the corner?",
    "[OTHER] I worry a chat bot feels like an escape hatch, not a fix. We should fix the actual friction at step 3 first.",
    "[YOU] What IS the friction at step 3 exactly? Is it the form, the field count, something else?",
    "[OTHER] It's mostly the 'workspace settings' page — 14 fields and half of them are unclear.",
    "[OTHER] OK so maybe AI isn't the answer, maybe it's cutting the form in half.",
  ],
};

export const ALL_TRANSCRIPTS: EvalTranscript[] = [
  SALES_TRANSCRIPT,
  INTERVIEW_TRANSCRIPT,
  TECHNICAL_TRANSCRIPT,
  NEGOTIATION_TRANSCRIPT,
  BRAINSTORM_TRANSCRIPT,
];
