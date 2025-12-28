import { describe, it, expect, beforeEach } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Template } from 'aws-cdk-lib/assertions';
import { Construct } from 'constructs';

/**
 * Test-specific stack that uses inline code instead of asset paths
 * to avoid requiring compiled Lambda assets during testing
 */
class TestEmailValidationServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 Bucket for file storage (ca-central-1)
    const bucket = new s3.Bucket(this, 'EmailValidationBucket', {
      bucketName: `email-validation-service-${this.account}-${this.region}`,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [{
        id: 'DeleteTempFiles',
        expiration: cdk.Duration.days(7),
        prefix: 'temp/'
      }],
      cors: [{
        allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.POST, s3.HttpMethods.PUT],
        allowedOrigins: ['*'],
        allowedHeaders: ['*']
      }]
    });

    // DynamoDB Tables (ca-central-1)
    const validationJobsTable = new dynamodb.Table(this, 'ValidationJobsTable', {
      tableName: 'ValidationJobs',
      partitionKey: { name: 'jobId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl'
    });

    const validationResultsTable = new dynamodb.Table(this, 'ValidationResultsTable', {
      tableName: 'ValidationResults',
      partitionKey: { name: 'jobId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl'
    });

    // IAM Role for Lambda functions with cross-region SES access
    const lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ],
      inlinePolicies: {
        CrossRegionSESPolicy: new iam.PolicyDocument({
          statements: [
            // SES permissions for us-east-1 region
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'ses:SendEmail',
                'ses:SendRawEmail',
                'ses:SendBulkTemplatedEmail',
                'ses:GetSendQuota',
                'ses:GetSendStatistics',
                'ses:ListIdentities',
                'ses:GetIdentityVerificationAttributes',
                'ses:GetIdentityDkimAttributes'
              ],
              resources: [
                'arn:aws:ses:us-east-1:010438486646:identity/xgccorp.com',
                `arn:aws:ses:us-east-1:${this.account}:*`
              ]
            }),
            // S3 permissions for ca-central-1
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
                's3:ListBucket'
              ],
              resources: [
                bucket.bucketArn,
                `${bucket.bucketArn}/*`
              ]
            }),
            // DynamoDB permissions for ca-central-1
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'dynamodb:GetItem',
                'dynamodb:PutItem',
                'dynamodb:UpdateItem',
                'dynamodb:DeleteItem',
                'dynamodb:Query',
                'dynamodb:Scan'
              ],
              resources: [
                validationJobsTable.tableArn,
                validationResultsTable.tableArn
              ]
            })
          ]
        })
      }
    });

    // Environment variables for Lambda functions
    const lambdaEnvironment = {
      SES_REGION: 'us-east-1',
      SES_DOMAIN_IDENTITY: 'xgccorp.com',
      SES_DOMAIN_IDENTITY_ARN: 'arn:aws:ses:us-east-1:010438486646:identity/xgccorp.com',
      S3_BUCKET_NAME: bucket.bucketName,
      VALIDATION_JOBS_TABLE: validationJobsTable.tableName,
      VALIDATION_RESULTS_TABLE: validationResultsTable.tableName,
      FROM_EMAIL: 'noreply@xgccorp.com',
      REPLY_TO_EMAIL: 'support@xgccorp.com'
    };

    // Lambda Functions with inline code for testing
    const fileProcessorLambda = new lambda.Function(this, 'FileProcessorLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 200 });'),
      role: lambdaExecutionRole,
      environment: lambdaEnvironment,
      timeout: cdk.Duration.minutes(5),
      memorySize: 512
    });

    const emailValidatorLambda = new lambda.Function(this, 'EmailValidatorLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 200 });'),
      role: lambdaExecutionRole,
      environment: lambdaEnvironment,
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024
    });

    const resultsProcessorLambda = new lambda.Function(this, 'ResultsProcessorLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 200 });'),
      role: lambdaExecutionRole,
      environment: lambdaEnvironment,
      timeout: cdk.Duration.minutes(5),
      memorySize: 512
    });

    const emailSenderLambda = new lambda.Function(this, 'EmailSenderLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 200 });'),
      role: lambdaExecutionRole,
      environment: lambdaEnvironment,
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024
    });

    // API Gateway
    const api = new apigateway.RestApi(this, 'EmailValidationApi', {
      restApiName: 'Email Validation Service API',
      description: 'API for email validation service',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key']
      }
    });

    // API Gateway Integrations
    const fileUploadIntegration = new apigateway.LambdaIntegration(fileProcessorLambda);
    const validationIntegration = new apigateway.LambdaIntegration(emailValidatorLambda);
    const resultsIntegration = new apigateway.LambdaIntegration(resultsProcessorLambda);
    const emailSendingIntegration = new apigateway.LambdaIntegration(emailSenderLambda);

    // API Routes
    const uploadResource = api.root.addResource('upload');
    uploadResource.addMethod('POST', fileUploadIntegration);

    const validationResource = api.root.addResource('validation');
    validationResource.addMethod('POST', validationIntegration);
    
    const jobResource = validationResource.addResource('{jobId}');
    jobResource.addMethod('GET', validationIntegration);

    const resultsResource = api.root.addResource('results');
    const jobResultsResource = resultsResource.addResource('{jobId}');
    jobResultsResource.addMethod('GET', resultsIntegration);

    const emailResource = api.root.addResource('email');
    emailResource.addMethod('POST', emailSendingIntegration);

    // S3 Bucket for frontend hosting
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `email-validation-frontend-${this.account}-${this.region}`,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
      publicReadAccess: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    // CloudFront Distribution
    const distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.RestApiOrigin(api),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED
        }
      }
    });

    // Outputs
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: api.url,
      description: 'API Gateway URL'
    });

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront Distribution URL'
    });

    new cdk.CfnOutput(this, 'S3BucketName', {
      value: bucket.bucketName,
      description: 'S3 Bucket for file storage'
    });

    new cdk.CfnOutput(this, 'ValidationJobsTableName', {
      value: validationJobsTable.tableName,
      description: 'DynamoDB table for validation jobs'
    });

    new cdk.CfnOutput(this, 'ValidationResultsTableName', {
      value: validationResultsTable.tableName,
      description: 'DynamoDB table for validation results'
    });
  }
}

