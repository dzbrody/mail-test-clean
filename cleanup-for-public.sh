#!/bin/bash

echo "🧹 Cleaning up sensitive information for public repository..."

# Files that contain actual credentials and should be removed
echo "Removing files with sensitive credentials..."
rm -f PRODUCTION_READY_SUMMARY.md
rm -f SMTP_SETUP.md
rm -f SECRETS_MANAGER_SETUP.md
rm -f scripts/setup-smtp-credentials.ts
rm -f scripts/create-secret-manual.sh
rm -f scripts/test-smtp-local.ts
rm -f scripts/test-smtp-config.ts

# Remove CSV test files that might contain real data
rm -f hubspot-crm-exports-all-contacts-2025-12-23.csv
rm -f test-emails.csv
rm -f test-hubspot-sample.csv

echo "✅ Sensitive files removed"

# Update .env.example to use placeholder values
cat > .env.example << 'EOF'
# AWS Configuration
AWS_REGION=ca-central-1
SES_REGION=us-east-1

# SMTP Configuration for Email Sending (AWS SES)
SMTP_USERNAME=YOUR_SMTP_USERNAME_HERE
SMTP_PASSWORD=YOUR_SMTP_PASSWORD_HERE
SES_DOMAIN_IDENTITY=your-domain.com
FROM_EMAIL_ADDRESS=no-reply@your-domain.com
FROM_EMAIL_NAME=Your Service Name

# Secrets Manager (Production)
USE_SECRETS_MANAGER=true
SECRETS_MANAGER_SECRET_NAME=your-smtp-secret-name
EOF

echo "✅ Updated .env.example with placeholders"

# Add additional entries to .gitignore
cat >> .gitignore << 'EOF'

# Sensitive files (never commit these)
PRODUCTION_READY_SUMMARY.md
SMTP_SETUP.md
SECRETS_MANAGER_SETUP.md
scripts/setup-smtp-credentials.ts
scripts/create-secret-manual.sh
scripts/test-smtp-local.ts
scripts/test-smtp-config.ts

# Test data files
*-contacts-*.csv
test-emails.csv
test-hubspot-sample.csv
hubspot-*.csv

# Local configuration
.env.production
.env.staging
config/production.json
config/staging.json
EOF

echo "✅ Updated .gitignore"

echo ""
echo "🎯 MANUAL STEPS REQUIRED:"
echo "1. Review and update infrastructure/email-validation-service-stack.ts"
echo "2. Update src/shared/utils/environment.ts with placeholder values"
echo "3. Update documentation to use example domains"
echo "4. Create a SECURITY.md file with responsible disclosure info"
echo "5. Add a proper LICENSE file"
echo ""
echo "✅ Cleanup complete! Review changes before committing."