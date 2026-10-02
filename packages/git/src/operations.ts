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
    this.targetDir = path.resolve(repoPath || process.cwd());
    this.git = simpleGit(this.targetDir);
  }

  private async getRelPath(): Promise<string> {
    try {
      const topLevel = await this.git.revparse(['--show-toplevel']);
      const trimmed = topLevel.trim();
      const rel = path.relative(trimmed, this.targetDir);
      return rel && rel !== '.' ? rel.replace(/\\/g, '/') : '';
    } catch {
      return '';
    }
  }

  async getRemoteInfo(): Promise<GitRemoteInfo | null> {
    try {
      const remotes = await this.git.getRemotes(true);
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
      const status = await this.git.status();
      return status.current || 'main';
    } catch {
      return 'main';
    }
  }

  async getUncommittedProjectFiles(): Promise<string[]> {
    try {
      const rel = await this.getRelPath();
      const status = await this.git.status();
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

    const rel = await this.getRelPath();
    const branch = await this.getCurrentBranch();

    // 1. Projeye ait uncommitted dosyaları bul
    const status = await this.git.status();
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
      const head = await this.git.revparse(['HEAD']);
      return {
        commitHash: head.trim(),
        branch,
        pushed: false,
        filesCommitted: [],
      };
    }

    // 2. Sadece bu projeye ait dosyaları stage et (diğer projeler karışmasın)
    await this.git.add(filesToStage);

    // 3. Commit mesajını oluştur
    const commitMessage =
      options.customMessage ||
      `chore(release): ${options.projectName} v${options.version}${
        options.buildNumber ? ` (#${options.buildNumber})` : ''
      }`;

    const commitResult = await this.git.commit(commitMessage, filesToStage);
    const commitHash = commitResult.commit || (await this.git.revparse(['HEAD'])).trim();

    // 4. Tag oluştur (eğer istenmişse)
    let tagName: string | undefined;
    if (options.createTag !== false) {
      tagName = `${options.projectName}-v${options.version}`;
      try {
        await this.git.addTag(tagName);
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
          await this.git.push('origin', branch);
          if (tagName) {
            await this.git.push(['origin', tagName]);
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
