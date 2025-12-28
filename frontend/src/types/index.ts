// Data Models for Email Validation Service

export interface Contact {
  recordId: string;
  firstName?: string;
  lastName?: string;
  email: string;
  company?: string;
  jobTitle?: string;
  phone?: string;
  metadata: Record<string, any>; // Additional HubSpot fields
}

export interface ValidationResult {
  email: string;
  isValid: boolean;
  bounceType?: 'hard' | 'soft' | 'complaint';
  bounceReason?: string;
  validatedAt: Date;
}

export interface ValidationJob {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalContacts: number;
  processedContacts: number;
  validContacts: number;
  invalidContacts: number;
  createdAt: Date;
  completedAt?: Date;
  s3InputKey: string;
  s3OutputKeys?: {
    cleanList: string;
    rejectedList: string;
    report: string;
  };
}

export interface EmailTemplate {
  subject: string;
  htmlBody: string;
  textBody?: string;
  placeholders: string[]; // e.g., ['firstName', 'company']
}

// API Response Types
export interface UploadResponse {
  success: boolean;
  jobId?: string;
  totalContacts?: number;
  error?: string;
}

export interface ValidationStatus {
  job: ValidationJob;
  results?: ValidationResult[];
}

export interface SendResponse {
  success: boolean;
  sentCount: number;
  failedCount: number;
  errors?: string[];
}

// Extended API response types for bulk email sending
export interface BulkEmailSendResponse {
  totalAttempts: number;
  successCount: number;
  failureCount: number;
  results: EmailSendResult[];
  sesMetadata: {
    region: string;
    fromAddress: string;
    authenticatedSender: boolean;
  };
  reputationMetrics: {
    bounceRate: number;
    complaintRate: number;
  };
  templateMetadata: {
    placeholdersFound: string[];
    placeholdersSubstituted: string[];
  };
  throttlingMetadata: {
    configuredSendRate: number;
    actualSendRate: number;
    totalDuration: number;
  };
  quotaMetadata: {
    dailyQuotaUsed: number;
    dailyQuotaRemaining: number;
    sendingRateUsed: number;
  };
  errorSummary: {
    totalErrors: number;
    errorsByType: Record<string, number>;
    retryStatistics: {
      averageRetries: number;
      maxRetries: number;
      totalRetries: number;
    };
  };
}

export interface EmailSendResult {
  email: string;
  success: boolean;
  sentAt: Date;
  sesMessageId?: string;
  errorMessage?: string;
  errorDetails?: {
    errorCode: string;
    errorType: 'bounce' | 'complaint' | 'delivery' | 'sending' | 'quota' | 'authentication' | 'configuration';
    timestamp: Date;
    retryAttempts: number;
  };
  personalizedContent?: {
    subject: string;
    htmlBody: string;
    textBody: string;
  };
}