# Email Validation Service

A production-ready serverless web application for validating email addresses from CSV files (especially HubSpot contact exports) using advanced DNS and SMTP verification techniques.

---

**Copyright © 2025 Dan Brody**  
**Website**: https://ctorescues.com  
**Author**: @dzbrody

---

## 🌟 Features

### ✅ **Advanced Email Validation**
- **DNS MX Record Verification**: Checks if domains have mail servers
- **SMTP Verification**: Connects to mail servers to verify mailbox existence
- **Major Provider Intelligence**: Smart handling of Gmail, Yahoo, Outlook, etc.
- **Detailed Bounce Classification**: Hard bounces, soft bounces, and complaints
- **Comprehensive Reporting**: Detailed reasons for each validation result

### 📊 **CSV Processing**
- **Robust CSV Parser**: Handles complex quoted CSV formats from HubSpot
- **Multiple Email Columns**: Supports "Email" and "Work email" columns
- **Large File Support**: Processes hundreds of contacts efficiently
- **Error Resilience**: Continues processing even with malformed rows

### 🌐 **Web Interface**
- **Drag & Drop Upload**: Easy file upload with progress tracking
- **Real-time Results**: Live validation statistics and progress
- **CSV Download**: Export detailed results with bounce reasons
- **Responsive Design**: Works on desktop and mobile devices

### 🏗️ **Production Architecture**
- **Serverless**: AWS Lambda functions with auto-scaling
- **Cross-Region**: Primary services in ca-central-1, SES in us-east-1
- **Custom Domain**: HTTPS with SSL certificate (your-email-service.your-domain.com)
- **CDN**: CloudFront distribution for global performance

## 🚀 Live Service

**Website**: https://your-email-service.your-domain.com

### How to Use:
1. **Upload CSV**: Drag and drop your contact CSV file
2. **Start Validation**: Click "Validate Emails" to begin processing
3. **View Results**: See real-time statistics and success rates
4. **Download Results**: Export detailed CSV with validation results

## 📋 CSV Format Support

The service automatically detects and processes these column formats:
- `Email` - Primary email column
- `Work email` - Alternative email column  
- `First Name` / `Last Name` - Contact names
- `Company` / `Company Name` - Organization info

**Supported Sources:**
- HubSpot CRM exports
- Standard CSV files with email columns
- Complex quoted CSV formats

## 🏛️ Architecture

### **Primary Region**: ca-central-1
- Lambda Functions (File Processing, Email Validation, Results Processing)
- API Gateway (REST API endpoints)
- S3 Buckets (File storage, Frontend hosting)
- DynamoDB Tables (Jobs, Results, Checkpoints)
- CloudFront Distribution (CDN)

### **SES Region**: us-east-1
- Email validation services
- Domain identity verification
- Bounce and complaint handling

### **Custom Domain**: your-email-service.your-domain.com
- SSL/TLS certificate
- Route 53 DNS configuration
- CloudFront distribution

## 📊 Validation Results

