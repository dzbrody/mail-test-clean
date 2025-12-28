// CSV parsing utilities
import csv from 'csv-parser';
import { createReadStream } from 'fs';
import { Readable } from 'stream';
import { Contact } from '../models';
import { validateContact, isValidEmailFormat } from './validation';

export interface CSVParseResult {
  contacts: Contact[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errors: string[];
  headers: string[];
}

export interface CSVParseError {
  row: number;
  message: string;
  data?: any;
}

/**
 * Detects all email columns from CSV headers
 */
export function detectEmailColumns(headers: string[]): { primary: string | null; secondary: string[]; workEmail: string | null; personalEmail: string | null } {
  const primaryEmailPatterns = [
    /^email$/i,
    /^email.?address$/i,
    /^e.?mail$/i,
    /^contact.?email$/i,
    /^primary.?email$/i
  ];
  
  const workEmailPatterns = [
    /^work.?email$/i,
    /^business.?email$/i,
    /^office.?email$/i,
    /^government.?email$/i,
    /^official.?email$/i,
    /^company.?email$/i
  ];
  
  const personalEmailPatterns = [
    /^personal.?email$/i,
    /^private.?email$/i,
    /^home.?email$/i,
    /^alternate.?email$/i,
    /^secondary.?email$/i
  ];
  
  let primary: string | null = null;
  let workEmail: string | null = null;
  let personalEmail: string | null = null;
  const secondary: string[] = [];
  
  // Find primary email column
  for (const header of headers) {
    for (const pattern of primaryEmailPatterns) {
      if (pattern.test(header.trim())) {
        primary = header;
        break;
      }
    }
    if (primary) break;
  }
  
  // Find work email column
  for (const header of headers) {
    for (const pattern of workEmailPatterns) {
      if (pattern.test(header.trim())) {
        workEmail = header;
        break;
      }
    }
  }
  
  // Find personal email column
  for (const header of headers) {
    for (const pattern of personalEmailPatterns) {
      if (pattern.test(header.trim())) {
        personalEmail = header;
        break;
      }
    }
  }
  
  // Find other email-like columns
  const emailLikePatterns = [
    /email/i,
    /e.?mail/i
  ];
  
  for (const header of headers) {
    if (header !== primary && header !== workEmail && header !== personalEmail) {
      for (const pattern of emailLikePatterns) {
        if (pattern.test(header.trim())) {
          secondary.push(header);
          break;
        }
      }
    }
  }
  
  return { primary, secondary, workEmail, personalEmail };
}

/**
 * Detects email column from CSV headers (backward compatibility)
 */
export function detectEmailColumn(headers: string[]): string | null {
  const emailColumns = detectEmailColumns(headers);
  return emailColumns.primary;
}

/**
 * Maps CSV row to Contact object with support for multiple email addresses
 */
export function mapRowToContact(row: any, emailColumn: string, rowIndex: number): Contact {
  const email = row[emailColumn]?.toString().trim() || '';
  
  // Clean up recordId to handle CSV escaping issues
  let recordId = row['Record ID'] || row['recordId'] || row['id'] || `row_${rowIndex}`;
  if (typeof recordId === 'string') {
    recordId = recordId.trim();
    // If recordId is empty, just quotes, or contains problematic CSV characters, generate a default one
    if (!recordId || recordId === '""' || recordId === '"' || recordId.includes(',') || recordId.includes('\n') || recordId.includes('\r')) {
      recordId = `row_${rowIndex}`;
    }
  }
  
  // Detect all email columns for this row
  const headers = Object.keys(row);
  const emailColumns = detectEmailColumns(headers);
  
  // Extract different types of email addresses
  let secondaryEmail: string | undefined;
  let workEmail: string | undefined;
  let personalEmail: string | undefined;
  
  if (emailColumns.workEmail && row[emailColumns.workEmail]) {
    workEmail = row[emailColumns.workEmail].toString().trim();
    if (workEmail && !isValidEmailFormat(workEmail)) {
      workEmail = undefined;
    }
  }
  
  if (emailColumns.personalEmail && row[emailColumns.personalEmail]) {
    personalEmail = row[emailColumns.personalEmail].toString().trim();
    if (personalEmail && !isValidEmailFormat(personalEmail)) {
      personalEmail = undefined;
    }
  }
  
  // Find first valid secondary email from other email columns
  for (const secColumn of emailColumns.secondary) {
    if (row[secColumn] && secColumn !== emailColumn) {
      const secEmail = row[secColumn].toString().trim();
      if (isValidEmailFormat(secEmail)) {
        secondaryEmail = secEmail;
        break;
      }
    }
  }
  
  // Also check if there's a direct secondaryEmail column
  if (!secondaryEmail && row['secondaryEmail']) {
    const secEmail = row['secondaryEmail'].toString().trim();
    if (isValidEmailFormat(secEmail)) {
      secondaryEmail = secEmail;
    }
  }
  
  return {
    recordId: recordId.toString(),
    firstName: row['First Name'] || row['firstName'] || row['first_name'] || undefined,
    lastName: row['Last Name'] || row['lastName'] || row['last_name'] || undefined,
    email: email,
    secondaryEmail,
    workEmail,
    personalEmail,
    company: row['Company'] || row['company'] || row['Company Name'] || undefined,
    jobTitle: row['Job Title'] || row['jobTitle'] || row['job_title'] || row['Title'] || undefined,
    phone: row['Phone'] || row['phone'] || row['Phone Number'] || undefined,
    metadata: { ...row } // Store all original data
  };
}

/**
 * Parses CSV content from string
 */
export async function parseCSVFromString(csvContent: string): Promise<CSVParseResult> {
  return new Promise((resolve, reject) => {
    const contacts: Contact[] = [];
    const errors: string[] = [];
    let headers: string[] = [];
    let totalRows = 0;
    let validRows = 0;
    let invalidRows = 0;
    let emailColumn: string | null = null;
    
    const stream = Readable.from([csvContent]);
    
    stream
      .pipe(csv())
      .on('headers', (headerList: string[]) => {
        headers = headerList;
        emailColumn = detectEmailColumn(headers);
        
        if (!emailColumn) {
          errors.push('No email column found. Expected columns like: email, Email Address, E-mail, etc.');
          return;
        }
      })
      .on('data', (row: any) => {
        totalRows++;
        
        if (!emailColumn) {
          invalidRows++;
          return;
        }
        
        try {
          const contact = mapRowToContact(row, emailColumn, totalRows);
          
          if (!validateContact(contact)) {
            invalidRows++;
            errors.push(`Row ${totalRows}: Invalid contact data or email format`);
            return;
          }
          
          contacts.push(contact);
          validRows++;
        } catch (error) {
          invalidRows++;
          errors.push(`Row ${totalRows}: ${error instanceof Error ? error.message : 'Unknown parsing error'}`);
        }
      })
      .on('end', () => {
        resolve({
          contacts,
          totalRows,
          validRows,
          invalidRows,
          errors,
          headers
        });
      })
      .on('error', (error) => {
        reject(new Error(`CSV parsing failed: ${error.message}`));
      });
  });
}

/**
 * Parses CSV file from file path
 */
export async function parseCSVFromFile(filePath: string): Promise<CSVParseResult> {
  return new Promise((resolve, reject) => {
    const contacts: Contact[] = [];
    const errors: string[] = [];
    let headers: string[] = [];
    let totalRows = 0;
    let validRows = 0;
    let invalidRows = 0;
    let emailColumn: string | null = null;
    
    createReadStream(filePath)
      .pipe(csv())
      .on('headers', (headerList: string[]) => {
        headers = headerList;
        emailColumn = detectEmailColumn(headers);
        
        if (!emailColumn) {
          errors.push('No email column found. Expected columns like: email, Email Address, E-mail, etc.');
          return;
        }
      })
      .on('data', (row: any) => {
        totalRows++;
        
        if (!emailColumn) {
          invalidRows++;
          return;
        }
        
        try {
          const contact = mapRowToContact(row, emailColumn, totalRows);
          
          if (!validateContact(contact)) {
            invalidRows++;
            errors.push(`Row ${totalRows}: Invalid contact data or email format`);
            return;
          }
          
          contacts.push(contact);
          validRows++;
        } catch (error) {
          invalidRows++;
          errors.push(`Row ${totalRows}: ${error instanceof Error ? error.message : 'Unknown parsing error'}`);
        }
      })
      .on('end', () => {
        resolve({
          contacts,
          totalRows,
          validRows,
          invalidRows,
          errors,
          headers
        });
      })
      .on('error', (error) => {
        reject(new Error(`CSV parsing failed: ${error.message}`));
      });
  });
}

/**
 * Validates CSV structure and required columns
 */
export function validateCSVStructure(headers: string[]): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!headers || headers.length === 0) {
    errors.push('CSV file has no headers');
    return { isValid: false, errors };
  }
  
  const emailColumn = detectEmailColumn(headers);
  if (!emailColumn) {
    errors.push('No email column found. CSV must contain a column named: email, Email Address, E-mail, or similar');
  }
  
  // Check for duplicate headers
  const duplicates = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicates.length > 0) {
    errors.push(`Duplicate column headers found: ${duplicates.join(', ')}`);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}