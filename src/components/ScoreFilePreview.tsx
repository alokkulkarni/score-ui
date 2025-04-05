import React from 'react';
import { Box, Button, Paper, Typography } from '@mui/material';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { docco } from 'react-syntax-highlighter/dist/esm/styles/hljs';

interface ScoreFilePreviewProps {
  scoreFile: string;
  onCancel: () => void;
}

const ScoreFilePreview: React.FC<ScoreFilePreviewProps> = ({ scoreFile, onCancel }) => {
  return (
    <Paper elevation={3} sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Generated Score Configuration
      </Typography>

      <Box sx={{ mb: 3 }}>
        <SyntaxHighlighter language="yaml" style={docco}>
          {scoreFile}
        </SyntaxHighlighter>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
        <Button
          variant="outlined"
          onClick={onCancel}
        >
          Back to Form
        </Button>
      </Box>
    </Paper>
  );
};

export default ScoreFilePreview; 