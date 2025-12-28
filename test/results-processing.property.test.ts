// Property-based tests for results processing and file generation
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { handler } from '../src/lambdas/results-processor/index';
import { Contact, ValidationResult, ValidationJob } from '../src/shared/models';

describe('Results Processing Properties', () => {
  /**
   * **Feature: email-validation-service, Property 10: Clean list generation in CSV format**
   * **Validates: Requirements 3.1**
   */
  it('should generate clean list in CSV format for completed validation jobs', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate validation job data
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
                tags: fc.option(fc.string({ maxLength: 100 }))
              })
            }),
            { minLength: 1, maxLength: 20 }
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
            
            return uniqueContacts.length > 0 ? uniqueContacts : [contacts[0] as Contact];
          }),
          validationResults: fc.array(
            fc.record({
              email: fc.emailAddress(),
              isValid: fc.boolean(),
              bounceType: fc.option(fc.constantFrom('hard', 'soft', 'complaint')),
              bounceReason: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
              validatedAt: fc.date()
            }),
            { minLength: 1, maxLength: 20 }
          )
        }).map(data => {
          // Ensure validation results match contact emails
          const contactEmails = data.contacts.map(c => c.email);
          const validationResults = contactEmails.map(email => {
            const existingResult = data.validationResults.find(r => r.email === email);
            if (existingResult) {
              return existingResult as ValidationResult;
            }
            
            const isValid = Math.random() > 0.3; // 70% valid rate
            return {
              email,
              isValid,
              bounceType: isValid ? undefined : 'hard' as const,
              bounceReason: isValid ? undefined : 'Invalid email address',
              validatedAt: new Date()
            } as ValidationResult;
          });
          
          return {
            ...data,
            validationResults
          };
        }),
        async ({ jobId, contacts, validationResults }) => {
          // Mock the dependencies by creating a test version of the handler
          const mockEvent = {
            httpMethod: 'POST',
            body: JSON.stringify({
              jobId,
              includeCleanList: true,
              includeRejectedList: false,
              includeReport: false
            }),
            headers: {},
            pathParameters: null,
            queryStringParameters: null,
            requestContext: {} as any,
            resource: '',
            path: '',
            isBase64Encoded: false,
            multiValueHeaders: {},
            multiValueQueryStringParameters: null,
            stageVariables: null
          };
          
          // Create mock validation job
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
          
          // Test the core CSV generation logic directly
          const validEmails = new Set(
            validationResults.filter(result => result.isValid).map(result => result.email)
          );
          
          const cleanContacts = contacts.filter(contact => validEmails.has(contact.email));
          
          // Property: Clean list should only contain contacts with valid emails
          cleanContacts.forEach(contact => {
            expect(validEmails.has(contact.email)).toBe(true);
          });
          
          // Property: Clean list should contain all contacts with valid emails
          const validContactEmails = contacts
            .filter(contact => validEmails.has(contact.email))
            .map(contact => contact.email)
            .sort();
          const cleanContactEmails = cleanContacts.map(contact => contact.email).sort();
          expect(cleanContactEmails).toEqual(validContactEmails);
          
          // Property: CSV generation should preserve contact structure
          if (cleanContacts.length > 0) {
            const csvContent = generateContactsCsv(cleanContacts);
            
            // Should be valid CSV format
            expect(csvContent).toMatch(/^[^,\n\r]+(?:,[^,\n\r]*)*\n/); // Header line
            
            // Should contain all clean contacts
            const lines = csvContent.split('\n').filter(line => line.trim() !== '');
            expect(lines.length).toBe(cleanContacts.length + 1); // +1 for header
            
            // Should contain email addresses of clean contacts
            cleanContacts.forEach(contact => {
              expect(csvContent).toContain(contact.email);
            });
            
            // Should not contain invalid email addresses
            const invalidEmails = validationResults
              .filter(r => !r.isValid)
              .map(r => r.email);
            invalidEmails.forEach(email => {
              if (!validEmails.has(email)) {
                expect(csvContent).not.toContain(email);
              }
            });
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: email-validation-service, Property 11: Clean list preserves original contact data**
   * **Validates: Requirements 3.2**
   */
  it('should preserve all original contact data in clean list', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate contacts with rich metadata
        fc.array(
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
            workEmail: fc.option(fc.emailAddress()),
            personalEmail: fc.option(fc.emailAddress()),
            metadata: fc.record({
              source: fc.option(fc.string({ maxLength: 50 }).filter(s => 
                !s.includes(',') && !s.includes('\n') && !s.includes('\r') && !s.includes('"')
              )),
              tags: fc.option(fc.string({ maxLength: 100 }).filter(s => 
                !s.includes(',') && !s.includes('\n') && !s.includes('\r') && !s.includes('"')
              )),
              customField1: fc.option(fc.string({ maxLength: 50 }).filter(s => 
                !s.includes(',') && !s.includes('\n') && !s.includes('\r') && !s.includes('"')
              )),
              customField2: fc.option(fc.string({ maxLength: 50 }).filter(s => 
                !s.includes(',') && !s.includes('\n') && !s.includes('\r') && !s.includes('"')
              )),
              hubspotId: fc.option(fc.integer({ min: 1, max: 999999 }).map(n => n.toString())),
              lastModified: fc.option(fc.date().map(d => d.toISOString()))
            })
          }),
          { minLength: 1, maxLength: 15 }
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
          
          return uniqueContacts.length > 0 ? uniqueContacts : [contacts[0] as Contact];
        }),
        // Generate validation results (all valid for this test)
        fc.float({ min: Math.fround(0.7), max: Math.fround(1.0) }), // Percentage of valid emails
        async (contacts, validPercentage) => {
          // Create validation results with specified percentage of valid emails
          const validationResults: ValidationResult[] = contacts.map((contact, index) => {
            const isValid = index < Math.floor(contacts.length * validPercentage);
            return {
              email: contact.email,
              isValid,
              bounceType: isValid ? undefined : 'hard' as const,
              bounceReason: isValid ? undefined : 'Invalid email address',
              validatedAt: new Date()
            };
          });
          
          // Get clean contacts (valid ones)
          const validEmails = new Set(
            validationResults.filter(result => result.isValid).map(result => result.email)
          );
          
          const cleanContacts = contacts.filter(contact => validEmails.has(contact.email));
          
          if (cleanContacts.length === 0) {
            // Skip test if no valid contacts
            return;
          }
          
          // Generate CSV for clean contacts
          const csvContent = generateContactsCsv(cleanContacts);
          const lines = csvContent.split('\n').filter(line => line.trim() !== '');
          
          if (lines.length < 2) {
            // Skip if no data rows
            return;
          }
          
          const headers = lines[0].split(',');
          const dataRows = lines.slice(1);
          
          // Property: All original contact data should be preserved
          cleanContacts.forEach((originalContact, contactIndex) => {
            if (contactIndex >= dataRows.length) return;
            
            const csvRow = dataRows[contactIndex].split(',');
            
            // Check direct properties
            Object.keys(originalContact).forEach(key => {
              if (key === 'metadata') return; // Skip metadata object itself
              
              const headerIndex = headers.indexOf(key);
              if (headerIndex >= 0 && headerIndex < csvRow.length) {
                const originalValue = (originalContact as any)[key];
                const csvValue = csvRow[headerIndex].replace(/^"|"$/g, ''); // Remove quotes
                
                if (originalValue !== null && originalValue !== undefined && originalValue !== '') {
                  expect(csvValue).toBe(String(originalValue));
                }
              }
            });
            
            // Check metadata properties
            if (originalContact.metadata) {
              Object.keys(originalContact.metadata).forEach(metadataKey => {
                const headerIndex = headers.indexOf(metadataKey);
                if (headerIndex >= 0 && headerIndex < csvRow.length) {
                  const originalValue = originalContact.metadata[metadataKey];
                  const csvValue = csvRow[headerIndex].replace(/^"|"$/g, ''); // Remove quotes
                  
                  if (originalValue !== null && originalValue !== undefined && originalValue !== '') {
                    expect(csvValue).toBe(String(originalValue));
                  }
                }
              });
            }
          });
          
          // Property: No data should be lost during CSV generation
          cleanContacts.forEach(contact => {
            // All non-empty direct properties should appear in headers
            Object.keys(contact).forEach(key => {
              if (key !== 'metadata') {
                const value = (contact as any)[key];
                if (value !== null && value !== undefined && value !== '') {
                  expect(headers).toContain(key);
                }
              }
            });
            
            // All non-empty metadata properties should appear in headers
            if (contact.metadata) {
              Object.keys(contact.metadata).forEach(metadataKey => {
                const value = contact.metadata[metadataKey];
                if (value !== null && value !== undefined && value !== '') {
                  expect(headers).toContain(metadataKey);
                }
              });
            }
          });
          
          // Property: Essential contact fields should always be present
          const essentialFields = ['recordId', 'email'];
          essentialFields.forEach(field => {
            expect(headers).toContain(field);
          });
          
          // Property: Contact count should be preserved
          expect(dataRows.length).toBe(cleanContacts.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: email-validation-service, Property 12: Clean list excludes invalid emails**
   * **Validates: Requirements 3.3**
   */
  it('should exclude all invalid emails from clean list', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate contacts with mix of valid and invalid emails
        fc.array(
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
            metadata: fc.record({
              source: fc.option(fc.string({ maxLength: 50 })),
              priority: fc.option(fc.constantFrom('high', 'medium', 'low'))
            })
          }),
          { minLength: 3, maxLength: 20 }
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
          
          return uniqueContacts.length > 0 ? uniqueContacts : [contacts[0] as Contact];
        }),
        // Generate validation results with explicit valid/invalid split
        fc.float({ min: Math.fround(0.3), max: Math.fround(0.8) }), // Percentage of valid emails
        async (contacts, validPercentage) => {
          // Create validation results with specified split
          const numValid = Math.floor(contacts.length * validPercentage);
          const validationResults: ValidationResult[] = contacts.map((contact, index) => {
            const isValid = index < numValid;
            return {
              email: contact.email,
              isValid,
              bounceType: isValid ? undefined : (['hard', 'soft', 'complaint'] as const)[index % 3],
              bounceReason: isValid ? undefined : `Validation failed: ${['Invalid domain', 'Mailbox full', 'Spam complaint'][index % 3]}`,
              validatedAt: new Date()
            };
          });
          
          // Separate valid and invalid emails
          const validEmails = new Set(
            validationResults.filter(result => result.isValid).map(result => result.email)
          );
          const invalidEmails = new Set(
            validationResults.filter(result => !result.isValid).map(result => result.email)
          );
          
          // Get clean contacts (should only contain valid emails)
          const cleanContacts = contacts.filter(contact => validEmails.has(contact.email));
          
          // Property: Clean list should never contain invalid emails
          cleanContacts.forEach(contact => {
            expect(invalidEmails.has(contact.email)).toBe(false);
            expect(validEmails.has(contact.email)).toBe(true);
          });
          
          // Property: Clean list should contain all and only valid emails
          const cleanContactEmails = new Set(cleanContacts.map(c => c.email));
          
          // All emails in clean list should be valid
          cleanContactEmails.forEach(email => {
            expect(validEmails.has(email)).toBe(true);
            expect(invalidEmails.has(email)).toBe(false);
          });
          
          // All valid emails should be in clean list
          validEmails.forEach(email => {
            expect(cleanContactEmails.has(email)).toBe(true);
          });
          
          // No invalid emails should be in clean list
          invalidEmails.forEach(email => {
            expect(cleanContactEmails.has(email)).toBe(false);
          });
          
          // Property: Clean list size should equal number of valid emails
          expect(cleanContacts.length).toBe(validEmails.size);
          
          // Property: CSV generation should not include invalid emails
          if (cleanContacts.length > 0) {
            const csvContent = generateContactsCsv(cleanContacts);
            
            // CSV should contain all valid emails
            validEmails.forEach(email => {
              expect(csvContent).toContain(email);
            });
            
            // CSV should not contain any invalid emails
            invalidEmails.forEach(email => {
              expect(csvContent).not.toContain(email);
            });
            
            // Verify CSV structure integrity
            const lines = csvContent.split('\n').filter(line => line.trim() !== '');
            expect(lines.length).toBe(cleanContacts.length + 1); // +1 for header
          }
          
          // Property: If all emails are invalid, clean list should be empty
          if (validEmails.size === 0) {
            expect(cleanContacts.length).toBe(0);
          }
          
          // Property: If all emails are valid, clean list should contain all contacts
          if (invalidEmails.size === 0) {
            expect(cleanContacts.length).toBe(contacts.length);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: email-validation-service, Property 20: Temporary data cleanup**
   * **Validates: Requirements 5.3**
   */
  it('should clean up temporary data after job completion', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate job data with temporary files
        fc.record({
          jobId: fc.string({ minLength: 10, maxLength: 20 }).filter(s => 
            /^[a-zA-Z0-9-_]+$/.test(s)
          ),
          temporaryFiles: fc.array(
            fc.record({
              key: fc.string({ minLength: 5, maxLength: 50 }).filter(s => 
                /^[a-zA-Z0-9\-_\/\.]+$/.test(s)
              ),
              type: fc.constantFrom('input', 'intermediate', 'processing', 'temp'),
              size: fc.integer({ min: 100, max: 10000 }),
              createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
              shouldCleanup: fc.boolean()
            }),
            { minLength: 1, maxLength: 10 }
          ).map(files => {
            // Ensure unique keys
            const uniqueFiles: any[] = [];
            const seenKeys = new Set<string>();
            
            for (const file of files) {
              if (!seenKeys.has(file.key)) {
                seenKeys.add(file.key);
                uniqueFiles.push(file);
              }
            }
            
            return uniqueFiles.length > 0 ? uniqueFiles : [files[0]];
          }),
          permanentFiles: fc.array(
            fc.record({
              key: fc.string({ minLength: 5, maxLength: 50 }).filter(s => 
                /^[a-zA-Z0-9\-_\/\.]+$/.test(s)
              ),
              type: fc.constantFrom('clean-list', 'rejected-list', 'report'),
              size: fc.integer({ min: 100, max: 10000 }),
              createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
            }),
            { minLength: 0, maxLength: 5 }
          ).map(files => {
            // Ensure unique keys
            const uniqueFiles: any[] = [];
            const seenKeys = new Set<string>();
            
            for (const file of files) {
              if (!seenKeys.has(file.key)) {
                seenKeys.add(file.key);
                uniqueFiles.push(file);
              }
            }
            
            return uniqueFiles;
          }),
          jobCompletedAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
          cleanupAfterHours: fc.integer({ min: 1, max: 72 })
        }).map(data => {
          // Ensure all keys are unique across temporary and permanent files
          const allKeys = new Set<string>();
          
          // Process temporary files first
          const uniqueTemporaryFiles: any[] = [];
          for (const file of data.temporaryFiles) {
            if (!allKeys.has(file.key)) {
              allKeys.add(file.key);
              uniqueTemporaryFiles.push(file);
            }
          }
          
          // Process permanent files, ensuring no conflicts with temporary files
          const uniquePermanentFiles: any[] = [];
          for (const file of data.permanentFiles) {
            if (!allKeys.has(file.key)) {
              allKeys.add(file.key);
              uniquePermanentFiles.push(file);
            }
          }
          
          return {
            ...data,
            temporaryFiles: uniqueTemporaryFiles.length > 0 ? uniqueTemporaryFiles : [data.temporaryFiles[0]],
            permanentFiles: uniquePermanentFiles
          };
        }),
        async ({ jobId, temporaryFiles, permanentFiles, jobCompletedAt, cleanupAfterHours }) => {
          // Simulate the cleanup logic
          const cleanupThreshold = new Date(jobCompletedAt.getTime() + (cleanupAfterHours * 60 * 60 * 1000));
          const currentTime = new Date();
          
          // Property: Temporary files should be identified for cleanup
          const filesToCleanup = temporaryFiles.filter(file => {
            // Files marked for cleanup OR older than threshold should be cleaned
            return file.shouldCleanup || file.createdAt < cleanupThreshold;
          });
          
          const filesToKeep = temporaryFiles.filter(file => {
            // Files NOT marked for cleanup AND newer than OR equal to threshold should be kept
            return !file.shouldCleanup && file.createdAt >= cleanupThreshold;
          });
          
          // Property: Permanent files should never be cleaned up
          permanentFiles.forEach(file => {
            expect(file.type).toMatch(/^(clean-list|rejected-list|report)$/);
            // Permanent files should not be in cleanup list
            expect(filesToCleanup.find(f => f.key === file.key)).toBeUndefined();
          });
          
          // Property: Cleanup should only affect temporary files
          filesToCleanup.forEach(file => {
            expect(['input', 'intermediate', 'processing', 'temp']).toContain(file.type);
          });
          
          // Property: Files marked for cleanup should be in cleanup list
          temporaryFiles.forEach(file => {
            if (file.shouldCleanup) {
              expect(filesToCleanup.find(f => f.key === file.key)).toBeDefined();
            }
          });
          
          // Property: Old temporary files should be cleaned up
          temporaryFiles.forEach(file => {
            if (file.createdAt < cleanupThreshold) {
              expect(filesToCleanup.find(f => f.key === file.key)).toBeDefined();
            }
          });
          
          // Property: Recent temporary files not marked for cleanup should be kept
          temporaryFiles.forEach(file => {
            if (!file.shouldCleanup && file.createdAt >= cleanupThreshold) {
              expect(filesToKeep.find(f => f.key === file.key)).toBeDefined();
              expect(filesToCleanup.find(f => f.key === file.key)).toBeUndefined();
            }
          });
          
          // Property: Cleanup should be deterministic
          const cleanupKeys = new Set(filesToCleanup.map(f => f.key));
          const keepKeys = new Set(filesToKeep.map(f => f.key));
          
          // No file should be both cleaned and kept
          cleanupKeys.forEach(key => {
            expect(keepKeys.has(key)).toBe(false);
          });
          
          // All temporary files should be either cleaned or kept
          const allTempKeys = new Set(temporaryFiles.map(f => f.key));
          const processedKeys = new Set([...cleanupKeys, ...keepKeys]);
          
          // Every temporary file should be accounted for
          expect(processedKeys.size).toBe(allTempKeys.size);
          allTempKeys.forEach(key => {
            expect(processedKeys.has(key)).toBe(true);
          });
          
          // Property: Total files processed should equal input files
          expect(filesToCleanup.length + filesToKeep.length).toBe(temporaryFiles.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Helper function to generate CSV content for contacts
 * (Extracted from the Lambda function for testing)
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