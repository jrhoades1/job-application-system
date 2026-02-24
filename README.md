# Job Application System

**An AI-powered job search workflow built with [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) skills that doesn't just help you apply — it learns what works and adapts.**

Most job search tools stop at "submit and hope." This system closes the feedback loop. It tracks outcomes, identifies patterns in what's converting, prepares you for interviews based on past debriefs, and continuously refines your strategy so each application is better than the last.

Built on the [Dark Software Factory](https://github.com/darksoftwarefactory) skill framework. Every skill was tested through the DSF skill-creator process with real evaluation cases.

## The Problem

Applying to jobs without feedback is flying blind. You don't know which resume version got the interview. You don't know if LinkedIn or referrals convert better for your profile. You don't know that three companies asked about Terraform but your resume buries it on page two. You just keep applying the same way and wondering why it's not working.

## The System

10 skills organized in two phases — **Apply** and **Learn**.

### Apply Phase (4 skills)

| Skill | Model | What it does |
|-------|-------|-------------|
| **job-intake** | Sonnet | Parses job postings, scores fit against your experience, creates structured application folders with match analysis |
| **resume-tailor** | Sonnet | Adapts your resume to each role — light touch for strong matches, heavy restructuring for stretch roles, always fits one page |
| **cover-letter-writer** | Opus | Writes concise formal cover letters that address gaps honestly and lead with your strongest matches |
| **job-tracker** | Haiku | Keeps metadata and spreadsheet in sync, manages follow-up dates, provides pipeline overview |

### Learn Phase (6 skills)

| Skill | Model | What it does |
|-------|-------|-------------|
| **application-analytics** | Sonnet | Conversion rates by source, match score, and tailoring intensity. Shows what's actually working. |
| **interview-debrief** | Opus | After interviews, captures what resonated, what they asked about, pain points — feeds learning back to your profile |
| **search-optimizer** | Opus | Recommends where to focus based on your data: which sources convert, which role types work, when to pivot |
| **application-outcome-logger** | Haiku | Tracks rejections with reasons. Detects patterns — "3 rejections citing X" triggers strategy review |
| **interview-prep-builder** | Sonnet | Before interviews, generates role-specific talking points, likely questions from past debriefs, gap bridges |
| **offer-evaluator** | Opus | Evaluates offers against goals, identifies negotiation leverage, drafts counter-offer emails |

### How the Feedback Loop Works

```
 APPLY                                          LEARN
┌──────────┐   ┌──────────────┐   ┌────────────────┐   ┌─────────────┐
│job-intake │──→│resume-tailor │──→│cover-letter-   │──→│ job-tracker  │
│           │   │              │   │writer          │   │             │
└──────────┘   └──────────────┘   └────────────────┘   └──────┬──────┘
                                                              │
                    ┌─────────────────────────────────────────┤
                    │                                         │
                    ▼                                         ▼
          ┌─────────────────┐                      ┌──────────────────┐
          │  interview-     │                      │  application-    │
          │  prep-builder   │                      │  analytics       │
          └────────┬────────┘                      └────────┬─────────┘
                   │                                        │
                   ▼                                        ▼
          ┌─────────────────┐                      ┌──────────────────┐
          │  interview-     │                      │  search-         │
          │  debrief        │──→ achievements.md   │  optimizer       │
          └─────────────────┘    learning loop     └──────────────────┘
                                                            │
          ┌─────────────────┐                               │
          │  application-   │───── pattern detection ───────┘
          │  outcome-logger │
          └─────────────────┘

          ┌─────────────────┐
          │  offer-         │  ← when you get an offer
          │  evaluator      │
          └─────────────────┘
```

Each application generates data. Analytics finds patterns. The optimizer adjusts your strategy. Your next application is better informed than your last.

## Quick Start

### 1. Install skills into Claude Code

```bash
# Clone the repo
git clone https://github.com/yourusername/job-application-system.git

# Copy skills to your Claude Code skills directory
cp -r job-application-system/skills/* ~/.claude/skills/
```

### 2. Set up your workspace

```bash
# Copy the workspace template to wherever you want your job search data
cp -r job-application-system/workspace-template/ ~/job-applications/
```

Then populate your master files:

- **`master/achievements.md`** — Your quantified accomplishments (the system pulls from this to tailor resumes and prep for interviews)
- **`master/narrative.md`** — Your career positioning and themes by role type
- **`master/base-resume.docx`** — Your canonical resume that gets tailored per application

### 3. Start applying

Paste a job description into Claude Code and the skill chain takes over:

```
"Here's a job posting for VP of Engineering at HealthFirst..."
→ job-intake scores it, creates folder
→ resume-tailor adapts your resume
→ cover-letter-writer addresses gaps
→ job-tracker logs the application

"I had my interview with HealthFirst yesterday..."
→ interview-debrief captures what happened
→ achievements.md updated with new signals

"How's my search going?"
→ application-analytics shows conversion rates
→ search-optimizer recommends adjustments
```

## Architecture

```
job-application-system/
├── README.md
├── skills/
│   ├── job-intake/              # Sonnet — evaluate and score
│   │   ├── SKILL.md
│   │   ├── references/          # scoring criteria, folder schema, model recs
│   │   └── evals/
│   ├── resume-tailor/           # Sonnet — adaptive tailoring
│   │   ├── SKILL.md
│   │   ├── references/          # tailoring patterns, docx format spec
│   │   └── evals/
│   ├── cover-letter-writer/     # Opus — persuasive positioning
│   │   ├── SKILL.md
│   │   ├── references/          # letter format spec
│   │   └── evals/
│   ├── job-tracker/             # Haiku — bookkeeping
│   │   ├── SKILL.md
│   │   ├── references/          # xlsx operations patterns
│   │   └── evals/
│   ├── application-analytics/   # Sonnet — pattern detection
│   │   ├── SKILL.md
│   │   ├── references/          # metric definitions
│   │   └── evals/
│   ├── interview-debrief/       # Opus — learning capture
│   │   ├── SKILL.md
│   │   ├── references/          # debrief template
│   │   └── evals/
│   ├── search-optimizer/        # Opus — strategy recommendations
│   │   ├── SKILL.md
│   │   ├── references/          # optimization patterns
│   │   └── evals/
│   ├── application-outcome-logger/  # Haiku — rejection tracking
│   │   ├── SKILL.md
│   │   └── evals/
│   ├── interview-prep-builder/  # Sonnet — pre-interview prep
│   │   ├── SKILL.md
│   │   ├── references/          # common questions by role type
│   │   └── evals/
│   └── offer-evaluator/         # Opus — negotiation support
│       ├── SKILL.md
│       ├── references/          # evaluation framework
│       └── evals/
└── workspace-template/
    ├── master/
    │   ├── achievements.md
    │   ├── narrative.md
    │   └── base-resume.docx
    ├── applications/
    └── tracker.xlsx
```

## Data Flow

Every application creates a folder with `metadata.json` — the shared contract between all skills:

```json
{
  "company": "HealthFirst Technologies",
  "role": "VP of Engineering",
  "status": "interviewing",
  "match_score": {
    "overall": "strong",
    "requirements_matched": ["..."],
    "gaps": ["HITRUST certification"],
    "keywords": ["AI/ML", "HL7/FHIR", "team scaling"]
  },
  "tailoring_intensity": "light",
  "interview_date": "2026-03-05",
  "interview_notes_file": "interview-notes.md",
  "learning_flags": ["They asked deep questions about HITRUST — add to prep"]
}
```

Skills read and write to this file. The tracker spreadsheet is a derived convenience view. `metadata.json` is the source of truth.

## Model Strategy

Not every skill needs the most powerful model. The system uses the right model for each job:

| Task type | Model | Why |
|-----------|-------|-----|
| File operations, status updates | **Haiku** | Fast, cheap, no reasoning needed |
| Structured analysis, resume building | **Sonnet** | Good at following rules and patterns |
| Persuasive writing, strategic reasoning | **Opus** | Nuanced prose, complex trade-offs |

## Origin

Built from a real job search using the [Dark Software Factory](https://darksoftwarefactory.com) skill-creator process. Every skill was tested with evaluation cases, iterated on failures, and refined until assertions passed.

The resume-tailor failed its first iteration — all three test resumes spilled to two pages. The fix (bullet budgets + 4-level formatting levers) came from observing the failure. That's how skills improve: mistakes become guardrails.

## Contributing

PRs welcome. A good skill addition has:

1. A `SKILL.md` with YAML frontmatter (name, description, recommended_model)
2. Reference files for detailed patterns
3. Eval test cases that validate the skill works
4. Real-world origin — built from actual use, not theory

## License

MIT
