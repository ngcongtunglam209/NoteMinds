import nodemailer from 'nodemailer';
import crypto from 'crypto';
import './envLoader.js';
import db from './database.js';

// ── SMTP Configuration ──────────────────────────────────
const smtpPort = parseInt(process.env.SMTP_PORT || '587');
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.titan.email',
    port: smtpPort,
    secure: smtpPort === 465, // true for 465 (SSL), false for 587 (STARTTLS)
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    requireTLS: smtpPort === 587, // Force STARTTLS for port 587
    tls: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
    },
});

const FROM_EMAIL = process.env.SMTP_FROM || 'donotreply@loveyuna.today';
const FROM_NAME = process.env.SMTP_FROM_NAME || 'NoteMinds';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const BACKEND_URL = process.env.API_DOMAIN || process.env.BACKEND_URL || 'http://localhost:3000';

// ── Token generation ────────────────────────────────────
export function generateVerificationToken() {
    return crypto.randomBytes(32).toString('hex');
}

export function generateTrackingId() {
    return crypto.randomBytes(16).toString('hex');
}

// ── i18n helpers ────────────────────────────────────────
const translations = {
    en: {
        verifyEmailSubject: '✉️ Verify your email - NoteMinds',
        verifyEmailTitle: 'Verify your email',
        verifyEmailGreeting: 'Hello',
        verifyEmailBody: 'Thank you for signing up for NoteMinds! Please click the button below to verify your email.',
        verifyEmailButton: '✓ Verify Email',
        verifyEmailOr: 'Or copy this link to your browser:',
        verifyEmailExpiry: 'This link will expire in <strong>5 minutes</strong>. If you did not sign up for this account, please ignore this email.',
        resetPasswordSubject: '🔑 Reset your password - NoteMinds',
        resetPasswordTitle: 'Reset your password',
        resetPasswordGreeting: 'Hello',
        resetPasswordBody: 'We received a request to reset the password for your account. Click the button below to create a new password.',
        resetPasswordButton: '🔑 Reset Password',
        resetPasswordOr: 'Or copy this link to your browser:',
        resetPasswordExpiry: 'This link will expire in <strong>5 minutes</strong>. If you did not request a password reset, please ignore this email.',
        footer: '© 2026 NoteMinds — AI-Powered Study Assistant',
        poweredBy: 'Powered by AI',
        secureEmail: 'Secure Email',
        needHelp: 'Need help? Contact us',
    },
    vi: {
        verifyEmailSubject: '✉️ Xác minh email - NoteMinds',
        verifyEmailTitle: 'Xác minh email của bạn',
        verifyEmailGreeting: 'Xin chào',
        verifyEmailBody: 'Cảm ơn bạn đã đăng ký tài khoản NoteMinds! Vui lòng nhấn nút bên dưới để xác minh email.',
        verifyEmailButton: '✓ Xác minh Email',
        verifyEmailOr: 'Hoặc copy link sau vào trình duyệt:',
        verifyEmailExpiry: 'Link này sẽ hết hạn sau <strong>5 phút</strong>. Nếu bạn không đăng ký tài khoản này, vui lòng bỏ qua email này.',
        resetPasswordSubject: '🔑 Đặt lại mật khẩu - NoteMinds',
        resetPasswordTitle: 'Đặt lại mật khẩu',
        resetPasswordGreeting: 'Xin chào',
        resetPasswordBody: 'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Nhấn nút bên dưới để tạo mật khẩu mới.',
        resetPasswordButton: '🔑 Đặt lại mật khẩu',
        resetPasswordOr: 'Hoặc copy link sau vào trình duyệt:',
        resetPasswordExpiry: 'Link này sẽ hết hạn sau <strong>5 phút</strong>. Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.',
        footer: '© 2026 NoteMinds — Trợ lý học tập AI',
        poweredBy: 'Powered by AI',
        secureEmail: 'Email bảo mật',
        needHelp: 'Cần hỗ trợ? Liên hệ chúng tôi',
    },
};

function t(lang, key) {
    return translations[lang]?.[key] || translations['en'][key];
}

