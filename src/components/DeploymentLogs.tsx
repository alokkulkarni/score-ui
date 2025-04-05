import React, { useEffect, useRef } from 'react';
import {
  Paper,
  Box,
  Typography,
  Button,
  CircularProgress,
} from '@mui/material';

interface Log {
  type: 'stdout' | 'stderr';
  message: string;
}

interface DeploymentLogsProps {
  logs: Log[];
  status: string;
  onApply?: () => void;
  isApplying?: boolean;
}

const DeploymentLogs: React.FC<DeploymentLogsProps> = ({ logs, status, onApply, isApplying = false }) => {
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getStatusColor = () => {
    switch (status) {
      case 'completed':
        return 'success.main';
      case 'failed':
        return 'error.main';
      default:
        return 'info.main';
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h6" gutterBottom>
        Deployment Status: {status}
      </Typography>
      <Paper elevation={3} sx={{ p: 2, mb: 2, maxHeight: '400px', overflow: 'auto' }}>
        {logs.map((log, index) => (
          <Box
            key={index}
            component="pre"
            sx={{
              margin: 0,
              fontFamily: 'monospace',
              color: log.type === 'stderr' ? 'error.main' : 'text.primary',
            }}
          >
            {log.message}
          </Box>
        ))}
      </Paper>
      {onApply && (
        <Button
          variant="contained"
          color="primary"
          onClick={onApply}
          disabled={isApplying}
          startIcon={isApplying ? <CircularProgress size={20} /> : null}
        >
          {isApplying ? 'Applying...' : 'Apply Changes'}
        </Button>
      )}
    </Box>
  );
};

export default DeploymentLogs; 