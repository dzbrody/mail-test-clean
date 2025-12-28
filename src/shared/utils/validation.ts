// Data validation utilities
import { Contact, ValidationResult, ValidationJob, EmailTemplate } from '../models';

/**
 * Validates email format using RFC 5322 compliant regex
 */
export function isValidEmailFormat(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  // RFC 5322 compliant email regex (simplified but robust)
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  return emailRegex.test(email.trim());
}

/**
 * Validates Contact object structure and required fields
 */
export function validateContact(contact: any): contact is Contact {
  if (!contact || typeof contact !== 'object') {
    return false;
  }
  
  // Required fields
  if (!contact.recordId || typeof contact.recordId !== 'string' || contact.recordId.trim() === '') {
    return false;
  }
  
  if (!contact.email || typeof contact.email !== 'string') {
    return false;
  }
  
  if (!isValidEmailFormat(contact.email)) {
    return false;
  }
  
  // Optional email fields validation
  if (contact.secondaryEmail !== undefined && contact.secondaryEmail !== null) {
    if (typeof contact.secondaryEmail !== 'string' || !isValidEmailFormat(contact.secondaryEmail)) {
      return false;
    }
  }
  
  if (contact.workEmail !== undefined && contact.workEmail !== null) {
    if (typeof contact.workEmail !== 'string' || !isValidEmailFormat(contact.workEmail)) {
      return false;
    }
  }
  
  if (contact.personalEmail !== undefined && contact.personalEmail !== null) {
    if (typeof contact.personalEmail !== 'string' || !isValidEmailFormat(contact.personalEmail)) {
      return false;
    }
  }
  
  // Optional fields type checking
  if (contact.firstName !== undefined && contact.firstName !== null && typeof contact.firstName !== 'string') {
    return false;
  }
  
  if (contact.lastName !== undefined && contact.lastName !== null && typeof contact.lastName !== 'string') {
    return false;
  }
  
  if (contact.company !== undefined && contact.company !== null && typeof contact.company !== 'string') {
    return false;
  }
  
  if (contact.jobTitle !== undefined && contact.jobTitle !== null && typeof contact.jobTitle !== 'string') {
    return false;
  }
  
  if (contact.phone !== undefined && contact.phone !== null && typeof contact.phone !== 'string') {
    return false;
  }
  
  if (contact.metadata !== undefined && (typeof contact.metadata !== 'object' || contact.metadata === null)) {
    return false;
  }
  
  return true;
}

/**
 * Validates ValidationResult object structure
 */
export function validateValidationResult(result: any): result is ValidationResult {
  if (!result || typeof result !== 'object') {
    return false;
  }
  
  if (!result.email || typeof result.email !== 'string') {
    return false;
  }
  
  if (!isValidEmailFormat(result.email)) {
    return false;
  }
  
  if (typeof result.isValid !== 'boolean') {
    return false;
  }
  
  if (result.bounceType !== undefined && !['hard', 'soft', 'complaint'].includes(result.bounceType)) {
    return false;
  }
  
  if (result.bounceReason !== undefined && typeof result.bounceReason !== 'string') {
    return false;
  }
  
  if (!(result.validatedAt instanceof Date) && typeof result.validatedAt !== 'string') {
    return false;
  }
  
  return true;
}

/**
 * Validates ValidationJob object structure
 */
export function validateValidationJob(job: any): job is ValidationJob {
  if (!job || typeof job !== 'object') {
    return false;
  }
  
  if (!job.jobId || typeof job.jobId !== 'string') {
    return false;
  }
  
  if (!['pending', 'processing', 'completed', 'failed'].includes(job.status)) {
    return false;
  }
  
  if (typeof job.totalContacts !== 'number' || job.totalContacts < 0) {
    return false;
  }
  
  if (typeof job.processedContacts !== 'number' || job.processedContacts < 0) {
    return false;
  }
  
  if (typeof job.validContacts !== 'number' || job.validContacts < 0) {
    return false;
  }
  
  if (typeof job.invalidContacts !== 'number' || job.invalidContacts < 0) {
    return false;
  }
  
  if (!(job.createdAt instanceof Date) && typeof job.createdAt !== 'string') {
    return false;
  }
  
  if (job.completedAt !== undefined && !(job.completedAt instanceof Date) && typeof job.completedAt !== 'string') {
    return false;
  }
  
  if (!job.s3InputKey || typeof job.s3InputKey !== 'string') {
    return false;
  }
  
  return true;
}

/**
 * Validates EmailTemplate object structure
 */
export function validateEmailTemplate(template: any): template is EmailTemplate {
  if (!template || typeof template !== 'object') {
    return false;
  }
  
  if (!template.subject || typeof template.subject !== 'string') {
    return false;
  }
  
  if (!template.htmlBody || typeof template.htmlBody !== 'string') {
    return false;
  }
  
  if (template.textBody !== undefined && typeof template.textBody !== 'string') {
    return false;
  }
  
  if (!Array.isArray(template.placeholders)) {
    return false;
  }
  
  if (!template.placeholders.every((p: any) => typeof p === 'string')) {
    return false;
  }
  
  return true;
}

/**
 * Gets all email addresses from a contact (primary, secondary, work, personal)
 */
export function getAllEmailsFromContact(contact: Contact): string[] {
  const emails: string[] = [];
  
  if (contact.email) {
    emails.push(contact.email);
  }
  
  if (contact.secondaryEmail) {
    emails.push(contact.secondaryEmail);
  }
  
  if (contact.workEmail) {
    emails.push(contact.workEmail);
  }
  
  if (contact.personalEmail) {
    emails.push(contact.personalEmail);
  }
  
  // Remove duplicates
  return [...new Set(emails)];
}

/**
 * Validates file type and size constraints
 */
export function validateFileConstraints(file: { type: string; size: number }, maxSize: number, allowedTypes: string[]): { isValid: boolean; error?: string } {
  if (!allowedTypes.includes(file.type)) {
    return {
      isValid: false,
      error: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`
    };
  }
  
  if (file.size > maxSize) {
    return {
      isValid: false,
      error: `File size exceeds maximum allowed size of ${Math.round(maxSize / 1024 / 1024)}MB`
    };
  }
  
  return { isValid: true };
}