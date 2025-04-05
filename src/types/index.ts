export type ApplicationType = 'web' | 'api' | 'worker' | 'batch';

export type ExecutionEnvironment = 'eks' | 'lambda' | 'ecs';

export interface EnvironmentVariable {
  key: string;
  value: string;
  isSecret: boolean;
}

export interface Service {
  name: string;
  type: 'database' | 'cache' | 'queue' | 'storage' | 'ai';
  provider: 'rds' | 'dynamodb' | 'redis' | 'sqs' | 's3' | 'bedrock';
  configuration: Record<string, any>;
}

export interface ApplicationConfig {
  name: string;
  type: ApplicationType;
  image: string;
  executionEnvironment: ExecutionEnvironment;
  environmentVariables: EnvironmentVariable[];
  services: Service[];
  environment: 'dev' | 'staging' | 'prod';
}

export interface ScoreConfig {
  application: ApplicationConfig;
  infrastructure: {
    vpc: boolean;
    alb: boolean;
    route53: boolean;
    certificate: boolean;
    secretsStore: boolean;
  };
} 