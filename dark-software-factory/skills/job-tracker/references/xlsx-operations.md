# Tracker Spreadsheet Operations

Patterns for reading and updating `tracker.xlsx` using openpyxl. The tracker
lives at `job-applications/tracker.xlsx` and uses the sheet name "Applications".

## Column layout

| Col | Header           | Letter |
|-----|-----------------|--------|
| 1   | Date Applied     | A      |
| 2   | Company          | B      |
| 3   | Role             | C      |
| 4   | Source           | D      |
| 5   | Status           | E      |
| 6   | Match Score      | F      |
| 7   | Follow-up Date   | G      |
| 8   | Contact          | H      |
| 9   | Resume Version   | I      |
| 10  | Cover Letter     | J      |
| 11  | Notes            | K      |

Row 1 is the header row. Data starts at row 2.

## Reading the tracker

```python
from openpyxl import load_workbook

wb = load_workbook('job-applications/tracker.xlsx')
ws = wb['Applications']

# Build a lookup of existing rows by (company, role)
rows = {}
for row_num in range(2, ws.max_row + 1):
    company = ws.cell(row=row_num, column=2).value
    role = ws.cell(row=row_num, column=3).value
    if company and role:
        rows[(company.lower().strip(), role.lower().strip())] = row_num
```

## Finding a row

Use case-insensitive matching on company + role. This avoids duplicates from
minor capitalization differences.

```python
def find_row(ws, company, role):
    key = (company.lower().strip(), role.lower().strip())
    for row_num in range(2, ws.max_row + 1):
        c = ws.cell(row=row_num, column=2).value
        r = ws.cell(row=row_num, column=3).value
        if c and r and (c.lower().strip(), r.lower().strip()) == key:
            return row_num
    return None
```

## Updating an existing row

After finding the row number, set cells individually. Map metadata.json fields
to columns:

```python
def update_row(ws, row_num, metadata):
    ws.cell(row=row_num, column=1, value=metadata.get('applied_date', ''))
    ws.cell(row=row_num, column=2, value=metadata.get('company', ''))
    ws.cell(row=row_num, column=3, value=metadata.get('role', ''))
    ws.cell(row=row_num, column=4, value=metadata.get('source', ''))
    ws.cell(row=row_num, column=5, value=metadata.get('status', '').replace('_', ' ').title())

    score = metadata.get('match_score', {})
    if isinstance(score, dict):
        ws.cell(row=row_num, column=6, value=score.get('overall', '').title())
    else:
        ws.cell(row=row_num, column=6, value=str(score).title())

    ws.cell(row=row_num, column=7, value=metadata.get('follow_up_date', ''))
    ws.cell(row=row_num, column=8, value=metadata.get('contact', ''))
    ws.cell(row=row_num, column=9, value=metadata.get('resume_version', ''))
    ws.cell(row=row_num, column=10, value=metadata.get('cover_letter', ''))
    ws.cell(row=row_num, column=11, value=metadata.get('notes', ''))
```

## Adding a new row

Append to the next empty row. The `ws.max_row + 1` approach works because
openpyxl tracks the used range.

```python
def add_row(ws, metadata):
    new_row = ws.max_row + 1
    update_row(ws, new_row, metadata)
    return new_row
```

## Full update-or-insert pattern

This is the most common operation — update the row if it exists, add it if
it doesn't.

```python
from openpyxl import load_workbook
import json

def sync_to_tracker(tracker_path, metadata):
    wb = load_workbook(tracker_path)
    ws = wb['Applications']

    row_num = find_row(ws, metadata['company'], metadata['role'])
    if row_num:
        update_row(ws, row_num, metadata)
    else:
        add_row(ws, metadata)

    wb.save(tracker_path)
```

## Rebuilding the entire tracker

When the user asks to rebuild or the spreadsheet has drifted, scan all
application folders and rewrite every data row.

```python
import os, json
from openpyxl import load_workbook

def rebuild_tracker(tracker_path, applications_dir):
    wb = load_workbook(tracker_path)
    ws = wb['Applications']

    # Clear data rows (keep header)
    for row_num in range(ws.max_row, 1, -1):
        ws.delete_rows(row_num)

    # Scan all application folders
    for folder in sorted(os.listdir(applications_dir)):
        meta_path = os.path.join(applications_dir, folder, 'metadata.json')
        if os.path.exists(meta_path):
            with open(meta_path) as f:
                metadata = json.load(f)
            add_row(ws, metadata)

    wb.save(tracker_path)
```

## Status display formatting

Status values in metadata.json use snake_case (`ready_to_apply`). In the
spreadsheet, convert to Title Case with spaces for readability:

| metadata.json      | Spreadsheet display |
|--------------------|-------------------|
| evaluating         | Evaluating        |
| ready_to_apply     | Ready To Apply    |
| applied            | Applied           |
| interviewing       | Interviewing      |
| offered            | Offered           |
| rejected           | Rejected          |
| withdrawn          | Withdrawn         |

Use `.replace('_', ' ').title()` for the conversion.

## Checking for overdue follow-ups

```python
from datetime import date

def get_overdue_followups(tracker_path):
    wb = load_workbook(tracker_path)
    ws = wb['Applications']
    today = date.today().isoformat()
    overdue = []

    for row_num in range(2, ws.max_row + 1):
        follow_up = ws.cell(row=row_num, column=7).value
        status = ws.cell(row=row_num, column=5).value
        if follow_up and str(follow_up) <= today:
            if status and status.lower() in ('applied', 'interviewing'):
                overdue.append({
                    'company': ws.cell(row=row_num, column=2).value,
                    'role': ws.cell(row=row_num, column=3).value,
                    'follow_up_date': str(follow_up),
                    'status': status
                })
    return overdue
```
