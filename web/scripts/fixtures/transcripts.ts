/**
 * Original synthetic transcripts for the prompt eval harness.
 *
 * Each scenario covers roughly four minutes at one chunk per refresh cycle.
 * Chunks intentionally omit speaker labels to match production prompt context.
 */

import type { MeetingType } from "../../src/lib/types";

export interface EvalTranscript {
  id: string;
  label: string;
  meetingType: MeetingType;
  chunks: string[];
}

export const PROCUREMENT_REVIEW_TRANSCRIPT: EvalTranscript = {
  id: "procurement-review",
  label: "Procurement Review",
  meetingType: "sales",
  chunks: [
    "Thanks for joining. We are comparing three vendors for the analytics workspace migration, and the finance team wants a recommendation by May 15.",
    "The blocker is data residency. Our legal team says customer event data must stay inside Canada, including backups and support exports.",
    "We also need SSO, SCIM provisioning, and an audit log export because our internal security review starts next week.",
    "Our platform has regional storage controls and a dedicated enterprise support queue. The current public case study mentions 45% faster analyst onboarding.",
    "For Canada-only storage, we can pin primary data to Montreal and keep disaster recovery in Toronto. I need to confirm whether support logs follow the same boundary.",
    "Can you give me a real price range for 120 seats? The public page only lists the team tier, and procurement needs a number before they open security review.",
    "For 120 seats, similar customers usually land between 38K and 52K annually depending on retention and support package.",
    "If we already have Looker dashboards, I need to understand whether your migration tool preserves dashboard permissions or only moves the raw datasets.",
  ],
};

export const DESIGN_INTERVIEW_TRANSCRIPT: EvalTranscript = {
  id: "design-interview",
  label: "System Design Interview",
  meetingType: "interview",
  chunks: [
    "Let's do a system design exercise. Design a collaborative notes app where multiple users can edit the same document at the same time.",
    "I would start by clarifying scope. Are we focused on real-time editing, comments, sharing permissions, or offline sync as well?",
    "Good question. Focus on real-time editing and basic sharing. Offline support is out of scope for this round.",
    "Okay. I would model documents, users, and permissions first, then use a websocket gateway for active editing sessions.",
    "What concurrency approach would you choose? I want to hear how you handle two people editing the same paragraph.",
    "I know operational transforms are one option, and CRDTs are another. I have used CRDTs once, but not at a very large scale.",
    "Assume 50K daily active users and peak 2K concurrent editors. What would you measure to know if the editing path is healthy?",
    "I would track edit acknowledgement latency, conflict resolution rate, websocket reconnects, and document save failures.",
  ],
};

export const INCIDENT_REVIEW_TRANSCRIPT: EvalTranscript = {
  id: "incident-review",
  label: "Incident Review",
  meetingType: "technical",
  chunks: [
    "The checkout API incident started at 10:05 UTC. Error rate went from 0.2% to 8% in about six minutes.",
    "The deploy at 9:58 added a new fraud-score call. It was supposed to timeout after 150 milliseconds but some requests hung for more than two seconds.",
    "Database CPU also spiked, but I think that was secondary because the app retried the same payment authorization three times.",
    "We rolled back at 10:27 and the error rate recovered by 10:34. The question is whether rollback was enough or we need a circuit breaker.",
    "The fraud vendor's SLA says p95 under 120 milliseconds, but we saw p95 around 900 milliseconds during the incident.",
    "If we add a circuit breaker, we need to decide whether failed fraud checks block checkout or move the order into manual review.",
    "I prefer manual review for low-risk orders, but compliance may require blocking high-risk orders when the fraud score is unavailable.",
    "Before we write action items, let's separate user impact, detection gaps, and the permanent fix for third-party dependency failure.",
  ],
};

export const OFFER_DISCUSSION_TRANSCRIPT: EvalTranscript = {
  id: "offer-discussion",
  label: "Offer Discussion",
  meetingType: "other",
  chunks: [
    "We are excited to move forward. The offer is 138K base, 12K signing bonus, and standard equity for level P3.",
    "Thank you. I am excited too. I was hoping to understand how flexible the base and equity pieces are before I respond.",
    "Base is the hardest part. The P3 band tops out at 145K, and this offer is already near the top of that band.",
    "That helps. My competing conversation is closer to 150K base, so I want to see if we can close some of that gap.",
    "We may be able to move the signing bonus to 18K, but equity refreshers are normally reviewed after the first performance cycle.",
    "Could we document the refresher review timing in the offer letter, or is that handled only after start date?",
    "We can include a note about eligibility for the March review cycle, but not a guaranteed refresher amount.",
    "I need to decide by Friday. If base cannot move, I would like to understand whether title or remote-work flexibility is negotiable.",
  ],
};

export const ONBOARDING_PLANNING_TRANSCRIPT: EvalTranscript = {
  id: "onboarding-planning",
  label: "Onboarding Planning",
  meetingType: "planning",
  chunks: [
    "Let's focus on activation. Trial users are dropping at the workspace setup step, and only 41% reach the invite-teammates screen.",
    "The current setup page asks for company size, use case, data source, region, compliance needs, and notification preferences all at once.",
    "Support tickets mention that people do not know what data source means, especially if they are just testing with a sample CSV.",
    "One idea is an AI helper that explains each field, but I worry that adds another widget instead of reducing friction.",
    "Agreed. We should first identify which fields are required for product value and which fields are only useful for sales qualification.",
    "The data team says region and compliance needs drive routing, but notification preferences can definitely wait until later.",
    "If we cut the first page from 12 fields to 5, we should A/B test completion rate and downstream invite rate, not just page submits.",
    "Before design starts, we need a crisp MVP: required fields, optional fields, and the event names analytics should track.",
  ],
};

export const ALL_TRANSCRIPTS: EvalTranscript[] = [
  PROCUREMENT_REVIEW_TRANSCRIPT,
  DESIGN_INTERVIEW_TRANSCRIPT,
  INCIDENT_REVIEW_TRANSCRIPT,
  OFFER_DISCUSSION_TRANSCRIPT,
  ONBOARDING_PLANNING_TRANSCRIPT,
];