// ── Enhanced Email Templates ─────────────────────────────────────

function baseTemplate(content, trackingId, lang = 'vi') {
    const trackingPixel = trackingId ? `<img src="${BACKEND_URL}/api/email/track/${trackingId}" width="1" height="1" style="display:none;width:1px;height:1px;" alt="" />` : '';
    
    return `
<!DOCTYPE html>
<html lang="${lang}" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <title>NoteMinds</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <style type="text/css">
    body, table, td, a { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
  <style>
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .email-content { padding: 24px 20px !important; }
      .hero-title { font-size: 20px !important; }
      .cta-button { padding: 14px 32px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; word-spacing:normal; background-color:#09090b; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
  <!-- Visually Hidden Preheader Text -->
  <div style="display:none; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden; mso-hide:all;">
    NoteMinds &mdash; ${t(lang, 'poweredBy')}
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#09090b;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <!-- ─── Email Container ─── -->
        <table role="presentation" class="email-container" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px; width:100%;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding:0 0 32px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding:10px 20px; background-color:#18181b; border:1px solid #27272a; border-radius:10px;">
                    <span style="font-size:18px; font-weight:700; color:#fafafa; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; letter-spacing:-0.3px;">
                      NoteMinds
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td style="background-color:#18181b; border:1px solid #27272a; border-radius:16px; overflow:hidden;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">

                <!-- Accent bar -->
                <tr>
                  <td style="height:3px; background:linear-gradient(90deg, var(--accent, #f43f5e), #fb7185, #fbbf24); font-size:0; line-height:0;">&nbsp;</td>
                </tr>

                <!-- Content -->
                <tr>
                  <td class="email-content" style="padding:40px 36px;">
                    ${content}
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:28px 0 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="padding:0 0 12px;">
                    <span style="display:inline-block; padding:4px 10px; background-color:#18181b; border:1px solid #27272a; border-radius:6px; font-size:10px; color:#71717a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; font-weight:600; letter-spacing:0.3px;">
                      &#128274; ${t(lang, 'secureEmail')}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size:11px; color:#52525b; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; line-height:1.6;">
                    ${t(lang, 'footer')}
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:8px 0 0;">
                    <a href="${FRONTEND_URL}" style="color:#a1a1aa; font-size:11px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; text-decoration:none; font-weight:500;">
                      ${t(lang, 'needHelp')} &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!-- End Container -->

      </td>
    </tr>
  </table>
  ${trackingPixel}
</body>
</html>`;
}

function verificationEmailTemplate(username, verifyUrl, trackingId, lang = 'vi') {
    return baseTemplate(`
    <!-- Icon -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="width:44px; height:44px; background-color:#09090b; border:1px solid #27272a; border-radius:12px; text-align:center; vertical-align:middle; font-size:20px; line-height:44px;">
          &#9993;
        </td>
      </tr>
    </table>

    <!-- Title -->
    <h1 class="hero-title" style="margin:20px 0 8px; font-size:22px; font-weight:700; color:#fafafa; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; letter-spacing:-0.4px; line-height:1.3;">
      ${t(lang, 'verifyEmailTitle')}
    </h1>

    <!-- Body text -->
    <p style="margin:0 0 28px; font-size:14px; color:#a1a1aa; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; line-height:1.7;">
      ${t(lang, 'verifyEmailGreeting')} <strong style="color:#fafafa;">${username}</strong>,<br>
      ${t(lang, 'verifyEmailBody')}
    </p>

    <!-- CTA Button -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td>
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${verifyUrl}" style="height:46px;v-text-anchor:middle;width:200px;" arcsize="26%" fillcolor="#f43f5e" stroke="f">
            <w:anchorlock/>
            <center style="color:#ffffff;font-family:sans-serif;font-size:14px;font-weight:bold;">&#10003; ${t(lang, 'verifyEmailButton')}</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-->
          <a href="${verifyUrl}" class="cta-button" style="display:inline-block; padding:14px 36px; background-color:#f43f5e; color:#ffffff; text-decoration:none; border-radius:10px; font-size:14px; font-weight:600; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; letter-spacing:0.2px; mso-hide:all;">
            &#10003; ${t(lang, 'verifyEmailButton')}
          </a>
          <!--<![endif]-->
        </td>
      </tr>
    </table>

    <!-- Divider -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 20px;">
      <tr>
        <td style="border-top:1px solid #27272a; font-size:0; line-height:0;">&nbsp;</td>
      </tr>
    </table>

    <!-- Alternative link -->
    <p style="margin:0 0 8px; font-size:11px; color:#71717a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">
      ${t(lang, 'verifyEmailOr')}
    </p>
    <p style="margin:0 0 24px; font-size:12px; word-break:break-all; line-height:1.6; font-family:'Courier New',monospace;">
      <a href="${verifyUrl}" style="color:#71717a; text-decoration:none;">${verifyUrl}</a>
    </p>

    <!-- Expiry notice -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
      <tr>
        <td style="padding:12px 16px; background-color:#09090b; border:1px solid #27272a; border-radius:10px; border-left:3px solid #f43f5e;">
          <p style="margin:0; font-size:12px; color:#a1a1aa; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; line-height:1.6;">
            &#9203; ${t(lang, 'verifyEmailExpiry')}
          </p>
        </td>
      </tr>
    </table>
  `, trackingId, lang);
}

