p = "tests.py"
s = open(p).read()
anchor = "    def test_invoice_changes_require_explicit_approval(self):\n"
assert s.count(anchor) == 1
assert "test_mail_draft_delete_passes_mailshot_404_through" not in s
new = '''    @patch(
        "integrations.views.call_mailshot",
        side_effect=MailshotUpstreamError("Draft not found", 404, "not_found"),
    )
    def test_mail_draft_delete_passes_mailshot_404_through(self, call_mailshot):
        response = self.client.delete(
            "/api/integrations/v1/mail/drafts/missing-draft",
            **{**self.headers, "HTTP_IDEMPOTENCY_KEY": "draft-delete-one"},
        )
        self.assertEqual(response.status_code, 404, response.content)
        self.assertEqual(response.json()["error"]["code"], "not_found")
        self.assertEqual(response.json()["error"]["message"], "Draft not found")

    @patch(
        "integrations.views.call_mailshot",
        side_effect=MailshotUpstreamError("Permanent delete is only allowed for messages already in Bin", 409, "not_in_bin"),
    )
    def test_mail_message_delete_passes_mailshot_409_through(self, call_mailshot):
        response = self.client.delete(
            "/api/integrations/v1/mail/messages/mail-1?permanent=true",
            **{**self.headers, "HTTP_IDEMPOTENCY_KEY": "message-delete-one"},
        )
        self.assertEqual(response.status_code, 409, response.content)
        self.assertEqual(response.json()["error"]["code"], "not_in_bin")

    @patch("integrations.views.call_mailshot", side_effect=RuntimeError("Mailshot could not be reached: refused"))
    def test_mail_outage_still_returns_502(self, call_mailshot):
        response = self.client.get("/api/integrations/v1/mail/labels", **self.headers)
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["error"]["code"], "mailshot_unavailable")

    def test_call_mailshot_maps_only_4xx_to_upstream_error(self):
        import io
        import urllib.error

        def http_error(code, body):
            return urllib.error.HTTPError("http://mailshot", code, "x", {}, io.BytesIO(body))

        not_found = b'{"error": {"code": "not_found", "message": "Message not found"}}'
        with patch("integrations.services.urllib.request.urlopen", side_effect=http_error(404, not_found)):
            with self.assertRaises(MailshotUpstreamError) as caught:
                call_mailshot_with_key("DELETE", "messages/x", "tns_decisionsai_test")
        self.assertEqual(
            (caught.exception.status, caught.exception.code, str(caught.exception)),
            (404, "not_found", "Message not found"),
        )

        with patch("integrations.services.urllib.request.urlopen", side_effect=http_error(500, b"{}")):
            with self.assertRaises(RuntimeError) as caught:
                call_mailshot_with_key("GET", "labels", "tns_decisionsai_test")
        self.assertNotIsInstance(caught.exception, MailshotUpstreamError)

'''
s = s.replace(anchor, new + anchor, 1)
head = s.split("class IntegrationApiTests")[0]
if "MailshotUpstreamError" not in head:
    s = s.replace("\nclass IntegrationApiTests", "\nfrom integrations.services import MailshotUpstreamError, call_mailshot_with_key\n\n\nclass IntegrationApiTests", 1)
open(p, "w").write(s)
print("tests added")
