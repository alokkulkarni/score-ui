const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const execa = require('execa');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const processes = new Map();

// Error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ 
      success: false,
      error: 'Invalid JSON format in request body'
    });
  }
  next();
});

// Helper function to run a command and stream output
function runCommandWithStream(command, args, cwd, res) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { cwd });
    let error = '';

    process.stdout.on('data', (data) => {
      const message = data.toString();
      console.log(`[${command}] stdout:`, message);
      res.write(`data: ${JSON.stringify({ log: message })}\n\n`);
    });

    process.stderr.on('data', (data) => {
      const message = data.toString();
      console.error(`[${command}] stderr:`, message);
      error += message;
      res.write(`data: ${JSON.stringify({ log: message })}\n\n`);
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(error || `Process exited with code ${code}`));
      }
    });

    process.on('error', (err) => {
      console.error(`[${command}] error:`, err);
      reject(err);
    });
  });
}

// Helper function to check if Terraform state exists
const checkTerraformState = async (cwd) => {
  try {
    await runCommandWithStream('terraform', ['state', 'list'], cwd, null);
    return true;
  } catch (error) {
    return false;
  }
};

// Helper function to get Terraform output
const getTerraformOutput = async (cwd) => {
  try {
    const hasState = await checkTerraformState(cwd);
    if (!hasState) {
      return {
        vpc_id: { value: null },
        subnet_ids: { value: [] }
      };
    }

    const output = await runCommandWithStream('terraform', ['output', '-json'], cwd, null);
    return JSON.parse(output);
  } catch (error) {
    console.error('Error getting Terraform output:', error);
    return {
      vpc_id: { value: null },
      subnet_ids: { value: [] }
    };
  }
};

// Generate score.yaml from configuration
const generateScoreYaml = (config) => {
  try {
    const { name, environment, services } = config;
    
    if (!name || !environment || !services) {
      throw new Error('Invalid configuration structure');
    }

    const scoreConfig = {
      apiVersion: 'score.dev/v1b1',
      metadata: {
        name: name
      },
      spec: {
        environment: {
          type: environment.type || 'web',
          executionEnvironment: environment.executionEnvironment || 'aws',
          region: environment.region
        },
        services: {
          ...(services.database && {
            database: {
              type: 'postgres',
              properties: {
                size: 'small'
              }
            }
          }),
          ...(services.cache && {
            cache: {
              type: 'redis',
              properties: {
                size: 'small'
              }
            }
          }),
          ...(services.queue && {
            queue: {
              type: 'rabbitmq',
              properties: {
                size: 'small'
              }
            }
          })
        }
      }
    };

    return JSON.stringify(scoreConfig, null, 2);
  } catch (error) {
    console.error('Error generating score config:', error);
    throw new Error('Failed to generate score configuration');
  }
};

const runTerraformCommand = async (command, envDir, region) => {
  try {
    const env = {
      ...process.env,
      AWS_REGION: region,
      TF_VAR_aws_region: region,
      AWS_DEFAULT_REGION: region
    };
    
    const result = await execa('terraform', command.split(' '), {
      cwd: envDir,
      env,
      stdio: 'pipe'
    });
    
    return { success: true, output: result.stdout };
  } catch (error) {
    console.error(`Terraform command failed: ${error.message}`);
    return { success: false, error: error.message };
  }
};

