import React, { useState, useRef } from 'react';
import { EmailTemplate, Contact, SendResponse, BulkEmailSendResponse } from '../types';
import './EmailSenderComponent.css';

interface EmailSenderComponentProps {
  contacts: Contact[];
  onSendComplete: (response: SendResponse) => void;
  onSendError: (error: string) => void;
}

const EmailSenderComponent: React.FC<EmailSenderComponentProps> = ({
  contacts,
  onSendComplete,
  onSendError,
}) => {
  const [template, setTemplate] = useState<EmailTemplate>({
    subject: '',
    htmlBody: '',
    textBody: '',
    placeholders: [],
  });
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(0);
  const [previewContact, setPreviewContact] = useState<Contact | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const detectPlaceholders = (text: string): string[] => {
    const placeholderRegex = /\{\{(\w+)\}\}/g;
    const matches = text.match(placeholderRegex);
    if (!matches) return [];
    
    return Array.from(new Set(matches.map(match => match.slice(2, -2))));
  };

  const updatePlaceholders = () => {
    const subjectPlaceholders = detectPlaceholders(template.subject);
    const htmlPlaceholders = detectPlaceholders(template.htmlBody);
    const textPlaceholders = detectPlaceholders(template.textBody || '');
    
    const allPlaceholders = Array.from(new Set([
      ...subjectPlaceholders,
      ...htmlPlaceholders,
      ...textPlaceholders,
    ]));
    
    setTemplate(prev => ({ ...prev, placeholders: allPlaceholders }));
  };

  const handleSubjectChange = (value: string) => {
    setTemplate(prev => ({ ...prev, subject: value }));
    setTimeout(updatePlaceholders, 0);
  };

  const handleHtmlBodyChange = (value: string) => {
    setTemplate(prev => ({ ...prev, htmlBody: value }));
    setTimeout(updatePlaceholders, 0);
  };

  const handleTextBodyChange = (value: string) => {
    setTemplate(prev => ({ ...prev, textBody: value }));
    setTimeout(updatePlaceholders, 0);
  };

  const validateTemplate = (): string | null => {
    if (!template.subject.trim()) {
      return 'Subject is required';
    }
    
    if (!template.htmlBody.trim() && !template.textBody?.trim()) {
      return 'Email body is required (HTML or text)';
    }

    // Check if all placeholders can be filled
    const availableFields = new Set([
      'firstName', 'lastName', 'email', 'company', 'jobTitle', 'phone'
    ]);
    
    const invalidPlaceholders = template.placeholders.filter(
      placeholder => !availableFields.has(placeholder)
    );
    
    if (invalidPlaceholders.length > 0) {
      return `Invalid placeholders: ${invalidPlaceholders.join(', ')}. Available: ${Array.from(availableFields).join(', ')}`;
    }

    return null;
  };

  const substitutePlaceholders = (text: string, contact: Contact): string => {
    let result = text;
    
    template.placeholders.forEach(placeholder => {
      const value = contact[placeholder as keyof Contact] || 
                   contact.metadata[placeholder] || 
                   `[${placeholder}]`;
      result = result.replace(new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g'), String(value));
    });
    
    return result;
  };

  const generatePreview = (contact: Contact) => {
    return {
      subject: substitutePlaceholders(template.subject, contact),
      htmlBody: substitutePlaceholders(template.htmlBody, contact),
      textBody: template.textBody ? substitutePlaceholders(template.textBody, contact) : '',
    };
  };

  const handlePreview = () => {
    if (contacts.length === 0) {
      onSendError('No contacts available for preview');
      return;
    }
    
    setPreviewContact(contacts[0]);
    setShowPreview(true);
  };

  const sendEmails = async (template: EmailTemplate, contacts: Contact[]): Promise<BulkEmailSendResponse> => {
    const { sendBulkEmails } = await import('../services/api');
    
    return sendBulkEmails(template, contacts, {
      sendRate: 2, // 2 emails per second
      batchSize: 10
    });
  };

  const handleSend = async () => {
    const validationError = validateTemplate();
    if (validationError) {
      onSendError(validationError);
      return;
    }

    if (contacts.length === 0) {
      onSendError('No contacts to send to');
      return;
    }

    setIsSending(true);
    setSendProgress(0);

    try {
      // Start progress simulation
      const progressInterval = setInterval(() => {
        setSendProgress(prev => Math.min(prev + 5, 90));
      }, 500);

      const response = await sendEmails(template, contacts);
      
      clearInterval(progressInterval);
      setSendProgress(100);

      // Transform the response to match the expected SendResponse format
      const sendResponse: SendResponse = {
        success: response.successCount > 0,
        sentCount: response.successCount,
        failedCount: response.failureCount,
        errors: response.results
          .filter(result => !result.success)
          .map(result => result.errorMessage || 'Unknown error')
      };

      onSendComplete(sendResponse);
    } catch (error) {
      onSendError(error instanceof Error ? error.message : 'Send failed');
    } finally {
      setIsSending(false);
      setSendProgress(0);
    }
  };

  const handleTemplateUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const templateData = JSON.parse(content);
        
        setTemplate({
          subject: templateData.subject || '',
          htmlBody: templateData.htmlBody || '',
          textBody: templateData.textBody || '',
          placeholders: templateData.placeholders || [],
        });
      } catch (error) {
        onSendError('Invalid template file format');
      }
    };
    reader.readAsText(file);
  };

  const exportTemplate = () => {
    const templateData = JSON.stringify(template, null, 2);
    const blob = new Blob([templateData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'email-template.json';
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const preview = previewContact ? generatePreview(previewContact) : null;

  return (
    <div className="email-sender-component">
      <h2>Send Email Campaign</h2>
      
      <div className="campaign-info">
        <div className="contact-count">
          Ready to send to <strong>{contacts.length}</strong> validated contacts
        </div>
        
        <div className="template-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleTemplateUpload}
            style={{ display: 'none' }}
          />
          <button 
            className="action-btn secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            📁 Load Template
          </button>
          <button 
            className="action-btn secondary"
            onClick={exportTemplate}
            disabled={!template.subject && !template.htmlBody}
          >
            💾 Save Template
          </button>
        </div>
      </div>

      <div className="template-editor">
        <div className="form-group">
          <label htmlFor="subject">Subject Line *</label>
          <input
            id="subject"
            type="text"
            value={template.subject}
            onChange={(e) => handleSubjectChange(e.target.value)}
            placeholder="Enter email subject (use {{firstName}} for personalization)"
            disabled={isSending}
          />
        </div>

        <div className="form-group">
          <label htmlFor="htmlBody">HTML Email Body *</label>
          <textarea
            id="htmlBody"
            value={template.htmlBody}
            onChange={(e) => handleHtmlBodyChange(e.target.value)}
            placeholder="Enter HTML email content (use {{firstName}}, {{company}}, etc. for personalization)"
            rows={10}
            disabled={isSending}
          />
        </div>

        <div className="form-group">
          <label htmlFor="textBody">Plain Text Body (Optional)</label>
          <textarea
            id="textBody"
            value={template.textBody}
            onChange={(e) => handleTextBodyChange(e.target.value)}
            placeholder="Enter plain text version (optional fallback)"
            rows={6}
            disabled={isSending}
          />
        </div>

        {template.placeholders.length > 0 && (
          <div className="placeholders-info">
            <h4>Detected Placeholders:</h4>
            <div className="placeholder-tags">
              {template.placeholders.map(placeholder => (
                <span key={placeholder} className="placeholder-tag">
                  {`{{${placeholder}}}`}
                </span>
              ))}
            </div>
            <p className="placeholder-hint">
              Available fields: firstName, lastName, email, company, jobTitle, phone
            </p>
          </div>
        )}
      </div>

      <div className="action-buttons">
        <button 
          className="action-btn secondary"
          onClick={handlePreview}
          disabled={isSending || contacts.length === 0}
        >
          👁️ Preview
        </button>
        <button 
          className="action-btn primary"
          onClick={handleSend}
          disabled={isSending || contacts.length === 0}
        >
          {isSending ? 'Sending...' : `📧 Send to ${contacts.length} Contacts`}
        </button>
      </div>

      {isSending && (
        <div className="send-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${sendProgress}%` }}
            ></div>
          </div>
          <div className="progress-text">Sending emails... {sendProgress}%</div>
        </div>
      )}

      {showPreview && preview && (
        <div className="preview-modal">
          <div className="preview-content">
            <div className="preview-header">
              <h3>Email Preview</h3>
              <button 
                className="close-btn"
                onClick={() => setShowPreview(false)}
              >
                ✕
              </button>
            </div>
            
            <div className="preview-body">
              <div className="preview-field">
                <strong>To:</strong> {previewContact?.email}
              </div>
              <div className="preview-field">
                <strong>Subject:</strong> {preview.subject}
              </div>
              
              <div className="preview-tabs">
                <div className="preview-section">
                  <h4>HTML Version:</h4>
                  <div 
                    className="preview-html"
                    dangerouslySetInnerHTML={{ __html: preview.htmlBody }}
                  />
                </div>
                
                {preview.textBody && (
                  <div className="preview-section">
                    <h4>Text Version:</h4>
                    <pre className="preview-text">{preview.textBody}</pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailSenderComponent;