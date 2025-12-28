// Shared data models
export interface Contact {
  recordId: string;
  firstName?: string;
  lastName?: string;
  email: string; // Primary email address
  secondaryEmail?: string; // Secondary email (personal, backup, etc.)
  workEmail?: string; // Work/government email
  personalEmail?: string; // Personal email
  company?: string;
  jobTitle?: string;
  phone?: string;
  metadata: Record<string, any>;
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
  placeholders: string[];
}