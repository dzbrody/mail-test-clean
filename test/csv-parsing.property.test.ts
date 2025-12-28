// Property-based tests for CSV parsing
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseCSVFromString, detectEmailColumn, mapRowToContact, validateCSVStructure } from '../src/shared/utils/csv-parser';
import { validateContact, getAllEmailsFromContact } from '../src/shared/utils/validation';

describe('CSV Parsing Properties', () => {
  /**
   * **Feature: email-validation-service, Property 1: CSV parsing extracts all email addresses**
   * **Validates: Requirements 1.1**
   */
  it('should extract all email addresses from valid CSV content including multiple emails per contact', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate valid CSV data with multiple email addresses per contact
        fc.array(
          fc.record({
            email: fc.emailAddress(),
            'Work Email': fc.option(fc.emailAddress()),
            'Personal Email': fc.option(fc.emailAddress()),
            firstName: fc.option(fc.string({ minLength: 1, maxLength: 50 }).filter(s => 
              !s.includes(',') && !s.includes('\n') && !s.includes('\r') && !s.includes('"')
            )),
            lastName: fc.option(fc.string({ minLength: 1, maxLength: 50 }).filter(s => 
              !s.includes(',') && !s.includes('\n') && !s.includes('\r') && !s.includes('"')
            )),
            company: fc.option(fc.string({ minLength: 1, maxLength: 100 }).filter(s => 
              !s.includes(',') && !s.includes('\n') && !s.includes('\r') && !s.includes('"')
            )),
            recordId: fc.string({ minLength: 1, maxLength: 20 }).filter(id => 
              id.trim() !== '' && 
              !id.includes(',') && 
              !id.includes('\n') && 
              !id.includes('\r') && 
              !id.includes('"')
            )
          }),
          { minLength: 1, maxLength: 50 }
        ).map(contacts => {
          // Ensure unique email addresses and recordIds
          const uniqueContacts: any[] = [];
          const seenEmails = new Set<string>();
          const seenRecordIds = new Set<string>();
          
          for (const contact of contacts) {
            if (!seenEmails.has(contact.email) && !seenRecordIds.has(contact.recordId)) {
              seenEmails.add(contact.email);
              seenRecordIds.add(contact.recordId);
              uniqueContacts.push(contact);
            }
          }
          
          return uniqueContacts.length > 0 ? uniqueContacts : [contacts[0]]; // Ensure at least one contact
        }),
        async (contacts) => {
          // Create CSV content from generated contacts with multiple email columns
          const headers = ['recordId', 'email', 'Work Email', 'Personal Email', 'firstName', 'lastName', 'company'];
          let csvContent = headers.join(',') + '\n';
          
          contacts.forEach(contact => {
            const row = [
              contact.recordId,
              contact.email,
              contact['Work Email'] || '',
              contact['Personal Email'] || '',
              contact.firstName || '',
              contact.lastName || '',
              contact.company || ''
            ];
            csvContent += row.join(',') + '\n';
          });
          
          // Parse the CSV
          const result = await parseCSVFromString(csvContent);
          
          // Property: All contacts should be extracted
          expect(result.contacts.length).toBe(contacts.length);
          expect(result.validRows).toBe(contacts.length);
          expect(result.totalRows).toBe(contacts.length);
          
          // Verify all primary emails are present
          const extractedPrimaryEmails = result.contacts.map(c => c.email).sort();
          const originalPrimaryEmails = contacts.map(c => c.email).sort();
          expect(extractedPrimaryEmails).toEqual(originalPrimaryEmails);
          
          // Verify multiple email addresses are preserved
          result.contacts.forEach((parsedContact) => {
            const originalContact = contacts.find(c => c.email === parsedContact.email);
            expect(originalContact).toBeDefined();
            
            // Check that primary email is preserved
            expect(parsedContact.email).toBe(originalContact!.email);
            
            // Check that work email is preserved if it exists
            if (originalContact!['Work Email']) {
              expect(parsedContact.workEmail).toBe(originalContact!['Work Email']);
            }
            
            // Check that personal email is preserved if it exists
            if (originalContact!['Personal Email']) {
              expect(parsedContact.personalEmail).toBe(originalContact!['Personal Email']);
            }
          });
          
          // Property: System should handle government vs personal email scenario
          // Count contacts that have both work and personal emails
          const contactsWithMultipleEmails = result.contacts.filter(contact => {
            const allEmails = getAllEmailsFromContact(contact);
            return allEmails.length > 1;
          });
          
          // If original data had multiple emails, parsed data should preserve them
          const originalContactsWithMultipleEmails = contacts.filter(contact => {
            const emailCount = [contact.email, contact['Work Email'], contact['Personal Email']]
              .filter(email => email && email.trim() !== '').length;
            return emailCount > 1;
          });
          
          expect(contactsWithMultipleEmails.length).toBe(originalContactsWithMultipleEmails.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: email-validation-service, Property 2: Invalid CSV files are rejected with error messages**
   * **Validates: Requirements 1.2**
   */
  it('should reject invalid CSV files with clear error messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // CSV without email column
          fc.array(fc.record({
            name: fc.string(),
            phone: fc.string(),
            address: fc.string()
          }), { minLength: 1, maxLength: 10 }),
          // CSV with invalid email formats
          fc.array(fc.record({
            email: fc.string().filter(s => !s.includes('@') || s.length < 3),
            name: fc.string()
          }), { minLength: 1, maxLength: 10 }),
          // Empty CSV
          fc.constant([])
        ),
        async (invalidData) => {
          let csvContent = '';
          
          if (Array.isArray(invalidData) && invalidData.length > 0) {
            const firstItem = invalidData[0];
            const headers = Object.keys(firstItem);
            csvContent = headers.join(',') + '\n';
            
            invalidData.forEach(item => {
              const row = headers.map(header => (item as any)[header] || '');
              csvContent += row.join(',') + '\n';
            });
          } else {
            csvContent = ''; // Empty CSV
          }
          
          try {
            const result = await parseCSVFromString(csvContent);
            
            // Property: Invalid CSV should either have errors or no valid contacts
            if (csvContent === '') {
              // Empty CSV should be handled gracefully
              expect(result.totalRows).toBe(0);
            } else {
              // CSV without email column or with invalid emails should have errors
              const hasEmailColumn = result.headers.some(header => 
                /^email$/i.test(header) || /email/i.test(header)
              );
              
              if (!hasEmailColumn) {
                expect(result.errors.length).toBeGreaterThan(0);
                expect(result.errors.some(error => error.includes('email column'))).toBe(true);
              } else {
                // If there's an email column but emails are invalid, should have validation errors
                expect(result.invalidRows).toBeGreaterThan(0);
              }
            }
          } catch (error) {
            // Parsing failure is also acceptable for invalid CSV
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain('CSV parsing failed');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: email-validation-service, Property 13: CSV structure preservation**
   * **Validates: Requirements 3.4**
   */
  it('should preserve original CSV structure and headers', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          headers: fc.array(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
              !s.includes(',') && !s.includes('\n') && !s.includes('\r') && !s.includes('"') && s.trim() !== ''
            ),
            { minLength: 3, maxLength: 10 }
          ).map(headers => {
            // Ensure we have an email column
            if (!headers.some(h => /email/i.test(h))) {
              headers[0] = 'email';
            }
            return headers;
          }),
          rows: fc.array(
            fc.array(fc.string({ maxLength: 50 }).filter(s => 
              !s.includes(',') && !s.includes('\n') && !s.includes('\r') && !s.includes('"')
            )),
            { minLength: 1, maxLength: 20 }
          )
        }),
        async ({ headers, rows }) => {
          // Create CSV content
          let csvContent = headers.join(',') + '\n';
          
          rows.forEach(row => {
            // Pad or trim row to match headers length
            const paddedRow = [...row];
            while (paddedRow.length < headers.length) {
              paddedRow.push('');
            }
            paddedRow.length = headers.length;
            
            // Ensure email column has valid email
            const emailIndex = headers.findIndex(h => /email/i.test(h));
            if (emailIndex >= 0) {
              paddedRow[emailIndex] = `test${Math.random().toString(36).substring(2)}@example.com`;
            }
            
            csvContent += paddedRow.join(',') + '\n';
          });
          
          // Parse the CSV
          const result = await parseCSVFromString(csvContent);
          
          // Property: Original headers should be preserved
          expect(result.headers).toEqual(headers);
          
          // Property: All original columns should be accessible in metadata
          if (result.contacts.length > 0) {
            const firstContact = result.contacts[0];
            headers.forEach(header => {
              // Each header should be accessible either as a direct property or in metadata
              const hasDirectProperty = header in firstContact && header !== 'metadata';
              const hasInMetadata = firstContact.metadata && header in firstContact.metadata;
              expect(hasDirectProperty || hasInMetadata).toBe(true);
            });
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});