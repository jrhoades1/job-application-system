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
    detect_rejection_email,
    get_sender_domain,
    html_to_text,
    normalize_role_title,
    parse_rejection_email,
    parse_single_job_email,
    process_rejections,
    resolve_company_name,
    _match_rejection_to_app,
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


class TestLinkedInUrlExtraction(unittest.TestCase):
    """Test that LinkedIn job URLs are extracted from multi-job emails."""

    def test_extracts_linkedin_url_from_location(self):
        from email_parse import _parse_linkedin_text_cards
        text = (
            "Some header\n"
            "VP, Platform Engineering <https://www.linkedin.com/comm/jobs/view/4343698348/?tracking=abc>\n"
            "Thrive Resources · Windermere, FL (On-site)<https://www.linkedin.com/comm/jobs/view/4343698348/?tracking=abc>\n"
            "$250K - $300K/yr\n"
        )
        leads = _parse_linkedin_text_cards(text)
        self.assertEqual(len(leads), 1)
        self.assertEqual(leads[0]["company"], "Thrive Resources")
        self.assertEqual(leads[0]["location"], "Windermere, FL (On-site)")
        self.assertIn("linkedin_url", leads[0])
        self.assertIn("4343698348", leads[0]["linkedin_url"])

    def test_location_cleaned_of_url(self):
        from email_parse import _parse_linkedin_text_cards
        text = (
            "Director of Engineering\n"
            "Acme Corp · Remote<https://linkedin.com/comm/jobs/view/123456>\n"
        )
        leads = _parse_linkedin_text_cards(text)
        self.assertEqual(len(leads), 1)
        self.assertEqual(leads[0]["location"], "Remote")
        self.assertNotIn("<", leads[0]["location"])


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


# ---------------------------------------------------------------------------
# Rejection detection tests
# ---------------------------------------------------------------------------

class TestDetectRejectionEmail(unittest.TestCase):

    def test_moved_forward_with_others(self):
        email = {
            "from": "careers@acme.com",
            "subject": "Your application to Acme",
            "body_text": "Thank you for your interest. We have decided to move forward with other candidates.",
            "body_html": "",
        }
        self.assertTrue(detect_rejection_email(email))

    def test_will_not_be_moving_forward(self):
        email = {
            "from": "talent@startup.io",
            "subject": "Update on your application",
            "body_text": "After careful review, we will not be moving forward with your application at this time.",
            "body_html": "",
        }
        self.assertTrue(detect_rejection_email(email))

    def test_position_filled(self):
        email = {
            "from": "hr@bigcorp.com",
            "subject": "Re: Director of Engineering",
            "body_text": "We wanted to let you know that the position has been filled. Thank you for your interest.",
            "body_html": "",
        }
        self.assertTrue(detect_rejection_email(email))

    def test_regret_to_inform(self):
        email = {
            "from": "noreply@company.com",
            "subject": "Application Status",
            "body_text": "We regret to inform you that we will not be able to offer you the position.",
            "body_html": "",
        }
        self.assertTrue(detect_rejection_email(email))

    def test_unfortunately_not_moving_forward(self):
        email = {
            "from": "recruiting@enterprise.com",
            "subject": "Regarding your candidacy",
            "body_text": "Unfortunately, we will not be moving forward with your candidacy.",
            "body_html": "",
        }
        self.assertTrue(detect_rejection_email(email))

    def test_application_unsuccessful(self):
        email = {
            "from": "jobs@techco.com",
            "subject": "Application Update",
            "body_text": "Your application has been unsuccessful. We encourage you to apply again in the future.",
            "body_html": "",
        }
        self.assertTrue(detect_rejection_email(email))

    def test_role_no_longer_available(self):
        email = {
            "from": "hr@startup.com",
            "subject": "VP Engineering Update",
            "body_text": "This role is no longer available. We appreciate your interest.",
            "body_html": "",
        }
        self.assertTrue(detect_rejection_email(email))

    def test_after_careful_consideration(self):
        email = {
            "from": "team@company.com",
            "subject": "Your application at Company",
            "body_text": "After careful consideration, we have decided to pursue other candidates whose experience more closely aligns.",
            "body_html": "",
        }
        self.assertTrue(detect_rejection_email(email))

    def test_subject_hint_plus_negative_body(self):
        email = {
            "from": "noreply@firm.com",
            "subject": "Application status update",
            "body_text": "Unfortunately, we are not able to move forward at this time. We wish you the best.",
            "body_html": "",
        }
        self.assertTrue(detect_rejection_email(email))

    def test_html_only_rejection(self):
        email = {
            "from": "careers@corp.com",
            "subject": "Application Update",
            "body_text": "",
            "body_html": "<p>We regret to inform you that we will not be pursuing your candidacy.</p>",
        }
        self.assertTrue(detect_rejection_email(email))

    def test_rejection_with_unsubscribe(self):
        """Rejections often have unsubscribe footers — should NOT be filtered as not_job."""
        email = {
            "from": "careers@acme.com",
            "subject": "Your application to Acme",
            "body_text": "We have decided to move forward with other candidates. Unsubscribe from these emails.",
            "body_html": "",
        }
        # Should be detected as rejection
        self.assertTrue(detect_rejection_email(email))
        # classify_email should return 'rejection', not 'not_job'
        result = classify_email(email, SENDER_TEMPLATES)
        self.assertEqual(result, "rejection")

    # --- False positive guards ---

    def test_job_alert_not_rejection(self):
        email = {
            "from": "jobs@linkedin.com",
            "subject": "Director of Engineering at Google",
            "body_text": "Apply now for this exciting role at Google.",
            "body_html": "",
        }
        self.assertFalse(detect_rejection_email(email))

    def test_recruiter_outreach_not_rejection(self):
        email = {
            "from": "sarah@staffing.com",
            "subject": "Exciting opportunity",
            "body_text": "I came across your profile and think you'd be perfect for a Director role with our client.",
            "body_html": "",
        }
        self.assertFalse(detect_rejection_email(email))

    def test_interview_invite_not_rejection(self):
        email = {
            "from": "hr@company.com",
            "subject": "Interview invitation",
            "body_text": "We'd like to move forward with scheduling an interview. Please select a time that works.",
            "body_html": "",
        }
        self.assertFalse(detect_rejection_email(email))

    def test_generic_newsletter_not_rejection(self):
        email = {
            "from": "news@techcrunch.com",
            "subject": "Your daily tech digest",
            "body_text": "Top stories today: Company X raised $50M. New AI tool launched.",
            "body_html": "",
        }
        self.assertFalse(detect_rejection_email(email))

    def test_application_confirmation_not_rejection(self):
        email = {
            "from": "noreply@workday.com",
            "subject": "Application received",
            "body_text": "Thank you for your application. We will review it and get back to you.",
            "body_html": "",
        }
        self.assertFalse(detect_rejection_email(email))


