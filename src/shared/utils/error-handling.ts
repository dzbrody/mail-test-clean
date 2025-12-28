// Error handling and resilience utilities
import { ValidationResult, ValidationJob } from '../models';

export interface ErrorContext {
  operation: string;
  email?: string;
  jobId?: string;
  attempt?: number;
  originalError?: Error;
}

export interface ResilienceConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RESILIENCE_CONFIG: ResilienceConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2
};

/**
 * Categorizes bounce reasons into standard types
 */
export function categorizeBounceReason(error: Error | string, email: string): { bounceType: 'hard' | 'soft' | 'complaint', bounceReason: string } {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const lowerMessage = errorMessage.toLowerCase();
  
  // Hard bounce patterns - permanent failures
  if (lowerMessage.includes('invalid') || 
      lowerMessage.includes('format') || 
      lowerMessage.includes('domain') && lowerMessage.includes('not') ||
      lowerMessage.includes('nonexistent') ||
      lowerMessage.includes('permanent')) {
    return {
      bounceType: 'hard',
      bounceReason: `Hard bounce: ${errorMessage}`
    };
  }
  
  // Complaint patterns - spam/abuse
  if (lowerMessage.includes('complaint') || 
      lowerMessage.includes('spam') || 
      lowerMessage.includes('abuse') ||
      lowerMessage.includes('blocked')) {
    return {
      bounceType: 'complaint',
      bounceReason: `Complaint: ${errorMessage}`
    };
  }
  
  // Soft bounce patterns - temporary failures (default)
  return {
    bounceType: 'soft',
    bounceReason: `Soft bounce: ${errorMessage}`
  };
}

/**
 * Implements exponential backoff with jitter
 */
export async function exponentialBackoffWithJitter(
  attempt: number, 
  config: ResilienceConfig = DEFAULT_RESILIENCE_CONFIG
): Promise<void> {
  if (attempt >= config.maxRetries) {
    return;
  }
  
  const baseDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const jitter = Math.random() * 0.1 * baseDelay; // 10% jitter
  const delay = Math.min(baseDelay + jitter, config.maxDelayMs);
  
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Executes an operation with retry logic and error resilience
 */
export async function executeWithResilience<T>(
  operation: () => Promise<T>,
  context: ErrorContext,
  config: ResilienceConfig = DEFAULT_RESILIENCE_CONFIG
): Promise<T> {
  let lastError: Error = new Error('Unknown error');
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Log error for monitoring
      console.warn(`Operation failed (attempt ${attempt + 1}/${config.maxRetries + 1})`, {
        ...context,
        attempt: attempt + 1,
        error: lastError.message
      });
      
      // Don't retry on the last attempt
      if (attempt === config.maxRetries) {
        break;
      }
      
      // Apply exponential backoff
      await exponentialBackoffWithJitter(attempt, config);
    }
  }
  
  // If all retries failed, throw the last error
  throw new Error(`Operation failed after ${config.maxRetries + 1} attempts: ${lastError.message}`);
}

/**
 * Processes emails with error resilience - continues processing even if individual emails fail
 */
export async function processEmailsWithResilience<T>(
  emails: string[],
  processor: (email: string) => Promise<T>,
  context: Omit<ErrorContext, 'email'>
): Promise<{ results: T[], errors: Array<{ email: string, error: Error }> }> {
  const results: T[] = [];
  const errors: Array<{ email: string, error: Error }> = [];
  
  for (const email of emails) {
    try {
      const result = await processor(email);
      results.push(result);
    } catch (error) {
      const errorObj = error as Error;
      errors.push({ email, error: errorObj });
      
      // Log individual email failure but continue processing
      console.warn('Email processing failed, continuing with next email', {
        ...context,
        email,
        error: errorObj.message
      });
    }
  }
  
  return { results, errors };
}

/**
 * Creates a validation result for failed email processing
 */
export function createFailedValidationResult(email: string, error: Error): ValidationResult {
  const { bounceType, bounceReason } = categorizeBounceReason(error, email);
  
  return {
    email,
    isValid: false,
    bounceType,
    bounceReason,
    validatedAt: new Date()
  };
}

/**
 * Validates and sanitizes email input to prevent processing errors
 */
export function sanitizeEmailInput(email: any): string | null {
  if (!email) {
    return null;
  }
  
  if (typeof email !== 'string') {
    return null;
  }
  
  const trimmed = email.trim();
  if (trimmed === '') {
    return null;
  }
  
  return trimmed;
}

/**
 * Creates a comprehensive error report for validation failures
 */
export function createErrorReport(
  errors: Array<{ email: string, error: Error }>,
  context: ErrorContext
): {
  totalErrors: number;
  errorsByType: Record<string, number>;
  errorsByBounceType: Record<string, number>;
  detailedErrors: Array<{ email: string, bounceType: string, bounceReason: string }>;
} {
  const errorsByType: Record<string, number> = {};
  const errorsByBounceType: Record<string, number> = {};
  const detailedErrors: Array<{ email: string, bounceType: string, bounceReason: string }> = [];
  
  errors.forEach(({ email, error }) => {
    // Count by error type
    const errorType = error.constructor.name;
    errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
    
    // Categorize bounce and count by bounce type
    const { bounceType, bounceReason } = categorizeBounceReason(error, email);
    errorsByBounceType[bounceType] = (errorsByBounceType[bounceType] || 0) + 1;
    
    detailedErrors.push({
      email,
      bounceType,
      bounceReason
    });
  });
  
  return {
    totalErrors: errors.length,
    errorsByType,
    errorsByBounceType,
    detailedErrors
  };
}

/**
 * Resume validation from a specific point
 */
export interface ValidationCheckpoint {
  jobId: string;
  processedEmails: string[];
  lastProcessedIndex: number;
  validationResults: ValidationResult[];
  timestamp: Date;
}

/**
 * Creates a checkpoint for resuming validation
 */
export function createValidationCheckpoint(
  jobId: string,
  processedEmails: string[],
  results: ValidationResult[]
): ValidationCheckpoint {
  return {
    jobId,
    processedEmails: [...processedEmails],
    lastProcessedIndex: processedEmails.length - 1,
    validationResults: [...results],
    timestamp: new Date()
  };
}

/**
 * Resumes validation from a checkpoint
 */
export function getEmailsToResume(
  allEmails: string[],
  checkpoint: ValidationCheckpoint
): string[] {
  const processedSet = new Set(checkpoint.processedEmails);
  return allEmails.filter(email => !processedSet.has(email));
}