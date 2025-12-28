# Email Validation Service - Monitoring & Maintenance Guide

---

**Copyright © 2025 Dan Brody**  
**Website**: https://ctorescues.com  
**Author**: @dzbrody

---

## Overview

This guide covers monitoring, maintenance, and operational procedures for the Email Validation Service. The service runs on AWS with components across multiple regions and requires regular monitoring to ensure optimal performance.

## System Health Monitoring

### Key Performance Indicators (KPIs)

#### Service Availability
- **API Gateway Uptime**: Target 99.9%
- **Lambda Function Success Rate**: Target 99.5%
- **CloudFront Cache Hit Rate**: Target 85%+
- **End-to-End Processing Success**: Target 95%+

#### Performance Metrics
- **File Upload Time**: < 30 seconds for 10MB files
- **Email Validation Speed**: 1-2 seconds per email
- **Results Download Time**: < 10 seconds for CSV generation
- **API Response Time**: < 2 seconds for status endpoints

#### Resource Utilization
- **Lambda Memory Usage**: Monitor for optimization
- **DynamoDB Read/Write Capacity**: Avoid throttling
- **S3 Storage Growth**: Track file accumulation
- **Data Transfer Costs**: Monitor cross-region traffic

### CloudWatch Dashboards

#### Primary Dashboard - Service Overview

```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/Lambda", "Duration", "FunctionName", "EmailValidationServiceStack-EmailValidatorLambda"],
          ["AWS/Lambda", "Errors", "FunctionName", "EmailValidationServiceStack-EmailValidatorLambda"],
          ["AWS/ApiGateway", "Count", "ApiName", "EmailValidationServiceStack"],
          ["AWS/ApiGateway", "4XXError", "ApiName", "EmailValidationServiceStack"]
        ],
        "period": 300,
        "stat": "Average",
        "region": "ca-central-1",
        "title": "Service Health Overview"
      }
    }
  ]
}
```

#### Performance Dashboard

Create custom dashboard for detailed metrics:

```bash
# Create CloudWatch dashboard
aws cloudwatch put-dashboard \
  --dashboard-name "EmailValidationService" \
  --dashboard-body file://dashboard-config.json \
  --profile xgc-main \
  --region ca-central-1
```

### Automated Monitoring Setup

#### CloudWatch Alarms

```bash
# Lambda function errors
aws cloudwatch put-metric-alarm \
  --alarm-name "EmailValidator-HighErrorRate" \
  --alarm-description "High error rate in email validator" \
  --metric-name "Errors" \
  --namespace "AWS/Lambda" \
  --statistic "Sum" \
  --period 300 \
  --threshold 10 \
  --comparison-operator "GreaterThanThreshold" \
  --dimensions Name=FunctionName,Value=EmailValidationServiceStack-EmailValidatorLambda \
  --alarm-actions "arn:aws:sns:ca-central-1:ACCOUNT:email-alerts" \
  --profile xgc-main \
  --region ca-central-1

# API Gateway high latency
aws cloudwatch put-metric-alarm \
  --alarm-name "APIGateway-HighLatency" \
  --alarm-description "High latency in API Gateway" \
  --metric-name "Latency" \
  --namespace "AWS/ApiGateway" \
  --statistic "Average" \
  --period 300 \
  --threshold 5000 \
  --comparison-operator "GreaterThanThreshold" \
  --dimensions Name=ApiName,Value=EmailValidationServiceStack \
  --profile xgc-main \
  --region ca-central-1

# DynamoDB throttling
aws cloudwatch put-metric-alarm \
  --alarm-name "DynamoDB-ReadThrottling" \
  --alarm-description "DynamoDB read throttling detected" \
  --metric-name "ReadThrottledEvents" \
  --namespace "AWS/DynamoDB" \
  --statistic "Sum" \
  --period 300 \
  --threshold 1 \
  --comparison-operator "GreaterThanThreshold" \
  --dimensions Name=TableName,Value=ValidationResults \
  --profile xgc-main \
  --region ca-central-1
```

## Log Management

### Log Aggregation Strategy

#### Lambda Function Logs
- **Location**: `/aws/lambda/[FunctionName]`
- **Retention**: 30 days for production, 7 days for development
- **Format**: Structured JSON logging with correlation IDs

