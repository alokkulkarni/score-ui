import React from 'react';
import { Box, Button, Typography, Paper, CircularProgress, Alert } from '@mui/material';

export type TerraformStatus = 'idle' | 'initializing' | 'planning' | 'applying' | 'destroying' | 'processing' | 'completed' | 'error';

interface TerraformLogsProps {
  status: TerraformStatus;
  logs: string[];
  error: string | null;
  onInit: () => void;
  onPlan: () => void;
  onApply: () => void;
  onDestroy: () => void;
  onCancel: () => void;
}

const TerraformLogs: React.FC<TerraformLogsProps> = ({
  status,
  logs,
  error,
  onInit,
  onPlan,
  onApply,
  onDestroy,
  onCancel,
}) => {
  const isProcessing = status === 'initializing' || status === 'planning' || status === 'applying' || status === 'destroying' || status === 'processing';
  const canPlan = status === 'idle' || status === 'completed';
  const canApply = status === 'completed';

  return (
    <Paper elevation={3} sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Terraform Execution
      </Typography>
      
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Status: {status}
        </Typography>
        
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {isProcessing && (
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <CircularProgress size={20} sx={{ mr: 1 }} />
            <Typography>
              {status === 'initializing' && 'Initializing Terraform...'}
              {status === 'planning' && 'Generating Terraform plan...'}
              {status === 'applying' && 'Applying Terraform changes...'}
              {status === 'destroying' && 'Destroying Terraform resources...'}
              {status === 'processing' && 'Processing...'}
            </Typography>
          </Box>
        )}

        <Paper elevation={1} sx={{ p: 2, backgroundColor: '#f5f5f5', overflow: 'auto', maxHeight: 300 }}>
          <Box component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap' }}>
            {logs.length > 0 ? logs.join('\n') : 'No logs available'}
          </Box>
        </Paper>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          color="primary"
          onClick={onInit}
          disabled={isProcessing}
        >
          Initialize Terraform
        </Button>
        
        <Button
          variant="contained"
          color="primary"
          onClick={onPlan}
          disabled={isProcessing || !canPlan}
        >
          Generate Plan
        </Button>
        
        <Button
          variant="contained"
          color="primary"
          onClick={onApply}
          disabled={isProcessing || !canApply}
        >
          Apply Changes
        </Button>
        
        <Button
          variant="contained"
          color="error"
          onClick={onDestroy}
          disabled={isProcessing}
        >
          Destroy
        </Button>
        
        <Button
          variant="outlined"
          onClick={onCancel}
          disabled={isProcessing}
        >
          Cancel
        </Button>
      </Box>
    </Paper>
  );
};

export default TerraformLogs; 