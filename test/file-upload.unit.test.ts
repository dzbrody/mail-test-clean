// Unit tests for file upload Lambda function
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from '../src/lambdas/file-processor/index';
import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock AWS SDK clients
vi.mock('../src/shared/utils/aws-clients', () => ({
  s3Client: {
    send: vi.fn()
  },
  dynamoDocClient: {
    send: vi.fn()
  }
}));

// Mock UUID
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-job-id-123')
}));

describe('File Upload Lambda Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle successful CSV parsing with sample HubSpot export', async () => {
    // Mock S3 response with sample HubSpot CSV data
    const sampleCSV = `Record ID,First Name,Last Name,Email,Company,Job Title,Phone
1,John,Doe,john.doe@example.com,Acme Corp,Manager,555-1234
2,Jane,Smith,jane.smith@test.org,Test Inc,Developer,555-5678
3,Bob,Johnson,bob.johnson@demo.net,Demo LLC,Analyst,555-9012`;

    const mockS3Response = {
      Body: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            callback(Buffer.from(sampleCSV));
          } else if (event === 'end') {
            callback();
          }
        })
      }
    };

    const { s3Client, dynamoDocClient } = await import('../src/shared/utils/aws-clients');
    (s3Client.send as any).mockResolvedValue(mockS3Response);
    (dynamoDocClient.send as any).mockResolvedValue({});

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        s3Key: 'uploads/hubspot-export.csv',
        fileName: 'hubspot-export.csv',
        fileSize: sampleCSV.length,
        contentType: 'text/csv'
      }),
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'POST',
      isBase64Encoded: false,
      path: '/upload',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: ''
    };

    const result = await handler(event);
    
    expect(result.statusCode).toBe(200);
    
    const responseBody = JSON.parse(result.body);
    expect(responseBody.jobId).toBe('test-job-id-123');
    expect(responseBody.totalContacts).toBe(3);
    expect(responseBody.validContacts).toBe(3);
    expect(responseBody.invalidContacts).toBe(0);
    expect(responseBody.errors).toEqual([]);
    
    // Verify S3 and DynamoDB calls were made
    expect(s3Client.send).toHaveBeenCalledTimes(2); // Get and Put
    expect(dynamoDocClient.send).toHaveBeenCalledTimes(1);
  });

  it('should handle error for malformed CSV files', async () => {
    // Mock S3 response with malformed CSV (no email column)
    const malformedCSV = `Name,Phone,Address
John Doe,555-1234,123 Main St
Jane Smith,555-5678,456 Oak Ave`;

    const mockS3Response = {
      Body: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            callback(Buffer.from(malformedCSV));
          } else if (event === 'end') {
            callback();
          }
        })
      }
    };

    const { s3Client } = await import('../src/shared/utils/aws-clients');
    (s3Client.send as any).mockResolvedValue(mockS3Response);

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        s3Key: 'uploads/malformed.csv',
        fileName: 'malformed.csv',
        fileSize: malformedCSV.length,
        contentType: 'text/csv'
      }),
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'POST',
      isBase64Encoded: false,
      path: '/upload',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: ''
    };

    const result = await handler(event);
    
    expect(result.statusCode).toBe(400);
    
    const responseBody = JSON.parse(result.body);
    expect(responseBody.error).toBe('Invalid CSV structure');
    expect(responseBody.errors).toContain('No email column found. CSV must contain a column named: email, Email Address, E-mail, or similar');
  });

  it('should handle missing request body', async () => {
    const event: APIGatewayProxyEvent = {
      body: null,
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'POST',
      isBase64Encoded: false,
      path: '/upload',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: ''
    };

    const result = await handler(event);
    
    expect(result.statusCode).toBe(400);
    
    const responseBody = JSON.parse(result.body);
    expect(responseBody.error).toBe('Request body is required');
  });

  it('should handle invalid file types', async () => {
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        s3Key: 'uploads/document.pdf',
        fileName: 'document.pdf',
        fileSize: 1024,
        contentType: 'application/pdf'
      }),
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'POST',
      isBase64Encoded: false,
      path: '/upload',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: ''
    };

    const result = await handler(event);
    
    expect(result.statusCode).toBe(400);
    
    const responseBody = JSON.parse(result.body);
    expect(responseBody.error).toBe('Invalid file');
    expect(responseBody.errors).toContain('Invalid file type. Allowed types: text/csv, application/csv');
  });

  it('should handle empty CSV files', async () => {
    // Mock S3 response with empty CSV
    const emptyCSV = '';

    const mockS3Response = {
      Body: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            callback(Buffer.from(emptyCSV));
          } else if (event === 'end') {
            callback();
          }
        })
      }
    };

    const { s3Client } = await import('../src/shared/utils/aws-clients');
    (s3Client.send as any).mockResolvedValue(mockS3Response);

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        s3Key: 'uploads/empty.csv',
        fileName: 'empty.csv',
        fileSize: 0,
        contentType: 'text/csv'
      }),
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'POST',
      isBase64Encoded: false,
      path: '/upload',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: ''
    };

    const result = await handler(event);
    
    expect(result.statusCode).toBe(400);
    
    const responseBody = JSON.parse(result.body);
    expect(responseBody.error).toBe('Invalid file');
    expect(responseBody.errors).toContain('File is empty');
  });

  it('should create DynamoDB job record with correct structure', async () => {
    // Mock S3 response with valid CSV
    const validCSV = `email,firstName,lastName
test@example.com,Test,User`;

    const mockS3Response = {
      Body: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            callback(Buffer.from(validCSV));
          } else if (event === 'end') {
            callback();
          }
        })
      }
    };

    const { s3Client, dynamoDocClient } = await import('../src/shared/utils/aws-clients');
    (s3Client.send as any).mockResolvedValue(mockS3Response);
    (dynamoDocClient.send as any).mockResolvedValue({});

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        s3Key: 'uploads/test.csv',
        fileName: 'test.csv',
        fileSize: validCSV.length,
        contentType: 'text/csv'
      }),
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'POST',
      isBase64Encoded: false,
      path: '/upload',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: ''
    };

    const result = await handler(event);
    
    expect(result.statusCode).toBe(200);
    
    // Verify DynamoDB put was called with correct structure
    expect(dynamoDocClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          TableName: 'ValidationJobs',
          Item: expect.objectContaining({
            jobId: 'test-job-id-123',
            status: 'pending',
            totalContacts: 1,
            processedContacts: 0,
            validContacts: 1,
            invalidContacts: 0,
            s3InputKey: 'uploads/test.csv',
            createdAt: expect.any(String)
          })
        })
      })
    );
  });

  it('should handle S3 download errors gracefully', async () => {
    const { s3Client } = await import('../src/shared/utils/aws-clients');
    (s3Client.send as any).mockRejectedValue(new Error('S3 access denied'));

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        s3Key: 'uploads/test.csv',
        fileName: 'test.csv',
        fileSize: 1024,
        contentType: 'text/csv'
      }),
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'POST',
      isBase64Encoded: false,
      path: '/upload',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: ''
    };

    const result = await handler(event);
    
    expect(result.statusCode).toBe(500);
    
    const responseBody = JSON.parse(result.body);
    expect(responseBody.error).toBe('Internal server error');
    expect(responseBody.details).toContain('S3 access denied');
  });
});