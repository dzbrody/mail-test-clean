// AWS Secrets Manager integration for secure credential storage
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

export interface SMTPCredentials {
  username: string;
  password: string;
  fromAddress: string;
  fromName: string;
}

/**
 * Retrieves SMTP credentials from AWS Secrets Manager
 * This is the recommended approach for production environments
 */
export async function getSMTPCredentialsFromSecretsManager(secretName: string = 'smtp_ses_us-east-1_main'): Promise<SMTPCredentials> {
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ca-central-1' });
  
  try {
    const command = new GetSecretValueCommand({
      SecretId: secretName
    });
    
    const response = await client.send(command);
    
    if (!response.SecretString) {
      throw new Error('Secret value is empty');
    }
    
    const secret = JSON.parse(response.SecretString);
    
    return {
      username: secret.SMTP_USERNAME,
      password: secret.SMTP_PASSWORD,
      fromAddress: secret.FROM_EMAIL_ADDRESS || 'no-reply@xgccloud.com',
      fromName: secret.FROM_EMAIL_NAME || 'XGC Cloud'
    };
  } catch (error) {
    console.error('Failed to retrieve SMTP credentials from Secrets Manager:', error);
    throw new Error('Unable to retrieve SMTP credentials');
  }
}

/**
 * Creates or updates SMTP credentials in AWS Secrets Manager
 * Use this to securely store your production credentials
 */
export async function storeSMTPCredentialsInSecretsManager(
  credentials: SMTPCredentials,
  secretName: string = 'smtp_ses_us-east-1_main'
): Promise<void> {
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ca-central-1' });
  
  const secretValue = {
    SMTP_USERNAME: credentials.username,
    SMTP_PASSWORD: credentials.password,
    FROM_EMAIL_ADDRESS: credentials.fromAddress,
    FROM_EMAIL_NAME: credentials.fromName
  };
  
  try {
    // Try to update existing secret first
    const { UpdateSecretCommand } = await import('@aws-sdk/client-secrets-manager');
    const updateCommand = new UpdateSecretCommand({
      SecretId: secretName,
      SecretString: JSON.stringify(secretValue)
    });
    
    await client.send(updateCommand);
    console.log(`Successfully updated SMTP credentials in secret: ${secretName}`);
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      // Secret doesn't exist, create it
      const { CreateSecretCommand } = await import('@aws-sdk/client-secrets-manager');
      const createCommand = new CreateSecretCommand({
        Name: secretName,
        Description: 'SMTP credentials for email validation service',
        SecretString: JSON.stringify(secretValue)
      });
      
      await client.send(createCommand);
      console.log(`Successfully created SMTP credentials secret: ${secretName}`);
    } else {
      console.error('Failed to store SMTP credentials in Secrets Manager:', error);
      throw error;
    }
  }
}

/**
 * Gets SMTP credentials with fallback to environment variables
 * Tries Secrets Manager first, falls back to environment variables
 */
export async function getSMTPCredentialsWithFallback(): Promise<SMTPCredentials> {
  // Try Secrets Manager first (recommended for production)
  if (process.env.USE_SECRETS_MANAGER === 'true') {
    try {
      return await getSMTPCredentialsFromSecretsManager();
    } catch (error) {
      console.warn('Failed to get credentials from Secrets Manager, falling back to environment variables');
    }
  }
  
  // Fallback to environment variables
  const username = process.env.SMTP_USERNAME;
  const password = process.env.SMTP_PASSWORD;
  const fromAddress = process.env.FROM_EMAIL_ADDRESS || 'no-reply@xgccloud.com';
  const fromName = process.env.FROM_EMAIL_NAME || 'XGC Cloud';
  
  if (!username || !password) {
    throw new Error('SMTP credentials not found in Secrets Manager or environment variables');
  }
  
  return {
    username,
    password,
    fromAddress,
    fromName
  };
}