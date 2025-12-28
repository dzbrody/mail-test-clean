# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly:

### How to Report

1. **Email**: Contact Dan Brody at security@ctorescues.com
2. **Subject**: Include "SECURITY" in the subject line
3. **Details**: Provide a detailed description of the vulnerability

### What to Include

- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact assessment
- Suggested fix (if available)

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Resolution**: Varies based on complexity

### Security Best Practices

When deploying this service:

1. **Environment Variables**: Never commit credentials to version control
2. **AWS IAM**: Use least-privilege access principles
3. **Secrets Management**: Use AWS Secrets Manager for production credentials
4. **Network Security**: Configure appropriate VPC and security groups
5. **Monitoring**: Enable CloudTrail and CloudWatch for audit logging

### Responsible Disclosure

We follow responsible disclosure practices:

- Security issues will be patched before public disclosure
- Credit will be given to researchers who report vulnerabilities responsibly
- We will coordinate with reporters on disclosure timing

## Security Features

This application includes:

- **HTTPS Only**: All communications encrypted in transit
- **Temporary Data**: Files automatically deleted after processing
- **IAM Roles**: Least-privilege access for AWS services
- **Input Validation**: Comprehensive validation of user inputs
- **Rate Limiting**: Protection against abuse and DoS attacks

---

**Copyright © 2025 Dan Brody**  
**Website**: https://ctorescues.com