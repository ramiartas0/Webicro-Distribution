export class EnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvironmentError';
  }
}

export class EnvironmentManager {
  public static getRequired(key: string): string {
    const value = process.env[key];
    if (value === undefined || value.trim() === '') {
      throw new EnvironmentError(`Required environment variable missing: ${key}`);
    }
    return value;
  }

  public static getOptional(key: string, defaultValue?: string): string | undefined {
    const value = process.env[key];
    if (value === undefined || value.trim() === '') {
      return defaultValue;
    }
    return value;
  }

  public static validate(requiredKeys: string[]): void {
    const missingKeys: string[] = [];
    
    for (const key of requiredKeys) {
      const value = process.env[key];
      if (value === undefined || value.trim() === '') {
        missingKeys.push(key);
      }
    }
    
    if (missingKeys.length > 0) {
      throw new EnvironmentError(`Missing required environment variables: ${missingKeys.join(', ')}`);
    }
  }

  public static getGooglePlayCredentials(): Record<string, unknown> {
    const jsonString = this.getOptional('GOOGLE_PLAY_CREDENTIALS_JSON');
    if (!jsonString) {
      throw new EnvironmentError('GOOGLE_PLAY_CREDENTIALS_JSON environment variable is not set');
    }
    try {
      return JSON.parse(jsonString) as Record<string, unknown>;
    } catch (e) {
      throw new EnvironmentError('Failed to parse GOOGLE_PLAY_CREDENTIALS_JSON as valid JSON');
    }
  }

  public static getAppleCredentials(): { keyId: string; issuerId: string; privateKey: string } {
    const keyId = this.getOptional('APP_STORE_KEY_ID');
    const issuerId = this.getOptional('APP_STORE_ISSUER_ID');
    const privateKey = this.getOptional('APP_STORE_PRIVATE_KEY');
    
    if (!keyId || !issuerId || !privateKey) {
      throw new EnvironmentError('App Store credentials incomplete. Need APP_STORE_KEY_ID, APP_STORE_ISSUER_ID, and APP_STORE_PRIVATE_KEY');
    }
    
    return {
      keyId,
      issuerId,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    };
  }
}
