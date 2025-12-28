// Results processor Lambda function
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { s3Client, dynamoDocClient } from '../../shared/utils/aws-clients';
import { config } from '../../shared/utils/environment';
import { ValidationJob, ValidationResult, Contact } from '../../shared/models';
import { generateValidationReport } from '../../shared/utils/progress-tracker';

interface ResultsRequest {
  jobId: string;
  includeCleanList?: boolean;
  includeRejectedList?: boolean;
  includeReport?: boolean;
}

interface ResultsResponse {
  jobId: string;
  downloadUrls: {
    cleanList?: string;
    rejectedList?: string;
    report?: string;
  };
  statistics: {
    totalContacts: number;
    validContacts: number;
    invalidContacts: number;
    successRate: number;
  };
}

/**
 * Lambda handler for results processing
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Results processor Lambda invoked', JSON.stringify(event, null, 2));
  
  try {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: ''
      };
    }
    
    if (!event.body) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({
          error: 'Request body is required',
          message: 'Please provide job ID and options in the request body'
        })
      };
    }
    
    const request: ResultsRequest = JSON.parse(event.body);
    const { jobId, includeCleanList = true, includeRejectedList = false, includeReport = true } = request;
    
    if (!jobId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({
          error: 'Missing job ID',
          message: 'Job ID is required to generate results'
        })
      };
    }
    
    // Get validation job details
    const job = await getValidationJob(jobId);
    if (!job) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({
          error: 'Job not found',
          message: `No validation job found with ID: ${jobId}`
        })
      };
    }
    
    if (job.status !== 'completed') {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({
          error: 'Job not completed',
          message: `Job ${jobId} is not yet completed. Current status: ${job.status}`
        })
      };
    }
    
    // Get original contacts and validation results
    const [contacts, validationResults] = await Promise.all([
      getOriginalContacts(jobId),
      getValidationResults(jobId)
    ]);
    
    const downloadUrls: { cleanList?: string; rejectedList?: string; report?: string } = {};
    
    // Generate clean list if requested
    if (includeCleanList) {
      const cleanContacts = getCleanContacts(contacts, validationResults);
      const cleanListKey = `results/${jobId}/clean-list.csv`;
      const cleanListCsv = generateContactsCsv(cleanContacts);
      
      await uploadToS3(cleanListKey, cleanListCsv, 'text/csv', 72); // Keep for 72 hours
      downloadUrls.cleanList = await generateSignedUrl(cleanListKey, 86400); // 24 hour expiry
    }
    
    // Generate rejected list if requested
    if (includeRejectedList) {
      const rejectedContacts = getRejectedContacts(contacts, validationResults);
      const rejectedListKey = `results/${jobId}/rejected-list.csv`;
      const rejectedListCsv = generateRejectedContactsCsv(rejectedContacts, validationResults);
      
      await uploadToS3(rejectedListKey, rejectedListCsv, 'text/csv', 72); // Keep for 72 hours
      downloadUrls.rejectedList = await generateSignedUrl(rejectedListKey, 86400); // 24 hour expiry
    }
    
    // Generate report if requested
    if (includeReport) {
      const report = await generateValidationReport(jobId);
      if (report) {
        const reportKey = `results/${jobId}/validation-report.json`;
        const reportJson = JSON.stringify(report, null, 2);
        
        await uploadToS3(reportKey, reportJson, 'application/json', 168); // Keep for 7 days
        downloadUrls.report = await generateSignedUrl(reportKey, 86400); // 24 hour expiry
      }
    }
    
    // Perform cleanup of old temporary files
    await cleanupTemporaryFiles(jobId);
    
    const response: ResultsResponse = {
      jobId,
      downloadUrls,
      statistics: {
        totalContacts: job.totalContacts,
        validContacts: job.validContacts,
        invalidContacts: job.invalidContacts,
        successRate: job.totalContacts > 0 ? (job.validContacts / job.totalContacts) * 100 : 0
      }
    };
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify(response)
    };
    
  } catch (error) {
    console.error('Results processing error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: 'Failed to process results',
        details: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

/**
 * Get validation job details
 */
async function getValidationJob(jobId: string): Promise<ValidationJob | null> {
  try {
    const command = new GetCommand({
      TableName: config.validationJobsTable,
      Key: { jobId }
    });
    
    const response = await dynamoDocClient.send(command);
    
    if (!response.Item) {
      return null;
    }
    
    const item = response.Item;
    return {
      ...item,
      createdAt: new Date(item.createdAt),
      completedAt: item.completedAt ? new Date(item.completedAt) : undefined
    } as ValidationJob;
  } catch (error) {
    console.error('Error getting validation job:', error);
    return null;
  }
}

/**
 * Get original contacts from S3
 */
async function getOriginalContacts(jobId: string): Promise<Contact[]> {
  try {
    const contactsKey = `jobs/${jobId}/contacts.json`;
    const command = new GetObjectCommand({
      Bucket: config.bucketName,
      Key: contactsKey
    });
    
    const response = await s3Client.send(command);
    if (!response.Body) {
      throw new Error('Failed to get contacts from S3');
    }
    
    const contactsJson = await streamToString(response.Body as any);
    return JSON.parse(contactsJson);
  } catch (error) {
    console.error('Error getting original contacts:', error);
    return [];
  }
}

