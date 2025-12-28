// Environment configuration
export const config = {
  // AWS Regions
  primaryRegion: process.env.AWS_REGION || 'ca-central-1',
  sesRegion: process.env.SES_REGION || 'us-east-1',
  
  // SES Configuration
  domainIdentity: process.env.SES_DOMAIN_IDENTITY || 'your-domain.com',
  domainIdentityArn: process.env.SES_DOMAIN_IDENTITY_ARN || 'arn:aws:ses:us-east-1:YOUR_ACCOUNT_ID:identity/your-domain.com',
  
  // S3 Configuration
  bucketName: process.env.S3_BUCKET_NAME || 'email-validation-service-bucket',
  
  // DynamoDB Configuration
  validationJobsTable: process.env.VALIDATION_JOBS_TABLE || 'ValidationJobs',
  validationResultsTable: process.env.VALIDATION_RESULTS_TABLE || 'ValidationResults',
  
  // Processing Configuration
  batchSize: parseInt(process.env.BATCH_SIZE || '100'),
  maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
  
  // File Configuration
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB
  allowedFileTypes: ['text/csv', 'application/csv'],
  
  // Email Configuration
  fromEmail: process.env.FROM_EMAIL || 'noreply@your-domain.com',
  replyToEmail: process.env.REPLY_TO_EMAIL || 'support@your-domain.com'
};