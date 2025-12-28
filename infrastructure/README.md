# Email Validation Service Infrastructure

This directory contains the AWS CDK infrastructure code for the Email Validation Service, which deploys a hybrid multi-region architecture across ca-central-1 (primary) and us-east-1 (SES).

## Architecture Overview

### Primary Region (ca-central-1)
- **Lambda Functions**: 4 serverless functions for processing
- **API Gateway**: RESTful API with CORS configuration
- **S3 Buckets**: File storage and frontend hosting
- **DynamoDB Tables**: Job tracking and results storage
- **CloudFront**: CDN for frontend distribution

### SES Region (us-east-1)
- **SES Integration**: Email validation and sending
- **Domain Identity**: xgccorp.com (existing)
- **IAM User**: email-worker-smtp (existing)

## Prerequisites

1. **AWS CLI configured** with appropriate credentials
2. **CDK bootstrapped** in ca-central-1 region
3. **SES domain identity** verified in us-east-1
4. **Environment variables** set:
   - `CDK_DEFAULT_ACCOUNT`: Your AWS account ID
   - `CDK_DEFAULT_REGION`: ca-central-1

## Deployment

### Quick Deployment
```bash
npm run deploy:infrastructure
```

### Manual Deployment Steps
```bash
# 1. Install dependencies
npm install

# 2. Build Lambda functions
npm run build

# 3. Bootstrap CDK (if not done)
cdk bootstrap aws://ACCOUNT-ID/ca-central-1

# 4. Deploy infrastructure
cdk deploy
```

## Infrastructure Components

### Lambda Functions
- **FileProcessorLambda**: Handles CSV file uploads and parsing
- **EmailValidatorLambda**: Validates emails using SES in us-east-1
- **ResultsProcessorLambda**: Generates clean and rejected contact lists
- **EmailSenderLambda**: Sends bulk emails using SES

### API Gateway Endpoints
- `POST /upload` - File upload
- `POST /validation` - Start validation
- `GET /validation/{jobId}` - Check validation status
- `GET /results/{jobId}` - Download results
- `POST /email` - Send emails

### Storage
- **S3 File Bucket**: Temporary storage for uploaded files and results
- **S3 Frontend Bucket**: Static website hosting
- **DynamoDB ValidationJobs**: Job tracking and metadata
- **DynamoDB ValidationResults**: Individual email validation results

### Cross-Region Configuration
- Lambda functions in ca-central-1 have IAM permissions to access SES in us-east-1
- Environment variables configure cross-region SES access
- Existing domain identity and IAM user integration

## Testing

Run infrastructure configuration tests:
```bash
npm test -- test/infrastructure-configuration.unit.test.ts
```

## Monitoring

After deployment, monitor resources through:
- AWS CloudWatch for Lambda metrics and logs
- API Gateway metrics for request/response patterns
- S3 access logs for file operations
- DynamoDB metrics for table performance

## Security

- IAM roles follow least-privilege principle
- Cross-region SES access is explicitly configured
- S3 buckets have appropriate CORS and lifecycle policies
- API Gateway includes CORS configuration for frontend integration

## Cost Optimization

- DynamoDB uses on-demand billing
- S3 lifecycle rules automatically clean up temporary files
- Lambda functions are sized appropriately for workload
- CloudFront caching reduces origin requests

## Troubleshooting

### Common Issues
1. **CDK Bootstrap**: Ensure CDK is bootstrapped in ca-central-1
2. **SES Permissions**: Verify domain identity is verified in us-east-1
3. **IAM Permissions**: Check that deployment role has necessary permissions
4. **Region Configuration**: Ensure environment variables are set correctly

### Useful Commands
```bash
# Check CDK diff
cdk diff

# Synthesize CloudFormation template
cdk synth

# Destroy infrastructure (careful!)
cdk destroy
```