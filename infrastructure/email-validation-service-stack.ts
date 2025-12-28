import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export class EmailValidationServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Domain configuration - UPDATE THESE VALUES FOR YOUR DEPLOYMENT
    const domainName = 'your-email-service.your-domain.com';
    const hostedZoneId = 'YOUR_HOSTED_ZONE_ID';
    
    // Import existing hosted zone
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: hostedZoneId,
      zoneName: 'your-domain.com'
    });

    // Create SSL certificate for the domain (must be in us-east-1 for CloudFront)
    const certificate = new certificatemanager.DnsValidatedCertificate(this, 'Certificate', {
      domainName: domainName,
      hostedZone: hostedZone,
      certificateName: 'EmailValidationServiceCertificate',
      region: 'us-east-1' // CloudFront requires certificates in us-east-1
    });

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

    const validationCheckpointsTable = new dynamodb.Table(this, 'ValidationCheckpointsTable', {
      tableName: 'ValidationCheckpoints',
      partitionKey: { name: 'jobId', type: dynamodb.AttributeType.STRING },
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
                'arn:aws:ses:us-east-1:YOUR_ACCOUNT_ID:identity/your-domain.com',
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
                validationResultsTable.tableArn,
                validationCheckpointsTable.tableArn
              ]
            })
          ]
        })
      }
    });

    // Environment variables for Lambda functions
    const lambdaEnvironment = {
      SES_REGION: 'us-east-1',
      SES_DOMAIN_IDENTITY: 'your-domain.com',
      SES_DOMAIN_IDENTITY_ARN: 'arn:aws:ses:us-east-1:YOUR_ACCOUNT_ID:identity/your-domain.com',
      S3_BUCKET_NAME: bucket.bucketName,
      VALIDATION_JOBS_TABLE: validationJobsTable.tableName,
      VALIDATION_RESULTS_TABLE: validationResultsTable.tableName,
      VALIDATION_CHECKPOINTS_TABLE: validationCheckpointsTable.tableName,
      FROM_EMAIL: 'noreply@your-domain.com',
      REPLY_TO_EMAIL: 'support@your-domain.com'
    };

    // Lambda Functions
    const fileProcessorLambda = new lambda.Function(this, 'FileProcessorLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('dist/src/lambdas/file-processor'),
      role: lambdaExecutionRole,
      environment: lambdaEnvironment,
      timeout: cdk.Duration.minutes(5),
      memorySize: 512
    });

    const emailValidatorLambda = new lambda.Function(this, 'EmailValidatorLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('dist/src/lambdas/email-validator'),
      role: lambdaExecutionRole,
      environment: lambdaEnvironment,
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024
    });

    const resultsProcessorLambda = new lambda.Function(this, 'ResultsProcessorLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('dist/src/lambdas/results-processor'),
      role: lambdaExecutionRole,
      environment: lambdaEnvironment,
      timeout: cdk.Duration.minutes(5),
      memorySize: 512
    });

    const emailSenderLambda = new lambda.Function(this, 'EmailSenderLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('dist/src/lambdas/email-sender'),
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

    // CloudFront Distribution with custom domain
    const distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.RestApiOrigin(api),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER
        }
      },
      domainNames: [domainName],
      certificate: certificate,
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html'
        }
      ]
    });

    // Route 53 record to point domain to CloudFront
    new route53.ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName: 'mailer',
      target: route53.RecordTarget.fromAlias(new route53targets.CloudFrontTarget(distribution))
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

    new cdk.CfnOutput(this, 'CustomDomainUrl', {
      value: `https://${domainName}`,
      description: 'Custom Domain URL for Email Validation Service'
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

    new cdk.CfnOutput(this, 'ValidationCheckpointsTableName', {
      value: validationCheckpointsTable.tableName,
      description: 'DynamoDB table for validation checkpoints'
    });
  }
}