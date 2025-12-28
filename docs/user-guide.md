# Email Validation Service - User Guide

---

**Copyright © 2025 Dan Brody**  
**Website**: https://ctorescues.com  
**Author**: @dzbrody

---

## Getting Started

The Email Validation Service is a web-based tool for validating email addresses from CSV files. It's particularly useful for cleaning contact lists from CRM systems like HubSpot.

**Website**: https://mailer.xgccorp.net

## Quick Start

### 1. Prepare Your CSV File

Ensure your CSV file contains email addresses in one of these column formats:
- `Email`
- `Work email`
- `Email Address`

**Example CSV format:**
```csv
"First Name","Last Name","Email","Company"
"John","Doe","john.doe@gmail.com","Acme Corp"
"Jane","Smith","jane.smith@yahoo.com","Tech Solutions"
```

### 2. Upload Your File

1. Visit https://your-email-service.your-domain.com
2. **Drag and drop** your CSV file onto the upload area, or **click to browse** and select your file
3. The file will upload automatically and show a green checkmark when complete

### 3. Start Validation

1. Click the **"Validate Emails"** button
2. The system will begin processing your emails immediately
3. You'll see real-time progress and statistics

### 4. View Results

Once validation is complete, you'll see:
- **Total Emails**: Number of email addresses processed
- **Valid**: Number of emails that can receive mail
- **Invalid**: Number of emails that will bounce
- **Success Rate**: Percentage of valid emails

### 5. Download Results

Click **"Download Results"** to get a detailed CSV file with:
- Original email addresses
- Validation status (Valid/Invalid)
- Bounce type (Hard/Soft/Complaint)
- Detailed bounce reasons
- Validation timestamps

## Understanding Results

### Email Status Types

#### ✅ Valid Emails
These emails exist and can receive mail:
- Major providers (Gmail, Yahoo, Outlook) with proper format
- Verified mailboxes on smaller domains
- Corporate email addresses that passed SMTP verification

#### ❌ Invalid Emails
These emails will bounce and should be removed:

**Hard Bounces** (Permanent failures):
- Invalid email format (missing @, malformed)
- Domain doesn't exist
- Mailbox doesn't exist
- Mail server permanently rejects the address

**Soft Bounces** (Temporary issues):
- SMTP server timeout (server busy)
- Mailbox temporarily full
- Server temporarily unavailable
- Rate limiting by mail server

**Complaints** (Spam/abuse issues):
- Address has reported spam complaints
- Sender reputation issues
- Blocked by recipient server

### Sample Results

```csv
Email,Status,Bounce Type,Bounce Reason,Validated At
"john.doe@gmail.com",Valid,"","Valid format for major email provider","2025-12-23T23:33:52Z"
"invalid@nonexistent.com",Invalid,"hard","Domain does not exist","2025-12-23T23:33:52Z"
"busy@example.com",Invalid,"soft","SMTP server timeout - server may be busy","2025-12-23T23:33:52Z"
```

## Supported File Formats

### CSV Requirements
- **File format**: CSV (.csv extension)
- **Maximum size**: 10MB
- **Encoding**: UTF-8 recommended
- **Headers**: Must include email column

### Supported CSV Sources
- **HubSpot CRM exports** (fully supported)
- **Salesforce exports**
- **Excel CSV exports**
- **Google Sheets exports**
- **Custom CSV files**

### Column Detection
The system automatically detects these column names (case-insensitive):

**Email Columns**:
- `Email`
- `Work email`
- `Email Address`
- `E-mail`

**Contact Information** (optional):
- `First Name`, `First`, `Given Name`
- `Last Name`, `Last`, `Surname`, `Family Name`
- `Company`, `Company Name`, `Organization`

## Processing Times

### Expected Processing Times
- **Small files** (1-50 emails): 30 seconds - 2 minutes
- **Medium files** (50-200 emails): 2-5 minutes
- **Large files** (200-500 emails): 5-15 minutes
- **Very large files** (500+ emails): 15-30 minutes

### Factors Affecting Speed
- **File size**: More emails take longer
- **Domain types**: Major providers (Gmail, Yahoo) process faster
- **Server response times**: Some mail servers are slower to respond
- **Network conditions**: Internet connectivity affects processing speed

## Best Practices

### Before Upload
1. **Clean your data**: Remove obviously invalid entries
2. **Check file format**: Ensure it's a proper CSV file
3. **Verify columns**: Make sure email column is properly named
4. **File size**: Keep files under 10MB for best performance

### During Processing
1. **Stay on the page**: Don't close the browser tab
2. **Be patient**: Large files take time to process
3. **Check progress**: Monitor the real-time statistics
4. **Don't refresh**: This will interrupt the process

### After Validation
1. **Download immediately**: Results are available for 24 hours
2. **Review bounce reasons**: Understand why emails failed
3. **Clean your lists**: Remove hard bounces permanently
4. **Retry soft bounces**: These might work later

## Troubleshooting

### Common Issues

#### Upload Problems
**Problem**: File won't upload
**Solutions**:
- Check file format (must be .csv)
- Verify file size is under 10MB
- Try a different browser
- Check internet connection

