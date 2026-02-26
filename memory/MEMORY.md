# Persistent Memory

> Curated long-term facts. Read at session start. Keep under ~200 lines.

## Identity
- Project: Job Application Pipeline
- Project Code: JOB-APPLICATIONS
- Developer: Jimmy
- Billing: Internal

## Stack
- Language: Python 3
- Key scripts: career_search.py, email_fetch.py, email_parse.py, job_score.py
- Data: pipeline/ directory for staging, applications/ for processed apps

## Key Paths
- applications/ — Processed job applications
- pipeline/ — Staging and processing data
- master/ — Master resume and templates
- swooped_export/ — Swooped platform data

## Learned Behaviors
- pipeline_config.json contains credentials — never commit
- Check existing pipeline state before processing new applications
