# Score UI

A React application for generating infrastructure configuration using Terraform modules.

## Features

- Interactive form for configuring application deployment
- Support for multiple application types:
  - Web Application
  - API Service
  - Background Worker
  - Batch Job
- Execution environment selection:
  - EKS (with IAM roles for service accounts)
  - Lambda
  - ECS
- Environment variable management with secret support
- Service configuration:
  - Databases (RDS, DynamoDB)
  - Cache (Redis)
  - Queue (SQS)
  - Storage (S3)
  - AI Services (Bedrock)
- Environment-specific configuration:
  - Development
  - Staging
  - Production
- Automatic Terraform configuration generation
- IAM role management for EKS service accounts
- OIDC provider integration for secure service account authentication

## Prerequisites

- Node.js 16 or later
- npm 7 or later
- Terraform 1.0.0 or later
- AWS CLI configured with appropriate credentials
- AWS IAM permissions for EKS cluster management
- AWS IAM permissions for OIDC provider configuration

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/terraform-aws-infrastructure.git
   cd terraform-aws-infrastructure/score-ui
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

1. Start the development server:
   ```bash
   npm start
   ```

2. Open [http://localhost:3000](http://localhost:3000) in your browser

3. Fill out the application configuration form:
   - Basic Information
     - Application Name
     - Application Type
     - Docker Image
     - Execution Environment
     - Target Environment
   - Environment Variables
     - Add key-value pairs
     - Mark sensitive values as secrets
   - Required Services
     - Select and configure needed services

4. Click "Generate Score Configuration" to create the score.yaml file

5. Generate Terraform configuration:
   ```bash
   npm run generate
   ```

   This will:
   - Parse the score.yaml file
   - Generate Terraform configuration in the appropriate environment directory
   - Create main.tf, variables.tf, and terraform.tfvars files
   - Configure EKS cluster with IAM roles for service accounts
   - Set up OIDC provider for secure authentication

6. Review and apply the Terraform configuration:
   ```bash
   cd ../environments/<env>
   terraform init
   terraform plan
   terraform apply
   ```

## Configuration Structure

The generated score.yaml file follows this structure:

```yaml
application:
  name: string
  type: web|api|worker|batch
  image: string
  executionEnvironment: eks|lambda|ecs
  environmentVariables:
    - key: string
      value: string
      isSecret: boolean
  services:
    - name: string
      type: database|cache|queue|storage|ai
      provider: rds|dynamodb|redis|sqs|s3|bedrock
      configuration: object
  environment: dev|staging|prod

infrastructure:
  vpc: boolean
  alb: boolean
  route53: boolean
  certificate: boolean
  secretsStore: boolean
  eks:
    enable_irsa: boolean
    cluster_addons:
      coredns: boolean
      kube-proxy: boolean
      vpc-cni: boolean
```

## EKS Configuration

The application supports EKS cluster configuration with the following features:

- IAM roles for service accounts (IRSA)
- OIDC provider integration
- Node group management
- Cluster add-ons (CoreDNS, kube-proxy, VPC-CNI)
- Security group configuration
- Service account annotations for IAM role binding

Example EKS configuration:
```hcl
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 19.0"

  cluster_name    = "app-cluster"
  cluster_version = "1.27"
  enable_irsa     = true

  eks_managed_node_groups = {
    default = {
      min_size     = 1
      max_size     = 3
      desired_size = 2
      instance_types = ["t3.medium"]
    }
  }

  cluster_addons = {
    coredns = {
      most_recent = true
    }
    kube-proxy = {
      most_recent = true
    }
    vpc-cni = {
      most_recent = true
    }
  }
}
```

## Development

- `src/types/index.ts` - TypeScript interfaces and types
- `src/components/ApplicationForm.tsx` - Main form component
- `scripts/generate-terraform.js` - Terraform configuration generator
- `server/index.js` - Server-side configuration generation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
