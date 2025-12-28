# Email Validation Service - Deployment Guide

---

**Copyright © 2025 Dan Brody**  
**Website**: https://ctorescues.com  
**Author**: @dzbrody

---

## Overview

This guide covers deploying and maintaining the Email Validation Service on AWS using CDK (Cloud Development Kit). The service uses a hybrid architecture with primary services in `ca-central-1` and SES in `us-east-1`.

## Prerequisites

### Required Tools
- **Node.js 18+**: Runtime environment
- **AWS CLI**: Configured with `xgc-main` profile
- **AWS CDK CLI**: `npm install -g aws-cdk`
- **TypeScript**: For building the project

### AWS Account Setup
- AWS account with appropriate permissions
- Route 53 hosted zone for `xgccorp.net`
- SES domain identity verified in `us-east-1`
- IAM user with SMTP credentials (if using email sending)

## Initial Deployment

### 1. Clone and Setup

```bash
# Clone the repository
git clone <repository-url>
cd email-validation-service

# Install dependencies
npm install

# Build the project
npm run build
```

### 2. Configure AWS Profile

```bash
# Configure AWS CLI with your profile
aws configure --profile xgc-main

# Verify configuration
aws sts get-caller-identity --profile xgc-main
```

### 3. Bootstrap CDK (First Time Only)

```bash
# Bootstrap CDK in both regions
cdk bootstrap --profile xgc-main --region ca-central-1
cdk bootstrap --profile xgc-main --region us-east-1
```

### 4. Deploy Infrastructure

```bash
# Deploy the complete stack
npm run deploy

# Or use CDK directly
cdk deploy --profile xgc-main --region ca-central-1
```

### 5. Verify Deployment

```bash
# Check stack status
aws cloudformation describe-stacks \
  --stack-name EmailValidationServiceStack \
  --profile xgc-main \
  --region ca-central-1

# Test the API endpoint
curl https://vyxhftdzc7.execute-api.ca-central-1.amazonaws.com/prod/health
```

## Architecture Components

### Primary Region (ca-central-1)

#### Lambda Functions
- **File Processor**: Handles CSV uploads and parsing
- **Email Validator**: Performs email validation with DNS/SMTP checks
- **Results Processor**: Generates downloadable results

#### Storage & Database
- **S3 Bucket**: File storage with lifecycle policies
- **DynamoDB Tables**: Jobs, results, and checkpoints
- **CloudWatch Logs**: Application logging

#### API & CDN
- **API Gateway**: REST API endpoints
- **CloudFront**: CDN with custom domain
- **Route 53**: DNS configuration

### Secondary Region (us-east-1)

#### Email Services
- **AWS SES**: Email validation and sending
- **SSL Certificate**: CloudFront certificate (required in us-east-1)

## Configuration Management

### Environment Variables

Set these in your Lambda functions:

```bash
# Required for all functions
AWS_REGION=ca-central-1
NODE_ENV=production

# For email sending (optional)
USE_SECRETS_MANAGER=true
SES_REGION=us-east-1
```

### Secrets Manager Setup

If using email sending features:

```bash
# Create SMTP credentials secret
aws secretsmanager create-secret \
  --name "smtp_ses_us-east-1_main" \
  --description "SMTP credentials for SES" \
  --secret-string '{
    "SMTP_USERNAME": "your-smtp-username",
    "SMTP_PASSWORD": "your-smtp-password",
    "FROM_EMAIL_ADDRESS": "no-reply@xgccorp.net",
    "FROM_EMAIL_NAME": "Email Validation Service"
  }' \
  --profile xgc-main \
  --region ca-central-1
```

## Custom Domain Setup

### DNS Configuration

The service is configured for `mailer.xgccorp.net`:

1. **SSL Certificate**: Automatically created in `us-east-1`
2. **CloudFront Distribution**: CDN with custom domain
3. **Route 53 Record**: A-record pointing to CloudFront

### Updating Domain

To change the domain, update `infrastructure/email-validation-service-stack.ts`:

```typescript
// Update these values
const domainName = 'your-domain.com';
const hostedZoneId = 'YOUR_HOSTED_ZONE_ID';
```

## Monitoring & Logging

### CloudWatch Dashboards

Create custom dashboards for monitoring:

```bash
# View Lambda logs
aws logs tail /aws/lambda/EmailValidationServiceStack-EmailValidatorLambda \
  --follow --profile xgc-main --region ca-central-1

# View API Gateway logs
aws logs tail /aws/apigateway/EmailValidationServiceStack \
  --follow --profile xgc-main --region ca-central-1
```

### Key Metrics to Monitor

- **Lambda Duration**: Function execution times
- **API Gateway Errors**: 4xx/5xx response rates
- **DynamoDB Throttling**: Read/write capacity issues
- **S3 Storage**: File storage usage
- **SES Bounce Rates**: Email deliverability

### Alarms Setup

```bash
# Create CloudWatch alarm for Lambda errors
aws cloudwatch put-metric-alarm \
  --alarm-name "EmailValidator-Errors" \
  --alarm-description "Lambda function errors" \
  --metric-name "Errors" \
  --namespace "AWS/Lambda" \
  --statistic "Sum" \
  --period 300 \
  --threshold 5 \
  --comparison-operator "GreaterThanThreshold" \
  --dimensions Name=FunctionName,Value=EmailValidationServiceStack-EmailValidatorLambda \
  --profile xgc-main \
  --region ca-central-1
```

## Updates and Maintenance

### Code Updates