#### API Gateway Logs
- **Access Logs**: Request/response details
- **Execution Logs**: Detailed API Gateway processing
- **Error Logs**: 4xx/5xx responses with context

#### Application Logs
- **Validation Results**: Success/failure with reasons
- **Performance Metrics**: Processing times and batch sizes
- **Error Details**: Stack traces and context information

### Log Analysis Queries

#### CloudWatch Insights Queries

```sql
-- Find validation errors in the last hour
fields @timestamp, @message
| filter @message like /ERROR/
| filter @timestamp > @timestamp - 1h
| sort @timestamp desc
| limit 100

-- Analyze processing performance
fields @timestamp, @duration, @message
| filter @message like /Processing batch/
| stats avg(@duration) by bin(5m)

-- Track validation success rates
fields @timestamp, @message
| filter @message like /Validation complete/
| parse @message "processed: *, valid: *, invalid: *" as processed, valid, invalid
| stats sum(valid) / sum(processed) * 100 as success_rate by bin(1h)
```

### Log Retention and Archival

```bash
# Set log retention policies
aws logs put-retention-policy \
  --log-group-name "/aws/lambda/EmailValidationServiceStack-EmailValidatorLambda" \
  --retention-in-days 30 \
  --profile xgc-main \
  --region ca-central-1

# Export logs to S3 for long-term storage
aws logs create-export-task \
  --log-group-name "/aws/lambda/EmailValidationServiceStack-EmailValidatorLambda" \
  --from $(date -d '30 days ago' +%s)000 \
  --to $(date +%s)000 \
  --destination "email-validation-logs-archive" \
  --profile xgc-main \
  --region ca-central-1
```

## Performance Monitoring

### Response Time Tracking

#### API Endpoint Performance
```bash
# Monitor API response times
curl -w "@curl-format.txt" -o /dev/null -s \
  "https://vyxhftdzc7.execute-api.ca-central-1.amazonaws.com/prod/health"

# curl-format.txt content:
#     time_namelookup:  %{time_namelookup}\n
#     time_connect:     %{time_connect}\n
#     time_appconnect:  %{time_appconnect}\n
#     time_pretransfer: %{time_pretransfer}\n
#     time_redirect:    %{time_redirect}\n
#     time_starttransfer: %{time_starttransfer}\n
#     time_total:       %{time_total}\n
```

#### Lambda Performance Metrics
```bash
# Get Lambda performance statistics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=EmailValidationServiceStack-EmailValidatorLambda \
  --start-time $(date -d '24 hours ago' -u +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Average,Maximum \
  --profile xgc-main \
  --region ca-central-1
```

### Resource Utilization Monitoring

#### DynamoDB Metrics
```bash
# Monitor DynamoDB capacity utilization
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedReadCapacityUnits \
  --dimensions Name=TableName,Value=ValidationResults \
  --start-time $(date -d '1 hour ago' -u +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --profile xgc-main \
  --region ca-central-1
```

#### S3 Storage Monitoring
```bash
# Check S3 bucket size and object count
aws cloudwatch get-metric-statistics \
  --namespace AWS/S3 \
  --metric-name BucketSizeBytes \
  --dimensions Name=BucketName,Value=email-validation-service-bucket Name=StorageType,Value=StandardStorage \
  --start-time $(date -d '1 day ago' -u +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 86400 \
  --statistics Average \
  --profile xgc-main \
  --region ca-central-1
```

## Maintenance Procedures

### Regular Maintenance Tasks

#### Daily Tasks (Automated)
- **Health Checks**: Verify all services are responding
- **Error Rate Monitoring**: Check for unusual error patterns
- **Performance Metrics**: Review response times and throughput
- **Cost Monitoring**: Track daily AWS usage costs

#### Weekly Tasks
- **Log Review**: Analyze error logs and performance trends
- **Capacity Planning**: Review resource utilization trends
- **Security Monitoring**: Check for unusual access patterns
- **Backup Verification**: Ensure automated backups are working

#### Monthly Tasks
- **Performance Optimization**: Review and optimize resource allocation
- **Cost Analysis**: Detailed cost breakdown and optimization opportunities
- **Security Audit**: Review IAM permissions and access logs
- **Dependency Updates**: Update Lambda runtime and dependencies

