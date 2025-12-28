// File handling utilities
import { createWriteStream, createReadStream, promises as fs } from 'fs';
import { join } from 'path';
import { Contact, ValidationResult } from '../models';
import { validateFileConstraints } from './validation';
import { config } from './environment';

export interface FileInfo {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates uploaded file against constraints
 */
export function validateUploadedFile(fileInfo: FileInfo): FileValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check file type
  const typeValidation = validateFileConstraints(
    { type: fileInfo.type, size: fileInfo.size },
    config.maxFileSize,
    config.allowedFileTypes
  );
  
  if (!typeValidation.isValid && typeValidation.error) {
    errors.push(typeValidation.error);
  }
  
  // Check file name
  if (!fileInfo.name.toLowerCase().endsWith('.csv')) {
    errors.push('File must have .csv extension');
  }
  
  // Check for suspicious file names
  const suspiciousPatterns = [/[<>:"|?*]/, /^\./];
  if (suspiciousPatterns.some(pattern => pattern.test(fileInfo.name))) {
    warnings.push('File name contains potentially problematic characters');
  }
  
  // Size warnings
  if (fileInfo.size > config.maxFileSize * 0.8) {
    warnings.push('File is close to maximum size limit');
  }
  
  if (fileInfo.size === 0) {
    errors.push('File is empty');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Generates unique file name with timestamp
 */
export function generateUniqueFileName(originalName: string, prefix: string = ''): string {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const extension = originalName.split('.').pop() || 'csv';
  const baseName = originalName.replace(/\.[^/.]+$/, '');
  
  return `${prefix}${baseName}_${timestamp}_${randomSuffix}.${extension}`;
}

/**
 * Creates CSV content from contacts array
 */
export function createCSVContent(contacts: Contact[], headers?: string[]): string {
  if (contacts.length === 0) {
    return headers ? headers.join(',') + '\n' : 'recordId,firstName,lastName,email,company,jobTitle,phone\n';
  }
  
  // Use provided headers or infer from first contact
  let csvHeaders: string[];
  if (headers) {
    csvHeaders = headers;
  } else {
    // Get all unique keys from contacts and their metadata
    const allKeys = new Set<string>();
    contacts.forEach(contact => {
      Object.keys(contact).forEach(key => {
        if (key !== 'metadata') {
          allKeys.add(key);
        }
      });
      if (contact.metadata) {
        Object.keys(contact.metadata).forEach(key => allKeys.add(key));
      }
    });
    csvHeaders = Array.from(allKeys);
  }
  
  // Create CSV content
  let csvContent = csvHeaders.join(',') + '\n';
  
  contacts.forEach(contact => {
    const row = csvHeaders.map(header => {
      let value: any;
      
      if (header in contact && header !== 'metadata') {
        value = (contact as any)[header];
      } else if (contact.metadata && header in contact.metadata) {
        value = contact.metadata[header];
      } else {
        value = '';
      }
      
      // Handle CSV escaping
      if (value === null || value === undefined) {
        return '';
      }
      
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      
      return stringValue;
    });
    
    csvContent += row.join(',') + '\n';
  });
  
  return csvContent;
}

/**
 * Creates validation results CSV content
 */
export function createValidationResultsCSV(results: ValidationResult[]): string {
  if (results.length === 0) {
    return 'email,isValid,bounceType,bounceReason,validatedAt\n';
  }
  
  let csvContent = 'email,isValid,bounceType,bounceReason,validatedAt\n';
  
  results.forEach(result => {
    const row = [
      result.email,
      result.isValid.toString(),
      result.bounceType || '',
      result.bounceReason || '',
      result.validatedAt instanceof Date ? result.validatedAt.toISOString() : result.validatedAt
    ];
    
    const escapedRow = row.map(value => {
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    });
    
    csvContent += escapedRow.join(',') + '\n';
  });
  
  return csvContent;
}

/**
 * Writes content to file safely
 */
export async function writeFileContent(filePath: string, content: string): Promise<void> {
  try {
    await fs.writeFile(filePath, content, 'utf8');
  } catch (error) {
    throw new Error(`Failed to write file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Reads file content safely
 */
export async function readFileContent(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Checks if file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets file stats safely
 */
export async function getFileStats(filePath: string): Promise<{ size: number; lastModified: Date } | null> {
  try {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      lastModified: stats.mtime
    };
  } catch {
    return null;
  }
}

/**
 * Deletes file safely
 */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    // Don't throw if file doesn't exist
    if ((error as any)?.code !== 'ENOENT') {
      throw new Error(`Failed to delete file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}