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

resource "aws_db_subnet_group" "main" {
  name       = "score-db-subnet-group"
  subnet_ids = var.subnet_ids

  tags = {
    Name = "score-db-subnet-group"
  }
}

resource "aws_security_group" "db" {
  name        = "score-db-sg"
  description = "Security group for RDS"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }

  tags = {
    Name = "score-db-sg"
  }
}

resource "aws_db_instance" "main" {
  identifier           = "score-db"
  engine              = "postgres"
  engine_version      = "13.7"
  instance_class      = "db.t3.micro"
  allocated_storage   = 20
  storage_type        = "gp2"
  db_name             = "scoredb"
  username            = "scoreadmin"
  password            = "scorepassword" # In production, use AWS Secrets Manager
  skip_final_snapshot = true

  vpc_security_group_ids = [aws_security_group.db.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name

  tags = {
    Name = "score-db"
  }
}

output "db_endpoint" {
  value = aws_db_instance.main.endpoint
}

output "db_name" {
  value = aws_db_instance.main.db_name
}

output "db_username" {
  value = aws_db_instance.main.username
} 