```bash
# Build and deploy updates
npm run build
npm run deploy

# Deploy specific functions only
cdk deploy --hotswap --profile xgc-main
```

### Database Maintenance

```bash
# Check DynamoDB table status
aws dynamodb describe-table \
  --table-name ValidationJobs \
  --profile xgc-main \
  --region ca-central-1

# Monitor capacity usage
aws dynamodb describe-table \
  --table-name ValidationResults \
  --profile xgc-main \
  --region ca-central-1
```

### S3 Cleanup

```bash
# List old files
aws s3 ls s3://email-validation-service-bucket/temp/ \
  --recursive --profile xgc-main

# Manual cleanup if needed
aws s3 rm s3://email-validation-service-bucket/temp/ \
  --recursive --profile xgc-main
```

## Backup and Recovery

### Data Backup

```bash
# Export DynamoDB table
aws dynamodb scan \
  --table-name ValidationJobs \
  --profile xgc-main \
  --region ca-central-1 > jobs-backup.json

# Backup S3 bucket
aws s3 sync s3://email-validation-service-bucket \
  ./backup-folder --profile xgc-main
```

### Disaster Recovery

1. **Infrastructure**: Redeploy using CDK
2. **Data**: Restore from DynamoDB backups
3. **Files**: Restore from S3 backups
4. **DNS**: Update Route 53 records if needed

## Security Considerations

### IAM Permissions

The service uses least-privilege IAM roles:

- **Lambda Execution Role**: Access to DynamoDB, S3, SES, Secrets Manager
- **API Gateway Role**: CloudWatch logging permissions
- **CloudFront Role**: S3 bucket access

### Data Protection

- **Encryption in Transit**: HTTPS/TLS for all communications
- **Encryption at Rest**: S3 and DynamoDB encryption enabled
- **Data Retention**: Automatic cleanup with TTL settings
- **Access Control**: IAM-based access control

### Security Updates

```bash
# Update dependencies
npm audit
npm update

# Rebuild and redeploy
npm run build
npm run deploy
```

## Performance Optimization

### Lambda Optimization

- **Memory Allocation**: Adjust based on usage patterns
- **Timeout Settings**: Configure appropriate timeouts
- **Concurrent Executions**: Monitor and adjust limits

### DynamoDB Optimization

- **Read/Write Capacity**: Use on-demand or adjust provisioned capacity
- **Indexes**: Add GSIs for common query patterns
- **TTL Settings**: Optimize data retention periods

### S3 Optimization

- **Storage Classes**: Use appropriate storage classes
- **Lifecycle Policies**: Automate data archival
- **Transfer Acceleration**: Enable for global users

## Troubleshooting

### Common Issues

#### Deployment Failures

```bash
# Check CloudFormation events
aws cloudformation describe-stack-events \
  --stack-name EmailValidationServiceStack \
  --profile xgc-main \
  --region ca-central-1

# View detailed error logs
cdk deploy --verbose --profile xgc-main
```

#### Lambda Function Errors

```bash
# View function logs
aws logs filter-log-events \
  --log-group-name "/aws/lambda/EmailValidationServiceStack-EmailValidatorLambda" \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --profile xgc-main \
  --region ca-central-1
```

#### API Gateway Issues

```bash
# Test API endpoints
curl -X POST https://vyxhftdzc7.execute-api.ca-central-1.amazonaws.com/prod/upload \
  -F "file=@test.csv" \
  -v

# Check API Gateway logs
aws logs filter-log-events \
  --log-group-name "API-Gateway-Execution-Logs" \
  --profile xgc-main \
  --region ca-central-1
```

### Performance Issues

1. **High Latency**: Check Lambda cold starts and memory allocation
2. **Timeout Errors**: Increase Lambda timeout settings
3. **Rate Limiting**: Implement exponential backoff
4. **Memory Issues**: Monitor Lambda memory usage

## Cost Optimization

### Cost Monitoring

```bash
# Check AWS costs
aws ce get-cost-and-usage \
  --time-period Start=2025-01-01,End=2025-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --profile xgc-main
```

### Optimization Strategies

- **Lambda**: Use ARM-based processors for cost savings
- **DynamoDB**: Use on-demand billing for variable workloads
- **S3**: Implement lifecycle policies for data archival
- **CloudFront**: Optimize cache settings to reduce origin requests

## Support and Maintenance

### Regular Maintenance Tasks

**Weekly**:
- Review CloudWatch logs for errors
- Check system performance metrics
- Monitor cost usage

**Monthly**:
- Update dependencies and security patches
- Review and optimize resource usage
- Backup critical configuration

**Quarterly**:
- Security audit and penetration testing
- Performance optimization review
- Disaster recovery testing

### Getting Support

1. **AWS Support**: Use AWS Support Center for infrastructure issues
2. **CloudWatch Insights**: Use for log analysis and troubleshooting
3. **AWS Trusted Advisor**: For optimization recommendations

---

## Quick Reference Commands

```bash
# Deploy
npm run build && npm run deploy

# View logs
aws logs tail /aws/lambda/EmailValidationServiceStack-EmailValidatorLambda --follow --profile xgc-main

# Check status
aws cloudformation describe-stacks --stack-name EmailValidationServiceStack --profile xgc-main --region ca-central-1

# Update code only
cdk deploy --hotswap --profile xgc-main

# Destroy stack (careful!)
cdk destroy --profile xgc-main
```

---

*For additional support or questions about deployment, refer to the AWS CDK documentation or contact your system administrator.*