package com.retailpulse.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmailService {

    private final JavaMailSender mailSender;
    private final EmailRateLimitService rateLimitService;

    @Value("${spring.mail.username:retailpulse@localhost}")
    private String fromEmail;

    @Value("${retailpulse.email.auto-alerts-enabled:false}")
    private boolean autoAlertsEnabled;

    @Value("${retailpulse.email.log-otp-to-console:true}")
    private boolean logOtpToConsole;

    public boolean sendOtpEmail(String to, String code) {
        if (logOtpToConsole) {
            log.info("OTP for {}: {}", to, code);
        }
        if (!rateLimitService.canSend()) {
            log.warn("Daily email limit reached — OTP for {} logged above (not sent via SMTP)", to);
            return false;
        }
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(fromEmail);
            helper.setTo(to);
            helper.setSubject("RetailPulse - Your Verification Code");
            helper.setText(buildOtpHtml(code), true);
            mailSender.send(message);
            rateLimitService.recordSent();
            log.info("OTP email sent to {}", to);
            return true;
        } catch (Exception e) {
            log.warn("Could not send OTP email to {} ({}). Use OTP logged above.", to, e.getMessage());
            return false;
        }
    }

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

    public boolean sendAlertEmail(String to, String subject, String body) {
        if (!autoAlertsEnabled) {
            log.info("Alert email skipped (auto-alerts disabled): {} — {}", subject, body);
            return false;
        }
        if (!rateLimitService.canSend()) {
            log.info("Alert email skipped (daily limit): {} — {}", subject, body);
            return false;
        }
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, "UTF-8");
            helper.setFrom(fromEmail);
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(body);
            mailSender.send(message);
            rateLimitService.recordSent();
            log.info("Alert email sent to {}", to);
            return true;
        } catch (MessagingException e) {
            log.warn("Could not send alert email to {}: {}", to, e.getMessage());
            return false;
        }
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
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(fromEmail);
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(body.replace("\n", "<br/>"), body);
            mailSender.send(message);
            rateLimitService.recordSent();
            log.info("Digest email sent to {}", to);
            return true;
        } catch (MessagingException e) {
            log.warn("Could not send digest email to {}", to);
            return false;
        }
    }

    public void sendPasswordReset(String toEmail, String resetLink) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, "UTF-8");
            helper.setFrom(fromEmail);
            helper.setTo(toEmail);
            helper.setSubject("RetailPulse — Password Reset");
            helper.setText("Reset your password: " + resetLink);
            mailSender.send(message);
        } catch (MessagingException e) {
            log.warn("Could not send password reset email to {}", toEmail);
        }
    }

    public boolean sendWelcomeEmail(String to, String fullName, String role, String temporaryPassword) {
        if (!rateLimitService.canSend()) {
            log.warn("Welcome email skipped (daily limit) for {}. Temporary password: {}", to, temporaryPassword);
            return false;
        }
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, "UTF-8");
            helper.setFrom(fromEmail);
            helper.setTo(to);
            helper.setSubject("RetailPulse — Your Account Has Been Created");
            helper.setText("""
                    Hello %s,

                    Your RetailPulse account has been created.

                    Email: %s
                    Role: %s
                    Temporary password: %s

                    This is your system password. Change it at first login.

                    — RetailPulse Administration
                    """.formatted(fullName, to, role, temporaryPassword));
            mailSender.send(message);
            rateLimitService.recordSent();
            log.info("Welcome email sent to {}", to);
            return true;
        } catch (Exception e) {
            log.warn("Could not send welcome email to {} ({}). Temporary password: {}", to, e.getMessage(), temporaryPassword);
            return false;
        }
    }
}
