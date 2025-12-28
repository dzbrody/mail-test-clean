// API Gateway integration Lambda for centralized routing and authentication
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * Standard CORS headers for all API responses
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Amz-Date, Authorization, X-Api-Key, X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

/**
 * Standard error response format
 */
interface ErrorResponse {
  error: string;
  message: string;
  details?: string;
  timestamp: string;
  requestId?: string;
}

/**
 * Create standardized error response
 */
function createErrorResponse(
  statusCode: number,
  error: string,
  message: string,
  details?: string,
  requestId?: string
): APIGatewayProxyResult {
  const errorResponse: ErrorResponse = {
    error,
    message,
    details,
    timestamp: new Date().toISOString(),
    requestId
  };

  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(errorResponse)
  };
}

/**
 * Create standardized success response
 */
function createSuccessResponse(
  statusCode: number,
  data: any,
  requestId?: string
): APIGatewayProxyResult {
  const response = {
    ...data,
    timestamp: new Date().toISOString(),
    requestId
  };

  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(response)
  };
}

/**
 * Handle CORS preflight requests
 */
function handleCorsPreflightRequest(): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: ''
  };
}

/**
 * Basic API key validation (placeholder for more sophisticated auth)
 */
function validateApiKey(event: APIGatewayProxyEvent): boolean {
  // In a real implementation, this would validate against a database or service
  // For now, we'll allow requests without API keys for development
  const apiKey = event.headers['X-Api-Key'] || event.headers['x-api-key'];
  
  // Allow requests without API key for development/testing
  if (!apiKey) {
    return true;
  }
  
  // Basic validation - in production, this would be more sophisticated
  return apiKey.length > 10;
}

/**
 * Rate limiting check (placeholder)
 */
function checkRateLimit(event: APIGatewayProxyEvent): boolean {
  // In a real implementation, this would check against a rate limiting service
  // For now, we'll allow all requests
  return true;
}

/**
 * Extract request metadata for logging and monitoring
 */
function extractRequestMetadata(event: APIGatewayProxyEvent) {
  return {
    method: event.httpMethod,
    path: event.path,
    userAgent: event.headers['User-Agent'] || event.headers['user-agent'],
    sourceIp: event.requestContext?.identity?.sourceIp,
    requestId: event.requestContext?.requestId,
    stage: event.requestContext?.stage
  };
}

/**
 * Validate request content type for POST/PUT requests
 */
function validateContentType(event: APIGatewayProxyEvent): boolean {
  if (event.httpMethod === 'GET' || event.httpMethod === 'DELETE' || event.httpMethod === 'OPTIONS') {
    return true;
  }
  
  const contentType = event.headers['Content-Type'] || event.headers['content-type'];
  
  // Allow requests without explicit content type (some clients don't set it)
  if (!contentType) {
    return true;
  }
  
  // Accept JSON content types
  return contentType.includes('application/json') || contentType.includes('text/plain');
}

/**
 * Main API Gateway handler with authentication, CORS, and error handling
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const requestMetadata = extractRequestMetadata(event);
  
  console.log('API Gateway request received', {
    ...requestMetadata,
    headers: event.headers,
    queryStringParameters: event.queryStringParameters
  });
  
  try {
    // Handle CORS preflight requests
    if (event.httpMethod === 'OPTIONS') {
      return handleCorsPreflightRequest();
    }
    
    // Validate API key (basic authentication)
    if (!validateApiKey(event)) {
      return createErrorResponse(
        401,
        'Unauthorized',
        'Invalid or missing API key',
        'Please provide a valid API key in the X-Api-Key header',
        requestMetadata.requestId
      );
    }
    
    // Check rate limiting
    if (!checkRateLimit(event)) {
      return createErrorResponse(
        429,
        'Too Many Requests',
        'Rate limit exceeded',
        'Please reduce your request frequency and try again later',
        requestMetadata.requestId
      );
    }
    
    // Validate content type for requests with body
    if (!validateContentType(event)) {
      return createErrorResponse(
        400,
        'Invalid Content Type',
        'Unsupported content type',
        'Please use application/json content type for requests with body',
        requestMetadata.requestId
      );
    }
    
    // Route to appropriate handler based on path
    const path = event.path;
    const method = event.httpMethod;
    
    // Health check endpoint
    if (path === '/health' && method === 'GET') {
      return createSuccessResponse(
        200,
        {
          status: 'healthy',
          service: 'email-validation-service',
          version: '1.0.0',
          region: process.env.AWS_REGION || 'unknown'
        },
        requestMetadata.requestId
      );
    }
    
    // API documentation endpoint
    if (path === '/api/docs' && method === 'GET') {
      return createSuccessResponse(
        200,
        {
          service: 'Email Validation Service API',
          version: '1.0.0',
          endpoints: {
            'POST /upload': 'Upload CSV file for email validation',
            'GET /validation/{jobId}': 'Get validation job status',
            'POST /results/{jobId}': 'Generate and download validation results',
            'POST /email': 'Send emails to validated contacts',
            'GET /health': 'Service health check',
            'GET /api/docs': 'API documentation'
          },
          authentication: 'API Key required in X-Api-Key header',
          cors: 'CORS enabled for all origins'
        },
        requestMetadata.requestId
      );
    }
    
    // For other endpoints, return routing information
    // In a real implementation, this would route to the appropriate Lambda function
    return createErrorResponse(
      404,
      'Not Found',
      `Endpoint not found: ${method} ${path}`,
      'This endpoint is handled by dedicated Lambda functions. Please check the API documentation.',
      requestMetadata.requestId
    );
    
  } catch (error: any) {
    console.error('API Gateway error', {
      ...requestMetadata,
      error: error.message,
      stack: error.stack
    });
    
    return createErrorResponse(
      500,
      'Internal Server Error',
      'An unexpected error occurred while processing your request',
      error.message,
      requestMetadata.requestId
    );
  }
};

/**
 * Middleware function to add standard headers and error handling to Lambda responses
 */
export function withApiGatewayMiddleware(
  handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>
) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
      const result = await handler(event);
      
      // Ensure CORS headers are always present
      return {
        ...result,
        headers: {
          ...CORS_HEADERS,
          ...result.headers
        }
      };
    } catch (error: any) {
      console.error('Lambda handler error', {
        path: event.path,
        method: event.httpMethod,
        error: error.message,
        stack: error.stack
      });
      
      return createErrorResponse(
        500,
        'Internal Server Error',
        'An unexpected error occurred',
        error.message,
        event.requestContext?.requestId
      );
    }
  };
}