// Progress tracking utilities
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDocClient } from './aws-clients';
import { config } from './environment';
import { ValidationJob } from '../models';

export interface ProgressUpdate {
  jobId: string;
  processedContacts: number;
  totalContacts: number;
  validContacts: number;
  invalidContacts: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  estimatedCompletionTime?: Date;
  currentBatch?: number;
  totalBatches?: number;
  lastUpdated: Date;
}

export interface ValidationReport {
  jobId: string;
  totalContacts: number;
  validContacts: number;
  invalidContacts: number;
  successRate: number;
  processingTime: number;
  bounceReasons: Record<string, number>;
  domainStatistics: Record<string, { valid: number; invalid: number }>;
  createdAt: Date;
  completedAt: Date;
}

/**
 * Updates progress for a validation job
 */
export async function updateJobProgress(
  jobId: string,
  processedContacts: number,
  validContacts: number,
  invalidContacts: number,
  totalContacts: number,
  currentBatch?: number,
  totalBatches?: number
): Promise<ProgressUpdate> {
  const now = new Date();
  const progressPercentage = totalContacts > 0 ? (processedContacts / totalContacts) * 100 : 0;
  
  // Calculate estimated completion time based on current progress
  let estimatedCompletionTime: Date | undefined;
  if (processedContacts > 0 && processedContacts < totalContacts) {
    try {
      const job = await getValidationJob(jobId);
      if (job && job.createdAt) {
        const elapsedTime = now.getTime() - new Date(job.createdAt).getTime();
        if (elapsedTime > 0) {
          const estimatedTotalTime = (elapsedTime / processedContacts) * totalContacts;
          estimatedCompletionTime = new Date(new Date(job.createdAt).getTime() + estimatedTotalTime);
        }
      }
    } catch (error) {
      // If we can't get job details, skip estimation
      console.warn('Could not calculate estimated completion time:', error);
    }
  }
  
  const status = processedContacts >= totalContacts ? 'completed' : 'processing';
  
  // Update job in DynamoDB
  const updateCommand = new UpdateCommand({
    TableName: config.validationJobsTable,
    Key: { jobId },
    UpdateExpression: 'SET processedContacts = :processed, validContacts = :valid, invalidContacts = :invalid, #status = :status, lastUpdated = :lastUpdated' +
      (estimatedCompletionTime ? ', estimatedCompletionTime = :estimatedTime' : '') +
      (currentBatch !== undefined ? ', currentBatch = :currentBatch' : '') +
      (totalBatches !== undefined ? ', totalBatches = :totalBatches' : '') +
      (status === 'completed' ? ', completedAt = :completedAt' : ''),
    ExpressionAttributeValues: {
      ':processed': processedContacts,
      ':valid': validContacts,
      ':invalid': invalidContacts,
      ':status': status,
      ':lastUpdated': now.toISOString(),
      ...(estimatedCompletionTime && { ':estimatedTime': estimatedCompletionTime.toISOString() }),
      ...(currentBatch !== undefined && { ':currentBatch': currentBatch }),
      ...(totalBatches !== undefined && { ':totalBatches': totalBatches }),
      ...(status === 'completed' && { ':completedAt': now.toISOString() })
    },
    ExpressionAttributeNames: {
      '#status': 'status'
    }
  });
  
  await dynamoDocClient.send(updateCommand);
  
  return {
    jobId,
    processedContacts,
    totalContacts,
    validContacts,
    invalidContacts,
    status,
    estimatedCompletionTime,
    currentBatch,
    totalBatches,
    lastUpdated: now
  };
}

/**
 * Gets current progress for a validation job
 */
export async function getJobProgress(jobId: string): Promise<ProgressUpdate | null> {
  try {
    const command = new GetCommand({
      TableName: config.validationJobsTable,
      Key: { jobId }
    });
    
    const response = await dynamoDocClient.send(command);
    
    if (!response.Item) {
      return null;
    }
    
    const job = response.Item as ValidationJob & {
      lastUpdated?: string;
      estimatedCompletionTime?: string;
      currentBatch?: number;
      totalBatches?: number;
    };
    
    return {
      jobId: job.jobId,
      processedContacts: job.processedContacts,
      totalContacts: job.totalContacts,
      validContacts: job.validContacts,
      invalidContacts: job.invalidContacts,
      status: job.status,
      estimatedCompletionTime: job.estimatedCompletionTime ? new Date(job.estimatedCompletionTime) : undefined,
      currentBatch: job.currentBatch,
      totalBatches: job.totalBatches,
      lastUpdated: job.lastUpdated ? new Date(job.lastUpdated) : job.createdAt
    };
  } catch (error) {
    console.error('Error getting job progress:', error);
    return null;
  }
}

/**
 * Gets validation job details
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
 * Generates a comprehensive validation report
 */
export async function generateValidationReport(jobId: string): Promise<ValidationReport | null> {
  try {
    // Get job details
    const job = await getValidationJob(jobId);
    if (!job || job.status !== 'completed') {
      return null;
    }
    
    // Get validation results (this would typically query a ValidationResults table)
    // For now, we'll create a basic report from job data
    const processingTime = job.completedAt && job.createdAt 
      ? job.completedAt.getTime() - job.createdAt.getTime()
      : 0;
    
    const successRate = job.totalContacts > 0 
      ? (job.validContacts / job.totalContacts) * 100 
      : 0;
    
    return {
      jobId: job.jobId,
      totalContacts: job.totalContacts,
      validContacts: job.validContacts,
      invalidContacts: job.invalidContacts,
      successRate,
      processingTime,
      bounceReasons: {}, // Would be populated from ValidationResults table
      domainStatistics: {}, // Would be populated from ValidationResults table
      createdAt: job.createdAt,
      completedAt: job.completedAt || new Date()
    };
  } catch (error) {
    console.error('Error generating validation report:', error);
    return null;
  }
}

/**
 * Calculates validation statistics for display
 */
export function calculateValidationStatistics(
  totalContacts: number,
  validContacts: number,
  invalidContacts: number,
  processedContacts: number
): {
  totalContacts: number;
  validContacts: number;
  invalidContacts: number;
  processedContacts: number;
  remainingContacts: number;
  successRate: number;
  progressPercentage: number;
} {
  const remainingContacts = totalContacts - processedContacts;
  const successRate = processedContacts > 0 ? (validContacts / processedContacts) * 100 : 0;
  const progressPercentage = totalContacts > 0 ? (processedContacts / totalContacts) * 100 : 0;
  
  return {
    totalContacts,
    validContacts,
    invalidContacts,
    processedContacts,
    remainingContacts,
    successRate,
    progressPercentage
  };
}