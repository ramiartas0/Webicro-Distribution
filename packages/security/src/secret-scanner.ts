import fs from 'node:fs/promises';
import path from 'node:path';
import type { SecurityIssue } from './types.js';

interface SecretPattern {
  name: string;
  regex: RegExp;
  type: SecurityIssue['type'];
  severity: SecurityIssue['severity'];
}

const PATTERNS: SecretPattern[] = [
  {
    name: 'AWS Access Key',
    regex: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/,
    type: 'SECRET_EXPOSED',
    severity: 'critical',
  },
  {
    name: 'Google Service Account Private Key',
    regex: /"private_key":\s*"-----BEGIN PRIVATE KEY-----/,
    type: 'SECRET_EXPOSED',
    severity: 'critical',
  },
  {
    name: 'RSA Private Key',
    regex: /-----BEGIN RSA PRIVATE KEY-----/,
    type: 'SECRET_EXPOSED',
    severity: 'high',
  },
  {
    name: 'Apple AuthKey',
    regex: /-----BEGIN PRIVATE KEY-----/,
    type: 'SECRET_EXPOSED',
    severity: 'high',
  },
  {
    name: 'JWT Token',
    regex: /ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    type: 'SUSPICIOUS_KEY',
    severity: 'medium',
  },
];

export class SecretScanner {
  async scanFiles(files: string[], repoPath: string): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = [];

    for (const file of files) {
      const fullPath = path.join(repoPath, file);

      try {
        if (file.endsWith('.jks') || file.endsWith('.keystore')) {
          issues.push({
            type: 'UNPROTECTED_FILE',
            file,
            description:
              'Keystore file found in repository. Ensure this is intentional and securely stored.',
            severity: 'high',
          });
          continue;
        }

        const content = await fs.readFile(fullPath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i] as string;
          for (const pattern of PATTERNS) {
            if (pattern.regex.test(line)) {
              issues.push({
                type: pattern.type,
                file,
                line: i + 1,
                description: `Found potential ${pattern.name}`,
                severity: pattern.severity,
              });
            }
          }
        }
      } catch (error: unknown) {}
    }

    return issues;
  }
}
