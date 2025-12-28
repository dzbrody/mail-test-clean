// API service for frontend-backend communication
import { UploadResponse, ValidationStatus, Contact, EmailTemplate, BulkEmailSendResponse } from '../types';

// Configuration
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '/api';
const API_TIMEOUT = 30000; // 30 seconds

// Error types
export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export class NetworkError extends Error {
  constructor(message: string = 'Network request failed') {
    super(message);
    this.name = 'NetworkError';
  }
}

// Request wrapper with timeout and error handling
async function apiRequest<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const response = await fetch(`${API_BASE_URL}${url}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      let errorDetails: string | undefined;

      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorMessage;
        errorDetails = errorData.details || errorData.error;
      } catch {
        // If we can't parse error response, use default message
      }

      throw new APIError(errorMessage, response.status, errorDetails);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof APIError) {
      throw error;
    }

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new NetworkError('Request timeout');
      }
      if (error.message.includes('fetch')) {
        throw new NetworkError('Network connection failed');
      }
    }

    throw new NetworkError('Unknown network error');
  }
}

// File upload with progress tracking
export async function uploadFile(
  file: File,
  onProgress?: (progress: number) => void
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();

    // Track upload progress
    if (onProgress) {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch (error) {
          reject(new APIError('Invalid response format', xhr.status));
        }
      } else {
        try {
          const errorData = JSON.parse(xhr.responseText);
          reject(new APIError(
            errorData.message || `Upload failed: ${xhr.statusText}`,
            xhr.status,
            errorData.details
          ));
        } catch {
          reject(new APIError(`Upload failed: ${xhr.statusText}`, xhr.status));
        }
      }
    });

    xhr.addEventListener('error', () => {
      reject(new NetworkError('Upload failed due to network error'));
    });

    xhr.addEventListener('timeout', () => {
      reject(new NetworkError('Upload timeout'));
    });

    xhr.timeout = API_TIMEOUT;
    xhr.open('POST', `${API_BASE_URL}/upload`);
    xhr.send(formData);
  });
}

// Get validation status with polling support
export async function getValidationStatus(jobId: string): Promise<ValidationStatus> {
  return apiRequest<ValidationStatus>(`/validation/status/${jobId}`);
}

// Poll validation status until completion
export async function pollValidationStatus(
  jobId: string,
  onUpdate: (status: ValidationStatus) => void,
  pollInterval: number = 2000
): Promise<ValidationStatus> {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const status = await getValidationStatus(jobId);
        onUpdate(status);

        if (status.job.status === 'completed' || status.job.status === 'failed') {
          resolve(status);
        } else {
          setTimeout(poll, pollInterval);
        }
      } catch (error) {
        reject(error);
      }
    };

    poll();
  });
}

// Generate and get download URLs
export async function generateResults(
  jobId: string,
  options: {
    includeCleanList?: boolean;
    includeRejectedList?: boolean;
    includeReport?: boolean;
  } = {}
): Promise<{
  jobId: string;
  downloadUrls: {
    cleanList?: string;
    rejectedList?: string;
    report?: string;
  };
  statistics: {
    totalContacts: number;
    validContacts: number;
    invalidContacts: number;
    successRate: number;
  };
}> {
  return apiRequest('/results/generate', {
    method: 'POST',
    body: JSON.stringify({
      jobId,
      includeCleanList: options.includeCleanList ?? true,
      includeRejectedList: options.includeRejectedList ?? false,
      includeReport: options.includeReport ?? true,
    }),
  });
}

// Download file from signed URL
export async function downloadFile(
  url: string,
  filename: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (onProgress) {
      xhr.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const blob = new Blob([xhr.response]);
          const downloadUrl = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(downloadUrl);
          document.body.removeChild(a);
          resolve();
        } catch (error) {
          reject(new APIError('Failed to process download', xhr.status));
        }
      } else {
        reject(new APIError(`Download failed: ${xhr.statusText}`, xhr.status));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new NetworkError('Download failed due to network error'));
    });

    xhr.addEventListener('timeout', () => {
      reject(new NetworkError('Download timeout'));
    });

    xhr.responseType = 'blob';
    xhr.timeout = API_TIMEOUT * 2; // Longer timeout for downloads
    xhr.open('GET', url);
    xhr.send();
  });
}

// Send bulk emails
export async function sendBulkEmails(
  template: EmailTemplate,
  contacts: Contact[],
  options: {
    sendRate?: number;
    batchSize?: number;
  } = {}
): Promise<BulkEmailSendResponse> {
  return apiRequest<BulkEmailSendResponse>('/send-emails', {
    method: 'POST',
    body: JSON.stringify({
      template,
      contacts,
      options,
    }),
  });
}

// Get validated contacts for a job
export async function getValidatedContacts(jobId: string): Promise<Contact[]> {
  return apiRequest<Contact[]>(`/validation/contacts/${jobId}`);
}

// Health check
export async function healthCheck(): Promise<{
  status: string;
  service: string;
  version: string;
  region: string;
}> {
  return apiRequest('/health');
}

// Retry wrapper for failed requests
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on client errors (4xx) except for 408 (timeout) and 429 (rate limit)
      if (error instanceof APIError) {
        const shouldRetry = error.statusCode === 408 || 
                           error.statusCode === 429 || 
                           error.statusCode >= 500;
        
        if (!shouldRetry || attempt === maxRetries) {
          throw error;
        }
      }

      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        throw error;
      }

      // Wait before retrying with exponential backoff
      const waitTime = delay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw lastError!;
}

// Batch operations helper
export class BatchProcessor<T, R> {
  constructor(
    private processor: (item: T) => Promise<R>,
    private batchSize: number = 10,
    private delayBetweenBatches: number = 100
  ) {}

  async process(
    items: T[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<R[]> {
    const results: R[] = [];
    
    for (let i = 0; i < items.length; i += this.batchSize) {
      const batch = items.slice(i, i + this.batchSize);
      
      const batchPromises = batch.map(item => this.processor(item));
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          console.error(`Batch item ${i + index} failed:`, result.reason);
          // You might want to handle failures differently based on your needs
        }
      });

      if (onProgress) {
        onProgress(Math.min(i + this.batchSize, items.length), items.length);
      }

      // Add delay between batches (except for the last batch)
      if (i + this.batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, this.delayBetweenBatches));
      }
    }

    return results;
  }
}

// Export API service object for easier mocking in tests
export const apiService = {
  uploadFile,
  getValidationStatus,
  pollValidationStatus,
  generateResults,
  downloadFile,
  sendBulkEmails,
  getValidatedContacts,
  healthCheck,
  withRetry,
  BatchProcessor,
};

export default apiService;