function resetPasswordEmailTemplate(username, resetUrl, trackingId, lang = 'vi') {
    return baseTemplate(`
    <!-- Icon -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="width:44px; height:44px; background-color:#09090b; border:1px solid #27272a; border-radius:12px; text-align:center; vertical-align:middle; font-size:20px; line-height:44px;">
          &#128272;
        </td>
      </tr>
    </table>

    <!-- Title -->
    <h1 class="hero-title" style="margin:20px 0 8px; font-size:22px; font-weight:700; color:#fafafa; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; letter-spacing:-0.4px; line-height:1.3;">
      ${t(lang, 'resetPasswordTitle')}
    </h1>

    <!-- Body text -->
    <p style="margin:0 0 28px; font-size:14px; color:#a1a1aa; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; line-height:1.7;">
      ${t(lang, 'resetPasswordGreeting')} <strong style="color:#fafafa;">${username}</strong>,<br>
      ${t(lang, 'resetPasswordBody')}
    </p>

    <!-- CTA Button -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td>
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${resetUrl}" style="height:46px;v-text-anchor:middle;width:220px;" arcsize="26%" fillcolor="#f43f5e" stroke="f">
            <w:anchorlock/>
            <center style="color:#ffffff;font-family:sans-serif;font-size:14px;font-weight:bold;">&#128272; ${t(lang, 'resetPasswordButton')}</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-->
          <a href="${resetUrl}" class="cta-button" style="display:inline-block; padding:14px 36px; background-color:#f43f5e; color:#ffffff; text-decoration:none; border-radius:10px; font-size:14px; font-weight:600; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; letter-spacing:0.2px; mso-hide:all;">
            &#128272; ${t(lang, 'resetPasswordButton')}
          </a>
          <!--<![endif]-->
        </td>
      </tr>
    </table>

    <!-- Divider -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 20px;">
      <tr>
        <td style="border-top:1px solid #27272a; font-size:0; line-height:0;">&nbsp;</td>
      </tr>
    </table>

    <!-- Alternative link -->
    <p style="margin:0 0 8px; font-size:11px; color:#71717a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">
      ${t(lang, 'resetPasswordOr')}
    </p>
    <p style="margin:0 0 24px; font-size:12px; word-break:break-all; line-height:1.6; font-family:'Courier New',monospace;">
      <a href="${resetUrl}" style="color:#71717a; text-decoration:none;">${resetUrl}</a>
    </p>

    <!-- Expiry notice -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
      <tr>
        <td style="padding:12px 16px; background-color:#09090b; border:1px solid #27272a; border-radius:10px; border-left:3px solid #f43f5e;">
          <p style="margin:0; font-size:12px; color:#a1a1aa; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; line-height:1.6;">
            &#9203; ${t(lang, 'resetPasswordExpiry')}
          </p>
        </td>
      </tr>
    </table>
  `, trackingId, lang);
}

