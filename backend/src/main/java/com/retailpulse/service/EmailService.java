package com.retailpulse.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmailService {

    private final JavaMailSender mailSender;
    private final EmailRateLimitService rateLimitService;

    @Value("${retailpulse.email.from:retailpulse@localhost}")
    private String fromEmail;

    @Value("${retailpulse.email.brevo-api-key:}")
    private String brevoApiKey;

    @Value("${retailpulse.email.auto-alerts-enabled:false}")
    private boolean autoAlertsEnabled;

    @Value("${retailpulse.email.log-otp-to-console:true}")
    private boolean logOtpToConsole;

    // ─── public API ──────────────────────────────────────────────────────────

    public boolean sendOtpEmail(String to, String code) {
        if (logOtpToConsole) {
            log.info("OTP for {}: {} (console mode — SMTP skipped)", to, code);
            return true;
        }
        if (!rateLimitService.canSend()) {
            log.warn("Daily email limit reached — OTP for {} not sent", to);
            return false;
        }
        String subject = "RetailPulse - Your Verification Code";
        String html    = buildOtpHtml(code);
        boolean sent   = sendEmail(to, subject, html);
        if (sent) rateLimitService.recordSent();
        return sent;
    }

    public boolean sendAlertEmail(String to, String subject, String body) {
        if (!autoAlertsEnabled) {
            log.info("Alert email skipped (auto-alerts disabled): {} — {}", subject, body);
            return false;
        }
        if (!rateLimitService.canSend()) {
            log.info("Alert email skipped (daily limit): {} — {}", subject, body);
            return false;
        }
        boolean sent = sendEmail(to, subject, "<pre>" + body + "</pre>");
        if (sent) rateLimitService.recordSent();
        return sent;
    }

    public boolean sendDigestEmail(String to, String subject, String body) {
        if (!autoAlertsEnabled) {
            log.info("Digest email skipped (auto-alerts disabled) for {}", to);
            return false;
        }
        if (!rateLimitService.canSend()) {
            log.info("Digest email skipped (daily limit) for {}", to);
            return false;
        }
        String html  = body.replace("\n", "<br/>");
        boolean sent = sendEmail(to, subject, html);
        if (sent) rateLimitService.recordSent();
        return sent;
    }

    public void sendPasswordReset(String toEmail, String resetLink) {
        sendEmail(toEmail, "RetailPulse — Password Reset",
                "<p>Reset your password: <a href=\"" + resetLink + "\">" + resetLink + "</a></p>");
    }

    public boolean sendWelcomeEmail(String to, String fullName, String role, String temporaryPassword) {
        if (!rateLimitService.canSend()) {
            log.warn("Welcome email skipped (daily limit) for {}. Temporary password: {}", to, temporaryPassword);
            return false;
        }
        String text = """
                Hello %s,

                Your RetailPulse account has been created.

                Email: %s
                Role: %s
                Temporary password: %s

                This is your system password. Change it at first login.

                — RetailPulse Administration
                """.formatted(fullName, to, role, temporaryPassword);
        boolean sent = sendEmail(to, "RetailPulse — Your Account Has Been Created",
                "<pre>" + text + "</pre>");
        if (sent) rateLimitService.recordSent();
        return sent;
    }

    // ─── routing: Brevo HTTP API or SMTP ─────────────────────────────────────

    private boolean sendEmail(String to, String subject, String htmlBody) {
        if (brevoApiKey != null && !brevoApiKey.isBlank()) {
            return sendViaBrevoApi(to, subject, htmlBody);
        }
        return sendViaSmtp(to, subject, htmlBody);
    }

    // ─── Brevo HTTP API (works on Render free tier) ──────────────────────────

    private boolean sendViaBrevoApi(String to, String subject, String htmlBody) {
        try {
            String senderName = "RetailPulse";
            String payload = """
                    {
                      "sender":  { "name": "%s", "email": "%s" },
                      "to":      [{ "email": "%s" }],
                      "subject": "%s",
                      "htmlContent": %s
                    }
                    """.formatted(
                    senderName,
                    fromEmail,
                    to,
                    subject,
                    toJsonString(htmlBody)
            );

            URL url = new URL("https://api.brevo.com/v3/smtp/email");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(10_000);
            conn.setRequestProperty("accept",       "application/json");
            conn.setRequestProperty("content-type", "application/json");
            conn.setRequestProperty("api-key",      brevoApiKey);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload.getBytes(StandardCharsets.UTF_8));
            }

            int status = conn.getResponseCode();
            if (status == 201 || status == 200) {
                log.info("Email sent via Brevo API to {}", to);
                return true;
            } else {
                String err = new String(conn.getErrorStream().readAllBytes(), StandardCharsets.UTF_8);
                log.warn("Brevo API returned {} for {}: {}", status, to, err);
                return false;
            }
        } catch (Exception e) {
            log.warn("Could not send email via Brevo API to {}: {}", to, e.getMessage());
            return false;
        }
    }

    /** Converts a raw string into a JSON string literal (escapes quotes and newlines). */
    private String toJsonString(String value) {
        return "\"" + value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "")
                + "\"";
    }

    // ─── SMTP fallback ────────────────────────────────────────────────────────

    private boolean sendViaSmtp(String to, String subject, String htmlBody) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(fromEmail);
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(htmlBody, true);
            mailSender.send(message);
            log.info("Email sent via SMTP to {}", to);
            return true;
        } catch (Exception e) {
            log.warn("Could not send email via SMTP to {} ({})", to, e.getMessage());
            return false;
        }
    }

    // ─── HTML builders ───────────────────────────────────────────────────────

    private String buildOtpHtml(String code) {
        String digits = buildDigitCells(code);
        return """
                <!DOCTYPE html>
                <html>
                <body style="margin:0;padding:0;background:#F5F0EB;font-family:Arial,Helvetica,sans-serif;">
                  <table width="100%%" cellpadding="0" cellspacing="0" style="background:#F5F0EB;padding:32px 16px;">
                    <tr>
                      <td align="center">
                        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #E8DDD4;border-radius:8px;padding:32px;">
                          <tr>
                            <td align="center" style="padding-bottom:24px;">
                              <span style="font-size:22px;font-weight:bold;color:#B87333;letter-spacing:2px;">RETAILPULSE</span>
                            </td>
                          </tr>
                          <tr>
                            <td align="center" style="color:#3D3D3D;font-size:15px;padding-bottom:20px;">
                              Your verification code is:
                            </td>
                          </tr>
                          <tr>
                            <td align="center" style="padding-bottom:24px;">
                              %s
                            </td>
                          </tr>
                          <tr>
                            <td align="center" style="color:#6B705C;font-size:13px;padding-bottom:16px;">
                              This code expires in 10 minutes.
                            </td>
                          </tr>
                          <tr>
                            <td align="center" style="color:#8A8278;font-size:12px;padding-bottom:24px;">
                              If you didn't request this, ignore this email.
                            </td>
                          </tr>
                          <tr>
                            <td align="center" style="border-top:1px solid #E8DDD4;padding-top:20px;color:#6B705C;font-size:12px;line-height:1.6;">
                              Quincaillerie du Rwamagana<br/>
                              Rwamagana, Eastern Province, Rwanda
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </body>
                </html>
                """.formatted(digits);
    }

    private String buildDigitCells(String code) {
        StringBuilder cells = new StringBuilder();
        cells.append("<table cellpadding=\"0\" cellspacing=\"8\" style=\"margin:0 auto;\"><tr>");
        for (char digit : code.toCharArray()) {
            cells.append("""
                    <td style="width:44px;height:52px;border:2px solid #B87333;border-radius:6px;
                    text-align:center;vertical-align:middle;font-size:24px;font-weight:bold;color:#2D2D2D;
                    background:#FAF7F4;">%c</td>
                    """.formatted(digit));
        }
        cells.append("</tr></table>");
        return cells.toString();
    }
}
