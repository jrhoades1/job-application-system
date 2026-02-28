"""
Tests for email_parse.py — email classification, parsing, and normalization.
"""

import os
import sys
import unittest

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from email_parse import (
    classify_email,
    detect_non_job_email,
    get_sender_domain,
    html_to_text,
    normalize_role_title,
    parse_single_job_email,
    resolve_company_name,
)


SENDER_TEMPLATES = {
    "linkedin.com": {
        "type": "job_board",
        "subject_patterns": [
            r"(?P<role>.+) at (?P<company>.+)",
            r"(?P<company>.+) is (?:hiring|looking)",
        ],
        "multi_job_indicator": "jobs for you|jobs you might",
        "body_parse_strategy": "linkedin_cards",
    },
    "indeed.com": {
        "type": "job_board",
        "subject_patterns": [
            r"(?P<count>\d+) new (?P<role>.+) jobs?",
        ],
        "multi_job_indicator": "new jobs",
        "body_parse_strategy": "indeed_list",
    },
    "_default": {
        "type": "recruiter",
        "body_parse_strategy": "recruiter_heuristic",
    },
}

ALIAS_MAP = {
    "meta": ["facebook", "meta platforms", "meta platforms inc"],
    "alphabet": ["google", "google llc", "google inc"],
    "amazon": ["amazon.com", "amazon web services", "aws"],
}


class TestSenderDomain(unittest.TestCase):

    def test_extract_from_angle_brackets(self):
        self.assertEqual(get_sender_domain("Joe <joe@linkedin.com>"), "linkedin.com")

    def test_extract_from_plain_email(self):
        self.assertEqual(get_sender_domain("noreply@indeed.com"), "indeed.com")

    def test_normalize_subdomain(self):
        self.assertEqual(get_sender_domain("noreply@email.linkedin.com"), "linkedin.com")

    def test_empty_string(self):
        self.assertEqual(get_sender_domain(""), "")


class TestClassifyEmail(unittest.TestCase):

    def test_linkedin_single_job(self):
        email = {
            "from": "jobs-noreply@linkedin.com",
            "subject": "Director of Engineering at HealthFirst",
            "body_text": "Apply now for this exciting role",
            "body_html": "",
        }
        result = classify_email(email, SENDER_TEMPLATES)
        self.assertEqual(result, "single_job")

    def test_linkedin_multi_job(self):
        email = {
            "from": "jobs-noreply@linkedin.com",
            "subject": "Jimmy, 5 new jobs for you",
            "body_text": "Jobs you might be interested in",
            "body_html": "",
        }
        result = classify_email(email, SENDER_TEMPLATES)
        self.assertEqual(result, "multi_job")

    def test_indeed_multi_job(self):
        email = {
            "from": "noreply@indeed.com",
            "subject": "3 new Director of Engineering jobs",
            "body_text": "3 new jobs near you",
            "body_html": "",
        }
        result = classify_email(email, SENDER_TEMPLATES)
        self.assertEqual(result, "multi_job")

    def test_non_job_email(self):
        email = {
            "from": "noreply@linkedin.com",
            "subject": "John accepted your invitation to connect",
            "body_text": "You and John are now connected. Unsubscribe from this email.",
            "body_html": "",
        }
        result = classify_email(email, SENDER_TEMPLATES)
        self.assertEqual(result, "not_job")

    def test_recruiter_generic(self):
        email = {
            "from": "sarah@staffingfirm.com",
            "subject": "Exciting opportunity",
            "body_text": "I came across your profile and think you'd be a perfect fit for several roles.",
            "body_html": "",
        }
        result = classify_email(email, SENDER_TEMPLATES)
        self.assertEqual(result, "recruiter_generic")

    def test_recruiter_with_specific_job(self):
        email = {
            "from": "sarah@staffingfirm.com",
            "subject": "Director of Engineering at HealthFirst",
            "body_text": "I have an exciting role for a Director of Engineering at HealthFirst. Apply now.",
            "body_html": "",
        }
        result = classify_email(email, SENDER_TEMPLATES)
        self.assertEqual(result, "single_job")


