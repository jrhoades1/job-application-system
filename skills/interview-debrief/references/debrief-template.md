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

## Learning Flag Triggers

Add a learning_flag to metadata.json when:
- A skill/technology came up that's in the user's `hard_gaps` → "Market signal: [skill] is required even for [role type]"
- A skill came up that's in `addressable_gaps` and the bridge worked → "Bridge works: [gap] can be addressed via [approach]"
- A skill came up that's in `addressable_gaps` and the bridge did NOT work → "Bridge failed: [gap] needs stronger evidence"
- An accomplishment not in achievements.md was mentioned → "Add to achievements: [description]"
- The same topic has appeared in 3+ interviews → "Pattern: [topic] is consistently important for [role type]"