// ── Send functions ──────────────────────────────────────

export async function sendVerificationEmail(email, token, username, lang = 'vi', saveTracking = null) {
    const verifyUrl = `${FRONTEND_URL}/verify-email?token=${token}`;
    const trackingId = generateTrackingId();
    const html = verificationEmailTemplate(username, verifyUrl, trackingId, lang);

    try {
        // Save tracking record if function provided
        if (saveTracking) {
            await saveTracking(trackingId, email, 'verification', username);
        }

        await transporter.sendMail({
            from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
            to: email,
            subject: t(lang, 'verifyEmailSubject'),
            html,
        });
        console.log(`[Email] Verification email sent to ${email} (tracking: ${trackingId})`);
        return { success: true, trackingId };
    } catch (err) {
        console.error(`[Email] Failed to send verification email to ${email}:`, err.message);
        const errorMsg = lang === 'vi' 
            ? 'Không thể gửi email xác minh. Vui lòng thử lại sau.'
            : 'Unable to send verification email. Please try again later.';
        throw new Error(errorMsg);
    }
}

export async function sendPasswordResetEmail(email, token, username, lang = 'vi', saveTracking = null) {
    const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}`;
    const trackingId = generateTrackingId();
    const html = resetPasswordEmailTemplate(username, resetUrl, trackingId, lang);

    try {
        // Save tracking record if function provided
        if (saveTracking) {
            await saveTracking(trackingId, email, 'password_reset', username);
        }

        await transporter.sendMail({
            from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
            to: email,
            subject: t(lang, 'resetPasswordSubject'),
            html,
        });
        console.log(`[Email] Password reset email sent to ${email} (tracking: ${trackingId})`);
        return { success: true, trackingId };
    } catch (err) {
        console.error(`[Email] Failed to send reset email to ${email}:`, err.message);
        const errorMsg = lang === 'vi'
            ? 'Không thể gửi email đặt lại mật khẩu. Vui lòng thử lại sau.'
            : 'Unable to send password reset email. Please try again later.';
        throw new Error(errorMsg);
    }
}

// ── Test connection ─────────────────────────────────────
export async function testEmailConnection() {
    try {
        await transporter.verify();
        console.log('📧 SMTP connection verified successfully');
        return true;
    } catch (err) {
        console.error('📧 SMTP connection failed:', err.message);
        return false;
    }
}

// ── Email Tracking Functions ────────────────────────────

export function saveEmailTracking(trackingId, email, type, recipientName) {
    try {
        const stmt = db.prepare(`
            INSERT INTO email_tracking (tracking_id, email, type, recipient_name)
            VALUES (?, ?, ?, ?)
        `);
        stmt.run(trackingId, email, type, recipientName);
        return true;
    } catch (err) {
        console.error('[Email Tracking] Failed to save tracking:', err.message);
        return false;
    }
}

export function trackEmailOpen(trackingId, userAgent, ipAddress) {
    try {
        const now = new Date().toISOString();
        const stmt = db.prepare(`
            UPDATE email_tracking 
            SET opened_at = COALESCE(opened_at, ?),
                open_count = open_count + 1,
                last_opened_at = ?,
                user_agent = COALESCE(user_agent, ?),
                ip_address = COALESCE(ip_address, ?)
            WHERE tracking_id = ?
        `);
        stmt.run(now, now, userAgent, ipAddress, trackingId);
        return true;
    } catch (err) {
        console.error('[Email Tracking] Failed to track open:', err.message);
        return false;
    }
}

export function getEmailStats() {
    try {
        const stats = db.prepare(`
            SELECT 
                COUNT(*) as total_sent,
                COUNT(opened_at) as total_opened,
                CAST(COUNT(opened_at) AS FLOAT) / COUNT(*) * 100 as open_rate,
                SUM(open_count) as total_opens
            FROM email_tracking
        `).get();

        const byType = db.prepare(`
            SELECT 
                type,
                COUNT(*) as sent,
                COUNT(opened_at) as opened,
                CAST(COUNT(opened_at) AS FLOAT) / COUNT(*) * 100 as open_rate,
                SUM(open_count) as total_opens
            FROM email_tracking
            GROUP BY type
        `).all();

        const recent = db.prepare(`
            SELECT 
                tracking_id,
                email,
                type,
                recipient_name,
                sent_at,
                opened_at,
                open_count,
                last_opened_at
            FROM email_tracking
            ORDER BY sent_at DESC
            LIMIT 50
        `).all();

        return {
            overview: stats,
            byType,
            recent,
        };
    } catch (err) {
        console.error('[Email Tracking] Failed to get stats:', err.message);
        return null;
    }
}

export function getEmailStatsDateRange(startDate, endDate) {
    try {
        const stats = db.prepare(`
            SELECT 
                COUNT(*) as total_sent,
                COUNT(opened_at) as total_opened,
                CAST(COUNT(opened_at) AS FLOAT) / COUNT(*) * 100 as open_rate,
                SUM(open_count) as total_opens
            FROM email_tracking
            WHERE sent_at >= ? AND sent_at <= ?
        `).get(startDate, endDate);

        const byType = db.prepare(`
            SELECT 
                type,
                COUNT(*) as sent,
                COUNT(opened_at) as opened,
                CAST(COUNT(opened_at) AS FLOAT) / COUNT(*) * 100 as open_rate
            FROM email_tracking
            WHERE sent_at >= ? AND sent_at <= ?
            GROUP BY type
        `).all(startDate, endDate);

        const daily = db.prepare(`
            SELECT 
                DATE(sent_at) as date,
                COUNT(*) as sent,
                COUNT(opened_at) as opened,
                CAST(COUNT(opened_at) AS FLOAT) / COUNT(*) * 100 as open_rate
            FROM email_tracking
            WHERE sent_at >= ? AND sent_at <= ?
            GROUP BY DATE(sent_at)
            ORDER BY date DESC
        `).all(startDate, endDate);

        return {
            overview: stats,
            byType,
            daily,
        };
    } catch (err) {
        console.error('[Email Tracking] Failed to get date range stats:', err.message);
        return null;
    }
}

// ── Blast Email ─────────────────────────────────────────
export async function sendBlastEmail(email, subject, content, displayName, lang = 'vi', saveTracking = null) {
    const trackingId = generateTrackingId();
    const html = baseTemplate(`
    <!-- Icon -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="width:44px; height:44px; background-color:#09090b; border:1px solid #27272a; border-radius:12px; text-align:center; vertical-align:middle; font-size:20px; line-height:44px;">
          &#128227;
        </td>
      </tr>
    </table>

    <!-- Title -->
    <h1 class="hero-title" style="margin:20px 0 8px; font-size:22px; font-weight:700; color:#fafafa; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; letter-spacing:-0.4px; line-height:1.3;">
      ${subject}
    </h1>

    <!-- Greeting -->
    <p style="margin:0 0 20px; font-size:14px; color:#a1a1aa; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; line-height:1.7;">
      ${t(lang, 'verifyEmailGreeting')} <strong style="color:#fafafa;">${displayName || (lang === 'vi' ? 'bạn' : 'there')}</strong>,
    </p>

    <!-- Content -->
    <div style="font-size:14px; color:#d4d4d8; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; line-height:1.8; padding:0 0 8px;">
      ${content.replace(/\n/g, '<br>')}
    </div>
  `, trackingId, lang);

    try {
        // Save tracking record if function provided
        if (saveTracking) {
            await saveTracking(trackingId, email, 'blast', displayName);
        }

        await transporter.sendMail({
            from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
            to: email,
            subject: `${subject} - NoteMinds`,
            html,
        });
        console.log(`[Email] Blast email sent to ${email} (tracking: ${trackingId})`);
        return { success: true, trackingId };
    } catch (err) {
        console.error(`[Email] Failed to send blast email to ${email}:`, err.message);
        throw err;
    }
}