**Problem**: "Invalid file format" error
**Solutions**:
- Save file as CSV from Excel/Google Sheets
- Check file extension is .csv
- Ensure file contains email addresses

#### Validation Issues
**Problem**: Validation takes too long
**Solutions**:
- Large files naturally take longer
- Check browser console for errors
- Try with a smaller sample file first
- Ensure stable internet connection

**Problem**: "Error: Upload failed" message
**Solutions**:
- Refresh the page and try again
- Check file format and size
- Try a different browser
- Contact support if problem persists

#### Download Problems
**Problem**: Download button doesn't work
**Solutions**:
- Wait for validation to complete
- Check that results are available
- Try right-click "Save link as"
- Refresh page and try again

**Problem**: CSV file is empty or corrupted
**Solutions**:
- Ensure validation completed successfully
- Try downloading again
- Check browser download settings
- Contact support with job details

### Error Messages

#### "File upload failed"
- Check file format and size
- Verify internet connection
- Try again with a smaller file

#### "Validation timeout"
- File may be too large
- Try with smaller batch sizes
- Check network connectivity

#### "Results not found"
- Validation may not be complete
- Check job status
- Try refreshing the page

## Tips for Better Results

### Preparing Your Data
1. **Remove duplicates**: Clean your list before upload
2. **Fix obvious errors**: Remove entries like "N/A" or "TBD"
3. **Standardize format**: Ensure consistent email formatting
4. **Include context**: Keep name/company columns for reference

### Interpreting Results
1. **Focus on hard bounces**: These should be removed immediately
2. **Consider soft bounces**: May be temporary issues
3. **Review complaints**: These indicate reputation problems
4. **Check patterns**: Look for common issues in your data

### Using Results
1. **Update your CRM**: Remove invalid emails
2. **Segment your lists**: Separate valid from invalid
3. **Plan follow-up**: Decide how to handle soft bounces
4. **Monitor trends**: Track validation rates over time

## Data Privacy & Security

### Data Handling
- **Temporary processing**: Files are deleted after 24-72 hours
- **No permanent storage**: Email addresses are not kept long-term
- **Secure transmission**: All data encrypted in transit (HTTPS)
- **AWS infrastructure**: Hosted on secure AWS services

### Privacy Protection
- **No email content**: Only addresses are processed, not content
- **No third-party sharing**: Data stays within the validation system
- **Automatic cleanup**: Results and files automatically deleted
- **GDPR compliant**: Follows data protection regulations

## Getting Help

### Self-Service Resources
1. **Check this guide**: Most questions are answered here
2. **Review error messages**: They often contain helpful information
3. **Try smaller files**: Test with a sample to isolate issues
4. **Check browser console**: Look for JavaScript errors

### Contact Support
If you continue to have issues:
1. **Note the error message**: Copy exact error text
2. **Record job details**: Include job ID if available
3. **Describe the problem**: What were you trying to do?
4. **Include file details**: File size, format, source system

### System Status
- **Website**: https://your-email-service.your-domain.com
- **API Status**: Check AWS service health dashboards
- **Maintenance**: Scheduled maintenance announced in advance

## Frequently Asked Questions

### General Questions

**Q: How accurate is the email validation?**
A: The service uses multiple validation methods including DNS lookups and SMTP verification. Accuracy is typically 95%+ for clear cases, with detailed reasons provided for edge cases.

**Q: Can I validate the same file multiple times?**
A: Yes, but results should be consistent. The system doesn't store previous results, so each validation is independent.

**Q: What happens to my data after validation?**
A: Files and results are automatically deleted after 24-72 hours. No email addresses are permanently stored.

### Technical Questions

**Q: Why do some Gmail addresses show as invalid?**
A: Gmail and other major providers may block automated verification attempts. The system uses intelligent heuristics for these cases.

**Q: What's the difference between hard and soft bounces?**
A: Hard bounces are permanent failures (domain doesn't exist, invalid format). Soft bounces are temporary issues (server busy, mailbox full).

**Q: Can I integrate this with my CRM system?**
A: The service provides a REST API for integration. See the API documentation for technical details.

### Billing Questions

**Q: Is there a cost per validation?**
A: Current pricing and usage limits are available on the website. Contact your administrator for billing details.

**Q: Are there usage limits?**
A: File size is limited to 10MB. Processing time limits apply for very large files.

---

## Quick Reference

### Supported File Types
- ✅ CSV files (.csv)
- ✅ HubSpot exports
- ✅ Excel CSV exports
- ❌ Excel files (.xlsx)
- ❌ Text files (.txt)

### Column Names (Auto-detected)
- `Email`, `Work email`, `Email Address`
- `First Name`, `Last Name`
- `Company`, `Company Name`

### Processing Limits
- **Max file size**: 10MB
- **Processing time**: Up to 30 minutes
- **Result retention**: 24-72 hours

### Status Indicators
- ✅ **Valid**: Can receive email
- ❌ **Hard Bounce**: Permanent failure
- ⚠️ **Soft Bounce**: Temporary issue
- 🚫 **Complaint**: Spam/abuse report

---

*For technical support or questions about the Email Validation Service, contact your system administrator or check the API documentation for integration details.*