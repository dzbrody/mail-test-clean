# Email Validation Service API Documentation

---

**Copyright © 2025 Dan Brody**  
**Website**: https://ctorescues.com  
**Author**: @dzbrody

---

## Overview

The Email Validation Service provides a RESTful API for validating email addresses from CSV files. The API is built on AWS API Gateway and Lambda functions, providing scalable and reliable email validation capabilities.

**Base URL**: `https://your-api-id.execute-api.your-region.amazonaws.com/prod`  
**Custom Domain**: `https://your-email-service.your-domain.com/api` (CloudFront routing)

## Authentication

Currently, the API does not require authentication. All endpoints are publicly accessible with CORS enabled for web applications.

## Rate Limiting

- **File Upload**: No specific limits (AWS API Gateway defaults apply)
- **Validation**: Automatic rate limiting to respect SMTP server limits
- **Results**: Standard API Gateway limits

## Endpoints

### 1. Upload CSV File

Upload a CSV file containing email addresses for validation.

**Endpoint**: `POST /upload`

**Content-Type**: `multipart/form-data`

**Parameters**:
- `file` (required): CSV file containing email addresses

**Request Example**:
```bash
curl -X POST "https://your-api-id.execute-api.your-region.amazonaws.com/prod/upload" \
  -F "file=@contacts.csv" \
  -H "Accept: application/json"
```

**Response**:
```json
{
  "jobId": "a1c7cf93-7e05-4f95-9409-5acc3301af8c",
  "s3Key": "uploads/a1c7cf93-7e05-4f95-9409-5acc3301af8c/contacts.csv",
  "message": "File uploaded successfully"
}
```

**Response Codes**:
- `200 OK`: File uploaded successfully
- `400 Bad Request`: Invalid file format or missing file
- `413 Payload Too Large`: File exceeds size limits
- `500 Internal Server Error`: Server error during upload

---

### 2. Start Email Validation

Begin the email validation process for an uploaded CSV file.

**Endpoint**: `POST /validation`

**Content-Type**: `application/json`

**Parameters**:
- `jobId` (required): Job ID from the upload response
- `s3Key` (required): S3 key from the upload response
- `batchSize` (optional): Number of emails to process in each batch (default: 10)

**Request Example**:
```bash
curl -X POST "https://your-api-id.execute-api.your-region.amazonaws.com/prod/validation" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "jobId": "a1c7cf93-7e05-4f95-9409-5acc3301af8c",
    "s3Key": "uploads/a1c7cf93-7e05-4f95-9409-5acc3301af8c/contacts.csv",
    "batchSize": 20
  }'
```

**Response**:
```json
{
  "jobId": "a1c7cf93-7e05-4f95-9409-5acc3301af8c",
  "processedCount": 260,
  "validCount": 152,
  "invalidCount": 108,
  "results": [
    {
      "email": "john.doe@gmail.com",
      "isValid": true,
      "validatedAt": "2025-12-23T23:33:52.000Z",
      "bounceReason": "Valid format for major email provider (SMTP verification skipped)"
    },
    {
      "email": "invalid@nonexistent.com",
      "isValid": false,
      "validatedAt": "2025-12-23T23:33:52.000Z",
      "bounceType": "hard",
      "bounceReason": "Domain does not exist"
    }
  ]
}
```

**Response Codes**:
- `200 OK`: Validation completed successfully
- `400 Bad Request`: Invalid request parameters
- `404 Not Found`: Job ID or S3 key not found
- `500 Internal Server Error`: Validation error
- `504 Gateway Timeout`: Validation took too long (for very large files)

---

### 3. Download Validation Results

Download the validation results as a CSV file.

**Endpoint**: `GET /results/{jobId}`

**Query Parameters**:
- `format` (optional): Response format (`json` or `csv`, default: `json`)

**Request Example**:
```bash
# Download as CSV
curl "https://your-api-id.execute-api.your-region.amazonaws.com/prod/results/a1c7cf93-7e05-4f95-9409-5acc3301af8c?format=csv" \
  -H "Accept: text/csv" \
  -o validation-results.csv

# Get as JSON
curl "https://your-api-id.execute-api.your-region.amazonaws.com/prod/results/a1c7cf93-7e05-4f95-9409-5acc3301af8c" \
  -H "Accept: application/json"
```

