terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

provider "aws" {
  region = var.aws_region
}

# VPC Module
module "vpc" {
  source = "../../modules/vpc"

  aws_region = var.aws_region
  name       = "score-vpc"
}

# Database Module
module "database" {
  source = "../../modules/database"

  aws_region = var.aws_region
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnet_ids
}

# Cache Module
module "cache" {
  source = "../../modules/cache"

  aws_region = var.aws_region
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnet_ids
}

# Queue Module
module "queue" {
  source = "../../modules/queue"

  aws_region = var.aws_region
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnet_ids
}

# Storage Module
module "storage" {
  source = "../../modules/storage"

  aws_region = var.aws_region
  name       = "score-storage"
}

# AI Module
module "ai" {
  source = "../../modules/ai"

  aws_region = var.aws_region
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnet_ids
}

output "vpc_id" {
  value = module.vpc.vpc_id
}

output "subnet_ids" {
  value = module.vpc.private_subnet_ids
} 