class TestParseRejectionEmail(unittest.TestCase):

    def test_company_from_sender_display_name(self):
        email = {
            "from": "Acme Corp Recruiting <noreply@acme.com>",
            "subject": "Your application",
            "body_text": "We have decided to move forward with other candidates.",
            "body_html": "",
        }
        result = parse_rejection_email(email, ALIAS_MAP)
        self.assertEqual(result["company"], "Acme")  # "Corp" stripped, resolve cleans suffix
        self.assertEqual(result["sender_domain"], "acme.com")
        self.assertGreaterEqual(result["confidence"], 0.8)

    def test_company_from_domain_when_no_display_name(self):
        email = {
            "from": "noreply@techstartup.com",
            "subject": "Application status",
            "body_text": "Position has been filled.",
            "body_html": "",
        }
        result = parse_rejection_email(email, {})
        self.assertEqual(result["company"], "Techstartup")

    def test_company_from_subject(self):
        email = {
            "from": "HealthFirst Talent <careers@healthfirst.com>",
            "subject": "Your application to HealthFirst Technologies",
            "body_text": "We regret to inform you that the role has been filled.",
            "body_html": "",
        }
        result = parse_rejection_email(email, {})
        self.assertEqual(result["company"], "HealthFirst Technologies")

    def test_skips_ats_domains(self):
        """ATS domains like greenhouse.io should not become the company name."""
        email = {
            "from": "noreply@greenhouse.io",
            "subject": "Update from Acme Corp",
            "body_text": "Unfortunately we will not be moving forward.",
            "body_html": "",
        }
        result = parse_rejection_email(email, {})
        # Should pick up "Acme Corp" from subject, not "Greenhouse"
        self.assertNotEqual(result["company"], "Greenhouse")

    def test_skips_personal_email_domains(self):
        """Personal domains like gmail.com should not become the company name."""
        email = {
            "from": "recruiter@gmail.com",
            "subject": "Regarding your application at Startup Inc",
            "body_text": "We decided not to move forward.",
            "body_html": "",
        }
        result = parse_rejection_email(email, {})
        self.assertNotEqual(result["company"], "Gmail")

    def test_extracts_role_from_body(self):
        email = {
            "from": "Acme HR <hr@acme.com>",
            "subject": "Application update",
            "body_text": "Thank you for interviewing for the Director of Engineering position. Unfortunately we have decided to pursue other candidates.",
            "body_html": "",
        }
        result = parse_rejection_email(email, {})
        self.assertIsNotNone(result["role"])
        self.assertIn("Director", result["role"])

    def test_alias_resolution(self):
        email = {
            "from": "Google Careers <noreply@google.com>",
            "subject": "Your application",
            "body_text": "We will not be moving forward with your candidacy.",
            "body_html": "",
        }
        result = parse_rejection_email(email, ALIAS_MAP)
        self.assertEqual(result["company"], "Alphabet")

    def test_forwarded_rejection(self):
        """Forwarded rejections should use the original sender."""
        email = {
            "from": "jimmy@gmail.com",
            "_original_from": "Acme Talent <careers@acme.com>",
            "_is_forwarded": True,
            "subject": "Fw: Your application to Acme",
            "body_text": "We have decided to move forward with other candidates.",
            "body_html": "",
        }
        result = parse_rejection_email(email, {})
        self.assertEqual(result["company"], "Acme")
        self.assertEqual(result["sender_domain"], "acme.com")


