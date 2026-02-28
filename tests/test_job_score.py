"""
Tests for job_score.py — scoring, ranking, deduplication, and auto-skip.
"""

import os
import sys
import unittest

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from job_score import (
    calculate_overall_score,
    check_auto_skip,
    check_existing_application,
    detect_employment_type,
    detect_location_match,
    extract_requirements,
    rank_jobs,
    score_requirement,
)


# Sample achievements for testing
SAMPLE_ACHIEVEMENTS = {
    "Leadership & Team Building": [
        "Built engineering team from zero to 22 (MedQuest)",
        "Managed 50+ developers across US, Ukraine, and Central America (Cognizant)",
        "Mentored engineers on agile best practices",
    ],
    "AI / ML Integration": [
        "Spearheaded AI/ML integration into healthcare workflows",
        "Integrated AI into product offerings, slashing development cycles by 30%",
    ],
    "Healthcare IT & Compliance": [
        "Overhauled system architecture for HIPAA compliance, achieving 99.9% uptime",
        "Led technical reviews ensuring compliance with HL7, FHIR standards",
    ],
    "Architecture & Scalability": [
        "Transformed monolithic app into scalable microservices and multi-tenant architecture",
        "Designed microservices architecture cutting latency by 20%",
        "Executed AWS integrations accelerating deployment timelines by 25%",
    ],
}


class TestScoreRequirement(unittest.TestCase):

    def test_strong_match(self):
        result = score_requirement(
            "Experience building and managing engineering teams from scratch",
            SAMPLE_ACHIEVEMENTS
        )
        self.assertEqual(result["match_type"], "strong")
        self.assertTrue(result["evidence"])

    def test_partial_match(self):
        result = score_requirement(
            "Experience with GCP cloud infrastructure",
            SAMPLE_ACHIEVEMENTS
        )
        # AWS experience is partial match for GCP
        self.assertIn(result["match_type"], ("partial", "gap"))

    def test_gap(self):
        result = score_requirement(
            "PhD in quantum computing",
            SAMPLE_ACHIEVEMENTS
        )
        self.assertEqual(result["match_type"], "gap")

    def test_direct_keyword_match(self):
        result = score_requirement(
            "Experience with HIPAA compliance in healthcare",
            SAMPLE_ACHIEVEMENTS
        )
        self.assertEqual(result["match_type"], "strong")
        self.assertIn("Healthcare", result["category"])

    def test_ai_ml_match(self):
        result = score_requirement(
            "Experience integrating AI and ML into products",
            SAMPLE_ACHIEVEMENTS
        )
        self.assertEqual(result["match_type"], "strong")


class TestCalculateOverallScore(unittest.TestCase):

    def test_strong_score(self):
        matches = [
            {"match_type": "strong"} for _ in range(9)
        ] + [{"match_type": "partial"}]
        result = calculate_overall_score(matches)
        self.assertEqual(result["overall"], "strong")
        self.assertGreaterEqual(result["match_percentage"], 80)

    def test_good_score(self):
        matches = [
            {"match_type": "strong"} for _ in range(5)
        ] + [
            {"match_type": "partial"} for _ in range(3)
        ] + [{"match_type": "gap"}]
        result = calculate_overall_score(matches)
        self.assertEqual(result["overall"], "good")

    def test_stretch_score(self):
        matches = [
            {"match_type": "strong"} for _ in range(3)
        ] + [
            {"match_type": "partial"} for _ in range(2)
        ] + [
            {"match_type": "gap"} for _ in range(2)
        ]
        result = calculate_overall_score(matches)
        self.assertIn(result["overall"], ("stretch", "good"))

    def test_long_shot_score(self):
        matches = [
            {"match_type": "strong"}
        ] + [
            {"match_type": "gap"} for _ in range(8)
        ]
        result = calculate_overall_score(matches)
        self.assertEqual(result["overall"], "long_shot")

    def test_empty_matches(self):
        result = calculate_overall_score([])
        self.assertEqual(result["overall"], "long_shot")
        self.assertEqual(result["match_percentage"], 0)


class TestRankJobs(unittest.TestCase):

    def test_rank_ordering(self):
        leads = [
            {"company": "C", "score_result": {"overall": "stretch", "match_percentage": 50, "gap_count": 2}},
            {"company": "A", "score_result": {"overall": "strong", "match_percentage": 90, "gap_count": 0}},
            {"company": "B", "score_result": {"overall": "good", "match_percentage": 70, "gap_count": 1}},
        ]
        ranked = rank_jobs(leads)
        self.assertEqual(ranked[0]["company"], "A")  # strong
        self.assertEqual(ranked[1]["company"], "B")  # good
        self.assertEqual(ranked[2]["company"], "C")  # stretch

    def test_tiebreaker_by_match_percentage(self):
        leads = [
            {"company": "B", "score_result": {"overall": "good", "match_percentage": 65, "gap_count": 1}},
            {"company": "A", "score_result": {"overall": "good", "match_percentage": 75, "gap_count": 1}},
        ]
        ranked = rank_jobs(leads)
        self.assertEqual(ranked[0]["company"], "A")  # higher match pct

    def test_tiebreaker_by_gap_count(self):
        leads = [
            {"company": "B", "score_result": {"overall": "good", "match_percentage": 70, "gap_count": 2}},
            {"company": "A", "score_result": {"overall": "good", "match_percentage": 70, "gap_count": 0}},
        ]
        ranked = rank_jobs(leads)
        self.assertEqual(ranked[0]["company"], "A")  # fewer gaps

    def test_rank_numbers_assigned(self):
        leads = [
            {"company": "A", "score_result": {"overall": "strong", "match_percentage": 90, "gap_count": 0}},
            {"company": "B", "score_result": {"overall": "good", "match_percentage": 70, "gap_count": 1}},
        ]
        ranked = rank_jobs(leads)
        self.assertEqual(ranked[0]["rank"], 1)
        self.assertEqual(ranked[1]["rank"], 2)


