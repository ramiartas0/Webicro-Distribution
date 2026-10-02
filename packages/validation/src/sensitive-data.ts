import type { ValidationIssue } from './types.js';

export class SensitiveDataScanner {
  private readonly patterns = [
    { name: 'Google API Key', regex: /AIza[0-9A-Za-z\-_]{35}/g },
    { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g },
    { name: 'JWT Token', regex: /eyJ[a-zA-Z0-9_-]+\\.eyJ[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+/g },
    { name: 'Private Key', regex: /-----BEGIN [A-Z ]+PRIVATE KEY-----/g },
    { name: 'Password Assignment', regex: /password\s*[:=]\s*['"][^'"]+['"]/gi },
    { name: 'Sensitive Endpoint (localhost)', regex: /(?:https?:\/\/)?localhost(?::\d+)?/gi },
    { name: 'Sensitive Endpoint (127.0.0.1)', regex: /(?:https?:\/\/)?127\.0\.0\.1(?::\d+)?/gi },
    { name: 'Sensitive Endpoint (internal)', regex: /(?:https?:\/\/)?[\w-]+\.internal(?:\.domain)?/gi },
  ];

  public scan(text: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const { name, regex } of this.patterns) {
      if (regex.test(text)) {
        issues.push({
          field: 'content',
          message: `Sensitive data detected: ${name} found in the provided text.`,
          severity: 'error',
        });
      }
    }

    return issues;
  }
}
