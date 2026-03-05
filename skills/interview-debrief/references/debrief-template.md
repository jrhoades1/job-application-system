# Debrief Question Framework

## Conversation Flow

Start open-ended, then drill into specifics. Don't ask all questions — follow
the user's energy and fill in gaps.

### Opener (always start here)
"How did it go? Tell me about the interview."

### Follow-up areas (choose based on what they share)

**If they focus on what was discussed:**
- "What did they spend the most time on?"
- "Were there questions you didn't expect?"
- "Did they seem concerned about any particular gap?"

**If they focus on how it felt:**
- "Did they seem interested? Were they selling the role to you?"
- "How formal or casual was the conversation?"
- "Any red flags or concerns?"

**If they focus on logistics/next steps:**
- "What did they say about timeline?"
- "Is there another round?"
- "Did you get a name for your next contact?"

**If they're brief ("it went fine"):**
- "What one thing do you think they cared about most?"
- "Did anything surprise you?"
- "Did they ask about [specific gap from match_score]?"

### Deep-dive questions (use when the user is engaged)

**On their pain points:**
- "What problem are they trying to solve with this hire?"
- "Did they mention any team challenges or technical debt?"
- "What's driving their urgency?"

**On what resonated:**
- "Which of your stories or examples got the best reaction?"
- "Did they reference anything from your resume specifically?"

**On your performance:**
- "Is there anything you wish you'd said differently?"
- "Was there a question you felt less prepared for?"
- "Did any of the talking points from your prep come in handy?"

## Signal Categories

When writing interview-notes.md, classify signals:

### Strong positive signals
- They sold the role to you (described growth, team vision, impact)
- They asked for your availability or start date
- They mentioned next steps proactively
- They went over time
- They introduced you to other team members unexpectedly

### Mild positive signals
- They were engaged and asked follow-ups
- They shared internal context (org structure, challenges)
- They responded positively to your stories

### Neutral signals
- Standard behavioral questions, no energy shift
- They stuck to the script

### Concerning signals
- Vague about the role or team structure
- Mentioned high turnover or recent departures
- Seemed rushed or distracted
- Avoided questions about growth or promotion path
- Couldn't articulate the team's top priority

### Red flags
- Disorganized process (wrong interviewers, no agenda)
- Salary expectations significantly misaligned
- Role is different from job description
- "We're looking for someone who can do everything"
- Negative comments about departing team members

## Transcript Import (Path B)

When the user provides a `.txt` transcript file instead of a conversational debrief:

### Speaker Identification
- The person describing their background and answering questions = **candidate**
- The person asking questions and describing the company = **interviewer**
- Look for name introductions, role descriptions, and conversational patterns
- If multiple interviewers (panel), identify each by their focus area

### Segment Extraction
Break the transcript into logical segments:
- **Introductions** — who they are, what they do, team context
- **Background review** — candidate's experience walkthrough
- **Technical deep-dive** — system design, architecture, specific technologies
- **Behavioral questions** — leadership, conflict, teamwork examples
- **AI/technology discussion** — philosophy, approach, current thinking
- **Domain validation** — industry-specific knowledge (healthcare, fintech, etc.)
- **Questions from candidate** — what the candidate asked
- **Closing/next steps** — timeline, process, follow-up

### What to Extract
- **What landed:** Interviewer reactions (follow-up questions, "that's great", visible interest)
- **What was probed:** Topics where the interviewer pushed for more depth
- **What was redirected:** Topics the interviewer steered away from (possible concern)
- **Intel gathered:** Team structure, challenges, priorities, culture signals
- **Signals:** Positive (sold the role, went over time) or concerning (vague, rushed)

## Achievement Extraction Triggers

After generating the debrief, scan for achievements NOT already in `master/achievements.md`:

### What qualifies as a new achievement
- **Quantified wins** — "reduced latency by 40%", "managed team of 12", "processed 2M records/day"
- **Technical specifics** — "built a custom integration engine", "designed auto-scaling architecture"
- **Leadership examples** — "hired and onboarded 8 engineers in 6 months", "instituted code review process"
- **Process improvements** — "reduced deployment time from 2 hours to 15 minutes"
- **Business impact** — "saved $500K annually", "increased customer retention by 25%"

### What does NOT qualify
- Vague statements without specifics ("I worked on scaling")
- Interviewer's descriptions of their own work
- Hypothetical or aspirational statements ("I would like to...")
- Achievements already captured in `master/achievements.md`

### Tagging
Append confirmed new achievements with `[learned: YYYY-MM-DD]` to track when they were discovered through interviews vs. original resume content.

## Tactical Learnings Categories

After generating the debrief, extract lessons into these categories for `master/interview-learnings.md`:

| Category | What to capture |
|----------|----------------|
| `system_design` | Drawing approaches, component trade-offs, how to structure a design walkthrough, pacing |
| `behavioral` | STAR method execution, which stories landed, how to frame failures as growth |
| `ai_discussion` | How to discuss AI philosophy, what positions resonate, what sounds hollow |
| `storytelling` | Intro/elevator pitch effectiveness, narrative arc, transitions between topics |
| `questions_asked` | Which questions to the interviewer got good responses, which fell flat |
| `signals` | How to read interviewer body language, tone shifts, engagement patterns |
| `interview_format` | Panel dynamics, technical whiteboard tactics, video call tips, timing |

### Promotion Rules
- **1 occurrence** = "observed" — worth noting but could be situational
- **2 occurrences** = "emerging" — starting to see a pattern
- **3+ occurrences** = "proven" — reliable enough to include in future interview prep

### Source Tagging
Every lesson gets a source tag: `[source: Company Round N, YYYY-MM-DD]`
When a lesson appears in multiple interviews, list all sources.

## Learning Flag Triggers

Add a learning_flag to metadata.json when:
- A skill/technology came up that's in the user's `hard_gaps` → "Market signal: [skill] is required even for [role type]"
- A skill came up that's in `addressable_gaps` and the bridge worked → "Bridge works: [gap] can be addressed via [approach]"
- A skill came up that's in `addressable_gaps` and the bridge did NOT work → "Bridge failed: [gap] needs stronger evidence"
- An accomplishment not in achievements.md was mentioned → "Add to achievements: [description]"
- The same topic has appeared in 3+ interviews → "Pattern: [topic] is consistently important for [role type]"
