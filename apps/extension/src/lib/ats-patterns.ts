/** ATS detection patterns — mirrors apps/web/src/lib/ats-detect.ts */

export interface ATSInfo {
  name: string;
  label: string;
}

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

export function detectATS(url: string): ATSInfo | null {
  const lower = url.toLowerCase();
  for (const ats of ATS_PATTERNS) {
    if (ats.patterns.some((p) => lower.includes(p))) {
      return { name: ats.name, label: ats.label };
    }
  }
  return null;
}
