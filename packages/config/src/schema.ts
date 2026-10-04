import { z } from 'zod';

export const ProjectConfigSchema = z.object({
  name: z.string(),
  package: z.string(),
  path: z.string().optional(),
});

export const VersionConfigSchema = z.object({
  strategy: z.enum(['conventional-commits', 'manual']).default('conventional-commits'),
  autoIncrement: z.boolean().default(true),
});

export const BuildConfigSchema = z.object({
  flutterChannel: z.enum(['stable', 'beta', 'dev']).default('stable'),
  clean: z.boolean().default(true),
  runTests: z.boolean().default(true),
  runAnalyze: z.boolean().default(true),
});

export const AndroidConfigSchema = z.object({
  enabled: z.boolean().default(true),
  track: z.enum(['internal', 'alpha', 'beta', 'production']).default('internal'),
  rollout: z.number().min(0).max(100).default(100),
});

export const IosConfigSchema = z.object({
  enabled: z.boolean().default(true),
  submitForReview: z.boolean().default(false),
});

export const AiConfigSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.enum(['gemini', 'openai', 'anthropic']).default('gemini'),
  generateReleaseNotes: z.boolean().default(true),
  generateLocalizations: z.boolean().default(false),
  languages: z.array(z.string()).default(['en']),
});

export const StoresConfigSchema = z.object({
  googlePlay: z.boolean().default(false),
  appStoreConnect: z.boolean().default(false),
});

export const SecurityConfigSchema = z.object({
  requireCleanGit: z.boolean().default(true),
  scanSecrets: z.boolean().default(false),
});

export const DeploymentConfigSchema = z.object({
  approvalRequired: z.boolean().default(false),
});

export const NotificationsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  channels: z.array(z.string()).default([]),
});

export const ReleaseConfigSchema = z.object({
  project: ProjectConfigSchema,
  version: VersionConfigSchema.default({ strategy: 'conventional-commits', autoIncrement: true }),
  build: BuildConfigSchema.default({
    flutterChannel: 'stable',
    clean: true,
    runTests: true,
    runAnalyze: true,
  }),
  android: AndroidConfigSchema.default({ enabled: true, track: 'internal', rollout: 100 }),
  ios: IosConfigSchema.default({ enabled: true, submitForReview: false }),
  ai: AiConfigSchema.default({
    enabled: false,
    provider: 'gemini',
    generateReleaseNotes: true,
    generateLocalizations: false,
    languages: ['en'],
  }),
  stores: StoresConfigSchema.default({ googlePlay: false, appStoreConnect: false }),
  security: SecurityConfigSchema.default({ requireCleanGit: true, scanSecrets: false }),
  deployment: DeploymentConfigSchema.default({ approvalRequired: false }),
  notifications: NotificationsConfigSchema.default({ enabled: false, channels: [] }),
});
