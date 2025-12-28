import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileUploadComponent from './FileUploadComponent';
import { UploadResponse } from '../types';

// Mock fetch
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('FileUploadComponent', () => {
  const mockOnUploadSuccess = jest.fn();
  const mockOnUploadError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
  });

  const renderComponent = () => {
    return render(
      <FileUploadComponent
        onUploadSuccess={mockOnUploadSuccess}
        onUploadError={mockOnUploadError}
      />
    );
  };

  test('renders upload component with correct elements', () => {
    renderComponent();
    
    expect(screen.getByText('Upload HubSpot Contact Export')).toBeInTheDocument();
    expect(screen.getByText('Drag and drop your CSV file here, or click to browse')).toBeInTheDocument();
    expect(screen.getByText('Supports CSV files up to 10MB')).toBeInTheDocument();
  });

  test('accepts CSV files', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    const file = new File(['email,name\ntest@example.com,Test'], 'test.csv', {
      type: 'text/csv',
    });
    
    const input = screen.getByRole('button', { name: /drag and drop/i }).querySelector('input[type="file"]') as HTMLInputElement;
    
    await user.upload(input, file);
    
    expect(screen.getByText('test.csv')).toBeInTheDocument();
    expect(screen.getByText('Start Validation')).toBeInTheDocument();
  });

  test('rejects non-CSV files', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    const file = new File(['content'], 'test.txt', {
      type: 'text/plain',
    });
    
    const input = screen.getByRole('button', { name: /drag and drop/i }).querySelector('input[type="file"]') as HTMLInputElement;
    
    await user.upload(input, file);
    
    expect(mockOnUploadError).toHaveBeenCalledWith('Please select a CSV file');
  });

  test('rejects files larger than 10MB', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    // Create a file larger than 10MB
    const largeContent = 'x'.repeat(11 * 1024 * 1024); // 11MB
    const file = new File([largeContent], 'large.csv', {
      type: 'text/csv',
    });
    
    const input = screen.getByRole('button', { name: /drag and drop/i }).querySelector('input[type="file"]') as HTMLInputElement;
    
    await user.upload(input, file);
    
    expect(mockOnUploadError).toHaveBeenCalledWith('File size must be less than 10MB');
  });

  test('handles successful upload', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    const mockResponse: UploadResponse = {
      success: true,
      jobId: 'test-job-123',
      totalContacts: 100,
    };
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);
    
    const file = new File(['email,name\ntest@example.com,Test'], 'test.csv', {
      type: 'text/csv',
    });
    
    const input = screen.getByRole('button', { name: /drag and drop/i }).querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);
    
    const uploadButton = screen.getByText('Start Validation');
    await user.click(uploadButton);
    
    await waitFor(() => {
      expect(mockOnUploadSuccess).toHaveBeenCalledWith(mockResponse);
    });
  });

  test('handles upload failure', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Bad Request',
    } as Response);
    
    const file = new File(['email,name\ntest@example.com,Test'], 'test.csv', {
      type: 'text/csv',
    });
    
    const input = screen.getByRole('button', { name: /drag and drop/i }).querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);
    
    const uploadButton = screen.getByText('Start Validation');
    await user.click(uploadButton);
    
    await waitFor(() => {
      expect(mockOnUploadError).toHaveBeenCalledWith('Upload failed: Bad Request');
    });
  });

  test('shows upload progress during upload', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    // Mock a delayed response
    mockFetch.mockImplementationOnce(() => 
      new Promise(resolve => 
        setTimeout(() => resolve({
          ok: true,
          json: async () => ({ success: true, jobId: 'test-job' }),
        } as Response), 100)
      )
    );
    
    const file = new File(['email,name\ntest@example.com,Test'], 'test.csv', {
      type: 'text/csv',
    });
    
    const input = screen.getByRole('button', { name: /drag and drop/i }).querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);
    
    const uploadButton = screen.getByText('Start Validation');
    await user.click(uploadButton);
    
    // Check that progress is shown
    expect(screen.getByText(/Uploading.../)).toBeInTheDocument();
    
    await waitFor(() => {
      expect(mockOnUploadSuccess).toHaveBeenCalled();
    });
  });

  test('handles drag and drop', () => {
    renderComponent();
    
    const uploadArea = screen.getByRole('button', { name: /drag and drop/i });
    
    // Test drag enter
    fireEvent.dragEnter(uploadArea);
    expect(uploadArea).toHaveClass('drag-active');
    
    // Test drag leave
    fireEvent.dragLeave(uploadArea);
    expect(uploadArea).not.toHaveClass('drag-active');
    
    // Test drop
    const file = new File(['email,name\ntest@example.com,Test'], 'test.csv', {
      type: 'text/csv',
    });
    
    fireEvent.drop(uploadArea, {
      dataTransfer: {
        files: [file],
      },
    });
    
    expect(screen.getByText('test.csv')).toBeInTheDocument();
  });

  test('displays file size correctly', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    const file = new File(['x'.repeat(1024)], 'test.csv', {
      type: 'text/csv',
    });
    
    const input = screen.getByRole('button', { name: /drag and drop/i }).querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);
    
    expect(screen.getByText('1 KB')).toBeInTheDocument();
  });
});