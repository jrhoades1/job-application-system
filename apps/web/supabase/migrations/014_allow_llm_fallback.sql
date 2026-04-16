-- Migration 014: Add allow_llm_fallback to target_companies
--
-- Controls whether LLM extraction is attempted when the primary vendor API
-- returns non-JSON (HTML, redirect, auth page). Default true -- opt-out per
-- target if the user wants to avoid any AI cost on a specific company.

ALTER TABLE target_companies
  ADD COLUMN IF NOT EXISTS allow_llm_fallback BOOLEAN NOT NULL DEFAULT true;