class TestDetectEmploymentType(unittest.TestCase):

    def test_full_time(self):
        self.assertEqual(detect_employment_type("This is a full-time position"), "full_time")

    def test_contract(self):
        self.assertEqual(detect_employment_type("Looking for a contractor for 6 months"), "contract")

    def test_part_time(self):
        self.assertEqual(detect_employment_type("This is a part-time role"), "part_time")

    def test_default_full_time(self):
        self.assertEqual(detect_employment_type("Join our engineering team"), "full_time")

    def test_empty(self):
        self.assertEqual(detect_employment_type(""), "unknown")


class TestDetectLocationMatch(unittest.TestCase):

    def test_remote_matches_remote_pref(self):
        result = detect_location_match("This is a fully remote position", {"location": "Remote (US)"})
        self.assertTrue(result["match"])
        self.assertEqual(result["remote_status"], "remote")

    def test_onsite_no_match_remote_pref(self):
        result = detect_location_match("This is an on-site position in NYC", {"location": "Remote (US)"})
        self.assertFalse(result["match"])
        self.assertEqual(result["remote_status"], "onsite")

    def test_hybrid(self):
        result = detect_location_match("We offer a hybrid work arrangement", {"location": "Remote (US)"})
        self.assertFalse(result["match"])
        self.assertEqual(result["remote_status"], "hybrid")


class TestCheckAutoSkip(unittest.TestCase):

    def test_skip_contract(self):
        lead = {"company": "Acme"}
        score = {"overall": "good"}
        rules = {"excluded_employment_types": ["contract", "temp"]}
        result = check_auto_skip(lead, score, rules, {}, "contract")
        self.assertIsNotNone(result)
        self.assertIn("contract", result)

    def test_no_skip_full_time(self):
        lead = {"company": "Acme"}
        score = {"overall": "good"}
        rules = {"excluded_employment_types": ["contract", "temp"]}
        result = check_auto_skip(lead, score, rules, {}, "full_time")
        self.assertIsNone(result)

    def test_skip_excluded_company(self):
        lead = {"company": "BadCorp"}
        score = {"overall": "strong"}
        rules = {"excluded_companies": ["BadCorp"]}
        result = check_auto_skip(lead, score, rules, {}, "full_time")
        self.assertIsNotNone(result)

    def test_no_rules(self):
        result = check_auto_skip({}, {}, {}, {}, "full_time")
        self.assertIsNone(result)


class TestCheckExistingApplication(unittest.TestCase):

    def test_finds_existing(self):
        index = [
            {"company": "Google", "role": "VP Engineering", "status": "applied", "folder": "2026-01-01_google_vp-eng"},
        ]
        result = check_existing_application("Google", "VP Engineering", index)
        self.assertIsNotNone(result)
        self.assertEqual(result["status"], "applied")

    def test_case_insensitive(self):
        index = [
            {"company": "Google", "role": "VP Engineering", "status": "applied", "folder": "2026-01-01_google_vp-eng"},
        ]
        result = check_existing_application("google", "vp engineering", index)
        self.assertIsNotNone(result)

    def test_no_match(self):
        index = [
            {"company": "Google", "role": "VP Engineering", "status": "applied", "folder": "2026-01-01_google_vp-eng"},
        ]
        result = check_existing_application("Amazon", "SDE", index)
        self.assertIsNone(result)


class TestExtractRequirements(unittest.TestCase):

    def test_extracts_requirements(self):
        desc = """
About the Role
We are looking for a VP of Engineering.

Requirements:
- 10+ years of engineering leadership experience
- Experience building teams from scratch
- HIPAA compliance background
- Strong AWS experience

Preferred:
- Healthcare industry experience
- AI/ML familiarity

Responsibilities:
- Lead the engineering organization
- Define technical strategy
"""
        result = extract_requirements(desc)
        self.assertTrue(len(result["hard_requirements"]) > 0)
        self.assertTrue(len(result["preferred"]) > 0)
        self.assertTrue(len(result["responsibilities"]) > 0)

    def test_empty_description(self):
        result = extract_requirements("")
        self.assertEqual(result["hard_requirements"], [])
        self.assertEqual(result["preferred"], [])


if __name__ == "__main__":
    unittest.main()
