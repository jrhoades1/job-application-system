---
name: negotiation-coach
description: >
  Draft negotiation scripts, counter-offer emails, and BATNA tables after an offer
  has been received and scored. Use when the user says "draft a counter", "help me
  negotiate this", "write the email to push back", "what should I ask for", "I want
  to counter $X", or after offer-evaluator has produced a baseline evaluation. This
  skill is tactical: it produces ready-to-send messages, not strategic analysis.
  For the strategic go or no-go decision, use offer-evaluator first. Do NOT trigger
  for cold outreach or interview scheduling.
recommended_model:
  default: opus
  reasoning: >
    Negotiation messages are persuasive writing under pressure with real money at
    stake. Opus handles tone, leverage, and face-saving language meaningfully
    better than Sonnet. Cost is justified by the dollar stakes.
  upgrade_to_opus_when: always
---

# Negotiation Coach

## Intent

1. **Ready-to-send beats advice.** The user has an offer in hand and needs a message they can paste into email today, not a lecture on negotiation theory.
2. **Honest leverage only.** Never fabricate competing offers. Never misrepresent current comp. Leverage comes from real BATNA, real market data, and real fit.
3. **Tone matches relationship.** A script to a recruiter you've built rapport with reads differently than one to a hiring manager you've met twice. Ask before drafting.
4. **One ask at a time.** Most counters fail because they stack 5 asks in one message. Prioritize: base > equity > sign-on > start date > PTO. Ask for the top 2.
5. **Red flags surface before scripts.** Exploding offers, verbal-only terms, below-band equity — flag these BEFORE drafting a counter, since they change what to ask for.
6. **No em dashes in user-facing text.** Jimmy's rule — em dashes read as AI-generated in a high-stakes email.

## When to use

- The user has a written offer (or a verbal offer being formalized) and is considering a counter.
- offer-evaluator has produced a baseline evaluation and flagged gaps vs market.
- The user has a competing offer and wants to use it as leverage — real or explicitly framed as hypothetical.
- The user wants to decline professionally while preserving the relationship.

## When NOT to use

- The user has not received an offer yet (use interview-prep-builder).
- The user is deciding whether to accept at all (use offer-evaluator).
- The user wants general comp research with no specific offer (skip — use a data tool).

## Inputs

Gather from the user or from `applications/<co>/metadata.json` + offer-evaluator output:

| Field | Required | Notes |
|---|---|---|
| Company, role, level | yes | Used to reference market bands |
| Base salary | yes | Current offer |
| Equity (shares or %, vesting) | yes | Preferred shares vs common; cliff; refreshers |
| Sign-on bonus | optional | If present, check claw-back terms |
| Target comp | yes | User's anchor. From master/narrative.md or explicit ask |
| BATNA | yes | Current role comp, competing offer, or "no good alternative" |
| Relationship with recruiter | yes | Warm / cold / adversarial |
| Offer deadline | yes | Exploding offer changes tactics |
| Blocker concerns | optional | Relocation, start date, visa, etc. |

## Outputs

Write all artifacts to `applications/<company>/negotiation-plan.md` with these sections:

### 1. Red Flags (top of document)

Scan the offer for these and list any that apply:

- **Exploding offer** — deadline under 72 hours without clear rationale
- **Verbal-only terms** — equity refreshers, bonuses, or title commitments not in writing
- **Below-band equity** — equity grant below levels.fyi or sec.gov filings for comparable roles
- **Claw-back on sign-on** — 24-month+ claw-back on a first-year sign-on bonus is aggressive
- **Non-standard vesting** — back-loaded vesting, 5+ year schedules, or no cliff protection
- **Ambiguous scope** — title doesn't match scope described in interviews
- **Comp structure change** — hourly/contract when FTE was expected, or vice versa

### 2. BATNA Table

| Option | Est. Total Comp | Timeline | Notes |
|---|---|---|---|
| Current role | $XXX + $XXX equity | Immediate | Stability, low upside |
| Competing offer (Company B) | $XXX | Offer deadline | Explicit leverage if real |
| No alternative (walk) | $0 + opportunity cost | Open-ended | Genuine floor |
| Target for THIS offer | $XXX | Negotiate | The number to anchor on |

### 3. Three Script Variants

Produce three tactical variants. Pick one, not all three.

#### Variant A: Base bump with market data

Use when base is below market and other terms are fine. Anchor to market data.

```
Hi [Recruiter],

Thank you for sending through the offer. I'm excited about the role
and the team, and I want to be direct about one area before I accept.

The base component is below what I'm seeing for [level] [discipline]
at [comparable companies], with a range of [cite levels.fyi or source].
To move forward, I'd like to see base at $[target], which keeps this
aligned with comparable roles and makes the decision easy on my side.

Everything else in the package works for me. Happy to jump on a call
if that helps move this along.

[Name]
```

#### Variant B: Equity bump with multi-year framing

Use when base is at target but equity is thin. Frame as long-term alignment.

```
Hi [Recruiter],

Appreciate the offer and I'm ready to accept once we sort one piece.

The equity component on this offer vests to roughly $[4-year value]
at the [cited valuation / strike]. For a [level] role with the scope
we discussed, I'd expect that closer to $[target 4-year value],
which is what I'm seeing at [comparable peer companies].

Can we revisit the grant size? I'd like to be aligned for the full
vest, and a larger grant now does more for that than a higher base.

[Name]
```

#### Variant C: Sign-on + start date package

Use when base and equity are locked but you can get a sign-on or flex on timing.

```
Hi [Recruiter],

Offer looks good. Two small items and I'm ready to sign.

1. [Current employer bonus / unvested equity of $XXX is forfeited if
   I leave before Q2]. A sign-on of $[target] would bridge that gap.
2. I'd like a start date of [date] instead of [current date], which
   gives me time to hand off cleanly.

Happy to jump on a call to close this out.

[Name]
```

### 4. Rebuttal Prep

Write two-sentence responses to the three most likely pushbacks:

- "We can't go higher on base." → "Understood. Can we close the gap with sign-on or equity? I'm open on structure."
- "That number is outside our band." → "Which band are you referring to? Happy to compare the level expectation so we're aligned."
- "This offer is our best and final." → "I hear you. Before we close this out, can you walk me through how you priced [specific component] so I can evaluate?"

### 5. Walk-Away Criteria

List the conditions under which the user should decline:

- Total comp below $X
- No written equity grant letter
- No flexibility on start date AND current employer has a non-compete cure period
- Any red flag from section 1 that wasn't addressed in negotiation

## Execution

1. Read the offer details from `applications/<company>/metadata.json` and any offer PDF in that folder.
2. Read offer-evaluator's output if present at `applications/<company>/offer-evaluation.md`.
3. Ask the user for anything missing from the Inputs table. Do NOT proceed without BATNA and target comp.
4. Produce the `negotiation-plan.md` artifact.
5. Print the chosen variant to the chat so the user can copy it.
6. Never send the message yourself. Human must review and send.

## Quality bar

- Zero em dashes in any draft script (Jimmy's rule)
- Every ask has a number, not a range
- Every number has a source cited somewhere in the BATNA table
- Every message is under 150 words
- Red flags block script generation until user acknowledges

## See also

- `references/negotiation-frameworks.md` — tactical playbook
- `skills/offer-evaluator/` — upstream strategic evaluation
- `master/narrative.md` — target comp anchor
