// SMTP configuration for AWS SES email sending
export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean; // true for SSL (port 465), false for STARTTLS (port 587)
  auth: {
    user: string;
    pass: string;
  };
  from: {
    address: string;
    name: string;
  };
}

/**
 * Gets SMTP configuration from environment variables
 * Uses AWS SES SMTP endpoint in us-east-1 region
 */
export function getSMTPConfig(): SMTPConfig {
  // Use environment variables for security
  const smtpUser = process.env.SMTP_USERNAME;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const fromAddress = process.env.FROM_EMAIL_ADDRESS || 'no-reply@xgccloud.com';
  const fromName = process.env.FROM_EMAIL_NAME || 'XGC Cloud';
  
  if (!smtpUser || !smtpPassword) {
    throw new Error('SMTP credentials not configured. Set SMTP_USERNAME and SMTP_PASSWORD environment variables.');
  }
  
  return {
    host: 'email-smtp.us-east-1.amazonaws.com',
    port: 587, // STARTTLS (recommended by AWS)
    secure: false, // false for STARTTLS, true for SSL
    auth: {
      user: smtpUser,
      pass: smtpPassword
    },
    from: {
      address: fromAddress,
      name: fromName
    }
  };
}

/**
 * Validates SMTP configuration
 */
export function validateSMTPConfig(config: SMTPConfig): boolean {
  if (!config.host || !config.port) {
    return false;
  }
  
  if (!config.auth.user || !config.auth.pass) {
    return false;
  }
  
  if (!config.from.address) {
    return false;
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(config.from.address)) {
    return false;
  }
  
  return true;
}

/**
 * Production SMTP configuration constants
 * These should be set as environment variables in production
 */
export const PRODUCTION_SMTP_CONSTANTS = {
  HOST: 'email-smtp.us-east-1.amazonaws.com',
  PORT_STARTTLS: 587,
  PORT_SSL: 465,
  REGION: 'us-east-1',
  // Note: Actual credentials should be stored in environment variables or AWS Secrets Manager
  // SMTP_USERNAME: 'AKIAQE3ROVJ3E4V46DJF' // Set as environment variable
  // SMTP_PASSWORD: 'j2RKQnVuWRHFFf2JG2vq7dAKMG67GqqapqCHJrWrArQ=' // Set as environment variable
} as const;