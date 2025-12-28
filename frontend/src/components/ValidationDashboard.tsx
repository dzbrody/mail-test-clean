import React, { useState, useEffect } from 'react';
import { ValidationJob, ValidationResult } from '../types';
import './ValidationDashboard.css';

interface ValidationDashboardProps {
  jobId: string;
  onJobComplete: (job: ValidationJob) => void;
}

const ValidationDashboard: React.FC<ValidationDashboardProps> = ({
  jobId,
  onJobComplete,
}) => {
  const [job, setJob] = useState<ValidationJob | null>(null);
  const [results, setResults] = useState<ValidationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getValidationStatus = async (jobId: string) => {
    const { getValidationStatus: apiGetValidationStatus } = await import('../services/api');
    return apiGetValidationStatus(jobId);
  };

  const downloadFile = async (fileType: 'clean' | 'rejected' | 'report') => {
    if (!job?.s3OutputKeys) return;
    
    const fileKey = job.s3OutputKeys[fileType === 'clean' ? 'cleanList' : 
                                    fileType === 'rejected' ? 'rejectedList' : 'report'];
    
    if (!fileKey) {
      // Generate results if not available
      try {
        const { generateResults } = await import('../services/api');
        const results = await generateResults(jobId, {
          includeCleanList: fileType === 'clean',
          includeRejectedList: fileType === 'rejected',
          includeReport: fileType === 'report'
        });
        
        const downloadUrl = results.downloadUrls[fileType === 'clean' ? 'cleanList' : 
                                                 fileType === 'rejected' ? 'rejectedList' : 'report'];
        
        if (downloadUrl) {
          const { downloadFile: apiDownloadFile } = await import('../services/api');
          await apiDownloadFile(downloadUrl, `${fileType}-contacts.csv`);
        }
      } catch (error) {
        setError(`Failed to generate ${fileType} file`);
      }
      return;
    }

    try {
      const { downloadFile: apiDownloadFile } = await import('../services/api');
      // Construct download URL - in a real implementation, this would be a signed URL from the API
      const downloadUrl = `/api/download/${fileKey}`;
      await apiDownloadFile(downloadUrl, `${fileType}-contacts.csv`);
    } catch (error) {
      setError(`Failed to download ${fileType} file`);
    }
  };

  useEffect(() => {
    let isActive = true;

    const startPolling = async () => {
      try {
        const { pollValidationStatus } = await import('../services/api');
        
        const finalStatus = await pollValidationStatus(
          jobId,
          (status) => {
            if (isActive) {
              setJob(status.job);
              setResults(status.results || []);
              setError(null);
              setLoading(false);
            }
          },
          2000 // Poll every 2 seconds
        );

        if (isActive) {
          onJobComplete(finalStatus.job);
        }
      } catch (err) {
        if (isActive) {
          setError(err instanceof Error ? err.message : 'Failed to get status');
          setLoading(false);
        }
      }
    };

    startPolling();

    return () => {
      isActive = false;
    };
  }, [jobId, onJobComplete]);

  const getProgressPercentage = (): number => {
    if (!job || job.totalContacts === 0) return 0;
    return Math.round((job.processedContacts / job.totalContacts) * 100);
  };

  const getEstimatedTimeRemaining = (): string => {
    if (!job || job.status !== 'processing' || job.processedContacts === 0) {
      return 'Calculating...';
    }

    const elapsed = Date.now() - new Date(job.createdAt).getTime();
    const rate = job.processedContacts / elapsed; // contacts per ms
    const remaining = job.totalContacts - job.processedContacts;
    const estimatedMs = remaining / rate;

    const minutes = Math.ceil(estimatedMs / (1000 * 60));
    return `~${minutes} minute${minutes !== 1 ? 's' : ''} remaining`;
  };

  const getBounceReasonCounts = () => {
    const counts = {
      hard: 0,
      soft: 0,
      complaint: 0,
      other: 0,
    };

    results.forEach(result => {
      if (!result.isValid) {
        if (result.bounceType) {
          counts[result.bounceType]++;
        } else {
          counts.other++;
        }
      }
    });

    return counts;
  };

  if (loading && !job) {
    return (
      <div className="validation-dashboard">
        <div className="loading">Loading validation status...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="validation-dashboard">
        <div className="error">Error: {error}</div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="validation-dashboard">
        <div className="error">Job not found</div>
      </div>
    );
  }

  const progressPercentage = getProgressPercentage();
  const bounceReasons = getBounceReasonCounts();

  return (
    <div className="validation-dashboard">
      <h2>Email Validation Progress</h2>
      
      <div className="job-info">
        <div className="job-status">
          <span className={`status-badge ${job.status}`}>
            {job.status.toUpperCase()}
          </span>
          <span className="job-id">Job ID: {job.jobId}</span>
        </div>
        
        {job.status === 'processing' && (
          <div className="time-estimate">
            {getEstimatedTimeRemaining()}
          </div>
        )}
      </div>

      <div className="progress-section">
        <div className="progress-stats">
          <div className="stat">
            <div className="stat-value">{job.totalContacts}</div>
            <div className="stat-label">Total Contacts</div>
          </div>
          <div className="stat">
            <div className="stat-value">{job.processedContacts}</div>
            <div className="stat-label">Processed</div>
          </div>
          <div className="stat">
            <div className="stat-value">{job.validContacts}</div>
            <div className="stat-label">Valid</div>
          </div>
          <div className="stat">
            <div className="stat-value">{job.invalidContacts}</div>
            <div className="stat-label">Invalid</div>
          </div>
        </div>

        <div className="progress-bar-container">
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
          <div className="progress-text">{progressPercentage}% Complete</div>
        </div>
      </div>

      {job.status === 'completed' && (
        <>
          <div className="results-summary">
            <h3>Validation Results</h3>
            <div className="summary-stats">
              <div className="summary-stat success">
                <div className="summary-value">{job.validContacts}</div>
                <div className="summary-label">Valid Emails</div>
                <div className="summary-percentage">
                  {Math.round((job.validContacts / job.totalContacts) * 100)}%
                </div>
              </div>
              <div className="summary-stat error">
                <div className="summary-value">{job.invalidContacts}</div>
                <div className="summary-label">Invalid Emails</div>
                <div className="summary-percentage">
                  {Math.round((job.invalidContacts / job.totalContacts) * 100)}%
                </div>
              </div>
            </div>
          </div>

          {job.invalidContacts > 0 && (
            <div className="bounce-reasons">
              <h4>Bounce Reason Breakdown</h4>
              <div className="bounce-stats">
                <div className="bounce-stat">
                  <span className="bounce-type">Hard Bounces:</span>
                  <span className="bounce-count">{bounceReasons.hard}</span>
                </div>
                <div className="bounce-stat">
                  <span className="bounce-type">Soft Bounces:</span>
                  <span className="bounce-count">{bounceReasons.soft}</span>
                </div>
                <div className="bounce-stat">
                  <span className="bounce-type">Complaints:</span>
                  <span className="bounce-count">{bounceReasons.complaint}</span>
                </div>
                <div className="bounce-stat">
                  <span className="bounce-type">Other Issues:</span>
                  <span className="bounce-count">{bounceReasons.other}</span>
                </div>
              </div>
            </div>
          )}

          <div className="download-section">
            <h4>Download Results</h4>
            <div className="download-buttons">
              <button 
                className="download-btn clean"
                onClick={() => downloadFile('clean')}
                disabled={!job.s3OutputKeys?.cleanList}
              >
                📥 Download Clean List ({job.validContacts} contacts)
              </button>
              <button 
                className="download-btn rejected"
                onClick={() => downloadFile('rejected')}
                disabled={!job.s3OutputKeys?.rejectedList}
              >
                📥 Download Rejected List ({job.invalidContacts} contacts)
              </button>
              <button 
                className="download-btn report"
                onClick={() => downloadFile('report')}
                disabled={!job.s3OutputKeys?.report}
              >
                📊 Download Full Report
              </button>
            </div>
          </div>
        </>
      )}

      {job.status === 'failed' && (
        <div className="error-section">
          <h3>Validation Failed</h3>
          <p>The validation process encountered an error. Please try uploading your file again.</p>
        </div>
      )}
    </div>
  );
};

export default ValidationDashboard;