#### Quarterly Tasks
- **Disaster Recovery Testing**: Test backup and recovery procedures
- **Security Penetration Testing**: Comprehensive security assessment
- **Architecture Review**: Evaluate system architecture for improvements
- **Compliance Audit**: Ensure regulatory compliance requirements

### Automated Maintenance Scripts

#### Daily Health Check Script
```bash
#!/bin/bash
# daily-health-check.sh

echo "=== Email Validation Service Health Check ==="
echo "Date: $(date)"

# Check API Gateway health
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://vyxhftdzc7.execute-api.ca-central-1.amazonaws.com/prod/health")

if [ "$API_STATUS" = "200" ]; then
    echo "✅ API Gateway: Healthy"
else
    echo "❌ API Gateway: Unhealthy (Status: $API_STATUS)"
fi

# Check Lambda function errors in last 24 hours
LAMBDA_ERRORS=$(aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=EmailValidationServiceStack-EmailValidatorLambda \
  --start-time $(date -d '24 hours ago' -u +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 86400 \
  --statistics Sum \
  --query 'Datapoints[0].Sum' \
  --output text \
  --profile xgc-main \
  --region ca-central-1)

echo "Lambda Errors (24h): ${LAMBDA_ERRORS:-0}"

# Check DynamoDB throttling
THROTTLE_EVENTS=$(aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ReadThrottledEvents \
  --dimensions Name=TableName,Value=ValidationResults \
  --start-time $(date -d '24 hours ago' -u +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 86400 \
  --statistics Sum \
  --query 'Datapoints[0].Sum' \
  --output text \
  --profile xgc-main \
  --region ca-central-1)

if [ "${THROTTLE_EVENTS:-0}" -gt "0" ]; then
    echo "⚠️  DynamoDB Throttling: $THROTTLE_EVENTS events"
else
    echo "✅ DynamoDB: No throttling"
fi

echo "=== Health Check Complete ==="
```

#### Weekly Performance Report
```bash
#!/bin/bash
# weekly-performance-report.sh

echo "=== Weekly Performance Report ==="
echo "Week ending: $(date)"

# Average Lambda duration
AVG_DURATION=$(aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=EmailValidationServiceStack-EmailValidatorLambda \
  --start-time $(date -d '7 days ago' -u +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 604800 \
  --statistics Average \
  --query 'Datapoints[0].Average' \
  --output text \
  --profile xgc-main \
  --region ca-central-1)

echo "Average Lambda Duration: ${AVG_DURATION:-N/A} ms"

# API Gateway request count
REQUEST_COUNT=$(aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name Count \
  --dimensions Name=ApiName,Value=EmailValidationServiceStack \
  --start-time $(date -d '7 days ago' -u +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 604800 \
  --statistics Sum \
  --query 'Datapoints[0].Sum' \
  --output text \
  --profile xgc-main \
  --region ca-central-1)

echo "Total API Requests: ${REQUEST_COUNT:-0}"

# Calculate success rate
ERROR_COUNT=$(aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name 4XXError \
  --dimensions Name=ApiName,Value=EmailValidationServiceStack \
  --start-time $(date -d '7 days ago' -u +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 604800 \
  --statistics Sum \
  --query 'Datapoints[0].Sum' \
  --output text \
  --profile xgc-main \
  --region ca-central-1)

if [ "${REQUEST_COUNT:-0}" -gt "0" ]; then
    SUCCESS_RATE=$(echo "scale=2; (${REQUEST_COUNT} - ${ERROR_COUNT:-0}) / ${REQUEST_COUNT} * 100" | bc)
    echo "Success Rate: ${SUCCESS_RATE}%"
fi

echo "=== Report Complete ==="
```

## Data Management

### Data Retention Policies

#### DynamoDB TTL Configuration
```bash
# Enable TTL on ValidationResults table
aws dynamodb update-time-to-live \
  --table-name ValidationResults \
  --time-to-live-specification Enabled=true,AttributeName=ttl \
  --profile xgc-main \
  --region ca-central-1

# Enable TTL on ValidationJobs table
aws dynamodb update-time-to-live \
  --table-name ValidationJobs \
  --time-to-live-specification Enabled=true,AttributeName=ttl \
  --profile xgc-main \
  --region ca-central-1
```

