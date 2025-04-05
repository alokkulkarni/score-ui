#!/bin/bash

# Set default region if not provided
if [ -z "$AWS_REGION" ]; then
    export AWS_REGION="us-east-2"
    echo "Using default region: $AWS_REGION"
fi

# Export variables for Terraform
export TF_VAR_aws_region=$AWS_REGION
export AWS_DEFAULT_REGION=$AWS_REGION

echo "Environment variables set successfully:"
echo "AWS_REGION: $AWS_REGION"
echo "AWS_DEFAULT_REGION: $AWS_DEFAULT_REGION"
echo "TF_VAR_aws_region: $TF_VAR_aws_region" 