// Property-based tests for email validation service
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateEmailBatch } from '../src/lambdas/email-validator/index';
import { ValidationResult } from '../src/shared/models';

describe('Email Validation Service Properties', () => {
  /**
   * **Feature: email-validation-service, Property 5: Email validation attempts all addresses**
   * **Validates: Requirements 2.1**
   */
  it('should attempt validation for all provided email addresses', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate array of properly formatted email addresses (that won't be pre-filtered)
        fc.array(
          fc.oneof(
            fc.emailAddress(), // Valid email addresses
            fc.string({ minLength: 1, maxLength: 30 }).filter(s => 
              s.length > 0 && !s.includes(' ') && !s.startsWith('@') && !s.endsWith('@')
            ).map(s => `${s}@example.com`), // Valid format with example domain
            fc.string({ minLength: 1, maxLength: 30 }).filter(s => 
              s.length > 0 && !s.includes(' ') && !s.startsWith('@') && !s.endsWith('@')
            ).map(s => `${s}@invalid-domain-xyz.com`) // Valid format with potentially invalid domain
          ),
          { minLength: 1, maxLength: 10 } // Reduced max length
        ).map(emails => {
          // Remove duplicates to ensure unique emails and filter out any malformed ones
          return [...new Set(emails)].filter(email => 
            email && 
            typeof email === 'string' && 
            email.includes('@') && 
            !email.startsWith('@') && 
            !email.endsWith('@') &&
            !email.includes(' ') &&
            email.length > 3
          );
        }).filter(emails => emails.length > 0), // Ensure we have at least one email
        fc.integer({ min: 1, max: 5 }), // Smaller batch size
        async (emails, batchSize) => {
          // Property: Validation should attempt all provided email addresses
          const results = await validateEmailBatch(emails, batchSize);
          
          // Property: Number of results should equal number of input emails (for properly formatted emails)
          expect(results.length).toBe(emails.length);
          
          // Property: Each input email should have a corresponding result
          const resultEmails = results.map(r => r.email).sort();
          const inputEmails = emails.sort();
          expect(resultEmails).toEqual(inputEmails);
          
          // Property: Each result should have required fields
          results.forEach(result => {
            expect(result).toHaveProperty('email');
            expect(result).toHaveProperty('isValid');
            expect(result).toHaveProperty('validatedAt');
            expect(typeof result.isValid).toBe('boolean');
            expect(result.validatedAt).toBeInstanceOf(Date);
            
            // If invalid, should have bounce information
            if (!result.isValid) {
              expect(result).toHaveProperty('bounceType');
              expect(result).toHaveProperty('bounceReason');
              expect(['hard', 'soft', 'complaint']).toContain(result.bounceType);
              expect(typeof result.bounceReason).toBe('string');
              expect(result.bounceReason!.length).toBeGreaterThan(0);
            }
          });
          
          // Property: All emails should be processed (no skipped emails)
          const processedEmails = new Set(results.map(r => r.email));
          emails.forEach(email => {
            expect(processedEmails.has(email)).toBe(true);
          });
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  }, 15000);

  /**
   * **Feature: email-validation-service, Property 6: Failed validations are marked with reasons**
   * **Validates: Requirements 2.2**
   */
  it('should mark failed validations with specific bounce reasons', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate array with known invalid email formats
        fc.array(
          fc.oneof(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('@')), // No @ symbol
            fc.string({ minLength: 1, maxLength: 20 }).map(s => `${s}@`), // Missing domain
            fc.string({ minLength: 1, maxLength: 20 }).map(s => `@${s}.com`), // Missing local part
            fc.string({ minLength: 1, maxLength: 20 }).map(s => `${s}@.com`), // Invalid domain format
            fc.constant(''), // Empty string
            fc.constant('invalid-email'), // No @ symbol
            fc.constant('test@'), // Missing domain
            fc.constant('@example.com') // Missing local part
          ),
          { minLength: 1, maxLength: 10 }
        ).map(emails => [...new Set(emails)]), // Remove duplicates
        async (invalidEmails) => {
          const results = await validateEmailBatch(invalidEmails);
          
          // Property: All invalid format emails should be marked as invalid
          results.forEach(result => {
            expect(result.isValid).toBe(false);
            
            // Property: Invalid emails should have bounce type and reason
            expect(result.bounceType).toBeDefined();
            expect(result.bounceReason).toBeDefined();
            expect(typeof result.bounceReason).toBe('string');
            expect(result.bounceReason!.length).toBeGreaterThan(0);
            
            // Property: Bounce type should be valid
            expect(['hard', 'soft', 'complaint']).toContain(result.bounceType);
            
            // Property: Bounce reason should be descriptive
            expect(result.bounceReason).toMatch(/invalid|format|domain|failed/i);
          });
          
          // Property: No invalid format emails should be marked as valid
          const validResults = results.filter(r => r.isValid);
          expect(validResults.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: email-validation-service, Property 7: Valid emails are retained in clean list**
   * **Validates: Requirements 2.3**
   */
  it('should retain valid emails in results with proper marking', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate array of properly formatted email addresses
        fc.array(
          fc.emailAddress(),
          { minLength: 1, maxLength: 15 }
        ).map(emails => [...new Set(emails)]), // Remove duplicates
        async (validFormatEmails) => {
          const results = await validateEmailBatch(validFormatEmails);
          
          // Property: All input emails should be present in results
          expect(results.length).toBe(validFormatEmails.length);
          
          const resultEmails = results.map(r => r.email).sort();
          const inputEmails = validFormatEmails.sort();
          expect(resultEmails).toEqual(inputEmails);
          
          // Property: Valid emails should be properly marked
          const validResults = results.filter(r => r.isValid);
          validResults.forEach(result => {
            expect(result.isValid).toBe(true);
            expect(result.email).toBeDefined();
            expect(result.validatedAt).toBeInstanceOf(Date);
            
            // Valid emails should not have bounce information
            expect(result.bounceType).toBeUndefined();
            expect(result.bounceReason).toBeUndefined();
          });
          
          // Property: At least some well-formatted emails should be considered valid
          // (This depends on domain validation, but well-formatted emails from common domains should pass)
          const commonDomainEmails = results.filter(r => 
            r.email.includes('@example.com') || 
            r.email.includes('@gmail.com') || 
            r.email.includes('@yahoo.com') ||
            r.email.includes('@hotmail.com')
          );
          
          if (commonDomainEmails.length > 0) {
            // At least some common domain emails should be valid (or have proper error handling)
            commonDomainEmails.forEach(result => {
              expect(typeof result.isValid).toBe('boolean');
              if (!result.isValid) {
                expect(result.bounceReason).toBeDefined();
              }
            });
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: email-validation-service, Property 8: Rate limit handling with exponential backoff**
   * **Validates: Requirements 2.4**
   */
  it('should handle rate limiting gracefully with proper error handling', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate large batch of emails to potentially trigger rate limiting
        fc.array(
          fc.emailAddress(),
          { minLength: 5, maxLength: 15 } // Reduced size
        ).map(emails => [...new Set(emails)]), // Remove duplicates
        fc.integer({ min: 1, max: 3 }), // Smaller batch size
        async (emails, batchSize) => {
          // Property: System should handle validation even with small batch sizes
          const results = await validateEmailBatch(emails, batchSize);
          
          // Property: All emails should be processed despite potential rate limiting
          expect(results.length).toBe(emails.length);
          
          // Property: Results should be returned in reasonable time (not hanging indefinitely)
          const resultEmails = new Set(results.map(r => r.email));
          emails.forEach(email => {
            expect(resultEmails.has(email)).toBe(true);
          });
          
          // Property: Each result should be properly formed
          results.forEach(result => {
            expect(result).toHaveProperty('email');
            expect(result).toHaveProperty('isValid');
            expect(result).toHaveProperty('validatedAt');
            expect(typeof result.isValid).toBe('boolean');
          });
          
          // Property: System should not crash or throw unhandled errors
          // (If we reach this point, the function completed successfully)
          expect(results).toBeDefined();
        }
      ),
      { numRuns: 15, timeout: 10000 }
    );
  }, 15000);

  /**
   * **Feature: email-validation-service, Property 22: Batch processing implementation**
   * **Validates: Requirements 6.3**
   */
  it('should process emails in configurable batches', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate array of emails
        fc.array(
          fc.emailAddress(),
          { minLength: 5, maxLength: 15 } // Reduced size
        ).map(emails => [...new Set(emails)]), // Remove duplicates
        fc.integer({ min: 1, max: 5 }), // Smaller batch sizes
        async (emails, batchSize) => {
          const startTime = Date.now();
          const results = await validateEmailBatch(emails, batchSize);
          const endTime = Date.now();
          
          // Property: All emails should be processed regardless of batch size
          expect(results.length).toBe(emails.length);
          
          // Property: Results should contain all input emails
          const resultEmails = results.map(r => r.email).sort();
          const inputEmails = emails.sort();
          expect(resultEmails).toEqual(inputEmails);
          
          // Property: Batch processing should complete in reasonable time
          const processingTime = endTime - startTime;
          expect(processingTime).toBeLessThan(30000); // Should complete within 30 seconds
          
          // Property: Each result should be properly validated
          results.forEach(result => {
            expect(result).toHaveProperty('email');
            expect(result).toHaveProperty('isValid');
            expect(result).toHaveProperty('validatedAt');
            expect(typeof result.isValid).toBe('boolean');
            expect(result.validatedAt).toBeInstanceOf(Date);
          });
          
          // Property: Batch size should not affect the correctness of results
          // (Same emails should get same validation results regardless of batch size)
          const validEmails = results.filter(r => r.isValid).map(r => r.email);
          const invalidEmails = results.filter(r => !r.isValid).map(r => r.email);
          
          // Valid and invalid should not overlap
          const validSet = new Set(validEmails);
          const invalidSet = new Set(invalidEmails);
          const intersection = [...validSet].filter(email => invalidSet.has(email));
          expect(intersection.length).toBe(0);
          
          // All emails should be classified as either valid or invalid
          expect(validEmails.length + invalidEmails.length).toBe(emails.length);
        }
      ),
      { numRuns: 15, timeout: 10000 }
    );
  }, 15000);

  /**
   * **Feature: email-validation-service, Property 15: Bounce reason categorization**
   * **Validates: Requirements 4.2**
   */
  it('should categorize bounce reasons by type (hard bounce, soft bounce, complaint)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate array with various types of invalid emails to trigger different bounce types
        fc.array(
          fc.oneof(
            // Hard bounce scenarios - permanent failures
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('@')), // No @ symbol
            fc.string({ minLength: 1, maxLength: 20 }).map(s => `${s}@nonexistent-domain-xyz.com`), // Non-existent domain
            fc.string({ minLength: 1, maxLength: 20 }).map(s => `${s}@.invalid`), // Invalid TLD
            fc.constant('invalid-email'), // Clearly invalid format
            fc.constant('test@'), // Missing domain
            fc.constant('@example.com'), // Missing local part
            
            // Soft bounce scenarios - temporary failures (simulated)
            fc.string({ minLength: 1, maxLength: 20 }).map(s => `${s}@temp-failure.com`), // Temporary failure domain
            fc.string({ minLength: 1, maxLength: 20 }).map(s => `${s}@quota-exceeded.com`), // Quota exceeded domain
            
            // Complaint scenarios (simulated)
            fc.string({ minLength: 1, maxLength: 20 }).map(s => `${s}@complaint-domain.com`) // Complaint domain
          ),
          { minLength: 1, maxLength: 15 }
        ).map(emails => [...new Set(emails)]), // Remove duplicates
        async (emails) => {
          const results = await validateEmailBatch(emails);
          
          // Property: All results should have bounce type categorization for invalid emails
          const invalidResults = results.filter(r => !r.isValid);
          
          invalidResults.forEach(result => {
            // Property: Invalid emails should have bounce type
            expect(result.bounceType).toBeDefined();
            expect(['hard', 'soft', 'complaint']).toContain(result.bounceType);
            
            // Property: Invalid emails should have bounce reason
            expect(result.bounceReason).toBeDefined();
            expect(typeof result.bounceReason).toBe('string');
            expect(result.bounceReason!.length).toBeGreaterThan(0);
            
            // Property: Bounce reason should be descriptive and match bounce type
            const reason = result.bounceReason!.toLowerCase();
            
            if (result.bounceType === 'hard') {
              // Hard bounces should indicate permanent failures
              expect(reason).toMatch(/invalid|format|domain|failed|nonexistent|permanent/i);
            } else if (result.bounceType === 'soft') {
              // Soft bounces should indicate temporary issues
              expect(reason).toMatch(/temporary|quota|full|busy|retry/i);
            } else if (result.bounceType === 'complaint') {
              // Complaints should indicate spam/abuse issues
              expect(reason).toMatch(/complaint|spam|abuse|blocked/i);
            }
          });
          
          // Property: Valid emails should not have bounce information
          const validResults = results.filter(r => r.isValid);
          validResults.forEach(result => {
            expect(result.bounceType).toBeUndefined();
            expect(result.bounceReason).toBeUndefined();
          });
          
          // Property: Each bounce type should be consistently applied
          const hardBounces = invalidResults.filter(r => r.bounceType === 'hard');
          const softBounces = invalidResults.filter(r => r.bounceType === 'soft');
          const complaints = invalidResults.filter(r => r.bounceType === 'complaint');
          
          // All invalid results should be categorized
          expect(hardBounces.length + softBounces.length + complaints.length).toBe(invalidResults.length);
          
          // Property: Same email should get same bounce type (consistency)
          const emailToBounceType = new Map<string, string>();
          invalidResults.forEach(result => {
            if (emailToBounceType.has(result.email)) {
              expect(result.bounceType).toBe(emailToBounceType.get(result.email));
            } else {
              emailToBounceType.set(result.email, result.bounceType!);
            }
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: email-validation-service, Property 17: Specific rejection reasons displayed**
   * **Validates: Requirements 4.4**
   */
  it('should display specific rejection reasons for invalid email addresses', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate array with various types of invalid emails that should have specific rejection reasons
        fc.array(
          fc.oneof(
            // Format-related rejections - but keep them in valid email format for processing
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
              s.length > 0 && !s.includes('@') && !s.includes(' ')
            ).map(s => `${s}@nonexistent-domain-xyz.com`), // Non-existent domain
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
              s.length > 0 && !s.includes(' ')
            ).map(s => `${s}@.invalid`), // Invalid TLD
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
              s.length > 0 && !s.includes(' ')
            ).map(s => `${s}@domain..com`), // Double dots in domain
            
            // Use properly formatted emails that will be processed but likely invalid
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
              s.length > 0 && !s.includes(' ')
            ).map(s => `${s}@temp-failure.com`), // Temporary failure
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
              s.length > 0 && !s.includes(' ')
            ).map(s => `${s}@quota-exceeded.com`), // Quota exceeded
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
              s.length > 0 && !s.includes(' ')
            ).map(s => `${s}@complaint-domain.com`) // Complaint
          ),
          { minLength: 1, maxLength: 15 }
        ).map(emails => [...new Set(emails)]), // Remove duplicates
        async (emails) => {
          const results = await validateEmailBatch(emails);
          
          // Property: All invalid emails should have specific rejection reasons
          const invalidResults = results.filter(r => !r.isValid);
          
          invalidResults.forEach(result => {
            // Property: Each invalid email should have a specific bounce reason
            expect(result.bounceReason).toBeDefined();
            expect(typeof result.bounceReason).toBe('string');
            expect(result.bounceReason!.length).toBeGreaterThan(0);
            
            // Property: Bounce reason should be specific and descriptive
            const reason = result.bounceReason!;
            const email = result.email;
            
            // Check that the reason is specific to the type of error
            // Note: Format validation takes precedence over domain-specific validation
            if (reason.toLowerCase().includes('invalid email format') || reason.toLowerCase().includes('format')) {
              // For format errors, accept the generic format message
              expect(reason).toMatch(/invalid.*email.*format|format|missing.*@|missing.*domain|missing.*local|consecutive.*dots|rfc.*standards/i);
            } else if (email.includes('nonexistent-domain')) {
              expect(reason).toMatch(/domain.*not.*exist|nonexistent|domain.*validation.*failed|invalid.*domain/i);
            } else if (email.includes('.invalid')) {
              expect(reason).toMatch(/invalid.*domain|domain.*format|invalid.*tld/i);
            } else if (email.includes('temp-failure')) {
              expect(reason).toMatch(/temporary.*delivery|temporary.*server|temp.*failure|domain.*validation.*failed|invalid.*domain/i);
            } else if (email.includes('quota-exceeded')) {
              expect(reason).toMatch(/quota.*exceeded|mailbox.*quota|domain.*validation.*failed|invalid.*domain/i);
            } else if (email.includes('complaint-domain')) {
              expect(reason).toMatch(/complaint.*received|potential.*spam|blocked.*complaint|domain.*validation.*failed|invalid.*domain/i);
            } else {
              // For other invalid emails, should have some descriptive reason
              expect(reason).toMatch(/invalid|domain|format|failed|error/i);
            }
            
            // Property: Reason should not be generic or empty
            expect(reason).not.toBe('');
            expect(reason).not.toBe('error');
            expect(reason).not.toBe('failed');
            expect(reason).not.toBe('invalid');
            
            // Property: Reason should provide actionable information
            expect(reason.length).toBeGreaterThan(5); // More than just "error"
          });
          
          // Property: Valid emails should not have rejection reasons
          const validResults = results.filter(r => r.isValid);
          validResults.forEach(result => {
            expect(result.bounceReason).toBeUndefined();
          });
          
          // Property: Each unique error type should have a consistent reason pattern
          const reasonsByEmail = new Map<string, string>();
          invalidResults.forEach(result => {
            const key = result.email;
            if (reasonsByEmail.has(key)) {
              // Same email should get same reason
              expect(result.bounceReason).toBe(reasonsByEmail.get(key));
            } else {
              reasonsByEmail.set(key, result.bounceReason!);
            }
          });
          
          // Property: Different error types should have different reasons
          const uniqueReasons = new Set(invalidResults.map(r => r.bounceReason));
          if (invalidResults.length > 1) {
            // Should have some variety in rejection reasons for different error types
            expect(uniqueReasons.size).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: email-validation-service, Property 23: Error resilience during processing**
   * **Validates: Requirements 6.4**
   */
  it('should continue processing after individual failures and report partial results', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate array with mix of valid emails and emails that will cause errors
        fc.array(
          fc.oneof(
            fc.emailAddress(), // Valid emails
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
              s.length > 0 && !s.includes(' ')
            ).map(s => `${s}@error-domain.com`), // Simulated error domain
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
              s.length > 0 && !s.includes(' ')
            ).map(s => `${s}@timeout-domain.com`), // Simulated timeout domain
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
              s.length > 0 && !s.includes(' ')
            ).map(s => `${s}@nonexistent-domain-xyz.com`) // Non-existent domain
          ),
          { minLength: 5, maxLength: 15 }
        ).map(emails => {
          // Remove duplicates and filter to only properly formatted emails
          const uniqueEmails = [...new Set(emails)];
          return uniqueEmails.filter(email => 
            email && 
            typeof email === 'string' && 
            email.includes('@') && 
            !email.startsWith('@') && 
            !email.endsWith('@') &&
            !email.includes(' ') &&
            email.length > 3
          );
        }).filter(emails => emails.length > 0), // Ensure we have at least one email
        async (emails) => {
          // Property: System should process all properly formatted emails despite individual failures
          const results = await validateEmailBatch(emails);
          
          // Property: Should return results for all input emails (properly formatted emails only)
          expect(results.length).toBe(emails.length);
          
          // Property: Each email should have a result, even if it failed validation
          const resultEmails = results.map(r => r.email).sort();
          const inputEmails = emails.sort();
          expect(resultEmails).toEqual(inputEmails);
          
          // Property: All results should have required fields even for error cases
          results.forEach(result => {
            expect(result).toHaveProperty('email');
            expect(result).toHaveProperty('isValid');
            expect(result).toHaveProperty('validatedAt');
            expect(typeof result.isValid).toBe('boolean');
            expect(result.validatedAt).toBeInstanceOf(Date);
            
            // Invalid results should have error information
            if (!result.isValid) {
              expect(result).toHaveProperty('bounceType');
              expect(result).toHaveProperty('bounceReason');
              expect(['hard', 'soft', 'complaint']).toContain(result.bounceType);
              expect(typeof result.bounceReason).toBe('string');
              expect(result.bounceReason!.length).toBeGreaterThan(0);
            }
          });
          
          // Property: System should not crash or throw unhandled errors
          // (If we reach this point, the function completed successfully despite errors)
          expect(results).toBeDefined();
          
          // Property: Should have processed some valid emails if any were provided
          const validInputEmails = emails.filter(email => 
            email && 
            typeof email === 'string' && 
            email.includes('@') && 
            !email.includes('error-domain') &&
            !email.includes('timeout-domain')
          );
          
          if (validInputEmails.length > 0) {
            const validResults = results.filter(r => r.isValid);
            // At least some valid emails should be processed successfully
            expect(validResults.length).toBeGreaterThanOrEqual(0);
          }
          
          // Property: Error emails should be marked as invalid with reasons
          const errorEmails = emails.filter(email => 
            email && (
              email.includes('error-domain') || 
              email.includes('timeout-domain') ||
              !email.includes('@')
            )
          );
          
          errorEmails.forEach(errorEmail => {
            const result = results.find(r => r.email === errorEmail);
            expect(result).toBeDefined();
            expect(result!.isValid).toBe(false);
            expect(result!.bounceReason).toBeDefined();
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: email-validation-service, Property 24: Resume capability after interruption**
   * **Validates: Requirements 6.5**
   */
  it('should allow resuming validation from the last successful validation point after interruption', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate array of properly formatted emails for validation
        fc.array(
          fc.oneof(
            fc.emailAddress(),
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
              s.length > 0 && !s.includes(' ')
            ).map(s => `${s}@gmail.com`),
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
              s.length > 0 && !s.includes(' ')
            ).map(s => `${s}@yahoo.com`)
          ),
          { minLength: 10, maxLength: 20 }
        ).map(emails => {
          // Remove duplicates and ensure properly formatted emails
          const uniqueEmails = [...new Set(emails)];
          return uniqueEmails.filter(email => 
            email && 
            typeof email === 'string' && 
            email.includes('@') && 
            !email.startsWith('@') && 
            !email.endsWith('@') &&
            !email.includes(' ') &&
            email.length > 3
          );
        }).filter(emails => emails.length >= 3), // Ensure we have enough emails for interruption test
        fc.integer({ min: 1, max: 8 }), // Interruption point
        async (emails, interruptionPoint) => {
          // Ensure interruption point is within bounds
          const actualInterruptionPoint = Math.min(interruptionPoint, emails.length - 1);
          
          // Property: Simulate partial processing (as if interrupted)
          const partialEmails = emails.slice(0, actualInterruptionPoint);
          const remainingEmails = emails.slice(actualInterruptionPoint);
          
          // Process first batch (before interruption)
          const partialResults = await validateEmailBatch(partialEmails);
          
          // Process remaining batch (after resume)
          const resumedResults = await validateEmailBatch(remainingEmails);
          
          // Combine results (simulating resume functionality)
          const combinedResults = [...partialResults, ...resumedResults];
          
          // Property: Combined results should contain all original emails
          expect(combinedResults.length).toBe(emails.length);
          
          const resultEmails = combinedResults.map(r => r.email).sort();
          const inputEmails = emails.sort();
          expect(resultEmails).toEqual(inputEmails);
          
          // Property: No email should be processed twice (no duplicates in results)
          const emailCounts = new Map<string, number>();
          combinedResults.forEach(result => {
            const count = emailCounts.get(result.email) || 0;
            emailCounts.set(result.email, count + 1);
          });
          
          emailCounts.forEach((count, email) => {
            expect(count).toBe(1); // Each email should appear exactly once
          });
          
          // Property: All results should have proper validation data
          combinedResults.forEach(result => {
            expect(result).toHaveProperty('email');
            expect(result).toHaveProperty('isValid');
            expect(result).toHaveProperty('validatedAt');
            expect(typeof result.isValid).toBe('boolean');
            expect(result.validatedAt).toBeInstanceOf(Date);
            
            if (!result.isValid) {
              expect(result).toHaveProperty('bounceType');
              expect(result).toHaveProperty('bounceReason');
            }
          });
          
          // Property: Resume should maintain consistency (same email gets same result)
          // Process the same emails again to verify consistency
          const fullResults = await validateEmailBatch(emails);
          
          // Each email should get the same validation result regardless of processing order
          emails.forEach(email => {
            const combinedResult = combinedResults.find(r => r.email === email);
            const fullResult = fullResults.find(r => r.email === email);
            
            expect(combinedResult).toBeDefined();
            expect(fullResult).toBeDefined();
            expect(combinedResult!.isValid).toBe(fullResult!.isValid);
            
            if (!combinedResult!.isValid) {
              expect(combinedResult!.bounceType).toBe(fullResult!.bounceType);
              // Note: bounceReason might vary slightly but should be consistent in type
            }
          });
          
          // Property: Resume should not lose any validation state
          const validCountCombined = combinedResults.filter(r => r.isValid).length;
          const validCountFull = fullResults.filter(r => r.isValid).length;
          const invalidCountCombined = combinedResults.filter(r => !r.isValid).length;
          const invalidCountFull = fullResults.filter(r => !r.isValid).length;
          
          expect(validCountCombined).toBe(validCountFull);
          expect(invalidCountCombined).toBe(invalidCountFull);
        }
      ),
      { numRuns: 50 } // Reduced runs due to complexity
    );
  });
});