#### S3 Lifecycle Policies
```json
{
  "Rules": [
    {
      "ID": "TempFileCleanup",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "temp/"
      },
      "Expiration": {
        "Days": 3
      }
    },
    {
      "ID": "ResultsArchival",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "results/"
      },
      "Transitions": [
        {
          "Days": 30,
          "StorageClass": "STANDARD_IA"
        },
        {
          "Days": 90,
          "StorageClass": "GLACIER"
        }
      ]
    }
  ]
}
```

### Backup Procedures

#### DynamoDB Backup
```bash
# Create on-demand backup
aws dynamodb create-backup \
  --table-name ValidationJobs \
  --backup-name "ValidationJobs-$(date +%Y%m%d)" \
  --profile xgc-main \
  --region ca-central-1

# Enable point-in-time recovery
aws dynamodb update-continuous-backups \
  --table-name ValidationJobs \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true \
  --profile xgc-main \
  --region ca-central-1
```

#### S3 Cross-Region Replication
```json
{
  "Role": "arn:aws:iam::ACCOUNT:role/replication-role",
  "Rules": [
    {
      "ID": "ReplicateToSecondaryRegion",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "critical/"
      },
      "Destination": {
        "Bucket": "arn:aws:s3:::email-validation-backup-us-east-1",
        "StorageClass": "STANDARD_IA"
      }
    }
  ]
}
```

## Incident Response

### Incident Classification

#### Severity Levels
- **P1 - Critical**: Service completely unavailable
- **P2 - High**: Major functionality impaired
- **P3 - Medium**: Minor functionality issues
- **P4 - Low**: Cosmetic or documentation issues

#### Response Times
- **P1**: 15 minutes
- **P2**: 1 hour
- **P3**: 4 hours
- **P4**: Next business day

### Common Incident Scenarios

#### Service Unavailable (P1)
1. **Check API Gateway**: Verify endpoint accessibility
2. **Check Lambda Functions**: Review error rates and timeouts
3. **Check DynamoDB**: Verify table accessibility and throttling
4. **Check CloudFront**: Verify CDN status and origin health

#### High Error Rates (P2)
1. **Review Recent Deployments**: Check for recent changes
2. **Analyze Error Logs**: Identify error patterns and root causes
3. **Check Resource Limits**: Verify Lambda concurrency and DynamoDB capacity
4. **Monitor Dependencies**: Check SES and other AWS service status

#### Performance Degradation (P3)
1. **Review Performance Metrics**: Identify bottlenecks
2. **Check Resource Utilization**: Monitor CPU, memory, and I/O
3. **Analyze Traffic Patterns**: Look for unusual usage spikes
4. **Optimize Configuration**: Adjust timeouts and batch sizes

### Incident Response Playbook

#### Initial Response (First 15 minutes)
1. **Acknowledge Incident**: Update status page if available
2. **Assess Impact**: Determine affected users and functionality
3. **Gather Information**: Collect logs, metrics, and error details
4. **Implement Immediate Fixes**: Apply quick fixes if available

#### Investigation Phase
1. **Root Cause Analysis**: Identify underlying cause
2. **Impact Assessment**: Quantify business impact
3. **Solution Development**: Plan comprehensive fix
4. **Testing**: Validate fix in staging environment

#### Resolution Phase
1. **Deploy Fix**: Implement solution in production
2. **Verify Resolution**: Confirm issue is resolved
3. **Monitor Stability**: Watch for regression or side effects
4. **Update Documentation**: Record lessons learned

## Cost Optimization

### Cost Monitoring

#### Daily Cost Tracking
```bash
# Get daily costs for the service
aws ce get-cost-and-usage \
  --time-period Start=$(date -d '7 days ago' +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity DAILY \
  --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=SERVICE \
  --filter file://cost-filter.json \
  --profile xgc-main

# cost-filter.json
{
  "Dimensions": {
    "Key": "SERVICE",
    "Values": ["Amazon API Gateway", "AWS Lambda", "Amazon DynamoDB", "Amazon S3"]
  }
}
```

