import twilio from 'twilio';

// ─── Config ───────────────────────────────────────────────────────────────────

const TWILIO_SID    = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM   = process.env.TWILIO_PHONE_NUMBER;
const FRONTEND_URL  = process.env.FRONTEND_URL ?? 'http://localhost:3000';

/** True only when all three Twilio env vars are configured */
const smsEnabled = !!(TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM);

// Lazy-init Twilio client — only if credentials are present
let client: ReturnType<typeof twilio> | null = null;
function getClient() {
  if (!client && smsEnabled) {
    client = twilio(TWILIO_SID!, TWILIO_TOKEN!);
  }
  return client;
}

// ─── SmsService ───────────────────────────────────────────────────────────────

export class SmsService {
  /**
   * Sends a tracking link SMS to the patient after they are registered.
   * Safe to call unconditionally — silently no-ops if Twilio is not configured.
   *
   * @returns true if SMS was sent, false if skipped or failed
   */
  async sendTrackingLink(opts: {
    to: string;
    patientName: string;
    tokenNumber: number;
    clinicName: string;
  }): Promise<boolean> {
    if (!smsEnabled) {
      console.log(
        `[SMS] Skipped (Twilio not configured) — would send to ${opts.to} for token ${opts.tokenNumber}`,
      );
      return false;
    }

    const trackingUrl = `${FRONTEND_URL}/track/${opts.tokenNumber}`;
    const firstName = opts.patientName.split(' ')[0];

    const body = `Your ${opts.clinicName} token is #${opts.tokenNumber}. Track your wait live: ${trackingUrl}`;

    try {
      const msg = await getClient()!.messages.create({
        body,
        from: TWILIO_FROM!,
        to: opts.to,
      });

      console.log(`[SMS] Sent to ${opts.to} — SID: ${msg.sid}`);
      return true;
    } catch (err: any) {
      // Non-critical: log the error but never throw — SMS failure should
      // not block patient registration
      console.error(`[SMS] Failed to send to ${opts.to}:`, err.message ?? err);
      return false;
    }
  }

  /** Returns whether SMS is currently configured and active */
  isEnabled(): boolean {
    return smsEnabled;
  }
}

export const smsService = new SmsService();
