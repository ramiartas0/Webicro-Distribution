import { spawn } from 'node:child_process';
import type { ProcessResult } from './types.js';
import { BuildError } from './errors.js';
import { logger } from './logger.js';

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  silent?: boolean;
  stdin?: string;
}

export async function runCommand(command: string, args: string[], options?: RunOptions): Promise<ProcessResult> {
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
    let stdoutData = '';
    let stderrData = '';

    const childEnv = { ...process.env, ...options?.env };

    const child = spawn(command, args, {
      cwd: options?.cwd,
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let timeoutId: NodeJS.Timeout | undefined;

    if (options?.timeout) {
      timeoutId = setTimeout(() => {
        child.kill();
        reject(new BuildError(`Command ${command} timed out after ${options.timeout}ms`));
      }, options.timeout);
    }

    if (options?.stdin) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    }

    child.stdout.on('data', (data: Buffer) => {
      const str = data.toString();
      stdoutData += str;
      if (!options?.silent) {
        process.stdout.write(str);
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      const str = data.toString();
      stderrData += str;
      if (!options?.silent) {
        process.stderr.write(str);
      }
    });

    child.on('error', (error: Error) => {
      if (timeoutId) clearTimeout(timeoutId);
      reject(new BuildError(`Failed to start command ${command}: ${error.message}`, { cause: error }));
    });

    child.on('close', (code: number | null) => {
      if (timeoutId) clearTimeout(timeoutId);
      
      const duration = Date.now() - startTime;
      const finalCode = code ?? -1;

      const result: ProcessResult = {
        exitCode: finalCode,
        stdout: stdoutData,
        stderr: stderrData,
        duration,
      };

      if (finalCode !== 0 && !options?.silent) {
        logger.error(`Command ${command} failed with exit code ${finalCode}`);
        reject(new BuildError(`Command ${command} failed with exit code ${finalCode}`, { details: { result } }));
      } else {
        resolve(result);
      }
    });
  });
}
