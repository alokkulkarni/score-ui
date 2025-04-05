import React, { useState, useEffect } from 'react';
import { Container, Box, Typography, Alert, Button } from '@mui/material';
import ApplicationForm from './components/ApplicationForm';
import TerraformLogs, { TerraformStatus } from './components/TerraformLogs';

interface ApplicationConfig {
  name: string;
  environment: {
    type: string;
    executionEnvironment: string;
    region: string;
  };
  services: Record<string, any>;
}

interface ServerResponse {
  success: boolean;
  message: string;
  scoreFile?: string;
  config?: ApplicationConfig;
}

type ServerStatus = 'idle' | 'processing' | 'error';

const App: React.FC = () => {
  const [serverStatus, setServerStatus] = useState<ServerStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [scoreFile, setScoreFile] = useState<string | null>(null);
  const [config, setConfig] = useState<ApplicationConfig | null>(null);
  const [terraformStatus, setTerraformStatus] = useState<TerraformStatus>('idle');
  const [terraformLogs, setTerraformLogs] = useState<string[]>([]);
  const [terraformError, setTerraformError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>('');

  useEffect(() => {
    // Generate a unique session ID when the component mounts
    setSessionId(Date.now().toString());
  }, []);

  const checkServerHealth = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/health');
      if (response.ok) {
        setServerStatus('idle');
      } else {
        setServerStatus('error');
      }
    } catch (err) {
      setServerStatus('error');
    }
  };

  useEffect(() => {
    checkServerHealth();
    const interval = setInterval(checkServerHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (formData: ApplicationConfig) => {
    setServerStatus('processing');
    setError(null);
    try {
      const response = await fetch('http://localhost:3001/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data: ServerResponse = await response.json();
      if (!response.ok) {
        throw new Error(data.message);
      }

      setScoreFile(data.scoreFile || null);
      setConfig(formData);
      setServerStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setServerStatus('error');
    }
  };

  const handleTerraformInit = async () => {
    if (!config) return;
    setTerraformStatus('initializing');
    setTerraformError(null);
    setTerraformLogs([]);

    const eventSource = new EventSource(
      `http://localhost:3001/api/terraform/init?sessionId=${sessionId}&region=${config.environment.region}`
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.error) {
        setTerraformError(data.error);
        setTerraformStatus('error');
        eventSource.close();
      } else if (data.log) {
        setTerraformLogs(prev => [...prev, data.log]);
      } else if (data.status === 'completed') {
        setTerraformStatus('completed');
        eventSource.close();
      }
    };

    eventSource.onerror = () => {
      setTerraformError('Connection to server lost');
      setTerraformStatus('error');
      eventSource.close();
    };
  };

  const handleTerraformPlan = async () => {
    if (!config) return;
    setTerraformStatus('planning');
    setTerraformError(null);
    setTerraformLogs([]);

    const eventSource = new EventSource(
      `http://localhost:3001/api/terraform/plan?sessionId=${sessionId}&region=${config.environment.region}`
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.error) {
        setTerraformError(data.error);
        setTerraformStatus('error');
        eventSource.close();
      } else if (data.log) {
        setTerraformLogs(prev => [...prev, data.log]);
      } else if (data.status === 'completed') {
        setTerraformStatus('completed');
        eventSource.close();
      }
    };

    eventSource.onerror = () => {
      setTerraformError('Connection to server lost');
      setTerraformStatus('error');
      eventSource.close();
    };
  };

  const handleTerraformApply = async () => {
    if (!config) return;
    setTerraformStatus('applying');
    setTerraformError(null);
    setTerraformLogs([]);

    const eventSource = new EventSource(
      `http://localhost:3001/api/terraform/apply?sessionId=${sessionId}&region=${config.environment.region}`
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.error) {
        setTerraformError(data.error);
        setTerraformStatus('error');
        eventSource.close();
      } else if (data.log) {
        setTerraformLogs(prev => [...prev, data.log]);
      } else if (data.status === 'completed') {
        setTerraformStatus('completed');
        eventSource.close();
      }
    };

    eventSource.onerror = () => {
      setTerraformError('Connection to server lost');
      setTerraformStatus('error');
      eventSource.close();
    };
  };

  const handleTerraformDestroy = async () => {
    if (!config) return;
    setTerraformStatus('destroying');
    setTerraformError(null);
    setTerraformLogs([]);

    const eventSource = new EventSource(
      `http://localhost:3001/api/terraform/destroy?sessionId=${sessionId}&region=${config.environment.region}`
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.error) {
        setTerraformError(data.error);
        setTerraformStatus('error');
        eventSource.close();
      } else if (data.log) {
        setTerraformLogs(prev => [...prev, data.log]);
      } else if (data.status === 'completed') {
        setTerraformStatus('completed');
        eventSource.close();
      }
    };

    eventSource.onerror = () => {
      setTerraformError('Connection to server lost');
      setTerraformStatus('error');
      eventSource.close();
    };
  };

  const handleCancel = () => {
    setScoreFile(null);
    setConfig(null);
    setError(null);
    setTerraformStatus('idle');
    setTerraformLogs([]);
    setTerraformError(null);
  };

  return (
    <Container maxWidth="md">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Score Configuration Generator
        </Typography>
        
        {serverStatus === 'error' && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Server is offline. Please start the server and refresh the page.
          </Alert>
        )}
        
        {!scoreFile ? (
          <ApplicationForm
            onSubmit={handleSubmit}
            isSubmitting={serverStatus === 'processing'}
            error={error}
            disabled={serverStatus === 'error'}
          />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Box>
              <Typography variant="h5" gutterBottom>
                Generated Score File
              </Typography>
              <Box
                component="pre"
                sx={{
                  p: 2,
                  bgcolor: 'grey.100',
                  borderRadius: 1,
                  overflow: 'auto',
                  maxHeight: 300,
                }}
              >
                {scoreFile}
              </Box>
            </Box>
            
            <TerraformLogs
              status={terraformStatus}
              logs={terraformLogs}
              error={terraformError}
              onInit={handleTerraformInit}
              onPlan={handleTerraformPlan}
              onApply={handleTerraformApply}
              onDestroy={handleTerraformDestroy}
              onCancel={handleCancel}
            />
          </Box>
        )}
      </Box>
    </Container>
  );
};

export default App;
