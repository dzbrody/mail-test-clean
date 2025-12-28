// Notification utilities for job completion
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { sesClient } from './aws-clients';
import { ValidationJob } from '../models';
import { generateValidationReport } from './progress-tracker';

export interface NotificationConfig {
  recipientEmail: string;
  senderEmail: string;
  jobCompletionTemplate?: EmailTemplate;
  jobFailureTemplate?: EmailTemplate;
}

export interface EmailTemplate {
  subject: string;
  htmlBody: string;
  textBody?: string;
}

/**
 * Send job completion notification
 */
export async function sendJobCompletionNotification(
  job: ValidationJob,
  config: NotificationConfig
): Promise<void> {
  try {
    const report = await generateValidationReport(job.jobId);
    const template = config.jobCompletionTemplate || getDefaultCompletionTemplate();
    
    const subject = template.subject
      .replace('{{jobId}}', job.jobId)
      .replace('{{totalContacts}}', job.totalContacts.toString());
    
    const htmlBody = template.htmlBody
      .replace('{{jobId}}', job.jobId)
      .replace('{{totalContacts}}', job.totalContacts.toString())
      .replace('{{validContacts}}', job.validContacts.toString())
      .replace('{{invalidContacts}}', job.invalidContacts.toString())
      .replace('{{successRate}}', report ? report.successRate.toFixed(1) : '0')
      .replace('{{processingTime}}', report ? formatProcessingTime(report.processingTime) : 'Unknown');
    
    const textBody = template.textBody
      ?.replace('{{jobId}}', job.jobId)
      .replace('{{totalContacts}}', job.totalContacts.toString())
      .replace('{{validContacts}}', job.validContacts.toString())
      .replace('{{invalidContacts}}', job.invalidContacts.toString())
      .replace('{{successRate}}', report ? report.successRate.toFixed(1) : '0')
      .replace('{{processingTime}}', report ? formatProcessingTime(report.processingTime) : 'Unknown');
    
    await sendEmail(config.recipientEmail, config.senderEmail, subject, htmlBody, textBody);
    
    console.log(`Job completion notification sent for job ${job.jobId}`);
  } catch (error) {
    console.error('Failed to send job completion notification:', error);
    // Don't throw error - notification failure shouldn't break the main process
  }
}

/**
 * Send job failure notification
 */
export async function sendJobFailureNotification(
  job: ValidationJob,
  error: string,
  config: NotificationConfig
): Promise<void> {
  try {
    const template = config.jobFailureTemplate || getDefaultFailureTemplate();
    
    const subject = template.subject
      .replace('{{jobId}}', job.jobId)
      .replace('{{totalContacts}}', job.totalContacts.toString());
    
    const htmlBody = template.htmlBody
      .replace('{{jobId}}', job.jobId)
      .replace('{{totalContacts}}', job.totalContacts.toString())
      .replace('{{error}}', error)
      .replace('{{createdAt}}', job.createdAt.toISOString());
    
    const textBody = template.textBody
      ?.replace('{{jobId}}', job.jobId)
      .replace('{{totalContacts}}', job.totalContacts.toString())
      .replace('{{error}}', error)
      .replace('{{createdAt}}', job.createdAt.toISOString());
    
    await sendEmail(config.recipientEmail, config.senderEmail, subject, htmlBody, textBody);
    
    console.log(`Job failure notification sent for job ${job.jobId}`);
  } catch (error) {
    console.error('Failed to send job failure notification:', error);
    // Don't throw error - notification failure shouldn't break the main process
  }
}

/**
 * Send email using SES
 */
async function sendEmail(
  recipientEmail: string,
  senderEmail: string,
  subject: string,
  htmlBody: string,
  textBody?: string
): Promise<void> {
  const command = new SendEmailCommand({
    Source: senderEmail,
    Destination: {
      ToAddresses: [recipientEmail]
    },
    Message: {
      Subject: {
        Data: subject,
        Charset: 'UTF-8'
      },
      Body: {
        Html: {
          Data: htmlBody,
          Charset: 'UTF-8'
        },
        ...(textBody && {
          Text: {
            Data: textBody,
            Charset: 'UTF-8'
          }
        })
      }
    }
  });
  
  await sesClient.send(command);
}

/**
 * Get default job completion email template
 */
function getDefaultCompletionTemplate(): EmailTemplate {
  return {
    subject: 'Email Validation Complete - Job {{jobId}}',
    htmlBody: `
      <html>
        <body>
          <h2>Email Validation Complete</h2>
          <p>Your email validation job has been completed successfully.</p>
          
          <h3>Job Details:</h3>
          <ul>
            <li><strong>Job ID:</strong> {{jobId}}</li>
            <li><strong>Total Contacts:</strong> {{totalContacts}}</li>
            <li><strong>Valid Contacts:</strong> {{validContacts}}</li>
            <li><strong>Invalid Contacts:</strong> {{invalidContacts}}</li>
            <li><strong>Success Rate:</strong> {{successRate}}%</li>
            <li><strong>Processing Time:</strong> {{processingTime}}</li>
          </ul>
          
          <p>You can now download your clean contact list and validation report from the dashboard.</p>
          
          <p>Thank you for using our Email Validation Service!</p>
        </body>
      </html>
    `,
    textBody: `
Email Validation Complete

Your email validation job has been completed successfully.

Job Details:
- Job ID: {{jobId}}
- Total Contacts: {{totalContacts}}
- Valid Contacts: {{validContacts}}
- Invalid Contacts: {{invalidContacts}}
- Success Rate: {{successRate}}%
- Processing Time: {{processingTime}}

You can now download your clean contact list and validation report from the dashboard.

Thank you for using our Email Validation Service!
    `
  };
}

/**
 * Get default job failure email template
 */
function getDefaultFailureTemplate(): EmailTemplate {
  return {
    subject: 'Email Validation Failed - Job {{jobId}}',
    htmlBody: `
      <html>
        <body>
          <h2>Email Validation Failed</h2>
          <p>Unfortunately, your email validation job encountered an error and could not be completed.</p>
          
          <h3>Job Details:</h3>
          <ul>
            <li><strong>Job ID:</strong> {{jobId}}</li>
            <li><strong>Total Contacts:</strong> {{totalContacts}}</li>
            <li><strong>Created At:</strong> {{createdAt}}</li>
            <li><strong>Error:</strong> {{error}}</li>
          </ul>
          
          <p>Please try uploading your file again. If the problem persists, please contact support.</p>
          
          <p>We apologize for the inconvenience.</p>
        </body>
      </html>
    `,
    textBody: `
Email Validation Failed

Unfortunately, your email validation job encountered an error and could not be completed.

Job Details:
- Job ID: {{jobId}}
- Total Contacts: {{totalContacts}}
- Created At: {{createdAt}}
- Error: {{error}}

Please try uploading your file again. If the problem persists, please contact support.

We apologize for the inconvenience.
    `
  };
}

/**
 * Format processing time in a human-readable format
 */
function formatProcessingTime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}