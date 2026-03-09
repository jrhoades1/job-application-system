# LinkedIn Alert Templates

> Boolean search patterns and alert configurations for Director/VP-level
> engineering roles. Adapt to your specific targets.

## Boolean Search Syntax (LinkedIn)

LinkedIn supports boolean operators in the job search bar:
- `AND` — both terms required (must be UPPERCASE)
- `OR` — either term matches (must be UPPERCASE)
- `NOT` — exclude term (must be UPPERCASE)
- `""` — exact phrase match
- `()` — grouping

**Example:** `("Director of Engineering" OR "VP of Engineering") AND "Healthcare" NOT "Junior"`

## Recommended Alert Set

### Alert 1: Director of Engineering — Broad
```
Query: "Director of Engineering" OR "Director, Engineering" OR "Director of Software Engineering" OR "Engineering Director"
Experience: Director, Executive
Location: United States (Remote)
Type: Full-time
Frequency: Daily
```

### Alert 2: VP / Head of Engineering
```
Query: "VP of Engineering" OR "VP, Engineering" OR "Head of Engineering" OR "Vice President of Engineering" OR "SVP Engineering"
Experience: Director, Executive
Location: United States (Remote)
Type: Full-time
Frequency: Daily
```

### Alert 3: Healthcare Engineering Leadership
```
Query: ("Director" OR "VP" OR "Head of" OR "CTO") AND ("Engineering" OR "Technology") AND ("Healthcare" OR "Health" OR "Clinical" OR "Medical")
Experience: Director, Executive
Location: United States (Remote)
Type: Full-time
Frequency: Daily
```

### Alert 4: AI/ML Engineering Leadership
```
Query: ("Director" OR "VP" OR "Head of") AND ("Engineering" OR "AI" OR "Machine Learning") AND ("AI" OR "ML" OR "Artificial Intelligence")
Experience: Director, Executive
Location: United States (Remote)
Type: Full-time
Frequency: Daily
```

### Alert 5: Company-Specific (Clone per target company)
```
Query: "Engineering" OR "Technology"
Experience: Director, Executive
Company: [Target Company Name]
Location: Any
Type: Full-time
Frequency: Daily
```

## Alert Management Rules

1. **Delete before creating.** Old alerts with stale filters pollute your email. Start fresh.
2. **Max 5-7 alerts.** More than that creates overlap and email fatigue.
3. **Review monthly.** If an alert consistently delivers noise, refine or replace it.
4. **Don't duplicate.** Alert 1 and Alert 2 cover different title levels — they shouldn't overlap.
5. **Use company alerts for top targets.** If you have a dream list of 5 companies, create one alert per company — these are highest-signal.

## Email Settings Configuration

Navigate to: **Settings & Privacy → Notifications → Email → Jobs**

| Setting | Recommended | Why |
|---------|-------------|-----|
| Job alerts | ON (per-alert) | Your curated, filtered alerts |
| Job recommendations | OFF | These use broad profile inference, not your filters |
| Career opportunities | ON | Recruiter InMail notifications |
| Job application updates | ON | Status changes on applied jobs |

## Common Mistakes

### Too broad
❌ `Engineering Manager` — matches thousands of mid-level roles
✅ `"Director of Engineering"` — exact phrase, correct seniority

### Missing seniority filter
❌ Query has title keywords but no experience level filter
✅ Always check "Director" and "Executive" in the experience level dropdown

### Overlapping alerts
❌ Alert 1: "Director of Engineering" / Alert 2: "Director Engineering" — near-identical results
✅ Each alert targets a distinct title tier or domain niche

### Location over-scoping
❌ "United States" without Remote filter — gets on-site roles nationwide
✅ Either specific metros you'd relocate to, or "Remote" explicitly

### Ignoring the NOT operator
❌ Getting flooded with contract/staffing agency posts
✅ Add `NOT "contract" NOT "staffing" NOT "recruiting agency"` if needed
