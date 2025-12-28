// AWS client utilities
import { SESClient } from '@aws-sdk/client-ses';
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// SES client for us-east-1 region (where domain identity exists)
export const sesClient = new SESClient({ 
  region: process.env.SES_REGION || 'us-east-1' 
});

// S3 client for ca-central-1 region (primary region)
export const s3Client = new S3Client({ 
  region: process.env.AWS_REGION || 'ca-central-1' 
});

// DynamoDB client for ca-central-1 region (primary region)
const dynamoClient = new DynamoDBClient({ 
  region: process.env.AWS_REGION || 'ca-central-1' 
});

export const dynamoDocClient = DynamoDBDocumentClient.from(dynamoClient);