**CSV Response**:
```csv
Email,Status,Bounce Type,Bounce Reason,Validated At
"john.doe@gmail.com",Valid,"","Valid format for major email provider","2025-12-23T23:33:52.000Z"
"invalid@nonexistent.com",Invalid,"hard","Domain does not exist","2025-12-23T23:33:52.000Z"
"busy@example.com",Invalid,"soft","SMTP server timeout - server may be busy","2025-12-23T23:33:52.000Z"
```

**JSON Response**:
```json
{
  "jobId": "a1c7cf93-7e05-4f95-9409-5acc3301af8c",
  "downloadUrls": {
    "cleanList": "https://s3.amazonaws.com/...",
    "rejectedList": "https://s3.amazonaws.com/...",
    "report": "https://s3.amazonaws.com/..."
  },
  "statistics": {
    "totalContacts": 260,
    "validContacts": 152,
    "invalidContacts": 108,
    "successRate": 58.46
  }
}
```

**Response Codes**:
- `200 OK`: Results retrieved successfully
- `404 Not Found`: Job ID not found or no results available
- `400 Bad Request`: Job not completed yet
- `500 Internal Server Error`: Error retrieving results

---

## Data Models

### Validation Result Object

```json
{
  "email": "string",           // The email address that was validated
  "isValid": boolean,          // Whether the email is valid
  "validatedAt": "string",     // ISO timestamp of validation
  "bounceType": "string",      // Type of bounce: "hard", "soft", "complaint"
  "bounceReason": "string"     // Detailed reason for validation result
}
```

### Bounce Types

- **`hard`**: Permanent delivery failure
  - Domain doesn't exist
  - Mailbox doesn't exist
  - Invalid email format
  
- **`soft`**: Temporary delivery issue
  - Server timeout
  - Mailbox full
  - Server temporarily unavailable
  
- **`complaint`**: Spam/abuse complaint
  - Sender reputation issues
  - Blocked by recipient server

### Common Bounce Reasons

#### Valid Emails
- `"Valid format for major email provider (SMTP verification skipped)"`
- `"Mailbox exists and can receive mail"`

#### Hard Bounces
- `"Invalid email format"`
- `"Domain does not exist"`
- `"Mailbox does not exist"`
- `"Domain validation failed - mail server rejected connection"`

#### Soft Bounces
- `"SMTP server timeout - server may be busy"`
- `"Temporary delivery issue - mail server busy or rate limited"`
- `"Mailbox quota exceeded - recipient mailbox is full"`
- `"Temporary server failure - mail server temporarily unavailable"`

#### Complaints
- `"Blocked due to complaint - sender reputation issue"`
- `"Complaint received - potential spam or abuse reported"`

---

## CSV File Format

### Supported Column Names

The API automatically detects these column names (case-insensitive):

**Email Columns**:
- `Email`
- `Work email`
- `Email Address`

**Contact Information** (optional):
- `First Name` / `First`
- `Last Name` / `Last`
- `Company` / `Company Name`

### Example CSV Format

```csv
"First Name","Last Name","Email","Company"
"John","Doe","john.doe@gmail.com","Acme Corp"
"Jane","Smith","jane.smith@yahoo.com","Tech Solutions"
"Bob","Johnson","invalid-email","Bad Company"
```

### CSV Processing Features

- **Quoted Fields**: Handles CSV files with quoted fields and embedded commas
- **Multiple Formats**: Supports various CSV export formats (HubSpot, Excel, etc.)
- **Error Resilience**: Continues processing even with malformed rows
- **Large Files**: Efficiently processes files with hundreds of contacts

---

## Error Handling

### Error Response Format

```json
{
  "error": "Error Type",
  "message": "Detailed error description"
}
```

### Common Errors

#### Upload Errors
```json
{
  "error": "Invalid file format",
  "message": "Only CSV files are supported"
}
```