### **Email Status Classifications:**
- ✅ **Valid**: Email exists and can receive mail
- ❌ **Invalid**: Email doesn't exist or has issues
- ⚠️ **Soft Bounce**: Temporary issues (server busy, quota exceeded)
- 🚫 **Hard Bounce**: Permanent failures (domain doesn't exist, mailbox not found)
- 📧 **Complaint**: Spam/abuse reports

### **Sample Results:**
```csv
Email,Status,Bounce Type,Bounce Reason,Validated At
john.doe@gmail.com,Valid,"","Valid format for major email provider",2025-12-23T23:33:52Z
invalid@nonexistent.com,Invalid,hard,"Domain does not exist",2025-12-23T23:33:52Z
busy@example.com,Invalid,soft,"SMTP server timeout - server may be busy",2025-12-23T23:33:52Z
```

## 🛠️ Technical Stack

### **Backend Services:**
- **AWS Lambda**: Serverless compute (Node.js 18)
- **API Gateway**: REST API with CORS support
- **DynamoDB**: NoSQL database for jobs and results
- **S3**: File storage and static website hosting
- **SES**: Email validation and sending
- **CloudFront**: Global CDN with custom domain

### **Frontend:**
- **HTML5/CSS3/JavaScript**: Responsive web interface
- **Drag & Drop API**: Modern file upload experience
- **Fetch API**: RESTful API communication
- **Real-time Updates**: Progress tracking and statistics

### **Infrastructure as Code:**
- **AWS CDK**: TypeScript infrastructure definitions
- **Cross-Region Setup**: Automated multi-region deployment
- **SSL Certificates**: Automated certificate management
- **DNS Configuration**: Route 53 hosted zone integration

## 🔧 Development Setup

### Prerequisites
- Node.js 18+
- AWS CLI configured with `xgc-main` profile
- AWS CDK CLI installed
- TypeScript

### Installation
```bash
# Install dependencies
npm install

# Build the project
npm run build

# Deploy infrastructure (first time)
npm run bootstrap
npm run deploy
```

### Development Commands
```bash
# Run tests
npm test

# Build project
npm run build

# Deploy updates
npm run deploy

# View logs
aws logs tail /aws/lambda/EmailValidationServiceStack-EmailValidatorLambda --follow --profile xgc-main
```

## 📈 Performance & Scalability

### **Validation Speed:**
- **Small files** (< 100 emails): ~30 seconds
- **Medium files** (100-500 emails): ~2-5 minutes  
- **Large files** (500+ emails): ~5-15 minutes

### **Throughput:**
- **Concurrent processing**: Multiple batch validation
- **Rate limiting**: Respects SMTP server limits
- **Auto-scaling**: Lambda functions scale automatically
- **Resume capability**: Can resume interrupted validations

### **Reliability:**
- **Error resilience**: Continues processing despite individual failures
- **Retry logic**: Automatic retries for temporary failures
- **Checkpointing**: Progress saved for large files
- **Comprehensive logging**: Full audit trail

## 🔐 Security & Compliance

### **Data Protection:**
- **HTTPS Only**: All communications encrypted
- **Temporary Storage**: Files automatically deleted after processing
- **No Email Storage**: Email addresses not permanently stored
- **Access Control**: AWS IAM role-based permissions

### **Privacy:**
- **Processing Only**: No email content analysis
- **Temporary Results**: Validation results have TTL
- **No Third-Party Sharing**: Data stays within AWS infrastructure
- **GDPR Compliant**: Automatic data cleanup

## 📚 Documentation

### **Complete Documentation Suite:**

- **[API Documentation](docs/api-documentation.md)** - Complete REST API reference with examples
- **[User Guide](docs/user-guide.md)** - Step-by-step guide for using the web interface
- **[Deployment Guide](docs/deployment-guide.md)** - Infrastructure deployment and configuration
- **[Monitoring & Maintenance](docs/monitoring-maintenance.md)** - Operational procedures and monitoring

### **Quick API Reference:**

#### Upload File
```http
POST /upload
Content-Type: multipart/form-data

Response: {"jobId": "uuid", "s3Key": "path", "message": "success"}
```

#### Start Validation
```http
POST /validation
Content-Type: application/json

Body: {"jobId": "uuid", "s3Key": "path", "batchSize": 10}
Response: {"jobId": "uuid", "processedCount": 260, "validCount": 152, "invalidCount": 108}
```

#### Download Results
```http
GET /results/{jobId}?format=csv
Accept: text/csv

Response: CSV file with validation results
```

## 🎯 Use Cases

### **Marketing Teams:**
- Clean email lists before campaigns
- Improve deliverability rates
- Reduce bounce rates
- Maintain sender reputation

### **Sales Teams:**
- Validate prospect contact information
- Clean CRM data exports
- Improve outreach success rates
- Maintain data quality

### **Data Teams:**
- Bulk email validation
- Data quality assessment
- Contact database cleanup
- Integration with existing workflows

## 🚨 Troubleshooting

### **Common Issues:**

#### Upload Fails
- Check file format (CSV required)
- Ensure file size < 10MB
- Verify internet connection

#### Validation Timeout
- Large files may take time
- Check browser console for errors
- Try smaller batch sizes

#### Download Fails
- Wait for validation to complete
- Check job status
- Refresh page and try again

### **Support:**
- Check CloudWatch logs for detailed error information
- Verify AWS service status
- Contact system administrator

## 📊 Monitoring & Analytics

### **CloudWatch Metrics:**
- Lambda function duration and errors
- API Gateway request counts and latency
- DynamoDB read/write capacity
- S3 storage and transfer metrics

### **Logging:**
- Comprehensive application logs
- Error tracking and alerting
- Performance monitoring
- Usage analytics

## 🔄 Maintenance

### **Automated:**
- **File Cleanup**: Temporary files deleted after 24-72 hours
- **Result Expiry**: Validation results have TTL
- **Log Rotation**: CloudWatch log retention policies
- **Certificate Renewal**: Automatic SSL certificate renewal

### **Manual:**
- **Infrastructure Updates**: CDK deployments
- **Code Updates**: Lambda function updates
- **Monitoring**: Regular performance reviews
- **Security**: Periodic security assessments

---

## 📞 Contact & Support

**Author**: Dan Brody (@dzbrody)  
**Website**: https://ctorescues.com  
**Service URL**: https://your-email-service.your-domain.com

For technical support or questions about the Email Validation Service:
- **Infrastructure**: AWS CDK managed
- **Monitoring**: CloudWatch dashboards available
- **Professional Services**: Available through https://ctorescues.com

### **Documentation Status**: ✅ Complete

This service includes comprehensive documentation covering:
- ✅ **User Guide** - Complete web interface instructions
- ✅ **API Documentation** - Full REST API reference with examples
- ✅ **Deployment Guide** - Infrastructure setup and configuration
- ✅ **Monitoring Guide** - Operational procedures and maintenance
- ✅ **Architecture Overview** - System design and components
- ✅ **Troubleshooting** - Common issues and solutions

**System Status**: 🟢 Production Ready
- All core functionality implemented and tested
- Advanced email validation with DNS + SMTP verification
- Robust CSV parsing for HubSpot and other formats
- Real-time progress tracking and detailed results
- Production deployment with custom domain and SSL