import dotenv from 'dotenv';
dotenv.config();

export interface AppEnv {
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  DATABASE_URL?: string;
  JWT_SECRET: string;
  APP_URL: string;
  ZATCA_ENV: 'sandbox' | 'simulation' | 'production';
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
}

export function validateEnv(): AppEnv {
  const port = 3000;

  const nodeEnv = (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test';
  const jwtSecret = process.env.JWT_SECRET || 'dev-local-jwt-secret-min-32-chars-saudi-erp';
  const appUrl = process.env.APP_URL || `http://localhost:${port}`;
  const zatcaEnv = (process.env.ZATCA_ENV || 'simulation') as 'sandbox' | 'simulation' | 'production';
  const logLevel = (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error';

  return {
    PORT: port,
    NODE_ENV: nodeEnv,
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: jwtSecret,
    APP_URL: appUrl,
    ZATCA_ENV: zatcaEnv,
    LOG_LEVEL: logLevel,
  };
}

export const env = validateEnv();
