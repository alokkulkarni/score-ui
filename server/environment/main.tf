provider "aws" {
  region = "eu-west-1"
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

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "payments-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["eu-west-1a", "eu-west-1b", "eu-west-1c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true

  tags = {
    Terraform = "true"
    Environment = "dev"
  }
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 19.0"

  cluster_name    = "payments-cluster"
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

# RDS instance configuration
resource "aws_db_subnet_group" "main" {
  name       = "payments-db-subnet-group"
  subnet_ids = module.vpc.private_subnets

  tags = {
    Name = "payments-db-subnet-group"
  }
}

resource "aws_security_group" "rds" {
  name        = "payments-rds-sg"
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
    Name = "payments-rds-sg"
  }
}

resource "aws_db_instance" "main" {
  identifier           = "payments-db"
  allocated_storage    = 20
  storage_type        = "gp2"
  engine              = "postgres"
  engine_version      = "13.7"
  instance_class      = "db.t3.micro"
  db_name             = "payments_db"
  username            = "postgres"
  password            = "postgres123"  # In production, use AWS Secrets Manager
  skip_final_snapshot = true

  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name

  tags = {
    Name = "payments-db"
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

# IAM role for EKS to access RDS
resource "aws_iam_role" "eks_rds_access" {
  name = "payments-eks-rds-access"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRoleWithWebIdentity"
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.eks.arn
        }
        Condition = {
          StringEquals = {
            "${replace(aws_iam_openid_connect_provider.eks.url, "https://", "")}:sub": "system:serviceaccount:default:payments-app",
            "${replace(aws_iam_openid_connect_provider.eks.url, "https://", "")}:aud": "sts.amazonaws.com"
          }
        }
      }
    ]
  })
}

# IAM policy for RDS access
resource "aws_iam_policy" "rds_access" {
  name = "payments-rds-access-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "rds-db:connect"
        ]
        Resource = [
          aws_db_instance.main.arn
        ]
      }
    ]
  })
}

# Attach policy to role
resource "aws_iam_role_policy_attachment" "rds_access" {
  role       = aws_iam_role.eks_rds_access.name
  policy_arn = aws_iam_policy.rds_access.arn
}

# Kubernetes service account with IAM role
resource "kubernetes_service_account" "app" {
  metadata {
    name      = "payments-app"
    namespace = "default"
    annotations = {
      "eks.amazonaws.com/role-arn" = aws_iam_role.eks_rds_access.arn
    }
  }
}

# Kubernetes secret for database connection details
resource "kubernetes_secret" "db_credentials" {
  metadata {
    name      = "payments-db-credentials"
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

# Update the Kubernetes deployment to use the service account and secrets
resource "kubernetes_deployment" "main" {
  metadata {
    name = "payments"
    namespace = "default"
    labels = {
      app = "payments"
    }
  }

  spec {
    replicas = 2

    selector {
      match_labels = {
        app = "payments"
      }
    }

    template {
      metadata {
        labels = {
          app = "payments"
        }
      }

      spec {
        service_account_name = kubernetes_service_account.app.metadata[0].name

        container {
          image = "payments:latest"
          name  = "payments"

          env_from {
            secret_ref {
              name = kubernetes_secret.db_credentials.metadata[0].name
            }
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
        }
      }
    }
  }
}

resource "kubernetes_service" "main" {
  metadata {
    name = "payments"
    namespace = "default"
  }

  spec {
    selector = {
      app = "payments"
    }

    port {
      port        = 80
      target_port = 8080
    }

    type = "LoadBalancer"
  }
}

