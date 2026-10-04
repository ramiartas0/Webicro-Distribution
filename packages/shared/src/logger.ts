import chalk from 'chalk';
import type { LogLevel } from './types.js';

export interface LoggerOptions {
  level?: LogLevel;
  context?: Record<string, unknown>;
  silent?: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private level: LogLevel;
  private context: Record<string, unknown>;
  private silent: boolean;

  constructor(options?: LoggerOptions) {
    this.level = options?.level ?? 'info';
    this.context = options?.context ?? {};
    this.silent = options?.silent ?? false;
  }

  public setLevel(level: LogLevel): void {
    this.level = level;
  }

  public child(context: Record<string, unknown>): Logger {
    return new Logger({
      level: this.level,
      context: { ...this.context, ...context },
      silent: this.silent,
    });
  }

  private shouldLog(level: LogLevel): boolean {
    if (this.silent) return false;
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private formatMessage(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    error?: unknown,
  ): string {
    const timestamp = new Date().toISOString();
    const mergedContext = { ...this.context, ...data };
    const contextStr =
      Object.keys(mergedContext).length > 0 ? ` ${JSON.stringify(mergedContext)}` : '';
    const errorStr =
      error instanceof Error
        ? `\n${error.stack ?? error.message}`
        : error
          ? `\n${String(error)}`
          : '';

    let levelStr = `[${level.toUpperCase()}]`;
    switch (level) {
      case 'debug':
        levelStr = chalk.gray(levelStr);
        break;
      case 'info':
        levelStr = chalk.blue(levelStr);
        break;
      case 'warn':
        levelStr = chalk.yellow(levelStr);
        break;
      case 'error':
        levelStr = chalk.red(levelStr);
        break;
    }

    return `${chalk.dim(`[${timestamp}]`)} ${levelStr} ${message}${chalk.gray(contextStr)}${errorStr}\n`;
  }

  public debug(message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog('debug')) return;
    process.stdout.write(this.formatMessage('debug', message, data));
  }

  public info(message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog('info')) return;
    process.stdout.write(this.formatMessage('info', message, data));
  }

  public warn(message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog('warn')) return;
    process.stdout.write(this.formatMessage('warn', message, data));
  }

  public error(message: string, error?: unknown, data?: Record<string, unknown>): void {
    if (!this.shouldLog('error')) return;
    process.stderr.write(this.formatMessage('error', message, data, error));
  }
}

export const logger = new Logger();
