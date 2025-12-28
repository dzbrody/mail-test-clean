// Integration tests for EmailSenderComponent
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmailSenderComponent from './EmailSenderComponent';
import * as apiService from '../services/api';
import { Contact, EmailTemplate, BulkEmailSendResponse } from '../types';

// Mock the API service
jest.mock('../services/api');
const mockApiService = apiService as jest.Mocked<typeof apiService>;

const mockContacts: Contact[] = [
  {
    recordId: '1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    company: 'Test Corp',
    jobTitle: 'Manager',
    metadata: {},
  },
  {
    recordId: '2',
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane@example.com',
    company: 'Another Corp',
    jobTitle: 'Director',
    metadata: {},
  },
];

describe('EmailSenderComponent Integration Tests', () => {
  const mockOnSendComplete = jest.fn();
  const mockOnSendError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Email Template Creation and Validation', () => {
    it('should create and validate email template with placeholders', async () => {
      const user = userEvent.setup();
      
      render(
        <EmailSenderComponent
          contacts={mockContacts}
          onSendComplete={mockOnSendComplete}
          onSendError={mockOnSendError}
        />
      );

      // Fill in template fields
      const subjectInput = screen.getByLabelText('Subject Line *');
      const htmlBodyTextarea = screen.getByLabelText('HTML Email Body *');

      await user.type(subjectInput, 'Hello {{firstName}} from {{company}}');
      await user.type(htmlBodyTextarea, '<p>Dear {{firstName}},</p><p>Greetings from {{company}}!</p>');

      // Check that placeholders are detected
      await waitFor(() => {
        expect(screen.getByText('Detected Placeholders:')).toBeInTheDocument();
        expect(screen.getByText('{{firstName}}')).toBeInTheDocument();
        expect(screen.getByText('{{company}}')).toBeInTheDocument();
      });

      // Verify available fields hint is shown
      expect(screen.getByText(/Available fields: firstName, lastName, email, company, jobTitle, phone/)).toBeInTheDocument();
    });

    it('should validate template before sending', async () => {
      const user = userEvent.setup();
      
      render(
        <EmailSenderComponent
          contacts={mockContacts}
          onSendComplete={mockOnSendComplete}
          onSendError={mockOnSendError}
        />
      );

      // Try to send without subject
      const sendButton = screen.getByText(/Send to \d+ Contacts/);
      await user.click(sendButton);

      expect(mockOnSendError).toHaveBeenCalledWith('Subject is required');
    });

    it('should validate invalid placeholders', async () => {
      const user = userEvent.setup();
      
      render(
        <EmailSenderComponent
          contacts={mockContacts}
          onSendComplete={mockOnSendComplete}
          onSendError={mockOnSendError}
        />
      );

      // Fill in template with invalid placeholder
      const subjectInput = screen.getByLabelText('Subject Line *');
      const htmlBodyTextarea = screen.getByLabelText('HTML Email Body *');

      await user.type(subjectInput, 'Hello {{invalidField}}');
      await user.type(htmlBodyTextarea, '<p>Test content</p>');

      const sendButton = screen.getByText(/Send to \d+ Contacts/);
      await user.click(sendButton);

      expect(mockOnSendError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid placeholders: invalidField')
      );
    });
  });

  describe('Email Sending Integration', () => {
    it('should send emails successfully', async () => {
      const user = userEvent.setup();
      
      const mockSendResponse: BulkEmailSendResponse = {
        totalAttempts: 2,
        successCount: 2,
        failureCount: 0,
        results: [
          {
            email: 'john@example.com',
            success: true,
            sentAt: new Date(),
            sesMessageId: 'msg-1',
          },
          {
            email: 'jane@example.com',
            success: true,
            sentAt: new Date(),
            sesMessageId: 'msg-2',
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
          totalDuration: 1000,
        },
        quotaMetadata: {
          dailyQuotaUsed: 2,
          dailyQuotaRemaining: 198,
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

      mockApiService.sendBulkEmails.mockResolvedValue(mockSendResponse);

      render(
        <EmailSenderComponent
          contacts={mockContacts}
          onSendComplete={mockOnSendComplete}
          onSendError={mockOnSendError}
        />
      );

      // Fill in valid template
      const subjectInput = screen.getByLabelText('Subject Line *');
      const htmlBodyTextarea = screen.getByLabelText('HTML Email Body *');

      await user.type(subjectInput, 'Hello {{firstName}}');
      await user.type(htmlBodyTextarea, '<p>Dear {{firstName}} from {{company}},</p><p>Test message</p>');

      // Send emails
      const sendButton = screen.getByText(/Send to \d+ Contacts/);
      await user.click(sendButton);

      // Verify API was called with correct parameters
      await waitFor(() => {
        expect(mockApiService.sendBulkEmails).toHaveBeenCalledWith(
          expect.objectContaining({
            subject: 'Hello {{firstName}}',
            htmlBody: '<p>Dear {{firstName}} from {{company}},</p><p>Test message</p>',
            placeholders: ['firstName', 'company'],
          }),
          mockContacts,
          {
            sendRate: 2,
            batchSize: 10,
          }
        );
      });

      // Verify success callback was called
      expect(mockOnSendComplete).toHaveBeenCalledWith({
        success: true,
        sentCount: 2,
        failedCount: 0,
        errors: [],
      });
    });

    it('should handle partial sending failures', async () => {
      const user = userEvent.setup();
      
      const mockSendResponse: BulkEmailSendResponse = {
        totalAttempts: 2,
        successCount: 1,
        failureCount: 1,
        results: [
          {
            email: 'john@example.com',
            success: true,
            sentAt: new Date(),
            sesMessageId: 'msg-1',
          },
          {
            email: 'jane@example.com',
            success: false,
            sentAt: new Date(),
            errorMessage: 'Bounce - domain not found',
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
          placeholdersFound: ['firstName'],
          placeholdersSubstituted: ['firstName'],
        },
        throttlingMetadata: {
          configuredSendRate: 2,
          actualSendRate: 2,
          totalDuration: 1000,
        },
        quotaMetadata: {
          dailyQuotaUsed: 1,
          dailyQuotaRemaining: 199,
          sendingRateUsed: 2,
        },
        errorSummary: {
          totalErrors: 1,
          errorsByType: { bounce: 1 },
          retryStatistics: {
            averageRetries: 0,
            maxRetries: 0,
            totalRetries: 0,
          },
        },
      };

      mockApiService.sendBulkEmails.mockResolvedValue(mockSendResponse);

      render(
        <EmailSenderComponent
          contacts={mockContacts}
          onSendComplete={mockOnSendComplete}
          onSendError={mockOnSendError}
        />
      );

      // Fill in template and send
      const subjectInput = screen.getByLabelText('Subject Line *');
      const htmlBodyTextarea = screen.getByLabelText('HTML Email Body *');

      await user.type(subjectInput, 'Test Subject');
      await user.type(htmlBodyTextarea, '<p>Test content</p>');

      const sendButton = screen.getByText(/Send to \d+ Contacts/);
      await user.click(sendButton);

      // Verify partial success callback
      await waitFor(() => {
        expect(mockOnSendComplete).toHaveBeenCalledWith({
          success: true, // Still considered success if some emails sent
          sentCount: 1,
          failedCount: 1,
          errors: ['Bounce - domain not found'],
        });
      });
    });

    it('should handle complete sending failure', async () => {
      const user = userEvent.setup();
      
      mockApiService.sendBulkEmails.mockRejectedValue(new Error('SES quota exceeded'));

      render(
        <EmailSenderComponent
          contacts={mockContacts}
          onSendComplete={mockOnSendComplete}
          onSendError={mockOnSendError}
        />
      );

      // Fill in template and send
      const subjectInput = screen.getByLabelText('Subject Line *');
      const htmlBodyTextarea = screen.getByLabelText('HTML Email Body *');

      await user.type(subjectInput, 'Test Subject');
      await user.type(htmlBodyTextarea, '<p>Test content</p>');

      const sendButton = screen.getByText(/Send to \d+ Contacts/);
      await user.click(sendButton);

      await waitFor(() => {
        expect(mockOnSendError).toHaveBeenCalledWith('SES quota exceeded');
      });
    });
  });

  describe('Template Management', () => {
    it('should save and load email templates', async () => {
      const user = userEvent.setup();
      
      render(
        <EmailSenderComponent
          contacts={mockContacts}
          onSendComplete={mockOnSendComplete}
          onSendError={mockOnSendError}
        />
      );

      // Fill in template
      const subjectInput = screen.getByLabelText('Subject Line *');
      const htmlBodyTextarea = screen.getByLabelText('HTML Email Body *');

      await user.type(subjectInput, 'Saved Template Subject {{firstName}}');
      await user.type(htmlBodyTextarea, '<p>Saved template content for {{company}}</p>');

      // Mock file download for template save
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

      // Save template
      const saveButton = screen.getByText('💾 Save Template');
      await user.click(saveButton);

      expect(mockCreateElement).toHaveBeenCalledWith('a');
      expect(mockClick).toHaveBeenCalled();
    });

    it('should load template from file', async () => {
      const user = userEvent.setup();
      
      render(
        <EmailSenderComponent
          contacts={mockContacts}
          onSendComplete={mockOnSendComplete}
          onSendError={mockOnSendError}
        />
      );

      const templateData = {
        subject: 'Loaded Template {{firstName}}',
        htmlBody: '<p>Loaded content for {{company}}</p>',
        textBody: 'Loaded text content',
        placeholders: ['firstName', 'company'],
      };

      // Mock file reading
      const mockFileReader = {
        readAsText: jest.fn(),
        onload: null as any,
        result: JSON.stringify(templateData),
      };

      Object.defineProperty(window, 'FileReader', {
        value: jest.fn(() => mockFileReader),
        writable: true,
      });

      // Simulate file selection
      const loadButton = screen.getByText('📁 Load Template');
      await user.click(loadButton);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const mockFile = new File([JSON.stringify(templateData)], 'template.json', {
        type: 'application/json',
      });

      Object.defineProperty(fileInput, 'files', {
        value: [mockFile],
        writable: false,
      });

      fireEvent.change(fileInput);

      // Simulate FileReader onload
      if (mockFileReader.onload) {
        mockFileReader.onload({ target: { result: JSON.stringify(templateData) } } as any);
      }

      // Verify template was loaded
      await waitFor(() => {
        expect(screen.getByDisplayValue('Loaded Template {{firstName}}')).toBeInTheDocument();
        expect(screen.getByDisplayValue('<p>Loaded content for {{company}}</p>')).toBeInTheDocument();
      });
    });
  });

  describe('Email Preview', () => {
    it('should generate and display email preview', async () => {
      const user = userEvent.setup();
      
      render(
        <EmailSenderComponent
          contacts={mockContacts}
          onSendComplete={mockOnSendComplete}
          onSendError={mockOnSendError}
        />
      );

      // Fill in template with placeholders
      const subjectInput = screen.getByLabelText('Subject Line *');
      const htmlBodyTextarea = screen.getByLabelText('HTML Email Body *');

      await user.type(subjectInput, 'Hello {{firstName}} from {{company}}');
      await user.type(htmlBodyTextarea, '<p>Dear {{firstName}},</p><p>Message from {{company}}</p>');

      // Open preview
      const previewButton = screen.getByText('👁️ Preview');
      await user.click(previewButton);

      // Verify preview modal appears with personalized content
      await waitFor(() => {
        expect(screen.getByText('Email Preview')).toBeInTheDocument();
        expect(screen.getByText('Hello John from Test Corp')).toBeInTheDocument(); // Personalized subject
        expect(screen.getByText('john@example.com')).toBeInTheDocument(); // Recipient email
      });

      // Close preview
      const closeButton = screen.getByText('✕');
      await user.click(closeButton);

      expect(screen.queryByText('Email Preview')).not.toBeInTheDocument();
    });

    it('should handle preview with missing contact data', async () => {
      const user = userEvent.setup();
      
      const contactsWithMissingData: Contact[] = [
        {
          recordId: '1',
          email: 'test@example.com',
          metadata: {},
        },
      ];

      render(
        <EmailSenderComponent
          contacts={contactsWithMissingData}
          onSendComplete={mockOnSendComplete}
          onSendError={mockOnSendError}
        />
      );

      // Fill in template with placeholders
      const subjectInput = screen.getByLabelText('Subject Line *');
      const htmlBodyTextarea = screen.getByLabelText('HTML Email Body *');

      await user.type(subjectInput, 'Hello {{firstName}} {{lastName}}');
      await user.type(htmlBodyTextarea, '<p>From {{company}}</p>');

      // Open preview
      const previewButton = screen.getByText('👁️ Preview');
      await user.click(previewButton);

      // Verify preview shows placeholder values for missing data
      await waitFor(() => {
        expect(screen.getByText('Hello  ')).toBeInTheDocument(); // Empty firstName/lastName
        expect(screen.getByText('test@example.com')).toBeInTheDocument();
      });
    });
  });

  describe('Progress Tracking', () => {
    it('should show sending progress', async () => {
      const user = userEvent.setup();
      
      // Mock a delayed response to see progress
      mockApiService.sendBulkEmails.mockImplementation(() => 
        new Promise(resolve => {
          setTimeout(() => {
            resolve({
              totalAttempts: 2,
              successCount: 2,
              failureCount: 0,
              results: [],
              sesMetadata: {
                region: 'us-east-1',
                fromAddress: 'test@xgccorp.com',
                authenticatedSender: true,
              },
              reputationMetrics: { bounceRate: 0, complaintRate: 0 },
              templateMetadata: { placeholdersFound: [], placeholdersSubstituted: [] },
              throttlingMetadata: { configuredSendRate: 2, actualSendRate: 2, totalDuration: 1000 },
              quotaMetadata: { dailyQuotaUsed: 2, dailyQuotaRemaining: 198, sendingRateUsed: 2 },
              errorSummary: {
                totalErrors: 0,
                errorsByType: {},
                retryStatistics: { averageRetries: 0, maxRetries: 0, totalRetries: 0 },
              },
            });
          }, 1000);
        })
      );

      render(
        <EmailSenderComponent
          contacts={mockContacts}
          onSendComplete={mockOnSendComplete}
          onSendError={mockOnSendError}
        />
      );

      // Fill in template and send
      const subjectInput = screen.getByLabelText('Subject Line *');
      const htmlBodyTextarea = screen.getByLabelText('HTML Email Body *');

      await user.type(subjectInput, 'Test Subject');
      await user.type(htmlBodyTextarea, '<p>Test content</p>');

      const sendButton = screen.getByText(/Send to \d+ Contacts/);
      await user.click(sendButton);

      // Verify progress indicator appears
      expect(screen.getByText('Sending...')).toBeInTheDocument();
      expect(screen.getByText(/Sending emails\.\.\./)).toBeInTheDocument();

      // Wait for completion
      await waitFor(() => {
        expect(mockOnSendComplete).toHaveBeenCalled();
      }, { timeout: 2000 });
    });
  });
});