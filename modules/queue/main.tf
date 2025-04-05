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

resource "aws_mq_broker" "main" {
  broker_name        = "score-queue"
  engine_type        = "RabbitMQ"
  engine_version     = "3.8.11"
  host_instance_type = "mq.t3.micro"
  security_groups    = [aws_security_group.queue.id]
  subnet_ids         = var.subnet_ids

  user {
    username = "scoreadmin"
    password = "scorepassword" # In production, use AWS Secrets Manager
  }

  tags = {
    Name = "score-queue"
  }
}

resource "aws_security_group" "queue" {
  name        = "score-queue-sg"
  description = "Security group for RabbitMQ"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 5671
    to_port     = 5671
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }

  tags = {
    Name = "score-queue-sg"
  }
}

output "queue_endpoint" {
  value = aws_mq_broker.main.instances[0].endpoints[0]
}

output "queue_username" {
  value = aws_mq_broker.main.user[0].username
} 