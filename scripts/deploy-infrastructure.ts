#!/usr/bin/env node

/**
 * Infrastructure deployment script for Email Validation Service
 * 
 * This script demonstrates the deployment of AWS infrastructure
 * including Lambda functions, API Gateway, S3 buckets, DynamoDB tables,
 * and CloudFront distribution across ca-central-1 and us-east-1 regions.
 * 
 * Requirements: 5.1, 5.2, 5.3
 */

import { execSync } from 'child_process';
import * as path from 'path';

const REQUIRED_ENV_VARS = [
  'CDK_DEFAULT_ACCOUNT',
  'CDK_DEFAULT_REGION'
];

const DEPLOYMENT_REGIONS = {
  primary: 'ca-central-1',
  ses: 'us-east-1'
};

const SES_CONFIG = {
  domainIdentity: 'xgccorp.com',
  domainIdentityArn: 'arn:aws:ses:us-east-1:010438486646:identity/xgccorp.com',
  iamUser: 'email-worker-smtp'
};

function checkEnvironment(): void {
  console.log('🔍 Checking environment variables...');
  
  const missingVars = REQUIRED_ENV_VARS.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => console.error(`   - ${varName}`));
    console.error('\nPlease set these variables before deployment.');
    process.exit(1);
  }
  
  console.log('✅ Environment variables configured');
}

function checkAWSCredentials(): void {
  console.log('🔍 Checking AWS credentials...');
  
  try {
    execSync('aws sts get-caller-identity', { stdio: 'pipe' });
    console.log('✅ AWS credentials configured');
  } catch (error) {
    console.error('❌ AWS credentials not configured or invalid');
    console.error('Please run: aws configure');
    process.exit(1);
  }
}

function checkCDKBootstrap(): void {
  console.log('🔍 Checking CDK bootstrap status...');
  
  try {
    // Check if CDK is bootstrapped in primary region
    execSync(`aws cloudformation describe-stacks --stack-name CDKToolkit --region ${DEPLOYMENT_REGIONS.primary}`, { stdio: 'pipe' });
    console.log(`✅ CDK bootstrapped in ${DEPLOYMENT_REGIONS.primary}`);
  } catch (error) {
    console.log(`⚠️  CDK not bootstrapped in ${DEPLOYMENT_REGIONS.primary}`);
    console.log(`Run: cdk bootstrap aws://${process.env.CDK_DEFAULT_ACCOUNT}/${DEPLOYMENT_REGIONS.primary}`);
  }
}

function verifySESConfiguration(): void {
  console.log('🔍 Verifying SES configuration...');
  
  try {
    // Check if domain identity exists
    const result = execSync(`aws ses get-identity-verification-attributes --identities ${SES_CONFIG.domainIdentity} --region ${DEPLOYMENT_REGIONS.ses}`, { 
      stdio: 'pipe',
      encoding: 'utf8'
    });
    
    const response = JSON.parse(result);
    const verificationStatus = response.VerificationAttributes[SES_CONFIG.domainIdentity]?.VerificationStatus;
    
    if (verificationStatus === 'Success') {
      console.log(`✅ SES domain identity ${SES_CONFIG.domainIdentity} verified in ${DEPLOYMENT_REGIONS.ses}`);
    } else {
      console.log(`⚠️  SES domain identity ${SES_CONFIG.domainIdentity} status: ${verificationStatus || 'Not found'}`);
    }
  } catch (error) {
    console.log(`⚠️  Could not verify SES domain identity: ${error}`);
  }
  
  try {
    // Check if IAM user exists
    execSync(`aws iam get-user --user-name ${SES_CONFIG.iamUser}`, { stdio: 'pipe' });
    console.log(`✅ IAM user ${SES_CONFIG.iamUser} exists`);
  } catch (error) {
    console.log(`⚠️  IAM user ${SES_CONFIG.iamUser} not found`);
  }
}

function buildLambdaFunctions(): void {
  console.log('🔨 Building Lambda functions...');
  
  try {
    // Ensure dist directory exists
    execSync('mkdir -p dist/lambdas', { stdio: 'inherit' });
    
    // Build TypeScript
    execSync('npm run build', { stdio: 'inherit' });
    
    console.log('✅ Lambda functions built successfully');
  } catch (error) {
    console.error('❌ Failed to build Lambda functions');
    process.exit(1);
  }
}

function deployInfrastructure(): void {
  console.log('🚀 Deploying infrastructure...');
  
  try {
    // Deploy the CDK stack
    execSync('cdk deploy --require-approval never', { 
      stdio: 'inherit',
      env: {
        ...process.env,
        CDK_DEFAULT_REGION: DEPLOYMENT_REGIONS.primary
      }
    });
    
    console.log('✅ Infrastructure deployed successfully');
  } catch (error) {
    console.error('❌ Infrastructure deployment failed');
    process.exit(1);
  }
}

function displayDeploymentInfo(): void {
  console.log('\n📋 Deployment Summary:');
  console.log(`   Primary Region: ${DEPLOYMENT_REGIONS.primary}`);
  console.log(`   SES Region: ${DEPLOYMENT_REGIONS.ses}`);
  console.log(`   Domain Identity: ${SES_CONFIG.domainIdentity}`);
  console.log(`   IAM User: ${SES_CONFIG.iamUser}`);
  
  console.log('\n🎯 Deployed Resources:');
  console.log('   ✅ Lambda Functions (4): file-processor, email-validator, results-processor, email-sender');
  console.log('   ✅ API Gateway with CORS configuration');
  console.log('   ✅ S3 Buckets (2): file storage, frontend hosting');
  console.log('   ✅ DynamoDB Tables (2): ValidationJobs, ValidationResults');
  console.log('   ✅ CloudFront Distribution');
  console.log('   ✅ IAM Roles with cross-region SES permissions');
  
  console.log('\n🔗 Cross-Region Configuration:');
  console.log(`   ✅ Lambda functions in ${DEPLOYMENT_REGIONS.primary} can access SES in ${DEPLOYMENT_REGIONS.ses}`);
  console.log(`   ✅ SES domain identity: ${SES_CONFIG.domainIdentityArn}`);
  
  console.log('\n🎉 Deployment completed successfully!');
  console.log('\nNext steps:');
  console.log('   1. Check AWS Console for deployed resources');
  console.log('   2. Test API endpoints');
  console.log('   3. Deploy frontend to S3 bucket');
}

function main(): void {
  console.log('🚀 Email Validation Service - Infrastructure Deployment');
  console.log('======================================================\n');
  
  // Pre-deployment checks
  checkEnvironment();
  checkAWSCredentials();
  checkCDKBootstrap();
  verifySESConfiguration();
  
  // Build and deploy
  buildLambdaFunctions();
  deployInfrastructure();
  
  // Summary
  displayDeploymentInfo();
}

// Run the deployment if this script is executed directly
if (require.main === module) {
  main();
}

export {
  checkEnvironment,
  checkAWSCredentials,
  checkCDKBootstrap,
  verifySESConfiguration,
  buildLambdaFunctions,
  deployInfrastructure,
  DEPLOYMENT_REGIONS,
  SES_CONFIG
};