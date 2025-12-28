// File processor Lambda function
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { parseCSVFromString, validateCSVStructure } from '../../shared/utils/csv-parser';
import { validateUploadedFile } from '../../shared/utils/file-handler';
import { validateContact } from '../../shared/utils/validation';
import { ValidationJob, Contact } from '../../shared/models';
import { s3Client, dynamoDocClient } from '../../shared/utils/aws-clients';
import { config } from '../../shared/utils/environment';
import { v4 as uuidv4 } from 'uuid';

interface FileUploadEvent {
  s3Key: string;
  fileName: string;
  fileSize: number;
  contentType: string;
}

interface FileProcessorResponse {
  jobId: string;
  totalContacts: number;
  validContacts: number;
  invalidContacts: number;
  errors: string[];
  warnings: string[];
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('File processor Lambda invoked', JSON.stringify(event, null, 2));
  
  try {
    // Parse the request body
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
          message: 'Please provide file upload information in the request body'
        })
      };
    }

    const uploadEvent: FileUploadEvent = JSON.parse(event.body);
    
    // Validate file information
    const fileValidation = validateUploadedFile({
      name: uploadEvent.fileName,
      size: uploadEvent.fileSize,
      type: uploadEvent.contentType,
      lastModified: Date.now()
    });

    if (!fileValidation.isValid) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({
          error: 'Invalid file',
          message: 'File validation failed',
          errors: fileValidation.errors,
          warnings: fileValidation.warnings
        })
      };
    }

    // Download file from S3
    console.log(`Downloading file from S3: ${uploadEvent.s3Key}`);
    const getObjectCommand = new GetObjectCommand({
      Bucket: config.bucketName,
      Key: uploadEvent.s3Key
    });

    const s3Response = await s3Client.send(getObjectCommand);
    if (!s3Response.Body) {
      throw new Error('Failed to download file from S3');
    }

    // Convert stream to string
    const csvContent = await streamToString(s3Response.Body as any);
    
    // Parse CSV content
    console.log('Parsing CSV content...');
    const parseResult = await parseCSVFromString(csvContent);
    
    // Validate CSV structure
    const structureValidation = validateCSVStructure(parseResult.headers);
    if (!structureValidation.isValid) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({
          error: 'Invalid CSV structure',
          message: 'CSV file structure validation failed',
          errors: structureValidation.errors
        })
      };
    }

    // Check if parsing found any contacts
    if (parseResult.totalRows === 0) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({
          error: 'Empty file',
          message: 'No contacts found in the uploaded file',
          errors: ['File contains no data rows']
        })
      };
    }

    // Generate job ID
    const jobId = uuidv4();
    
    // Create validation job record
    const validationJob: ValidationJob = {
      jobId,
      status: 'pending',
      totalContacts: parseResult.totalRows,
      processedContacts: 0,
      validContacts: parseResult.validRows,
      invalidContacts: parseResult.invalidRows,
      createdAt: new Date(),
      s3InputKey: uploadEvent.s3Key
    };

    // Store job in DynamoDB
    console.log(`Creating validation job: ${jobId}`);
    const putJobCommand = new PutCommand({
      TableName: config.validationJobsTable,
      Item: {
        ...validationJob,
        createdAt: validationJob.createdAt.toISOString()
      }
    });

    await dynamoDocClient.send(putJobCommand);

    // Store parsed contacts in S3 for processing by validation Lambda
    const contactsKey = `jobs/${jobId}/contacts.json`;
    const putContactsCommand = new PutObjectCommand({
      Bucket: config.bucketName,
      Key: contactsKey,
      Body: JSON.stringify(parseResult.contacts),
      ContentType: 'application/json'
    });

    await s3Client.send(putContactsCommand);

    // Prepare response
    const response: FileProcessorResponse = {
      jobId,
      totalContacts: parseResult.totalRows,
      validContacts: parseResult.validRows,
      invalidContacts: parseResult.invalidRows,
      errors: parseResult.errors,
      warnings: fileValidation.warnings
    };

    console.log(`File processing completed successfully. Job ID: ${jobId}`);
    
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
    console.error('File processing error:', error);
    
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
        message: 'Failed to process uploaded file',
        details: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

// Helper function to convert stream to string
async function streamToString(stream: any): Promise<string> {
  const chunks: Buffer[] = [];
  
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}