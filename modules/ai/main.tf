variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs"
  type        = list(string)
}

resource "aws_sagemaker_notebook_instance" "main" {
  name          = "score-ai-notebook"
  role_arn      = aws_iam_role.sagemaker.arn
  instance_type = "ml.t2.medium"
  subnet_id     = var.subnet_ids[0]
  security_groups = [aws_security_group.sagemaker.id]

  tags = {
    Name = "score-ai-notebook"
  }
}

resource "aws_iam_role" "sagemaker" {
  name = "score-sagemaker-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "sagemaker.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "sagemaker" {
  role       = aws_iam_role.sagemaker.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSageMakerFullAccess"
}

resource "aws_security_group" "sagemaker" {
  name        = "score-sagemaker-sg"
  description = "Security group for SageMaker"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }

  tags = {
    Name = "score-sagemaker-sg"
  }
}

output "notebook_url" {
  value = aws_sagemaker_notebook_instance.main.url
} 