const initTerraform = async (envDir, region) => {
  try {
    await runTerraformCommand('init', envDir, region);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const planTerraform = async (envDir, region) => {
  try {
    const output = await runTerraformCommand('plan -out=tfplan', envDir, region);
    return { success: true, output };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const applyTerraform = async (envDir, region) => {
  try {
    const output = await runTerraformCommand('apply tfplan', envDir, region);
    return { success: true, output };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// Helper function to send consistent responses
function sendResponse(res, status, data) {
  return res.status(status).json({
    success: status >= 200 && status < 300,
    ...data
  });
}

// Function to generate Terraform configuration from score file
function generateTerraformConfig(scoreConfig) {
  const { environment, services } = scoreConfig.spec;
  const { region } = environment;
  
  let hclConfig = '';

  // Generate provider configuration
  hclConfig += `provider "aws" {
  region = "${region}"
}

provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
  }
}

`;

  // Generate VPC configuration
  hclConfig += `module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${scoreConfig.metadata.name}-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["${region}a", "${region}b", "${region}c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true

  tags = {
    Terraform = "true"
    Environment = "dev"
  }
}

`;

  // Generate EKS configuration
  hclConfig += `module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 19.0"

  cluster_name    = "${scoreConfig.metadata.name}-cluster"
  cluster_version = "1.27"

  cluster_endpoint_public_access = true

  vpc_id                   = module.vpc.vpc_id
  subnet_ids               = module.vpc.private_subnets
  control_plane_subnet_ids = module.vpc.private_subnets

  eks_managed_node_groups = {
    default = {
      min_size     = 1
      max_size     = 3
      desired_size = 2

      instance_types = ["t3.medium"]
    }
  }

  # Enable IAM roles for service accounts
  enable_irsa = true

  # Add IAM role for RDS access
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

  tags = {
    Environment = "dev"
    Terraform   = "true"
  }
}

# Create IAM role policy for EKS
resource "aws_iam_role_policy" "eks_node_policy" {
  name = "eks-node-policy"
  role = module.eks.eks_managed_node_groups["default"].iam_role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ec2:DescribeInstances",
          "ec2:DescribeRegions",
          "ec2:DescribeRouteTables",
          "ec2:DescribeSecurityGroups",
          "ec2:DescribeSubnets",
          "ec2:DescribeVolumes",
          "ec2:DescribeVolumesModifications",
          "ec2:DescribeVpcs",
          "eks:DescribeCluster"
        ]
        Resource = "*"
      }
    ]
  })
}

# RDS instance configuration
resource "aws_db_subnet_group" "main" {
  name       = "${scoreConfig.metadata.name}-db-subnet-group"
  subnet_ids = module.vpc.private_subnets

  tags = {
    Name = "${scoreConfig.metadata.name}-db-subnet-group"
  }
}

resource "aws_security_group" "rds" {
  name        = "${scoreConfig.metadata.name}-rds-sg"
  description = "Security group for RDS instance"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [module.eks.cluster_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${scoreConfig.metadata.name}-rds-sg"
  }
}

resource "aws_db_instance" "main" {
  identifier           = "${scoreConfig.metadata.name}-db"
  allocated_storage    = 20
  storage_type        = "gp2"
  engine              = "postgres"
  engine_version      = "13.7"
  instance_class      = "db.t3.micro"
  db_name             = "${scoreConfig.metadata.name}_db"
  username            = "postgres"
  password            = "postgres123"  # In production, use AWS Secrets Manager
  skip_final_snapshot = true

  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name

  tags = {
    Name = "${scoreConfig.metadata.name}-db"
  }
}

# Create OIDC provider for EKS
data "tls_certificate" "eks" {
  url = module.eks.cluster_oidc_issuer_url
}

resource "aws_iam_openid_connect_provider" "eks" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.eks.certificates[0].sha1_fingerprint]
  url             = module.eks.cluster_oidc_issuer_url
}

# Kubernetes service account with IAM role
resource "kubernetes_service_account" "app" {
  metadata {
    name      = "app"
    namespace = "default"
    annotations = {
      "eks.amazonaws.com/role-arn" = module.eks.eks_managed_node_groups["default"].iam_role_name
    }
  }
}

# Kubernetes secret for database connection details
resource "kubernetes_secret" "db_credentials" {
  metadata {
    name      = "app-db-credentials"
    namespace = "default"
  }

  data = {
    DB_HOST     = aws_db_instance.main.address
    DB_PORT     = "5432"
    DB_NAME     = aws_db_instance.main.db_name
    DB_USER     = aws_db_instance.main.username
    DB_PASSWORD = aws_db_instance.main.password
  }
}

# Update the Kubernetes deployment to use a public nginx image for testing
resource "kubernetes_deployment" "app" {
  metadata {
    name = "app"
    namespace = "default"
    labels = {
      app = "app"
    }
  }

  spec {
    replicas = 2

    selector {
      match_labels = {
        app = "app"
      }
    }

    template {
      metadata {
        labels = {
          app = "app"
        }
      }

      spec {
        service_account_name = kubernetes_service_account.app.metadata[0].name

        container {
          # Use nginx as a test image since app:latest doesn't exist
          image = "nginx:latest"
          name  = "app"

          env_from {
            secret_ref {
              name = kubernetes_secret.db_credentials.metadata[0].name
            }
          }

          # Add readiness and liveness probes
          readiness_probe {
            http_get {
              path = "/"
              port = 80
            }
            initial_delay_seconds = 10
            period_seconds = 5
          }

          liveness_probe {
            http_get {
              path = "/"
              port = 80
            }
            initial_delay_seconds = 10
            period_seconds = 5
          }

          resources {
            limits = {
              cpu    = "0.5"
              memory = "512Mi"
            }
            requests = {
              cpu    = "250m"
              memory = "50Mi"
            }
          }

          # Update container port to match nginx
          port {
            container_port = 80
          }
        }
      }
    }
  }
}

# Update the service to match nginx port
resource "kubernetes_service" "app" {
  metadata {
    name = "app"
    namespace = "default"
  }

  spec {
    selector = {
      app = "app"
    }

    port {
      port        = 80
      target_port = 80
    }

    type = "LoadBalancer"
  }
}

# Ingress configuration
resource "kubernetes_ingress_v1" "app" {
  metadata {
    name = "app"
    namespace = "default"
    annotations = {
      "kubernetes.io/ingress.class" = "alb"
      "alb.ingress.kubernetes.io/scheme" = "internet-facing"
      "alb.ingress.kubernetes.io/target-type" = "ip"
      "alb.ingress.kubernetes.io/listen-ports" = jsonencode([{"HTTP": 80}])
    }
  }

  spec {
    rule {
      http {
        path {
          path = "/"
          backend {
            service {
              name = kubernetes_service.app.metadata[0].name
              port {
                number = 80
              }
            }
          }
        }
      }
    }
  }
}
`;

  return hclConfig;
}

// POST /api/generate
app.post('/api/generate', (req, res) => {
  try {
    const config = req.body;

    // Validate request body
    if (!config || typeof config !== 'object') {
      return sendResponse(res, 400, {
        error: 'Invalid request body'
      });
    }

    // Validate required fields
    if (!config.name) {
      return sendResponse(res, 400, {
        error: 'Application name is required'
      });
    }

    if (!config.environment || !config.environment.region) {
      return sendResponse(res, 400, {
        error: 'AWS region is required'
      });
    }

    // Generate score file
    const scoreFile = generateScoreYaml(config);
    
    // Save the score file
    const envDir = path.join(__dirname, 'environment');
    if (!fs.existsSync(envDir)) {
      fs.mkdirSync(envDir, { recursive: true });
    }
    
    const scoreFilePath = path.join(envDir, 'score.yaml');
    fs.writeFileSync(scoreFilePath, scoreFile);

    console.log('Generated score file:', scoreFile);
    
    return sendResponse(res, 200, {
      scoreFile,
      message: 'Score file generated successfully'
    });
  } catch (error) {
    console.error('Error generating score file:', error);
    return sendResponse(res, 500, {
      error: error.message || 'Failed to generate score file'
    });
  }
});

// Terraform init endpoint
app.get('/api/terraform/init', (req, res) => {
  const { sessionId, region } = req.query;
  
  if (!sessionId || !region) {
    return res.status(400).json({ error: 'Session ID and region are required' });
  }

  const envDir = path.join(__dirname, 'environments', sessionId);
  if (!fs.existsSync(envDir)) {
    fs.mkdirSync(envDir, { recursive: true });
  }

  // Generate Terraform configuration
  const mainTf = `
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }
  }
}

provider "aws" {
  region = "${region}"
}

# VPC Configuration
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "app-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["${region}a", "${region}b", "${region}c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true

  tags = {
    Terraform = "true"
    Environment = "dev"
  }
}

# EKS Cluster
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 19.0"

  cluster_name    = "app-cluster"
  cluster_version = "1.27"

  cluster_endpoint_public_access = true

  vpc_id                   = module.vpc.vpc_id
  subnet_ids               = module.vpc.private_subnets
  control_plane_subnet_ids = module.vpc.private_subnets

  eks_managed_node_groups = {
    default = {
      min_size     = 1
      max_size     = 3
      desired_size = 2

      instance_types = ["t3.medium"]
    }
  }

  # Enable IAM roles for service accounts
  enable_irsa = true

  # Add IAM role for RDS access
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

  tags = {
    Environment = "dev"
    Terraform   = "true"
  }
}

# Create IAM role policy for EKS
resource "aws_iam_role_policy" "eks_node_policy" {
  name = "eks-node-policy"
  role = module.eks.eks_managed_node_groups["default"].iam_role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ec2:DescribeInstances",
          "ec2:DescribeRegions",
          "ec2:DescribeRouteTables",
          "ec2:DescribeSecurityGroups",
          "ec2:DescribeSubnets",
          "ec2:DescribeVolumes",
          "ec2:DescribeVolumesModifications",
          "ec2:DescribeVpcs",
          "eks:DescribeCluster"
        ]
        Resource = "*"
      }
    ]
  })
}

# RDS Configuration
resource "aws_db_subnet_group" "main" {
  name       = "app-db-subnet-group"
  subnet_ids = module.vpc.private_subnets

  tags = {
    Name = "app-db-subnet-group"
  }
}

resource "aws_security_group" "rds" {
  name        = "app-rds-sg"
  description = "Security group for RDS instance"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [module.eks.cluster_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "app-rds-sg"
  }
}

resource "aws_db_instance" "main" {
  identifier           = "app-db"
  allocated_storage    = 20
  storage_type        = "gp2"
  engine              = "postgres"
  engine_version      = "14"
  instance_class      = "db.t3.micro"
  db_name             = "appdb"
  username            = "postgres"
  password            = "postgres123"  # In production, use AWS Secrets Manager
  skip_final_snapshot = true

  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name

  tags = {
    Name = "app-db"
  }
}

# Create OIDC provider for EKS
data "tls_certificate" "eks" {
  url = module.eks.cluster_oidc_issuer_url
}

resource "aws_iam_openid_connect_provider" "eks" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.eks.certificates[0].sha1_fingerprint]
  url             = module.eks.cluster_oidc_issuer_url
}

# Kubernetes provider configuration
provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
  }
}

# Kubernetes service account with IAM role
resource "kubernetes_service_account" "app" {
  metadata {
    name      = "app"
    namespace = "default"
    annotations = {
      "eks.amazonaws.com/role-arn" = module.eks.eks_managed_node_groups["default"].iam_role_name
    }
  }
}

# Kubernetes secret for database connection details
resource "kubernetes_secret" "db_credentials" {
  metadata {
    name      = "app-db-credentials"
    namespace = "default"
  }

  data = {
    DB_HOST     = aws_db_instance.main.address
    DB_PORT     = "5432"
    DB_NAME     = aws_db_instance.main.db_name
    DB_USER     = aws_db_instance.main.username
    DB_PASSWORD = aws_db_instance.main.password
  }
}

# Kubernetes deployment
resource "kubernetes_deployment" "app" {
  metadata {
    name = "app"
    namespace = "default"
    labels = {
      app = "app"
    }
  }

  spec {
    replicas = 2

    selector {
      match_labels = {
        app = "app"
      }
    }

    template {
      metadata {
        labels = {
          app = "app"
        }
      }

      spec {
        service_account_name = kubernetes_service_account.app.metadata[0].name

        container {
          # Use nginx as a test image since app:latest doesn't exist
          image = "nginx:latest"
          name  = "app"

          env_from {
            secret_ref {
              name = kubernetes_secret.db_credentials.metadata[0].name
            }
          }

          # Add readiness and liveness probes
          readiness_probe {
            http_get {
              path = "/"
              port = 80
            }
            initial_delay_seconds = 10
            period_seconds = 5
          }

          liveness_probe {
            http_get {
              path = "/"
              port = 80
            }
            initial_delay_seconds = 10
            period_seconds = 5
          }

          resources {
            limits = {
              cpu    = "0.5"
              memory = "512Mi"
            }
            requests = {
              cpu    = "250m"
              memory = "50Mi"
            }
          }

          # Update container port to match nginx
          port {
            container_port = 80
          }
        }
      }
    }
  }
}

# Kubernetes service
resource "kubernetes_service" "app" {
  metadata {
    name = "app"
    namespace = "default"
  }

  spec {
    selector = {
      app = "app"
    }

    port {
      port        = 80
      target_port = 80
    }

    type = "LoadBalancer"
  }
}

# Ingress configuration
resource "kubernetes_ingress_v1" "app" {
  metadata {
    name = "app"
    namespace = "default"
    annotations = {
      "kubernetes.io/ingress.class" = "alb"
      "alb.ingress.kubernetes.io/scheme" = "internet-facing"
      "alb.ingress.kubernetes.io/target-type" = "ip"
      "alb.ingress.kubernetes.io/listen-ports" = jsonencode([{"HTTP": 80}])
    }
  }

  spec {
    rule {
      http {
        path {
          path = "/"
          backend {
            service {
              name = kubernetes_service.app.metadata[0].name
              port {
                number = 80
              }
            }
          }
        }
      }
    }
  }
}
`;

  // Write Terraform configuration to file
  fs.writeFileSync(path.join(envDir, 'main.tf'), mainTf);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  process.chdir(envDir);
  runCommandWithStream('terraform', ['init'], envDir, res)
    .then(() => {
      res.write(`data: ${JSON.stringify({ status: 'completed' })}\n\n`);
      res.end();
    })
    .catch(error => {
      console.error('Terraform init error:', error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    });
});

// Terraform plan endpoint
app.get('/api/terraform/plan', (req, res) => {
  const { sessionId } = req.query;
  
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required' });
  }

  const envDir = path.join(__dirname, 'environments', sessionId);
  if (!fs.existsSync(envDir)) {
    return res.status(400).json({ error: 'Environment directory not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  process.chdir(envDir);
  runCommandWithStream('terraform', ['plan', '-out=tfplan'], envDir, res)
    .then(() => {
      res.write(`data: ${JSON.stringify({ status: 'completed' })}\n\n`);
      res.end();
    })
    .catch(error => {
      console.error('Terraform plan error:', error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    });
});

// Terraform apply endpoint
app.get('/api/terraform/apply', (req, res) => {
  const { sessionId } = req.query;
  
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required' });
  }

  const envDir = path.join(__dirname, 'environments', sessionId);
  if (!fs.existsSync(envDir)) {
    return res.status(400).json({ error: 'Environment directory not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  process.chdir(envDir);
  runCommandWithStream('terraform', ['apply', '-auto-approve', 'tfplan'], envDir, res)
    .then(() => {
      res.write(`data: ${JSON.stringify({ status: 'completed' })}\n\n`);
      res.end();
    })
    .catch(error => {
      console.error('Terraform apply error:', error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    });
});

// Terraform destroy endpoint
app.get('/api/terraform/destroy', (req, res) => {
  const { sessionId } = req.query;
  
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required' });
  }

  const envDir = path.join(__dirname, 'environments', sessionId);
  if (!fs.existsSync(envDir)) {
    return res.status(400).json({ error: 'Environment directory not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  process.chdir(envDir);
  runCommandWithStream('terraform', ['destroy', '-auto-approve'], envDir, res)
    .then(() => {
      res.write(`data: ${JSON.stringify({ status: 'completed' })}\n\n`);
      res.end();
    })
    .catch(error => {
      console.error('Terraform destroy error:', error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    });
});

// GET /api/score/:sessionId
app.get('/api/score/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const envDir = path.join(__dirname, 'environments', 'dev');
    const scoreFilePath = path.join(envDir, 'score.yaml');

    if (!fs.existsSync(scoreFilePath)) {
      return res.status(404).json({ error: 'Score file not found' });
    }

    const fileContent = fs.readFileSync(scoreFilePath, 'utf8');
    res.json({ scoreFile: fileContent });
  } catch (error) {
    console.error('Error reading score file:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/status/:sessionId
app.get('/api/status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const process = processes.get(sessionId);

  if (!process) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({
    status: process.status,
    logs: process.logs,
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  return sendResponse(res, 200, {
    status: 'ok',
    message: 'Server is running'
  });
});

// Catch-all route for 404 errors
app.use((req, res) => {
  return sendResponse(res, 404, {
    error: 'Route not found'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  return sendResponse(res, 500, {
    error: 'Internal server error'
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 