class TestMatchRejectionToApp(unittest.TestCase):

    def _make_index(self, entries):
        """Build an app_index from a list of (company, folder, status) tuples."""
        index = {}
        for company, folder, status in entries:
            meta = {"company": company, "role": "Director of Engineering", "status": status}
            meta_path = f"/fake/{folder}/metadata.json"
            index.setdefault(company.lower(), []).append((folder, meta_path, meta))
        return index

    def test_exact_match(self):
        index = self._make_index([
            ("Acme", "2026-01-15_acme_director-of-engineering", "applied"),
        ])
        record = {"company": "Acme", "role": None}
        matches = _match_rejection_to_app("Acme", record, index)
        self.assertEqual(len(matches), 1)
        self.assertIn("acme", matches[0][0])

    def test_case_insensitive_match(self):
        index = self._make_index([
            ("healthfirst", "2026-02-01_healthfirst_vp-engineering", "applied"),
        ])
        record = {"company": "HealthFirst", "role": None}
        matches = _match_rejection_to_app("HealthFirst", record, index)
        self.assertEqual(len(matches), 1)

    def test_suffix_stripping_match(self):
        index = self._make_index([
            ("acme", "2026-01-15_acme_director-of-engineering", "applied"),
        ])
        record = {"company": "Acme Inc.", "role": None}
        matches = _match_rejection_to_app("Acme Inc.", record, index)
        self.assertEqual(len(matches), 1)

    def test_substring_match(self):
        index = self._make_index([
            ("acme corp", "2026-01-15_acme-corp_director-of-engineering", "applied"),
        ])
        record = {"company": "Acme", "role": None}
        matches = _match_rejection_to_app("Acme", record, index)
        self.assertEqual(len(matches), 1)

    def test_slug_match(self):
        index = self._make_index([
            ("florida power & light", "2026-03-01_florida-power-light_engineer", "applied"),
        ])
        record = {"company": "Florida Power Light", "role": None}
        matches = _match_rejection_to_app("Florida Power Light", record, index)
        self.assertEqual(len(matches), 1)

    def test_no_match(self):
        index = self._make_index([
            ("acme", "2026-01-15_acme_director-of-engineering", "applied"),
        ])
        record = {"company": "Totally Different Co", "role": None}
        matches = _match_rejection_to_app("Totally Different Co", record, index)
        self.assertEqual(len(matches), 0)

    def test_role_tiebreaker(self):
        """When multiple apps for same company, prefer role match."""
        index = {}
        meta1 = {"company": "Acme", "role": "VP of Engineering", "status": "applied"}
        meta2 = {"company": "Acme", "role": "Director of Engineering", "status": "applied"}
        index["acme"] = [
            ("2026-01_acme_vp-engineering", "/fake/1/metadata.json", meta1),
            ("2026-02_acme_director-engineering", "/fake/2/metadata.json", meta2),
        ]
        record = {"company": "Acme", "role": "Director of Engineering"}
        matches = _match_rejection_to_app("Acme", record, index)
        self.assertEqual(len(matches), 1)
        self.assertIn("director", matches[0][0])


