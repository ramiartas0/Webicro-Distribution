import { exec } from 'child_process';
import { promisify } from 'util';
import type { FlutterTestResult } from './types.js';

const execAsync = promisify(exec);

export class FlutterTester {
  async test(cwd?: string): Promise<FlutterTestResult> {
    try {
      const { stdout } = await execAsync('flutter test', { cwd });

      const passedMatch = stdout.match(/All tests passed!/);
      const passedCountMatch = stdout.match(/\+(\d+)/);
      const passed = passedMatch !== null || (passedCountMatch !== null && parseInt(passedCountMatch[1], 10) > 0 && !stdout.includes('-'));

      const testsPassed = passedCountMatch ? parseInt(passedCountMatch[1], 10) : (passed ? 1 : 0);

      return {
        passed: true,
        testsPassed,
        testsFailed: 0,
        output: stdout,
      };
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'stdout' in error && typeof (error as Record<string, unknown>).stdout === 'string') {
        const stdout = (error as Record<string, unknown>).stdout as string;

        const failedMatch = stdout.match(/-(\d+)/);
        const testsFailed = failedMatch ? parseInt(failedMatch[1], 10) : 1;

        const passedCountMatch = stdout.match(/\+(\d+)/);
        const testsPassed = passedCountMatch ? parseInt(passedCountMatch[1], 10) : 0;

        return {
          passed: false,
          testsPassed,
          testsFailed,
          output: stdout,
        };
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        passed: false,
        testsPassed: 0,
        testsFailed: 1,
        output: errorMessage,
      };
    }
  }
}