#### Validation Errors
```json
{
  "error": "Invalid request",
  "message": "jobId and s3Key are required"
}
```

#### Results Errors
```json
{
  "error": "Job not completed",
  "message": "Job a1c7cf93-7e05-4f95-9409-5acc3301af8c is not yet completed. Current status: processing"
}
```

---

## CORS Support

All endpoints support Cross-Origin Resource Sharing (CORS) with the following headers:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, X-Amz-Date, Authorization, X-Api-Key
```

---

## Usage Examples

### Complete Workflow Example

```javascript
// 1. Upload CSV file
const formData = new FormData();
formData.append('file', csvFile);

const uploadResponse = await fetch('https://vyxhftdzc7.execute-api.ca-central-1.amazonaws.com/prod/upload', {
  method: 'POST',
  body: formData
});

const uploadResult = await uploadResponse.json();
console.log('Upload result:', uploadResult);

// 2. Start validation
const validationResponse = await fetch('https://vyxhftdzc7.execute-api.ca-central-1.amazonaws.com/prod/validation', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jobId: uploadResult.jobId,
    s3Key: uploadResult.s3Key,
    batchSize: 20
  })
});

const validationResult = await validationResponse.json();
console.log('Validation result:', validationResult);

// 3. Download results as CSV
const csvResponse = await fetch(`https://vyxhftdzc7.execute-api.ca-central-1.amazonaws.com/prod/results/${uploadResult.jobId}?format=csv`);
const csvData = await csvResponse.text();
console.log('CSV results:', csvData);
```

### Python Example

```python
import requests

# Upload file
with open('contacts.csv', 'rb') as f:
    files = {'file': f}
    upload_response = requests.post(
        'https://vyxhftdzc7.execute-api.ca-central-1.amazonaws.com/prod/upload',
        files=files
    )
    upload_result = upload_response.json()

# Start validation
validation_response = requests.post(
    'https://vyxhftdzc7.execute-api.ca-central-1.amazonaws.com/prod/validation',
    json={
        'jobId': upload_result['jobId'],
        's3Key': upload_result['s3Key'],
        'batchSize': 20
    }
)
validation_result = validation_response.json()

# Download CSV results
csv_response = requests.get(
    f"https://vyxhftdzc7.execute-api.ca-central-1.amazonaws.com/prod/results/{upload_result['jobId']}?format=csv"
)
csv_data = csv_response.text

print(f"Processed {validation_result['processedCount']} emails")
print(f"Valid: {validation_result['validCount']}, Invalid: {validation_result['invalidCount']}")
```

---

## Performance Considerations

### File Size Limits
- **Maximum file size**: 10MB (API Gateway limit)
- **Recommended batch size**: 10-50 emails per batch
- **Processing time**: ~1-2 seconds per email (depending on validation method)

### Optimization Tips
- **Smaller batches**: Use smaller batch sizes for faster initial results
- **Parallel processing**: The service automatically handles concurrent validation
- **Caching**: Results are cached to avoid re-validation of the same emails

### Timeouts
- **API Gateway timeout**: 30 seconds for individual requests
- **Lambda timeout**: 15 minutes for validation processing
- **Large files**: May require multiple requests or asynchronous processing

---

## Monitoring and Logging

### CloudWatch Metrics
- Request counts and error rates
- Lambda function duration and memory usage
- DynamoDB read/write capacity
- S3 storage and transfer metrics

### Logging
- All API requests are logged with request/response details
- Validation errors are logged with specific failure reasons
- Performance metrics are tracked for optimization

---

## Support and Troubleshooting

### Common Issues

1. **File Upload Fails**
   - Check file format (must be CSV)
   - Verify file size is under 10MB
   - Ensure proper Content-Type header

2. **Validation Timeout**
   - Try smaller batch sizes
   - Check for network connectivity issues
   - Large files may take several minutes

3. **Results Not Available**
   - Ensure validation has completed
   - Check job status in logs
   - Verify correct job ID

### Getting Help
- Check CloudWatch logs for detailed error information
- Verify API endpoint URLs
- Test with smaller sample files first
- Contact system administrator for infrastructure issues