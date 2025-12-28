import React, { useState } from 'react';
import FileUploadComponent from './components/FileUploadComponent';
import ValidationDashboard from './components/ValidationDashboard';
import EmailSenderComponent from './components/EmailSenderComponent';
import ErrorBoundary from './components/ErrorBoundary';
import NotificationSystem, { useNotifications } from './components/NotificationSystem';
import { UploadResponse, ValidationJob, Contact, SendResponse } from './types';
import './App.css';

type AppState = 'upload' | 'validating' | 'completed' | 'sending';

function App() {
  const [appState, setAppState] = useState<AppState>('upload');
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [validatedContacts, setValidatedContacts] = useState<Contact[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const {
    notifications,
    removeNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  } = useNotifications();

  const handleUploadSuccess = (response: UploadResponse) => {
    if (response.success && response.jobId) {
      setCurrentJobId(response.jobId);
      setAppState('validating');
      setError(null);
      
      showSuccess(
        'File uploaded successfully!',
        `Found ${response.totalContacts} contacts. Validation started.`
      );
    }
  };

  const handleUploadError = (errorMessage: string) => {
    setError(errorMessage);
    showError('Upload failed', errorMessage);
  };

  const handleJobComplete = async (job: ValidationJob) => {
    if (job.status === 'completed') {
      setAppState('completed');
      
      showSuccess(
        'Validation completed!',
        `${job.validContacts} valid emails found out of ${job.totalContacts} total.`
      );
      
      // Fetch the actual validated contacts from the API
      try {
        const { getValidatedContacts } = await import('./services/api');
        const contacts = await getValidatedContacts(job.jobId);
        setValidatedContacts(contacts);
      } catch (error) {
        console.error('Failed to fetch validated contacts:', error);
        showWarning(
          'Using fallback data',
          'Could not fetch validated contacts from server. Using sample data.'
        );
        
        // Fallback to mock data if API call fails
        const mockContacts: Contact[] = Array.from({ length: job.validContacts }, (_, i) => ({
          recordId: `contact-${i + 1}`,
          firstName: `Contact`,
          lastName: `${i + 1}`,
          email: `contact${i + 1}@example.com`,
          company: `Company ${i + 1}`,
          jobTitle: 'Marketing Manager',
          metadata: {},
        }));
        setValidatedContacts(mockContacts);
      }
    } else if (job.status === 'failed') {
      setError('Validation job failed. Please try again.');
      setAppState('upload');
      showError(
        'Validation failed',
        'The email validation process encountered an error. Please try uploading your file again.'
      );
    }
  };

  const handleSendComplete = (response: SendResponse) => {
    if (response.success) {
      showSuccess(
        'Emails sent successfully!',
        `Successfully sent ${response.sentCount} emails.`
      );
    } else {
      showWarning(
        'Email sending completed with issues',
        `${response.sentCount} emails sent, ${response.failedCount} failed.`
      );
    }
  };

  const handleSendError = (errorMessage: string) => {
    setError(errorMessage);
    showError('Email sending failed', errorMessage);
  };

  const startNewValidation = () => {
    setAppState('upload');
    setCurrentJobId(null);
    setValidatedContacts([]);
    setError(null);
  };

  const startEmailCampaign = () => {
    setAppState('sending');
    setError(null);
  };

  return (
    <ErrorBoundary>
      <div className="App">
        <NotificationSystem
          notifications={notifications}
          onDismiss={removeNotification}
        />
        
        <header className="App-header">
          <h1 className="md-typescale-headline-large">Email Validation Service</h1>
          <p className="md-typescale-body-large">Upload your HubSpot contact exports for email validation</p>
        </header>
        
        {error && (
          <div className="error-banner">
            <span>⚠️ {error}</span>
            <button onClick={() => setError(null)} aria-label="Close error">✕</button>
          </div>
        )}

        <main>
          {appState === 'upload' && (
            <FileUploadComponent
              onUploadSuccess={handleUploadSuccess}
              onUploadError={handleUploadError}
            />
          )}

          {appState === 'validating' && currentJobId && (
            <ValidationDashboard
              jobId={currentJobId}
              onJobComplete={handleJobComplete}
            />
          )}

          {appState === 'completed' && (
            <div className="completion-screen">
              <div className="completion-actions">
                <button 
                  className="md-filled-button"
                  onClick={startEmailCampaign}
                  disabled={validatedContacts.length === 0}
                >
                  📧 Send Email Campaign
                </button>
                <button 
                  className="md-outlined-button"
                  onClick={startNewValidation}
                >
                  📁 Upload New File
                </button>
              </div>
            </div>
          )}

          {appState === 'sending' && (
            <div className="sending-screen">
              <EmailSenderComponent
                contacts={validatedContacts}
                onSendComplete={handleSendComplete}
                onSendError={handleSendError}
              />
              <div className="back-actions">
                <button 
                  className="md-outlined-button"
                  onClick={() => setAppState('completed')}
                >
                  ← Back to Results
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}

export default App;