class TestProcessRejectionsIntegration(unittest.TestCase):
    """Integration test using temp directories to verify end-to-end rejection processing."""

    def setUp(self):
        import tempfile
        import email_parse
        self._orig_script_dir = email_parse.SCRIPT_DIR
        self._orig_staging_parsed = email_parse.STAGING_PARSED

        self.tmpdir = tempfile.mkdtemp()
        self.apps_dir = os.path.join(self.tmpdir, "applications")
        self.parsed_dir = os.path.join(self.tmpdir, "staging", "parsed")
        os.makedirs(self.apps_dir)
        os.makedirs(self.parsed_dir)

        # Monkey-patch module paths
        email_parse.SCRIPT_DIR = self.tmpdir
        email_parse.STAGING_PARSED = self.parsed_dir

    def tearDown(self):
        import shutil
        import email_parse
        email_parse.SCRIPT_DIR = self._orig_script_dir
        email_parse.STAGING_PARSED = self._orig_staging_parsed
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _create_app(self, folder_name, company, status="applied"):
        import json
        app_dir = os.path.join(self.apps_dir, folder_name)
        os.makedirs(app_dir, exist_ok=True)
        meta = {
            "company": company,
            "role": "Director of Engineering",
            "status": status,
            "rejection_date": None,
            "follow_up_date": "2026-03-15",
        }
        meta_path = os.path.join(app_dir, "metadata.json")
        with open(meta_path, "w") as f:
            json.dump(meta, f)
        return meta_path

    def _create_parsed_rejection(self, filename, company, email_date="Tue, 11 Mar 2026 10:00:00 +0000"):
        import json
        parsed = [{
            "type": "rejection",
            "company": company,
            "role": None,
            "email_uid": "99",
            "email_date": email_date,
            "raw_subject": f"Update from {company}",
        }]
        path = os.path.join(self.parsed_dir, filename)
        with open(path, "w") as f:
            json.dump(parsed, f)

    def test_updates_matching_application(self):
        import json
        meta_path = self._create_app("2026-01-15_acme_director-of-engineering", "Acme")
        self._create_parsed_rejection("99.json", "Acme")

        updates = process_rejections()
        self.assertEqual(len(updates), 1)
        self.assertEqual(updates[0]["status"], "updated")
        self.assertEqual(updates[0]["old_status"], "applied")

        with open(meta_path) as f:
            meta = json.load(f)
        self.assertEqual(meta["status"], "rejected")
        self.assertEqual(meta["rejection_date"], "2026-03-11")
        self.assertIsNone(meta["follow_up_date"])

    def test_skips_already_rejected(self):
        self._create_app("2026-01-15_acme_director-of-engineering", "Acme", status="rejected")
        self._create_parsed_rejection("99.json", "Acme")

        updates = process_rejections()
        self.assertEqual(len(updates), 1)
        self.assertEqual(updates[0]["status"], "already_rejected")

    def test_unmatched_rejection(self):
        self._create_app("2026-01-15_acme_director-of-engineering", "Acme")
        self._create_parsed_rejection("99.json", "Unknown Corp")

        updates = process_rejections()
        self.assertEqual(len(updates), 1)
        self.assertEqual(updates[0]["status"], "unmatched")

    def test_no_company_in_rejection(self):
        self._create_app("2026-01-15_acme_director-of-engineering", "Acme")
        # Create a rejection with no company
        import json
        parsed = [{"type": "rejection", "company": None, "role": None,
                    "email_uid": "99", "email_date": "", "raw_subject": "Update"}]
        path = os.path.join(self.parsed_dir, "99.json")
        with open(path, "w") as f:
            json.dump(parsed, f)

        updates = process_rejections()
        self.assertEqual(len(updates), 1)
        self.assertEqual(updates[0]["status"], "unmatched")
        self.assertIn("No company", updates[0]["reason"])


class TestClassifyEmailRejection(unittest.TestCase):
    """Verify classify_email returns 'rejection' and prioritizes it correctly."""

    def test_classify_rejection(self):
        email = {
            "from": "careers@acme.com",
            "subject": "Your application to Acme",
            "body_text": "We have decided to move forward with other candidates.",
            "body_html": "",
        }
        self.assertEqual(classify_email(email, SENDER_TEMPLATES), "rejection")

    def test_rejection_beats_not_job(self):
        """Rejection with 'unsubscribe' footer should be rejection, not not_job."""
        email = {
            "from": "careers@acme.com",
            "subject": "Application update",
            "body_text": "Unfortunately we will not be moving forward with your candidacy. Unsubscribe here.",
            "body_html": "",
        }
        self.assertEqual(classify_email(email, SENDER_TEMPLATES), "rejection")

    def test_rejection_beats_single_job(self):
        """A rejection mentioning a role should still be rejection, not single_job."""
        email = {
            "from": "talent@linkedin.com",
            "subject": "Director of Engineering at Acme",
            "body_text": "We regret to inform you that the position has been filled.",
            "body_html": "",
        }
        self.assertEqual(classify_email(email, SENDER_TEMPLATES), "rejection")


if __name__ == "__main__":
    unittest.main()
