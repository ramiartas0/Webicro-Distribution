import { exec } from 'child_process';
import { promisify } from 'util';
import type { FlutterDoctorResult } from './types.js';

const execAsync = promisify(exec);

export class FlutterDoctor {
  async check(cwd?: string): Promise<FlutterDoctorResult> {
    try {
      const { stdout } = await execAsync('flutter doctor -v', { cwd });
      
      const versionMatch = stdout.match(/Flutter \(Channel .*, (.*?),/);
      const version = versionMatch ? versionMatch[1] : null;

      return {
        isInstalled: true,
        version,
        output: stdout,
      };
    } catch (error) {
      if (error instanceof Error) {
        return {
          isInstalled: false,
          version: null,
          output: error.message,
        };
      }
      return {
        isInstalled: false,
        version: null,
        output: 'Unknown error occurred while running flutter doctor',
      };
    }
  }
}