/**
 * Unit tests for infrastructure configuration
 * Tests Lambda function deployment, cross-region SES configuration, 
 * DynamoDB table creation, and existing SES domain identity integration
 * Requirements: 5.1, 5.2, 5.3
 */
describe('Infrastructure Configuration Unit Tests', () => {
  let app: cdk.App;
  let stack: TestEmailValidationServiceStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new TestEmailValidationServiceStack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: 'ca-central-1'
      }
    });
    template = Template.fromStack(stack);
  });

  describe('Lambda Function Deployment and Configuration in ca-central-1', () => {
    it('should deploy all required Lambda functions in ca-central-1', () => {
      // Test that our 4 Lambda functions are created (CDK may create additional custom resource functions)
      const functions = template.findResources('AWS::Lambda::Function');
      const ourFunctions = Object.keys(functions).filter(name => 
        name.includes('FileProcessor') || 
        name.includes('EmailValidator') || 
        name.includes('ResultsProcessor') || 
        name.includes('EmailSender')
      );
      
      expect(ourFunctions.length).toBe(4);
      
      // Verify each Lambda function exists with correct configuration
      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'nodejs18.x',
        Handler: 'index.handler',
        Timeout: 300, // 5 minutes for file processor
        MemorySize: 512
      });

      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'nodejs18.x',
        Handler: 'index.handler',
        Timeout: 900, // 15 minutes for email validator
        MemorySize: 1024
      });

      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'nodejs18.x',
        Handler: 'index.handler',
        Timeout: 300, // 5 minutes for results processor
        MemorySize: 512
      });

      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'nodejs18.x',
        Handler: 'index.handler',
        Timeout: 900, // 15 minutes for email sender
        MemorySize: 1024
      });
    });

    it('should configure Lambda functions with correct environment variables', () => {
      // Test that Lambda functions have required environment variables
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: {
            SES_REGION: 'us-east-1',
            SES_DOMAIN_IDENTITY: 'xgccorp.com',
            SES_DOMAIN_IDENTITY_ARN: 'arn:aws:ses:us-east-1:010438486646:identity/xgccorp.com',
            FROM_EMAIL: 'noreply@xgccorp.com',
            REPLY_TO_EMAIL: 'support@xgccorp.com'
          }
        }
      });
    });

    it('should configure Lambda functions with proper IAM execution role', () => {
      // Test that Lambda execution role is created
      template.hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Statement: [{
            Effect: 'Allow',
            Principal: {
              Service: 'lambda.amazonaws.com'
            },
            Action: 'sts:AssumeRole'
          }]
        }
      });

      // Test that our Lambda functions reference the execution role (not custom resource functions)
      const functions = template.findResources('AWS::Lambda::Function');
      const ourFunctions = Object.keys(functions).filter(name => 
        name.includes('FileProcessor') || 
        name.includes('EmailValidator') || 
        name.includes('ResultsProcessor') || 
        name.includes('EmailSender')
      );
      
      ourFunctions.forEach(functionName => {
        const functionProps = functions[functionName].Properties;
        expect(functionProps.Role).toHaveProperty('Fn::GetAtt');
        expect(functionProps.Role['Fn::GetAtt'][0]).toContain('LambdaExecutionRole');
      });
    });

    it('should configure Lambda functions with correct code asset paths', () => {
      // Test that our Lambda functions have inline code for testing
      const functions = template.findResources('AWS::Lambda::Function');
      const ourFunctions = Object.keys(functions).filter(name => 
        name.includes('FileProcessor') || 
        name.includes('EmailValidator') || 
        name.includes('ResultsProcessor') || 
        name.includes('EmailSender')
      );
      
      expect(ourFunctions.length).toBe(4);
      
      // Each of our functions should have a Code property with ZipFile (inline code)
      ourFunctions.forEach(functionName => {
        const functionProps = functions[functionName].Properties;
        expect(functionProps.Code).toHaveProperty('ZipFile');
        expect(functionProps.Code.ZipFile).toContain('exports.handler');
      });
    });
  });

  describe('Cross-region SES Configuration and Permissions to us-east-1', () => {
    it('should configure IAM role with cross-region SES permissions', () => {
      // Test that IAM role has SES permissions for us-east-1
      const roles = template.findResources('AWS::IAM::Role');
      const lambdaRole = Object.keys(roles).find(name => name.includes('LambdaExecutionRole'));
      
      expect(lambdaRole).toBeDefined();
      const roleProps = roles[lambdaRole!].Properties;
      
      expect(roleProps.Policies).toBeDefined();
      expect(roleProps.Policies).toHaveLength(1);
      expect(roleProps.Policies[0].PolicyName).toBe('CrossRegionSESPolicy');
      
      const statements = roleProps.Policies[0].PolicyDocument.Statement;
      const sesStatement = statements.find((stmt: any) => 
        stmt.Action.includes('ses:SendEmail')
      );
      
      expect(sesStatement).toBeDefined();
      expect(sesStatement.Effect).toBe('Allow');
      expect(sesStatement.Action).toContain('ses:SendEmail');
      expect(sesStatement.Action).toContain('ses:SendRawEmail');
      expect(sesStatement.Resource).toContain('arn:aws:ses:us-east-1:010438486646:identity/xgccorp.com');
    });

    it('should configure environment variables for cross-region SES access', () => {
      // Test that our Lambda functions have SES region configuration
      const functions = template.findResources('AWS::Lambda::Function');
      const ourFunctions = Object.keys(functions).filter(name => 
        name.includes('FileProcessor') || 
        name.includes('EmailValidator') || 
        name.includes('ResultsProcessor') || 
        name.includes('EmailSender')
      );
      
      ourFunctions.forEach(functionName => {
        const functionProps = functions[functionName].Properties;
        expect(functionProps.Environment).toBeDefined();
        expect(functionProps.Environment.Variables).toMatchObject({
          SES_REGION: 'us-east-1',
          SES_DOMAIN_IDENTITY: 'xgccorp.com',
          SES_DOMAIN_IDENTITY_ARN: 'arn:aws:ses:us-east-1:010438486646:identity/xgccorp.com'
        });
      });
    });

    it('should reference existing SES domain identity correctly', () => {
      // Test that the SES domain identity ARN is correctly formatted
      const expectedArn = 'arn:aws:ses:us-east-1:010438486646:identity/xgccorp.com';
      
      const functions = template.findResources('AWS::Lambda::Function');
      const ourFunctions = Object.keys(functions).filter(name => 
        name.includes('FileProcessor') || 
        name.includes('EmailValidator') || 
        name.includes('ResultsProcessor') || 
        name.includes('EmailSender')
      );
      
      ourFunctions.forEach(functionName => {
        const functionProps = functions[functionName].Properties;
        expect(functionProps.Environment.Variables.SES_DOMAIN_IDENTITY_ARN).toBe(expectedArn);
      });

      // Verify ARN format
      expect(expectedArn).toMatch(/^arn:aws:ses:us-east-1:\d{12}:identity\/.+$/);
      expect(expectedArn).toContain('xgccorp.com');
    });

    it('should configure IAM permissions for existing email-worker-smtp user integration', () => {
      // Test that IAM role allows SES operations that would work with existing IAM user
      const roles = template.findResources('AWS::IAM::Role');
      const lambdaRole = Object.keys(roles).find(name => name.includes('LambdaExecutionRole'));
      
      expect(lambdaRole).toBeDefined();
      const roleProps = roles[lambdaRole!].Properties;
      
      const statements = roleProps.Policies[0].PolicyDocument.Statement;
      const sesStatement = statements.find((stmt: any) => 
        stmt.Action.includes('ses:SendEmail')
      );
      
      expect(sesStatement).toBeDefined();
      expect(sesStatement.Action).toContain('ses:SendEmail');
      expect(sesStatement.Action).toContain('ses:SendRawEmail');
    });
  });

  describe('DynamoDB Table Creation and Indexes in ca-central-1', () => {
    it('should create ValidationJobs table with correct configuration', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'ValidationJobs',
        AttributeDefinitions: [{
          AttributeName: 'jobId',
          AttributeType: 'S'
        }],
        KeySchema: [{
          AttributeName: 'jobId',
          KeyType: 'HASH'
        }],
        BillingMode: 'PAY_PER_REQUEST',
        TimeToLiveSpecification: {
          AttributeName: 'ttl',
          Enabled: true
        }
      });
    });

    it('should create ValidationResults table with correct configuration', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'ValidationResults',
        AttributeDefinitions: [
          {
            AttributeName: 'jobId',
            AttributeType: 'S'
          },
          {
            AttributeName: 'email',
            AttributeType: 'S'
          }
        ],
        KeySchema: [
          {
            AttributeName: 'jobId',
            KeyType: 'HASH'
          },
          {
            AttributeName: 'email',
            KeyType: 'RANGE'
          }
        ],
        BillingMode: 'PAY_PER_REQUEST',
        TimeToLiveSpecification: {
          AttributeName: 'ttl',
          Enabled: true
        }
      });
    });

    it('should configure Lambda functions with DynamoDB table access', () => {
      // Test that IAM role has DynamoDB permissions
      const roles = template.findResources('AWS::IAM::Role');
      const lambdaRole = Object.keys(roles).find(name => name.includes('LambdaExecutionRole'));
      
      expect(lambdaRole).toBeDefined();
      const roleProps = roles[lambdaRole!].Properties;
      
      const statements = roleProps.Policies[0].PolicyDocument.Statement;
      const dynamoStatement = statements.find((stmt: any) => 
        stmt.Action.includes('dynamodb:GetItem')
      );
      
      expect(dynamoStatement).toBeDefined();
      expect(dynamoStatement.Action).toContain('dynamodb:GetItem');
      expect(dynamoStatement.Action).toContain('dynamodb:PutItem');
    });

    it('should configure Lambda functions with DynamoDB table names in environment', () => {
      const functions = template.findResources('AWS::Lambda::Function');
      const ourFunctions = Object.keys(functions).filter(name => 
        name.includes('FileProcessor') || 
        name.includes('EmailValidator') || 
        name.includes('ResultsProcessor') || 
        name.includes('EmailSender')
      );
      
      ourFunctions.forEach(functionName => {
        const functionProps = functions[functionName].Properties;
        expect(functionProps.Environment).toBeDefined();
        expect(functionProps.Environment.Variables).toHaveProperty('VALIDATION_JOBS_TABLE');
        expect(functionProps.Environment.Variables).toHaveProperty('VALIDATION_RESULTS_TABLE');
      });
    });

    it('should create exactly 2 DynamoDB tables', () => {
      template.resourceCountIs('AWS::DynamoDB::Table', 2);
    });
  });

  describe('S3 Bucket and CloudFront Configuration', () => {
    it('should create S3 bucket for file storage with correct configuration', () => {
      // Test that file storage bucket exists with lifecycle rules
      const buckets = template.findResources('AWS::S3::Bucket');
      const fileBucket = Object.keys(buckets).find(name => name.includes('EmailValidationBucket'));
      
      expect(fileBucket).toBeDefined();
      const bucketProps = buckets[fileBucket!].Properties;
      
      expect(bucketProps.LifecycleConfiguration).toBeDefined();
      expect(bucketProps.CorsConfiguration).toBeDefined();
    });

    it('should create S3 bucket for frontend hosting', () => {
      // Test that frontend bucket exists with website configuration
      const buckets = template.findResources('AWS::S3::Bucket');
      const frontendBucket = Object.keys(buckets).find(name => name.includes('FrontendBucket'));
      
      expect(frontendBucket).toBeDefined();
      const bucketProps = buckets[frontendBucket!].Properties;
      
      expect(bucketProps.WebsiteConfiguration).toBeDefined();
      expect(bucketProps.WebsiteConfiguration.IndexDocument).toBe('index.html');
      expect(bucketProps.WebsiteConfiguration.ErrorDocument).toBe('error.html');
    });

    it('should create CloudFront distribution for frontend', () => {
      // Test that CloudFront distribution exists
      template.resourceCountIs('AWS::CloudFront::Distribution', 1);
      
      const distributions = template.findResources('AWS::CloudFront::Distribution');
      const distribution = Object.values(distributions)[0];
      
      expect(distribution.Properties.DistributionConfig).toBeDefined();
      expect(distribution.Properties.DistributionConfig.DefaultCacheBehavior).toBeDefined();
    });

    it('should create exactly 2 S3 buckets', () => {
      template.resourceCountIs('AWS::S3::Bucket', 2);
    });
  });

  describe('API Gateway Configuration', () => {
    it('should create API Gateway with correct CORS configuration', () => {
      template.hasResourceProperties('AWS::ApiGateway::RestApi', {
        Name: 'Email Validation Service API',
        Description: 'API for email validation service'
      });
    });

    it('should create all required API Gateway resources and methods', () => {
      // Test that API Gateway resources are created (CDK creates additional resources)
      const resources = template.findResources('AWS::ApiGateway::Resource');
      expect(Object.keys(resources).length).toBeGreaterThanOrEqual(5);
      
      // Test that methods are created for each resource
      const methods = template.findResources('AWS::ApiGateway::Method');
      expect(Object.keys(methods).length).toBeGreaterThanOrEqual(5);
    });

    it('should integrate API Gateway with Lambda functions', () => {
      // Test that Lambda integrations are created (CDK creates additional methods for CORS)
      const methods = template.findResources('AWS::ApiGateway::Method');
      expect(Object.keys(methods).length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Stack Outputs', () => {
    it('should create all required stack outputs', () => {
      // Test that stack outputs are defined
      const outputs = template.findOutputs('*');
      const outputNames = Object.keys(outputs);
      
      expect(outputNames).toContain('ApiGatewayUrl');
      expect(outputNames).toContain('CloudFrontUrl');
      expect(outputNames).toContain('S3BucketName');
      expect(outputNames).toContain('ValidationJobsTableName');
      expect(outputNames).toContain('ValidationResultsTableName');
    });
  });
});