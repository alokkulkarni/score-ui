import React, { useState } from 'react';
import {
  Box,
  Button,
  TextField,
  MenuItem,
  Typography,
  Paper,
  FormControlLabel,
  Checkbox,
  Alert,
} from '@mui/material';

interface ApplicationConfig {
  name: string;
  environment: {
    type: string;
    executionEnvironment: string;
    region: string;
  };
  services: Record<string, any>;
}

interface ApplicationFormProps {
  onSubmit: (config: ApplicationConfig) => void;
  isSubmitting: boolean;
  error: string | null;
  disabled?: boolean;
}

const AWS_REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-west-2',
  'eu-central-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'sa-east-1',
];

const ApplicationForm: React.FC<ApplicationFormProps> = ({
  onSubmit,
  isSubmitting,
  error,
  disabled = false,
}) => {
  const [formData, setFormData] = useState<ApplicationConfig>({
    name: '',
    environment: {
      type: 'api',
      executionEnvironment: 'aws',
      region: 'us-east-1',
    },
    services: {},
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name.startsWith('environment.')) {
      const field = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        environment: {
          ...prev.environment,
          [field]: value,
        },
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleServiceToggle = (service: string) => {
    setFormData(prev => ({
      ...prev,
      services: {
        ...prev.services,
        [service]: prev.services[service] ? undefined : {
          type: service === 'database' ? 'postgres' : 
                service === 'cache' ? 'redis' : 
                'sqs',
          properties: {
            size: 'small',
          },
        },
      },
    }));
  };

  return (
    <Paper elevation={3} sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Application Configuration
      </Typography>
      <Box component="form" onSubmit={handleSubmit}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <TextField
          fullWidth
          label="Application Name"
          name="name"
          value={formData.name}
          onChange={handleInputChange}
          required
          disabled={isSubmitting || disabled}
          sx={{ mb: 2 }}
        />
        <TextField
          select
          fullWidth
          label="AWS Region"
          name="environment.region"
          value={formData.environment.region}
          onChange={handleInputChange}
          required
          disabled={isSubmitting || disabled}
          sx={{ mb: 2 }}
        >
          {AWS_REGIONS.map((region) => (
            <MenuItem key={region} value={region}>
              {region}
            </MenuItem>
          ))}
        </TextField>
        <Typography variant="subtitle1" gutterBottom>
          Services
        </Typography>
        <Box sx={{ mb: 2 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={!!formData.services.database}
                onChange={() => handleServiceToggle('database')}
                disabled={isSubmitting || disabled}
              />
            }
            label="Database (PostgreSQL)"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={!!formData.services.cache}
                onChange={() => handleServiceToggle('cache')}
                disabled={isSubmitting || disabled}
              />
            }
            label="Cache (Redis)"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={!!formData.services.messageQueue}
                onChange={() => handleServiceToggle('messageQueue')}
                disabled={isSubmitting || disabled}
              />
            }
            label="Message Queue (SQS)"
          />
        </Box>
        <Button
          type="submit"
          variant="contained"
          color="primary"
          disabled={isSubmitting || disabled}
        >
          {isSubmitting ? 'Generating...' : 'Generate Score File'}
        </Button>
      </Box>
    </Paper>
  );
};

export default ApplicationForm; 