#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EmailValidationServiceStack } from './email-validation-service-stack';

const app = new cdk.App();

// Deploy to ca-central-1 (primary region)
// Note: SSL certificate for CloudFront will be automatically created in us-east-1
new EmailValidationServiceStack(app, 'EmailValidationServiceStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'ca-central-1'
  },
  crossRegionReferences: true, // Enable cross-region references for certificate
  description: 'Email Validation Service - Primary stack in ca-central-1 with custom domain mailer.xgccorp.net'
});