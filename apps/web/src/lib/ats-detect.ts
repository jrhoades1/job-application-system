/** Detect ATS platform from a URL. Patterns mirror pipeline_config.json ats_handlers. */

const ATS_PATTERNS: { name: string; label: string; patterns: string[] }[] = [
  { name: "workday", label: "Workday", patterns: ["myworkdayjobs.com"] },
  { name: "greenhouse", label: "Greenhouse", patterns: ["boards.greenhouse.io", "job-boards.greenhouse.io"] },
  { name: "lever", label: "Lever", patterns: ["jobs.lever.co"] },
  { name: "icims", label: "iCIMS", patterns: ["icims.com"] },
  { name: "successfactors", label: "SAP SuccessFactors", patterns: ["successfactors.com", "jobs.sap.com"] },
  { name: "smartrecruiters", label: "SmartRecruiters", patterns: ["jobs.smartrecruiters.com"] },
  { name: "ashby", label: "Ashby", patterns: ["jobs.ashbyhq.com"] },
  { name: "bamboohr", label: "BambooHR", patterns: ["bamboohr.com/careers", "bamboohr.com/jobs"] },
];

export function detectATS(url: string | null | undefined): { name: string; label: string } | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  for (const ats of ATS_PATTERNS) {
    if (ats.patterns.some((p) => lower.includes(p))) {
      return { name: ats.name, label: ats.label };
    }
  }
  return null;
}
