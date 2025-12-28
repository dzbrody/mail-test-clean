// Integration tests for API service
import { apiService, APIError, NetworkError } from './api';
import { UploadResponse, ValidationStatus, Contact, EmailTemplate, BulkEmailSendResponse } from '../types';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock XMLHttpRequest for file upload tests
const mockXHR = {
  open: jest.fn(),
  send: jest.fn(),
  setRequestHeader: jest.fn(),
  addEventListener: jest.fn(),
  upload: {
    addEventListener: jest.fn(),
  },
  status: 200,
  responseText: '',
  response: new Blob(),
  timeout: 0,
};

// @ts-ignore
global.XMLHttpRequest = jest.fn(() => mockXHR);

describe('API Service Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
  });

  describe('File Upload Integration', () => {
    it('should upload file with progress tracking', async () => {
      const mockFile = new File(['test content'], 'test.csv', { type: 'text/csv' });
      const mockResponse: UploadResponse = {
        success: true,
        jobId: 'test-job-123',
        totalContacts: 100,
      };

      const progressCallback = jest.fn();

      // Mock successful upload
      mockXHR.addEventListener.mockImplementation((event, callback) => {
        if (event === 'load') {
          mockXHR.status = 200;
          mockXHR.responseText = JSON.stringify(mockResponse);
          callback();
        }
      });

      const result = await apiService.uploadFile(mockFile, progressCallback);

      expect(mockXHR.open).toHaveBeenCalledWith('POST', '/api/upload');
      expect(mockXHR.send).toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });

    it('should handle upload errors', async () => {
      const mockFile = new File(['test content'], 'test.csv', { type: 'text/csv' });
      const errorResponse = {
        message: 'Invalid file format',
        details: 'CSV file is required',
      };

      mockXHR.addEventListener.mockImplementation((event, callback) => {
        if (event === 'load') {
          mockXHR.status = 400;
          mockXHR.responseText = JSON.stringify(errorResponse);
          callback();
        }
      });

      await expect(apiService.uploadFile(mockFile)).rejects.toThrow(APIError);
    });

    it('should handle network errors during upload', async () => {
      const mockFile = new File(['test content'], 'test.csv', { type: 'text/csv' });

      mockXHR.addEventListener.mockImplementation((event, callback) => {
        if (event === 'error') {
          callback();
        }
      });

      await expect(apiService.uploadFile(mockFile)).rejects.toThrow(NetworkError);
    });
  });

  describe('Validation Status Polling', () => {
    it('should get validation status', async () => {
      const mockStatus: ValidationStatus = {
        job: {
          jobId: 'test-job-123',
          status: 'processing',
          totalContacts: 100,
          processedContacts: 50,
          validContacts: 45,
          invalidContacts: 5,
          createdAt: new Date(),
          s3InputKey: 'input/test.csv',
        },
        results: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStatus,
      });

      const result = await apiService.getValidationStatus('test-job-123');

      expect(mockFetch).toHaveBeenCalledWith('/api/validation/status/test-job-123', {
        signal: expect.any(AbortSignal),
        headers: {
          'Content-Type': 'application/json',
        },
      });
      expect(result).toEqual(mockStatus);
    });

    it('should poll validation status until completion', async () => {
      const processingStatus: ValidationStatus = {
        job: {
          jobId: 'test-job-123',
          status: 'processing',
          totalContacts: 100,
          processedContacts: 50,
          validContacts: 45,
          invalidContacts: 5,
          createdAt: new Date(),
          s3InputKey: 'input/test.csv',
        },
        results: [],
      };

      const completedStatus: ValidationStatus = {
        job: {
          ...processingStatus.job,
          status: 'completed',
          processedContacts: 100,
          validContacts: 90,
          invalidContacts: 10,
          completedAt: new Date(),
        },
        results: [],
      };

      const updateCallback = jest.fn();

      // Mock first call returns processing, second call returns completed
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => processingStatus,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => completedStatus,
        });

      const result = await apiService.pollValidationStatus(
        'test-job-123',
        updateCallback,
        100 // Short interval for testing
      );

      expect(updateCallback).toHaveBeenCalledWith(processingStatus);
      expect(updateCallback).toHaveBeenCalledWith(completedStatus);
      expect(result).toEqual(completedStatus);
    });

    it('should handle validation status errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ message: 'Job not found' }),
      });

      await expect(apiService.getValidationStatus('invalid-job')).rejects.toThrow(APIError);
    });
  });

  describe('Results Generation and Download', () => {
    it('should generate results with download URLs', async () => {
      const mockResults = {
        jobId: 'test-job-123',
        downloadUrls: {
          cleanList: 'https://s3.amazonaws.com/bucket/clean-list.csv',
          rejectedList: 'https://s3.amazonaws.com/bucket/rejected-list.csv',
          report: 'https://s3.amazonaws.com/bucket/report.json',
        },
        statistics: {
          totalContacts: 100,
          validContacts: 90,
          invalidContacts: 10,
          successRate: 90,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResults,
      });

      const result = await apiService.generateResults('test-job-123', {
        includeCleanList: true,
        includeRejectedList: true,
        includeReport: true,
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/results/generate', {
        method: 'POST',
        signal: expect.any(AbortSignal),
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId: 'test-job-123',
          includeCleanList: true,
          includeRejectedList: true,
          includeReport: true,
        }),
      });
      expect(result).toEqual(mockResults);
    });

    it('should download files from signed URLs', async () => {
      const mockBlob = new Blob(['csv,content'], { type: 'text/csv' });
      
      // Mock successful download
      mockXHR.addEventListener.mockImplementation((event, callback) => {
        if (event === 'load') {
          mockXHR.status = 200;
          mockXHR.response = mockBlob;
          callback();
        }
      });

      // Mock DOM methods
      const mockCreateElement = jest.fn();
      const mockAppendChild = jest.fn();
      const mockRemoveChild = jest.fn();
      const mockClick = jest.fn();
      const mockCreateObjectURL = jest.fn(() => 'blob:url');
      const mockRevokeObjectURL = jest.fn();

      const mockAnchor = {
        href: '',
        download: '',
        click: mockClick,
      };

      mockCreateElement.mockReturnValue(mockAnchor);
      
      Object.defineProperty(document, 'createElement', {
        value: mockCreateElement,
        writable: true,
      });
      Object.defineProperty(document.body, 'appendChild', {
        value: mockAppendChild,
        writable: true,
      });
      Object.defineProperty(document.body, 'removeChild', {
        value: mockRemoveChild,
        writable: true,
      });
      Object.defineProperty(window.URL, 'createObjectURL', {
        value: mockCreateObjectURL,
        writable: true,
      });
      Object.defineProperty(window.URL, 'revokeObjectURL', {
        value: mockRevokeObjectURL,
        writable: true,
      });

      await apiService.downloadFile('https://example.com/file.csv', 'test-file.csv');

      expect(mockXHR.open).toHaveBeenCalledWith('GET', 'https://example.com/file.csv');
      expect(mockCreateElement).toHaveBeenCalledWith('a');
      expect(mockClick).toHaveBeenCalled();
      expect(mockCreateObjectURL).toHaveBeenCalledWith(mockBlob);
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:url');
    });
  });

  describe('Email Sending Integration', () => {
    it('should send bulk emails successfully', async () => {
      const mockTemplate: EmailTemplate = {
        subject: 'Test Subject {{firstName}}',
        htmlBody: '<p>Hello {{firstName}} from {{company}}</p>',
        textBody: 'Hello {{firstName}} from {{company}}',
        placeholders: ['firstName', 'company'],
      };

      const mockContacts: Contact[] = [
        {
          recordId: '1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          company: 'Test Corp',
          metadata: {},
        },
      ];

      const mockResponse: BulkEmailSendResponse = {
        totalAttempts: 1,
        successCount: 1,
        failureCount: 0,
        results: [
          {
            email: 'john@example.com',
            success: true,
            sentAt: new Date(),
            sesMessageId: 'test-message-id',
          },
        ],
        sesMetadata: {
          region: 'us-east-1',
          fromAddress: 'test@xgccorp.com',
          authenticatedSender: true,
        },
        reputationMetrics: {
          bounceRate: 0.01,
          complaintRate: 0.001,
        },
        templateMetadata: {
          placeholdersFound: ['firstName', 'company'],
          placeholdersSubstituted: ['firstName', 'company'],
        },
        throttlingMetadata: {
          configuredSendRate: 2,
          actualSendRate: 2,
          totalDuration: 500,
        },
        quotaMetadata: {
          dailyQuotaUsed: 1,
          dailyQuotaRemaining: 199,
          sendingRateUsed: 2,
        },
        errorSummary: {
          totalErrors: 0,
          errorsByType: {},
          retryStatistics: {
            averageRetries: 0,
            maxRetries: 0,
            totalRetries: 0,
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await apiService.sendBulkEmails(mockTemplate, mockContacts, {
        sendRate: 2,
        batchSize: 10,
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/send-emails', {
        method: 'POST',
        signal: expect.any(AbortSignal),
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          template: mockTemplate,
          contacts: mockContacts,
          options: {
            sendRate: 2,
            batchSize: 10,
          },
        }),
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle email sending errors', async () => {
      const mockTemplate: EmailTemplate = {
        subject: 'Test Subject',
        htmlBody: '<p>Test</p>',
        placeholders: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ message: 'SES quota exceeded' }),
      });

      await expect(
        apiService.sendBulkEmails(mockTemplate, [])
      ).rejects.toThrow(APIError);
    });
  });

  describe('Error Handling and Retry Logic', () => {
    it('should retry failed requests', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new APIError('Server Error', 500))
        .mockResolvedValueOnce('success');

      const result = await apiService.withRetry(operation, 3, 10);

      expect(operation).toHaveBeenCalledTimes(2);
      expect(result).toBe('success');
    });

    it('should not retry client errors', async () => {
      const operation = jest.fn()
        .mockRejectedValue(new APIError('Bad Request', 400));

      await expect(apiService.withRetry(operation, 3, 10)).rejects.toThrow(APIError);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry rate limit errors', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new APIError('Too Many Requests', 429))
        .mockResolvedValueOnce('success');

      const result = await apiService.withRetry(operation, 3, 10);

      expect(operation).toHaveBeenCalledTimes(2);
      expect(result).toBe('success');
    });

    it('should handle network timeouts', async () => {
      mockFetch.mockImplementation(() => 
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('AbortError')), 100);
        })
      );

      await expect(apiService.getValidationStatus('test-job')).rejects.toThrow(NetworkError);
    });
  });

  describe('Health Check Integration', () => {
    it('should perform health check', async () => {
      const mockHealthResponse = {
        status: 'healthy',
        service: 'email-validation-service',
        version: '1.0.0',
        region: 'ca-central-1',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockHealthResponse,
      });

      const result = await apiService.healthCheck();

      expect(mockFetch).toHaveBeenCalledWith('/api/health', {
        signal: expect.any(AbortSignal),
        headers: {
          'Content-Type': 'application/json',
        },
      });
      expect(result).toEqual(mockHealthResponse);
    });
  });

  describe('Batch Processing', () => {
    it('should process items in batches with progress tracking', async () => {
      const items = [1, 2, 3, 4, 5];
      const processor = jest.fn().mockImplementation((item: number) => 
        Promise.resolve(item * 2)
      );
      const progressCallback = jest.fn();

      const batchProcessor = new apiService.BatchProcessor(processor, 2, 10);
      const results = await batchProcessor.process(items, progressCallback);

      expect(results).toEqual([2, 4, 6, 8, 10]);
      expect(processor).toHaveBeenCalledTimes(5);
      expect(progressCallback).toHaveBeenCalled();
    });

    it('should handle batch processing errors gracefully', async () => {
      const items = [1, 2, 3];
      const processor = jest.fn()
        .mockResolvedValueOnce(2)
        .mockRejectedValueOnce(new Error('Processing failed'))
        .mockResolvedValueOnce(6);

      const batchProcessor = new apiService.BatchProcessor(processor, 1, 10);
      const results = await batchProcessor.process(items);

      expect(results).toEqual([2, 6]); // Failed item is excluded
      expect(processor).toHaveBeenCalledTimes(3);
    });
  });
});