/**
 * Get validation results from DynamoDB
 */
async function getValidationResults(jobId: string): Promise<ValidationResult[]> {
  try {
    // Query validation results table for this job
    const command = new QueryCommand({
      TableName: config.validationResultsTable || 'ValidationResults',
      KeyConditionExpression: 'jobId = :jobId',
      ExpressionAttributeValues: {
        ':jobId': jobId
      }
    });
    
    const response = await dynamoDocClient.send(command);
    
    if (!response.Items) {
      return [];
    }
    
    return response.Items.map(item => ({
      email: item.email,
      isValid: item.isValid,
      bounceType: item.bounceType,
      bounceReason: item.bounceReason,
      validatedAt: new Date(item.validatedAt)
    })) as ValidationResult[];
  } catch (error) {
    console.error('Error getting validation results:', error);
    return [];
  }
}

/**
 * Filter contacts to get only clean (valid) ones
 */
function getCleanContacts(contacts: Contact[], validationResults: ValidationResult[]): Contact[] {
  const validEmails = new Set(
    validationResults.filter(result => result.isValid).map(result => result.email)
  );
  
  return contacts.filter(contact => validEmails.has(contact.email));
}

/**
 * Filter contacts to get only rejected (invalid) ones
 */
function getRejectedContacts(contacts: Contact[], validationResults: ValidationResult[]): Contact[] {
  const invalidEmails = new Set(
    validationResults.filter(result => !result.isValid).map(result => result.email)
  );
  
  return contacts.filter(contact => invalidEmails.has(contact.email));
}

/**
 * Generate CSV content for contacts
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
 * Generate CSV content for rejected contacts with bounce reasons
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

/**
 * Upload content to S3 with automatic cleanup configuration
 */
async function uploadToS3(key: string, content: string, contentType: string, cleanupAfterHours: number = 24): Promise<void> {
  const expirationDate = new Date();
  expirationDate.setHours(expirationDate.getHours() + cleanupAfterHours);
  
  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    Body: content,
    ContentType: contentType,
    Metadata: {
      'cleanup-after': expirationDate.toISOString(),
      'file-type': key.includes('clean-list') ? 'permanent' : 'temporary'
    },
    // Set object expiration for temporary files
    ...(key.includes('temp') || key.includes('processing') ? {
      Expires: expirationDate
    } : {})
  });
  
  await s3Client.send(command);
}

/**
 * Generate signed URL for S3 object with expiration
 */
async function generateSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
  try {
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    
    const command = new GetObjectCommand({
      Bucket: config.bucketName,
      Key: key
    });
    
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
    return signedUrl;
  } catch (error) {
    console.error('Error generating signed URL:', error);
    // Fallback to direct URL (not recommended for production)
    return `https://${config.bucketName}.s3.amazonaws.com/${key}`;
  }
}

/**
 * Helper function to convert stream to string
 */
async function streamToString(stream: any): Promise<string> {
  const chunks: Buffer[] = [];
  
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

/**
 * Clean up temporary files for a job
 */
async function cleanupTemporaryFiles(jobId: string): Promise<void> {
  try {
    const { ListObjectsV2Command, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    
    // List all objects for this job
    const listCommand = new ListObjectsV2Command({
      Bucket: config.bucketName,
      Prefix: `jobs/${jobId}/`
    });
    
    const listResponse = await s3Client.send(listCommand);
    
    if (!listResponse.Contents) {
      return;
    }
    
    const now = new Date();
    const filesToDelete: string[] = [];
    
    // Check each file for cleanup eligibility
    for (const object of listResponse.Contents) {
      if (!object.Key) continue;
      
      // Get object metadata to check cleanup policy
      try {
        const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
        const headCommand = new HeadObjectCommand({
          Bucket: config.bucketName,
          Key: object.Key
        });
        
        const headResponse = await s3Client.send(headCommand);
        const metadata = headResponse.Metadata || {};
        
        // Check if file should be cleaned up
        const cleanupAfter = metadata['cleanup-after'];
        const fileType = metadata['file-type'];
        
        if (cleanupAfter && new Date(cleanupAfter) < now) {
          // File has expired
          filesToDelete.push(object.Key);
        } else if (fileType === 'temporary' && object.Key.includes('temp')) {
          // Temporary processing files older than 1 hour
          const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
          if (object.LastModified && object.LastModified < oneHourAgo) {
            filesToDelete.push(object.Key);
          }
        }
      } catch (error) {
        console.warn(`Could not check metadata for ${object.Key}:`, error);
        
        // Fallback: clean up obvious temporary files older than 24 hours
        if (object.Key.includes('temp') || object.Key.includes('processing')) {
          const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          if (object.LastModified && object.LastModified < oneDayAgo) {
            filesToDelete.push(object.Key);
          }
        }
      }
    }
    
    // Delete eligible files
    for (const key of filesToDelete) {
      try {
        const deleteCommand = new DeleteObjectCommand({
          Bucket: config.bucketName,
          Key: key
        });
        
        await s3Client.send(deleteCommand);
        console.log(`Cleaned up temporary file: ${key}`);
      } catch (error) {
        console.error(`Failed to delete ${key}:`, error);
      }
    }
    
    console.log(`Cleanup completed for job ${jobId}. Deleted ${filesToDelete.length} files.`);
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}