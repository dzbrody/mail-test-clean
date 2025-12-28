import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ValidationDashboard from './ValidationDashboard';
import { ValidationJob, ValidationResult } from '../types';

// Mock the API service
jest.mock('../services/api', () => ({
  pollValidationStatus: jest.fn(),
  downloadFile: jest.fn(),
  generateResults: jest.fn(),
}));

// Mock fetch
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('ValidationDashboard', () => {
  const mockOnJobComplete = jest.fn();
  const mockJobId = 'test-job-123';

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
  });

  const renderComponent = () => {
    return render(
      <ValidationDashboard
        jobId={mockJobId}
        onJobComplete={mockOnJobComplete}
      />
    );
  };

  const mockPendingJob: ValidationJob = {
    jobId: mockJobId,
    status: 'pending',
    totalContacts: 100,
    processedContacts: 0,
    validContacts: 0,
    invalidContacts: 0,
    createdAt: new Date(),
    s3InputKey: 'input.csv',
  };

  const mockProcessingJob: ValidationJob = {
    jobId: mockJobId,
    status: 'processing',
    totalContacts: 100,
    processedContacts: 50,
    validContacts: 30,
    invalidContacts: 20,
    createdAt: new Date(),
    s3InputKey: 'input.csv',
  };

  const mockCompletedJob: ValidationJob = {
    jobId: mockJobId,
    status: 'completed',
    totalContacts: 100,
    processedContacts: 100,
    validContacts: 80,
    invalidContacts: 20,
    createdAt: new Date(),
    completedAt: new Date(),
    s3InputKey: 'input.csv',
    s3OutputKeys: {
      cleanList: 'clean.csv',
      rejectedList: 'rejected.csv',
      report: 'report.csv',
    },
  };

  const mockValidationResults: ValidationResult[] = [
    {
      email: 'valid@example.com',
      isValid: true,
      validatedAt: new Date(),
    },
    {
      email: 'invalid@example.com',
      isValid: false,
      bounceType: 'hard',
      bounceReason: 'Mailbox does not exist',
      validatedAt: new Date(),
    },
  ];

  test('shows loading state initially', () => {
    const mockPollValidationStatus = require('../services/api').pollValidationStatus;
    mockPollValidationStatus.mockImplementation(() => 
      new Promise(() => {}) // Never resolves
    );
    
    renderComponent();
    
    expect(screen.getByText('Loading validation status...')).toBeInTheDocument();
  });

  test('displays pending job status', async () => {
    const mockPollValidationStatus = require('../services/api').pollValidationStatus;
    mockPollValidationStatus.mockImplementation((jobId, onUpdate) => {
      onUpdate({ job: mockPendingJob, results: [] });
      return Promise.resolve({ job: mockPendingJob, results: [] });
    });
    
    renderComponent();
    
    await waitFor(() => {
      expect(screen.getByText('PENDING')).toBeInTheDocument();
      expect(screen.getByText('Total Contacts')).toBeInTheDocument();
      expect(screen.getAllByText('100')[0]).toBeInTheDocument(); // Total contacts
      expect(screen.getAllByText('0')[0]).toBeInTheDocument(); // Processed contacts
    });
  });

  test('displays processing job with progress', async () => {
    const mockPollValidationStatus = require('../services/api').pollValidationStatus;
    mockPollValidationStatus.mockImplementation((jobId, onUpdate) => {
      onUpdate({ job: mockProcessingJob, results: [] });
      return Promise.resolve({ job: mockProcessingJob, results: [] });
    });
    
    renderComponent();
    
    await waitFor(() => {
      expect(screen.getByText('PROCESSING')).toBeInTheDocument();
      expect(screen.getByText('50% Complete')).toBeInTheDocument();
      expect(screen.getByText(/minute.*remaining/)).toBeInTheDocument();
    });
  });

  test('displays completed job with results', async () => {
    const mockPollValidationStatus = require('../services/api').pollValidationStatus;
    mockPollValidationStatus.mockImplementation((jobId, onUpdate) => {
      onUpdate({ job: mockCompletedJob, results: mockValidationResults });
      return Promise.resolve({ job: mockCompletedJob, results: mockValidationResults });
    });
    
    renderComponent();
    
    await waitFor(() => {
      expect(screen.getByText('COMPLETED')).toBeInTheDocument();
      expect(screen.getByText('100% Complete')).toBeInTheDocument();
      expect(screen.getByText('Validation Results')).toBeInTheDocument();
      // Use more specific selectors for duplicate numbers
      expect(screen.getByText('Valid Emails')).toBeInTheDocument();
      expect(screen.getByText('Invalid Emails')).toBeInTheDocument();
    });
  });

  test('shows bounce reason breakdown for completed jobs', async () => {
    const resultsWithBounces: ValidationResult[] = [
      {
        email: 'hard@example.com',
        isValid: false,
        bounceType: 'hard',
        bounceReason: 'Mailbox does not exist',
        validatedAt: new Date(),
      },
      {
        email: 'soft@example.com',
        isValid: false,
        bounceType: 'soft',
        bounceReason: 'Mailbox full',
        validatedAt: new Date(),
      },
      {
        email: 'complaint@example.com',
        isValid: false,
        bounceType: 'complaint',
        bounceReason: 'Spam complaint',
        validatedAt: new Date(),
      },
    ];

    const mockPollValidationStatus = require('../services/api').pollValidationStatus;
    mockPollValidationStatus.mockImplementation((jobId, onUpdate) => {
      const jobWithBounces = { ...mockCompletedJob, invalidContacts: 3 };
      onUpdate({ job: jobWithBounces, results: resultsWithBounces });
      return Promise.resolve({ job: jobWithBounces, results: resultsWithBounces });
    });
    
    renderComponent();
    
    await waitFor(() => {
      expect(screen.getByText('Bounce Reason Breakdown')).toBeInTheDocument();
      expect(screen.getByText('Hard Bounces:')).toBeInTheDocument();
      expect(screen.getByText('Soft Bounces:')).toBeInTheDocument();
      expect(screen.getByText('Complaints:')).toBeInTheDocument();
    });
  });

  test('provides download buttons for completed jobs', async () => {
    const mockPollValidationStatus = require('../services/api').pollValidationStatus;
    mockPollValidationStatus.mockImplementation((jobId, onUpdate) => {
      onUpdate({ job: mockCompletedJob, results: [] });
      return Promise.resolve({ job: mockCompletedJob, results: [] });
    });
    
    renderComponent();
    
    await waitFor(() => {
      expect(screen.getByText(/Download Clean List/)).toBeInTheDocument();
      expect(screen.getByText(/Download Rejected List/)).toBeInTheDocument();
      expect(screen.getByText(/Download Full Report/)).toBeInTheDocument();
    });
  });

  test('handles download functionality', async () => {
    const user = userEvent.setup();
    const mockDownloadFile = require('../services/api').downloadFile;
    const mockPollValidationStatus = require('../services/api').pollValidationStatus;
    
    mockPollValidationStatus.mockImplementation((jobId, onUpdate) => {
      onUpdate({ job: mockCompletedJob, results: [] });
      return Promise.resolve({ job: mockCompletedJob, results: [] });
    });
    
    mockDownloadFile.mockResolvedValue(undefined);
    
    renderComponent();
    
    await waitFor(() => {
      expect(screen.getByText(/Download Clean List/)).toBeInTheDocument();
    });
    
    const downloadButton = screen.getByText(/Download Clean List/);
    await user.click(downloadButton);
    
    await waitFor(() => {
      expect(mockDownloadFile).toHaveBeenCalledWith('/api/download/clean.csv', 'clean-contacts.csv');
    });
  });

  test('handles failed job status', async () => {
    const failedJob: ValidationJob = {
      ...mockPendingJob,
      status: 'failed',
    };
    
    const mockPollValidationStatus = require('../services/api').pollValidationStatus;
    mockPollValidationStatus.mockImplementation((jobId, onUpdate) => {
      onUpdate({ job: failedJob, results: [] });
      return Promise.resolve({ job: failedJob, results: [] });
    });
    
    renderComponent();
    
    await waitFor(() => {
      expect(screen.getByText('FAILED')).toBeInTheDocument();
      expect(screen.getByText('Validation Failed')).toBeInTheDocument();
      expect(screen.getByText(/try uploading your file again/)).toBeInTheDocument();
    });
  });

  test('handles API errors', async () => {
    const mockPollValidationStatus = require('../services/api').pollValidationStatus;
    mockPollValidationStatus.mockRejectedValue(new Error('HTTP undefined: Not Found'));
    
    renderComponent();
    
    await waitFor(() => {
      expect(screen.getByText(/Error: HTTP undefined: Not Found/)).toBeInTheDocument();
    });
  });

  test('calls onJobComplete when job is completed', async () => {
    const mockPollValidationStatus = require('../services/api').pollValidationStatus;
    mockPollValidationStatus.mockImplementation((jobId, onUpdate) => {
      onUpdate({ job: mockCompletedJob, results: [] });
      return Promise.resolve({ job: mockCompletedJob, results: [] });
    });
    
    renderComponent();
    
    await waitFor(() => {
      expect(mockOnJobComplete).toHaveBeenCalledWith(mockCompletedJob);
    });
  });

  test('calculates progress percentage correctly', async () => {
    const partialJob: ValidationJob = {
      ...mockProcessingJob,
      totalContacts: 200,
      processedContacts: 75,
    };
    
    const mockPollValidationStatus = require('../services/api').pollValidationStatus;
    mockPollValidationStatus.mockImplementation((jobId, onUpdate) => {
      onUpdate({ job: partialJob, results: [] });
      return Promise.resolve({ job: partialJob, results: [] });
    });
    
    renderComponent();
    
    await waitFor(() => {
      expect(screen.getByText('38% Complete')).toBeInTheDocument(); // 75/200 = 37.5% rounded to 38%
    });
  });

  test('handles job with no results gracefully', async () => {
    const jobWithNoResults: ValidationJob = {
      ...mockCompletedJob,
      validContacts: 0,
      invalidContacts: 0,
      totalContacts: 0,
    };
    
    const mockPollValidationStatus = require('../services/api').pollValidationStatus;
    mockPollValidationStatus.mockImplementation((jobId, onUpdate) => {
      onUpdate({ job: jobWithNoResults, results: [] });
      return Promise.resolve({ job: jobWithNoResults, results: [] });
    });
    
    renderComponent();
    
    await waitFor(() => {
      expect(screen.getByText('COMPLETED')).toBeInTheDocument();
      // Use more specific selectors to avoid ambiguity
      expect(screen.getByText('Total Contacts')).toBeInTheDocument();
      expect(screen.getByText('Valid Emails')).toBeInTheDocument();
      expect(screen.getByText('Invalid Emails')).toBeInTheDocument();
    });
  });
});