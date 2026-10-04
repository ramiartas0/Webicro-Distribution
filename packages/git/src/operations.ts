import fs from 'node:fs';
import path from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';
import type { GitRemoteInfo, CommitAndPushResult } from './types.js';

export function parseRemoteWebUrl(remoteUrl: string): {
  webUrl: string | null;
  ownerRepo: string | null;
  provider: 'github' | 'gitlab' | 'bitbucket' | 'other';
} {
  if (!remoteUrl) {
    return { webUrl: null, ownerRepo: null, provider: 'other' };
  }
  const trimmed = remoteUrl.trim();

  // SSH format: git@github.com:owner/repo.git
  const sshMatch = trimmed.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (sshMatch && sshMatch[1] && sshMatch[2]) {
    const host = sshMatch[1].toLowerCase();
    const repoPath = sshMatch[2];
    const provider = host.includes('github')
      ? 'github'
      : host.includes('gitlab')
      ? 'gitlab'
      : host.includes('bitbucket')
      ? 'bitbucket'
      : 'other';

    return {
      webUrl: `https://${sshMatch[1]}/${repoPath}`,
      ownerRepo: repoPath,
      provider,
    };
  }

  // HTTPS format: https://github.com/owner/repo.git
  try {
    const parsed = new URL(trimmed);
    const host = parsed.host.toLowerCase();
    const repoPath = parsed.pathname.replace(/^\//, '').replace(/\.git$/, '');
    const provider = host.includes('github')
      ? 'github'
      : host.includes('gitlab')
      ? 'gitlab'
      : host.includes('bitbucket')
      ? 'bitbucket'
      : 'other';

    return {
      webUrl: `https://${parsed.host}/${repoPath}`,
      ownerRepo: repoPath,
      provider,
    };
  } catch {
    return { webUrl: null, ownerRepo: null, provider: 'other' };
  }
}

export class GitOperations {
  private git: SimpleGit;
  private targetDir: string;

  constructor(repoPath?: string) {
    const raw = path.resolve(repoPath || process.cwd());
    try {
      this.targetDir = fs.existsSync(raw) ? fs.realpathSync(raw) : raw;
    } catch {
      this.targetDir = raw;
    }
    this.git = simpleGit(this.targetDir);
  }

  private async getRootContext(): Promise<{ rootGit: SimpleGit; topLevel: string; rel: string }> {
    const rawTopLevel = (await this.git.revparse(['--show-toplevel'])).trim();
    const topLevel = fs.existsSync(rawTopLevel) ? fs.realpathSync(rawTopLevel) : rawTopLevel;
    const rel = path.relative(topLevel, this.targetDir);
    const normalizedRel = rel && rel !== '.' ? rel.replace(/\\/g, '/') : '';
    return {
      rootGit: simpleGit(topLevel),
      topLevel,
      rel: normalizedRel,
    };
  }

  async getRemoteInfo(): Promise<GitRemoteInfo | null> {
    try {
      const { rootGit } = await this.getRootContext();
      const remotes = await rootGit.getRemotes(true);
      if (!remotes || remotes.length === 0) {
        return null;
      }

      // origin varsa öncelikli al, yoksa ilkini al
      const origin = remotes.find((r) => r.name === 'origin') || remotes[0];
      if (!origin) return null;

      const fetchUrl = origin.refs.fetch || '';
      const pushUrl = origin.refs.push || fetchUrl;
      const parsed = parseRemoteWebUrl(fetchUrl || pushUrl);

      return {
        name: origin.name,
        fetchUrl,
        pushUrl,
        webUrl: parsed.webUrl,
        ownerRepo: parsed.ownerRepo,
        provider: parsed.provider,
      };
    } catch {
      return null;
    }
  }

  async getCurrentBranch(): Promise<string> {
    try {
      const { rootGit } = await this.getRootContext();
      const status = await rootGit.status();
      return status.current || 'main';
    } catch {
      return 'main';
    }
  }

  async getUncommittedProjectFiles(): Promise<string[]> {
    try {
      const { rootGit, rel } = await this.getRootContext();
      const status = await rootGit.status();
      const files = status.files
        .map((f) => f.path)
        .filter((f) => !f.includes('/.release/') && !f.startsWith('.release/'));

      if (!rel) {
        return files;
      }
      const prefix = rel.endsWith('/') ? rel : `${rel}/`;
      return files
        .filter((f) => f.startsWith(prefix) || f === rel)
        .map((f) => (f.startsWith(prefix) ? f.slice(prefix.length) : f));
    } catch {
      return [];
    }
  }

  async commitProjectRelease(options: {
    projectName: string;
    version: string;
    buildNumber?: number;
    customMessage?: string;
    createTag?: boolean;
    push?: boolean;
  }): Promise<CommitAndPushResult> {
    const isRepo = await this.git.checkIsRepo();
    if (!isRepo) {
      throw new Error(`Git reposu bulunamadı: ${this.targetDir}`);
    }

    const { rootGit, rel } = await this.getRootContext();
    const branch = await this.getCurrentBranch();

    // 1. Projeye ait uncommitted dosyaları bul (repo köküne göre yollar)
    const status = await rootGit.status();
    const rawFiles = status.files
      .map((f) => f.path)
      .filter((f) => !f.includes('/.release/') && !f.startsWith('.release/'));

    let filesToStage: string[] = [];
    if (!rel) {
      filesToStage = rawFiles;
    } else {
      const prefix = rel.endsWith('/') ? rel : `${rel}/`;
      filesToStage = rawFiles.filter((f) => f.startsWith(prefix) || f === rel);
    }

    if (filesToStage.length === 0) {
      // Değişiklik yoksa mevcut HEAD hash'ini al
      const head = await rootGit.revparse(['HEAD']);
      return {
        commitHash: head.trim(),
        branch,
        pushed: false,
        filesCommitted: [],
      };
    }

    // 2. Sadece bu projeye ait dosyaları stage et (repo kökünden)
    await rootGit.add(filesToStage);

    // 3. Commit mesajını oluştur
    const commitMessage =
      options.customMessage ||
      `chore(release): ${options.projectName} v${options.version}${
        options.buildNumber ? ` (#${options.buildNumber})` : ''
      }`;

    const commitResult = await rootGit.commit(commitMessage, filesToStage);
    const commitHash = commitResult.commit || (await rootGit.revparse(['HEAD'])).trim();

    // 4. Tag oluştur (eğer istenmişse)
    let tagName: string | undefined;
    if (options.createTag !== false) {
      tagName = `${options.projectName}-v${options.version}`;
      try {
        await rootGit.addTag(tagName);
      } catch (tagErr: unknown) {
        // Tag zaten varsa force güncelleme yapmayıp uyaralım veya sessiz geçelim
        const errMsg = tagErr instanceof Error ? tagErr.message : String(tagErr);
        if (!errMsg.includes('already exists')) {
          throw tagErr;
        }
      }
    }

    // 5. Remote'a push et (eğer istenmişse)
    let pushed = false;
    if (options.push !== false) {
      const remoteInfo = await this.getRemoteInfo();
      if (remoteInfo) {
        try {
          await rootGit.push('origin', branch);
          if (tagName) {
            await rootGit.push(['origin', tagName]);
          }
          pushed = true;
        } catch (pushErr: unknown) {
          // Push hatası commit ve tag'i geçersiz kılmaz, ancak flag false kalır
          console.warn(`[GitOperations] Push uyarısı:`, pushErr);
        }
      }
    }

    return {
      commitHash,
      tagName,
      pushed,
      branch,
      filesCommitted: filesToStage,
    };
  }
}

