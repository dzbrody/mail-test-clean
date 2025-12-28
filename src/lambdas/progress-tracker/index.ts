// Progress tracking Lambda function
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { 
  getJobProgress, 
  generateValidationReport, 
  calculateValidationStatistics,
  ProgressUpdate,
  ValidationReport 
} from '../../shared/utils/progress-tracker';

interface ProgressRequest {
  jobId: string;
}

interface ProgressResponse {
  jobId: string;
  progress: ProgressUpdate;
  statistics: ReturnType<typeof calculateValidationStatistics>;
  report?: ValidationReport;
}

/**
 * Lambda handler for progress tracking API
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Progress tracker Lambda invoked', JSON.stringify(event, null, 2));
  
  try {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
        },
        body: ''
      };
    }
    
    // Extract job ID from path parameters or query string
    const jobId = event.pathParameters?.jobId || event.queryStringParameters?.jobId;
    
    if (!jobId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
        },
        body: JSON.stringify({
          error: 'Missing job ID',
          message: 'Job ID is required to get progress information'
        })
      };
    }
    
    // Get current progress
    const progress = await getJobProgress(jobId);
    
    if (!progress) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
        },
        body: JSON.stringify({
          error: 'Job not found',
          message: `No validation job found with ID: ${jobId}`
        })
      };
    }
    
    // Calculate statistics
    const statistics = calculateValidationStatistics(
      progress.totalContacts,
      progress.validContacts,
      progress.invalidContacts,
      progress.processedContacts
    );
    
    // Generate report if job is completed
    let report: ValidationReport | undefined;
    if (progress.status === 'completed') {
      report = await generateValidationReport(jobId) || undefined;
    }
    
    const response: ProgressResponse = {
      jobId,
      progress,
      statistics,
      report
    };
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: JSON.stringify(response)
    };
    
  } catch (error) {
    console.error('Progress tracking error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: 'Failed to get progress information',
        details: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

/**
 * Get progress for multiple jobs (batch endpoint)
 */
export const batchProgressHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Batch progress tracker Lambda invoked', JSON.stringify(event, null, 2));
  
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
          message: 'Please provide job IDs in the request body'
        })
      };
    }
    
    const { jobIds }: { jobIds: string[] } = JSON.parse(event.body);
    
    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({
          error: 'Invalid job IDs',
          message: 'Please provide an array of job IDs'
        })
      };
    }
    
    // Get progress for all jobs
    const progressPromises = jobIds.map(async (jobId) => {
      try {
        const progress = await getJobProgress(jobId);
        if (!progress) {
          return { jobId, error: 'Job not found' };
        }
        
        const statistics = calculateValidationStatistics(
          progress.totalContacts,
          progress.validContacts,
          progress.invalidContacts,
          progress.processedContacts
        );
        
        let report: ValidationReport | undefined;
        if (progress.status === 'completed') {
          report = await generateValidationReport(jobId) || undefined;
        }
        
        return {
          jobId,
          progress,
          statistics,
          report
        };
      } catch (error) {
        return {
          jobId,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });
    
    const results = await Promise.all(progressPromises);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({ results })
    };
    
  } catch (error) {
    console.error('Batch progress tracking error:', error);
    
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
        message: 'Failed to get batch progress information',
        details: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};