#### Cost Optimization Opportunities

**Lambda Optimization**:
- Use ARM-based processors (Graviton2) for 20% cost savings
- Optimize memory allocation based on actual usage
- Implement provisioned concurrency only where needed

**DynamoDB Optimization**:
- Use on-demand billing for variable workloads
- Implement efficient query patterns to reduce RCU/WCU
- Archive old data to reduce storage costs

**S3 Optimization**:
- Implement intelligent tiering for automatic cost optimization
- Use lifecycle policies to move data to cheaper storage classes
- Enable S3 Transfer Acceleration only when needed

**API Gateway Optimization**:
- Use caching to reduce backend calls
- Implement request/response compression
- Consider REST vs HTTP API based on features needed

### Budget Alerts

```bash
# Create budget alert
aws budgets create-budget \
  --account-id $(aws sts get-caller-identity --query Account --output text) \
  --budget '{
    "BudgetName": "EmailValidationService",
    "BudgetLimit": {
      "Amount": "100",
      "Unit": "USD"
    },
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST",
    "CostFilters": {
      "Service": ["Amazon API Gateway", "AWS Lambda", "Amazon DynamoDB", "Amazon S3"]
    }
  }' \
  --notifications-with-subscribers '[{
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 80
    },
    "Subscribers": [{
      "SubscriptionType": "EMAIL",
      "Address": "admin@xgccorp.net"
    }]
  }]' \
  --profile xgc-main
```

## Security Monitoring

### Security Metrics

#### Access Monitoring
- **API Gateway Access Logs**: Monitor for unusual access patterns
- **CloudTrail Events**: Track administrative actions
- **VPC Flow Logs**: Monitor network traffic (if using VPC)
- **GuardDuty Findings**: Automated threat detection

#### Security Alerts
```bash
# Create CloudWatch alarm for unusual API access
aws cloudwatch put-metric-alarm \
  --alarm-name "UnusualAPIAccess" \
  --alarm-description "Unusual number of API requests" \
  --metric-name "Count" \
  --namespace "AWS/ApiGateway" \
  --statistic "Sum" \
  --period 300 \
  --threshold 1000 \
  --comparison-operator "GreaterThanThreshold" \
  --dimensions Name=ApiName,Value=EmailValidationServiceStack \
  --alarm-actions "arn:aws:sns:ca-central-1:ACCOUNT:security-alerts" \
  --profile xgc-main \
  --region ca-central-1
```

### Security Maintenance

#### Regular Security Tasks
- **Certificate Renewal**: Monitor SSL certificate expiration
- **Dependency Updates**: Keep Lambda runtime and packages updated
- **Access Review**: Regularly review IAM permissions
- **Vulnerability Scanning**: Use AWS Inspector for security assessments

#### Security Incident Response
1. **Isolate Affected Resources**: Disable compromised components
2. **Preserve Evidence**: Capture logs and system state
3. **Assess Impact**: Determine scope of potential breach
4. **Implement Containment**: Prevent further damage
5. **Recovery**: Restore services with enhanced security
6. **Post-Incident Review**: Update security procedures

---

## Quick Reference

### Emergency Contacts
- **AWS Support**: Use AWS Support Center
- **On-Call Engineer**: [Contact Information]
- **Security Team**: [Contact Information]

### Critical Commands
```bash
# Check service health
curl https://vyxhftdzc7.execute-api.ca-central-1.amazonaws.com/prod/health

# View recent errors
aws logs filter-log-events --log-group-name "/aws/lambda/EmailValidationServiceStack-EmailValidatorLambda" --start-time $(date -d '1 hour ago' +%s)000 --profile xgc-main --region ca-central-1

# Emergency deployment rollback
cdk deploy --previous-parameters --profile xgc-main

# Scale down Lambda concurrency (emergency)
aws lambda put-provisioned-concurrency-config --function-name EmailValidationServiceStack-EmailValidatorLambda --provisioned-concurrency-config ProvisionedConcurrencyConfig=0 --profile xgc-main --region ca-central-1
```

---

*This monitoring and maintenance guide should be reviewed and updated quarterly to ensure it remains current with system changes and operational requirements.*