class TestNonJobDetection(unittest.TestCase):

    def test_connection_request(self):
        email = {"subject": "John accepted your invitation to connect", "body_text": "You are now connected"}
        self.assertTrue(detect_non_job_email(email))

    def test_newsletter(self):
        email = {"subject": "Your weekly newsletter", "body_text": "Here's your weekly digest of top articles"}
        self.assertTrue(detect_non_job_email(email))

    def test_profile_view(self):
        email = {"subject": "Someone viewed your profile", "body_text": "who's viewed your profile recently"}
        self.assertTrue(detect_non_job_email(email))

    def test_job_email_not_flagged(self):
        email = {"subject": "VP of Engineering at Google", "body_text": "Apply for this Director role at Google"}
        self.assertFalse(detect_non_job_email(email))


class TestResolveCompanyName(unittest.TestCase):

    def test_canonical_name(self):
        self.assertEqual(resolve_company_name("Meta", ALIAS_MAP), "Meta")

    def test_alias_to_canonical(self):
        self.assertEqual(resolve_company_name("Facebook", ALIAS_MAP), "Meta")

    def test_alias_with_suffix(self):
        self.assertEqual(resolve_company_name("Google Inc.", ALIAS_MAP), "Alphabet")

    def test_unknown_company(self):
        self.assertEqual(resolve_company_name("Acme Corp", ALIAS_MAP), "Acme")

    def test_none_input(self):
        self.assertIsNone(resolve_company_name(None, ALIAS_MAP))

    def test_aws_alias(self):
        self.assertEqual(resolve_company_name("AWS", ALIAS_MAP), "Amazon")


class TestNormalizeRoleTitle(unittest.TestCase):

    def test_strip_tracking_code(self):
        self.assertEqual(normalize_role_title("VP of Engineering REQ-12345"), "VP of Engineering")

    def test_strip_location_suffix(self):
        self.assertEqual(normalize_role_title("Director of Engineering - Remote"), "Director of Engineering")

    def test_normalize_sr(self):
        self.assertEqual(normalize_role_title("Sr. Software Engineer"), "Senior Software Engineer")

    def test_normalize_jr(self):
        self.assertEqual(normalize_role_title("Jr. Developer"), "Junior Developer")

    def test_strip_parenthetical_code(self):
        self.assertEqual(normalize_role_title("VP Engineering (R12345)"), "VP Engineering")

    def test_clean_whitespace(self):
        self.assertEqual(normalize_role_title("  Director  of   Engineering  "), "Director of Engineering")

    def test_none_input(self):
        self.assertIsNone(normalize_role_title(None))


class TestParseSingleJobEmail(unittest.TestCase):

    def test_linkedin_subject_pattern(self):
        email = {
            "from": "jobs@linkedin.com",
            "subject": "VP of Engineering at HealthFirst Technologies",
            "body_text": "View this job",
            "body_html": "",
        }
        sender_config = SENDER_TEMPLATES["linkedin.com"]
        result = parse_single_job_email(email, sender_config, ALIAS_MAP)
        self.assertIsNotNone(result)
        self.assertEqual(result["company"], "HealthFirst Technologies")
        self.assertEqual(result["role"], "VP of Engineering")
        self.assertGreater(result["confidence"], 0.5)

    def test_no_match_returns_none(self):
        email = {
            "from": "unknown@random.com",
            "subject": "Hello there",
            "body_text": "Just saying hi",
            "body_html": "",
        }
        sender_config = {"subject_patterns": [], "body_parse_strategy": "generic"}
        result = parse_single_job_email(email, sender_config, ALIAS_MAP)
        self.assertIsNone(result)


class TestHtmlToText(unittest.TestCase):

    def test_strips_tags(self):
        html = "<p>Hello <strong>World</strong></p>"
        text = html_to_text(html)
        self.assertIn("Hello", text)
        self.assertIn("World", text)
        self.assertNotIn("<p>", text)

    def test_empty_input(self):
        self.assertEqual(html_to_text(""), "")
        self.assertEqual(html_to_text(None), "")


if __name__ == "__main__":
    unittest.main()
