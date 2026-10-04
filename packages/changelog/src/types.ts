export interface ChangelogSection {
  title: string;
  items: string[];
}

export interface ChangelogRelease {
  version: string;
  date: string;
  sections: ChangelogSection[];
}

export interface ChangelogOptions {
  includeScopes?: boolean;
  repoUrl?: string;
}
