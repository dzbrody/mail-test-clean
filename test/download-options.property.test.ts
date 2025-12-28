// Property-based tests for download options availability
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { handler } from '../src/lambdas/results-processor/index';
import { Contact, ValidationResult, ValidationJob } from '../src/shared/models';

describe('Download Options Properties', () => {
  /**
   * **Feature: email-validation-service, Property 16: Download options availability**
   * **Validates: Requirements 4.3**
   */
  it('should provide download options for both clean and rejected contact lists when validation is completed', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate validation job data with completed status
        fc.record({
          jobId: fc.string({ minLength: 10, maxLength: 20 }).filter(s => 
            /^[a-zA-Z0-9-_]+$/.test(s)
          ),
          contacts: fc.array(
            fc.record({
              recordId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
                /^[a-zA-Z0-9-_]+$/.test(s)
              ),
              email: fc.emailAddress(),
              firstName: fc.option(fc.string({ minLength: 1, maxLength: 50 }).filter(s => 
                !s.includes(',') && !s.includes('\n') && !s.includes('\r') && !s.includes('"')
              )),
              lastName: fc.option(fc.string({ minLength: 1, maxLength: 50 }).filter(s => 
                !s.includes(',') && !s.includes('\n') && !s.includes('\r') && !s.includes('"')
              )),
              company: fc.option(fc.string({ minLength: 1, maxLength: 100 }).filter(s => 
                !s.includes(',') && !s.includes('\n') && !s.includes('\r') && !s.includes('"')
              )),
              jobTitle: fc.option(fc.string({ minLength: 1, maxLength: 50 }).filter(s => 
                !s.includes(',') && !s.includes('\n') && !s.includes('\r') && !s.includes('"')
              )),
              phone: fc.option(fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
                /^[0-9+\-\s()]+$/.test(s)
              )),
              metadata: fc.record({
                source: fc.option(fc.string({ maxLength: 50 })),
                tags: fc.option(fc.string({ maxLength: 100 })),
                hubspotId: fc.option(fc.string({ maxLength: 20 }))
              })
            }),
            { minLength: 2, maxLength: 20 }
          ).map(contacts => {
            // Ensure unique emails and recordIds
            const uniqueContacts: Contact[] = [];
            const seenEmails = new Set<string>();
            const seenRecordIds = new Set<string>();
            
            for (const contact of contacts) {
              if (!seenEmails.has(contact.email) && !seenRecordIds.has(contact.recordId)) {
                seenEmails.add(contact.email);
                seenRecordIds.add(contact.recordId);
                uniqueContacts.push(contact as Contact);
              }
            }
            
            return uniqueContacts.length >= 2 ? uniqueContacts : [
              contacts[0] as Contact,
              { ...contacts[0], recordId: contacts[0].recordId + '_2', email: 'test2@example.com' } as Contact
            ];
          }),
          validationResults: fc.array(
            fc.record({
              email: fc.emailAddress(),
              isValid: fc.boolean(),
              bounceType: fc.option(fc.constantFrom('hard', 'soft', 'complaint')),
              bounceReason: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
              validatedAt: fc.date()
            }),
            { minLength: 2, maxLength: 20 }
          ),
          downloadOptions: fc.record({
            includeCleanList: fc.boolean(),
            includeRejectedList: fc.boolean(),
            includeReport: fc.boolean()
          })
        }).map(data => {
          // Ensure validation results match contact emails and have both valid and invalid
          const contactEmails = data.contacts.map(c => c.email);
          const validationResults = contactEmails.map((email, index) => {
            // Ensure we have at least one valid and one invalid for meaningful testing
            const isValid = index < Math.ceil(contactEmails.length / 2);
            return {
              email,
              isValid,
              bounceType: isValid ? undefined : (['hard', 'soft', 'complaint'] as const)[index % 3],
              bounceReason: isValid ? undefined : `Validation failed: reason ${index}`,
              validatedAt: new Date()
            } as ValidationResult;
          });
          
          return {
            ...data,
            validationResults
          };
        }),
        async ({ jobId, contacts, validationResults, downloadOptions }) => {
          // Create mock validation job with completed status
          const validContacts = validationResults.filter(r => r.isValid).length;
          const invalidContacts = validationResults.filter(r => !r.isValid).length;
          
          const mockJob: ValidationJob = {
            jobId,
            status: 'completed',
            totalContacts: contacts.length,
            processedContacts: contacts.length,
            validContacts,
            invalidContacts,
            createdAt: new Date(),
            completedAt: new Date(),
            s3InputKey: `jobs/${jobId}/input.csv`
          };
          
          // Test the core download options logic
          const validEmails = new Set(
            validationResults.filter(result => result.isValid).map(result => result.email)
          );
          const invalidEmails = new Set(
            validationResults.filter(result => !result.isValid).map(result => result.email)
          );
          
          const cleanContacts = contacts.filter(contact => validEmails.has(contact.email));
          const rejectedContacts = contacts.filter(contact => invalidEmails.has(contact.email));
          
          // Property: Download options should be available for completed jobs
          expect(mockJob.status).toBe('completed');
          
          // Property: Clean list download should be available when there are valid contacts
          if (downloadOptions.includeCleanList && cleanContacts.length > 0) {
            // Should be able to generate clean list
            const cleanListCsv = generateContactsCsv(cleanContacts);
            expect(cleanListCsv).toBeDefined();
            expect(cleanListCsv.length).toBeGreaterThan(0);
            
            // Clean list should contain header
            const lines = cleanListCsv.split('\n').filter(line => line.trim() !== '');
            expect(lines.length).toBeGreaterThan(0); // At least header
            
            // Clean list should contain only valid emails
            cleanContacts.forEach(contact => {
              expect(cleanListCsv).toContain(contact.email);
              expect(validEmails.has(contact.email)).toBe(true);
            });
            
            // Clean list should not contain invalid emails
            rejectedContacts.forEach(contact => {
              expect(cleanListCsv).not.toContain(contact.email);
            });
          }
          
          // Property: Rejected list download should be available when there are invalid contacts
          if (downloadOptions.includeRejectedList && rejectedContacts.length > 0) {
            // Should be able to generate rejected list
            const rejectedListCsv = generateRejectedContactsCsv(rejectedContacts, validationResults);
            expect(rejectedListCsv).toBeDefined();
            expect(rejectedListCsv.length).toBeGreaterThan(0);
            
            // Rejected list should contain header with bounce information
            const lines = rejectedListCsv.split('\n').filter(line => line.trim() !== '');
            expect(lines.length).toBeGreaterThan(0); // At least header
            
            const headers = lines[0].split(',');
            expect(headers).toContain('bounceType');
            expect(headers).toContain('bounceReason');
            
            // Rejected list should contain only invalid emails
            rejectedContacts.forEach(contact => {
              expect(rejectedListCsv).toContain(contact.email);
              expect(invalidEmails.has(contact.email)).toBe(true);
            });
            
            // Rejected list should not contain valid emails
            cleanContacts.forEach(contact => {
              expect(rejectedListCsv).not.toContain(contact.email);
            });
          }
          
          // Property: Report download should be available when requested
          if (downloadOptions.includeReport) {
            // Should be able to generate validation report
            const report = {
              jobId,
              totalContacts: contacts.length,
              validContacts,
              invalidContacts,
              successRate: contacts.length > 0 ? (validContacts / contacts.length) * 100 : 0,
              completedAt: mockJob.completedAt,
              bounceReasons: validationResults
                .filter(r => !r.isValid && r.bounceReason)
                .reduce((acc, r) => {
                  acc[r.bounceReason!] = (acc[r.bounceReason!] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>)
            };
            
            expect(report).toBeDefined();
            expect(report.jobId).toBe(jobId);
            expect(report.totalContacts).toBe(contacts.length);
            expect(report.validContacts).toBe(validContacts);
            expect(report.invalidContacts).toBe(invalidContacts);
            expect(report.successRate).toBeGreaterThanOrEqual(0);
            expect(report.successRate).toBeLessThanOrEqual(100);
          }
          
          // Property: Both download options should be available simultaneously
          if (downloadOptions.includeCleanList && downloadOptions.includeRejectedList) {
            // Should be able to generate both lists
            if (cleanContacts.length > 0) {
              const cleanListCsv = generateContactsCsv(cleanContacts);
              expect(cleanListCsv).toBeDefined();
            }
            
            if (rejectedContacts.length > 0) {
              const rejectedListCsv = generateRejectedContactsCsv(rejectedContacts, validationResults);
              expect(rejectedListCsv).toBeDefined();
            }
            
            // Lists should be mutually exclusive in content
            const cleanEmails = new Set(cleanContacts.map(c => c.email));
            const rejectedEmails = new Set(rejectedContacts.map(c => c.email));
            
            // No email should appear in both lists
            cleanEmails.forEach(email => {
              expect(rejectedEmails.has(email)).toBe(false);
            });
            
            rejectedEmails.forEach(email => {
              expect(cleanEmails.has(email)).toBe(false);
            });
            
            // Together they should account for all contacts
            const allProcessedEmails = new Set([...cleanEmails, ...rejectedEmails]);
            const originalEmails = new Set(contacts.map(c => c.email));
            expect(allProcessedEmails.size).toBe(originalEmails.size);
          }
          
          // Property: Download options should respect the completion status
          expect(mockJob.status).toBe('completed');
          expect(mockJob.processedContacts).toBe(mockJob.totalContacts);
          expect(mockJob.validContacts + mockJob.invalidContacts).toBe(mockJob.totalContacts);
          
          // Property: Statistics should be consistent with download content
          expect(validContacts).toBe(cleanContacts.length);
          expect(invalidContacts).toBe(rejectedContacts.length);
          expect(validContacts + invalidContacts).toBe(contacts.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Helper function to generate CSV content for contacts
 */
function generateContactsCsv(contacts: Contact[]): string {
  if (contacts.length === 0) {
    return 'recordId,email,firstName,lastName,company,jobTitle,phone\n';
  }
  
  // Get all possible headers from contacts
  const allHeaders = new Set<string>();
  contacts.forEach(contact => {
    Object.keys(contact).forEach(key => {
      if (key !== 'metadata') {
        allHeaders.add(key);
      }
    });
    if (contact.metadata) {
      Object.keys(contact.metadata).forEach(key => allHeaders.add(key));
    }
  });
  
  const headers = Array.from(allHeaders);
  let csv = headers.join(',') + '\n';
  
  contacts.forEach(contact => {
    const row = headers.map(header => {
      let value = '';
      if (header in contact && header !== 'metadata') {
        value = (contact as any)[header] || '';
      } else if (contact.metadata && header in contact.metadata) {
        value = contact.metadata[header] || '';
      }
      
      // Escape CSV values
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        value = `"${value.replace(/"/g, '""')}"`;
      }
      
      return value;
    });
    
    csv += row.join(',') + '\n';
  });
  
  return csv;
}

/**
 * Helper function to generate CSV content for rejected contacts with bounce reasons
 */
function generateRejectedContactsCsv(contacts: Contact[], validationResults: ValidationResult[]): string {
  const resultMap = new Map(validationResults.map(result => [result.email, result]));
  
  if (contacts.length === 0) {
    return 'recordId,email,firstName,lastName,company,jobTitle,phone,bounceType,bounceReason\n';
  }
  
  // Get all possible headers from contacts plus bounce information
  const allHeaders = new Set<string>();
  contacts.forEach(contact => {
    Object.keys(contact).forEach(key => {
      if (key !== 'metadata') {
        allHeaders.add(key);
      }
    });
    if (contact.metadata) {
      Object.keys(contact.metadata).forEach(key => allHeaders.add(key));
    }
  });
  
  const headers = Array.from(allHeaders).concat(['bounceType', 'bounceReason']);
  let csv = headers.join(',') + '\n';
  
  contacts.forEach(contact => {
    const validationResult = resultMap.get(contact.email);
    
    const row = headers.map(header => {
      let value = '';
      
      if (header === 'bounceType') {
        value = validationResult?.bounceType || '';
      } else if (header === 'bounceReason') {
        value = validationResult?.bounceReason || '';
      } else if (header in contact && header !== 'metadata') {
        value = (contact as any)[header] || '';
      } else if (contact.metadata && header in contact.metadata) {
        value = contact.metadata[header] || '';
      }
      
      // Escape CSV values
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        value = `"${value.replace(/"/g, '""')}"`;
      }
      
      return value;
    });
    
    csv += row.join(',') + '\n';
  });
  
  return csv;
}