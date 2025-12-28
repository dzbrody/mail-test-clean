# Email Validation Service - Setup Guide

---

**Copyright © 2025 Dan Brody**  
**Website**: https://ctorescues.com  
**Author**: @dzbrody

---

## Quick Start

This is a production-ready serverless email validation service built with AWS CDK. Follow these steps to deploy your own instance.

## Prerequisites

### Required Tools
- **Node.js 18+**
- **AWS CLI** configured with appropriate permissions
- **AWS CDK CLI**: `npm install -g aws-cdk`
- **Git**

### AWS Requirements
- AWS account with administrative permissions
- Route 53 hosted zone for your domain
- SES domain identity verified (for email sending features)

## Installation

### 1. Clone and Install

```bash
git clone https://github.com/dzbrody/mail-test-clean.git
cd mail-test-clean
npm install
```

### 2. Configure Your Environment

Copy the example environment file and update with your values:

```bash
cp .env.example .env
```

Edit `.env` with your specific configuration:

```bash
# AWS Configuration
AWS_REGION=ca-central-1
SES_REGION=us-east-1

# Your Domain Configuration
SES_DOMAIN_IDENTITY=your-domain.com
FROM_EMAIL_ADDRESS=no-reply@your-domain.com
FROM_EMAIL_NAME=Your Service Name

# SMTP Configuration (if using email sending)
SMTP_USERNAME=your-smtp-username
SMTP_PASSWORD=your-smtp-password

# Secrets Manager (Production)
USE_SECRETS_MANAGER=true
SECRETS_MANAGER_SECRET_NAME=your-smtp-secret-name
```

### 3. Update Infrastructure Configuration

Edit `infrastructure/email-validation-service-stack.ts`:

```typescript
// Update these values for your deployment
const domainName = 'your-email-service.your-domain.com';
const hostedZoneId = 'YOUR_HOSTED_ZONE_ID';

// Update hosted zone
const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
  hostedZoneId: hostedZoneId,
  zoneName: 'your-domain.com'
});
```

### 4. Configure AWS Profile

```bash
# Configure AWS CLI
aws configure --profile your-profile-name

# Set your profile as default (optional)
export AWS_PROFILE=your-profile-name
```

## Deployment

### 1. Bootstrap CDK

```bash
# Bootstrap CDK in your regions
cdk bootstrap --region ca-central-1
cdk bootstrap --region us-east-1  # Required for SES and certificates
```

### 2. Build and Deploy

```bash
# Build the project
npm run build

# Deploy infrastructure
npm run deploy
```

### 3. Verify Deployment

After deployment, you'll see outputs including:
- API Gateway endpoint URL
- CloudFront distribution URL
- S3 bucket names

Test the API:
```bash
curl https://your-api-id.execute-api.your-region.amazonaws.com/prod/health
```

## Configuration Options

### Email Sending (Optional)

If you want to enable email sending features:

1. **Verify SES Domain**:
   ```bash
   aws ses verify-domain-identity --domain your-domain.com --region us-east-1
   ```

2. **Create SMTP Credentials**:
   - Go to AWS SES Console
   - Create SMTP credentials
   - Store in AWS Secrets Manager or environment variables

3. **Update Configuration**:
   ```bash
   # Add to your .env file
   USE_SECRETS_MANAGER=true
   SECRETS_MANAGER_SECRET_NAME=your-smtp-secret
   ```

### Custom Domain Setup

1. **Update DNS**: The CDK will create the necessary Route 53 records
2. **SSL Certificate**: Automatically created and managed
3. **CloudFront**: CDN distribution with custom domain

## Usage

### Web Interface

Visit your deployed domain to use the web interface:
1. Upload CSV file with email addresses
2. Start validation process
3. Download results with detailed bounce reasons

### API Integration

Use the REST API for programmatic access:

```javascript
// Upload file
const formData = new FormData();
formData.append('file', csvFile);
const uploadResponse = await fetch('/upload', {
  method: 'POST',
  body: formData
});

// Start validation
const validationResponse = await fetch('/validation', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jobId: uploadResult.jobId,
    s3Key: uploadResult.s3Key
  })
});

// Download results
const csvResponse = await fetch(`/results/${jobId}?format=csv`);
```

## Monitoring

### CloudWatch Dashboards

The service includes comprehensive monitoring:
- Lambda function metrics
- API Gateway performance
- DynamoDB usage
- S3 storage metrics

### Logs

View logs using AWS CLI:
```bash
aws logs tail /aws/lambda/EmailValidationServiceStack-EmailValidatorLambda --follow
```

## Customization

### Batch Size Configuration

Adjust processing batch sizes in `src/shared/utils/environment.ts`:

```typescript
batchSize: parseInt(process.env.BATCH_SIZE || '50'),
```

### File Size Limits

Update maximum file size:

```typescript
maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB
```

### Validation Logic

Customize email validation in `src/lambdas/email-validator/index.ts`:
- Add custom validation rules
- Modify bounce reason categorization
- Adjust retry logic

## Troubleshooting

### Common Issues

1. **Deployment Fails**:
   - Check AWS permissions
   - Verify CDK bootstrap completed
   - Ensure domain/hosted zone exists

2. **API Returns 403**:
   - Check CORS configuration
   - Verify API Gateway deployment

3. **Email Validation Slow**:
   - Adjust batch sizes
   - Check Lambda memory allocation
   - Monitor DynamoDB capacity

### Getting Help

- Check CloudWatch logs for detailed errors
- Review AWS service limits
- Consult the [API Documentation](docs/api-documentation.md)
- Visit [CTO Rescues](https://ctorescues.com) for professional support

## Security Considerations

### Production Deployment

1. **Use Secrets Manager**: Store credentials securely
2. **Enable CloudTrail**: Audit all API calls
3. **Configure VPC**: Add network security (optional)
4. **Set up Monitoring**: CloudWatch alarms for errors
5. **Regular Updates**: Keep dependencies current

### Data Privacy

- Files are automatically deleted after processing
- No email addresses stored permanently
- All communications encrypted (HTTPS)
- GDPR compliant data handling

## Cost Optimization

### Expected Costs

For moderate usage (1000 validations/month):
- **Lambda**: ~$1-5/month
- **API Gateway**: ~$1-3/month
- **DynamoDB**: ~$1-2/month
- **S3**: ~$0.50/month
- **CloudFront**: ~$1/month

### Optimization Tips

1. **Use On-Demand DynamoDB**: Better for variable workloads
2. **Optimize Lambda Memory**: Monitor and adjust allocation
3. **Enable S3 Lifecycle**: Automatic cleanup of old files
4. **Use ARM Processors**: 20% cost savings on Lambda

## Support

### Community Support
- GitHub Issues: Report bugs and feature requests
- Documentation: Comprehensive guides available

### Professional Support
- **Consulting**: Available through [CTO Rescues](https://ctorescues.com)
- **Custom Development**: Tailored solutions for enterprise needs
- **Training**: AWS serverless architecture training

---

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

Contributions welcome! Please read our [Security Policy](SECURITY.md) for responsible disclosure of security issues.

---

**Built with ❤️ by Dan Brody (@dzbrody)**  
**Professional AWS consulting available at https://ctorescues.com**