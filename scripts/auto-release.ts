import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export type ReleaseBumpType = "major" | "minor" | "patch";

export interface ReleaseCommit {
  hash: string;
  shortHash: string;
  type: string;
  scope?: string;
  isBreaking: boolean;
  subject: string;
  rawHeader: string;
}

const COMMIT_HEADER_REGEX = /^([a-zA-Z]+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;

export const parseReleaseCommit = (rawCommitLine: string): ReleaseCommit | null => {
  const trimmed = rawCommitLine.trim();
  if (!trimmed) return null;

  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return null;

  const hash = trimmed.slice(0, spaceIndex);
  const rawHeader = trimmed.slice(spaceIndex + 1).trim();
  const shortHash = hash.slice(0, 7);

  const match = COMMIT_HEADER_REGEX.exec(rawHeader);
  const containsBreakingMarker =
    rawHeader.includes("BREAKING CHANGE:") || rawHeader.includes("BREAKING-CHANGE:");

  if (!match) {
    return {
      hash,
      shortHash,
      type: "other",
      isBreaking: containsBreakingMarker,
      subject: rawHeader,
      rawHeader,
    };
  }

  const [, type, scope, exclamation, subject] = match;
  const isBreaking = Boolean(exclamation) || containsBreakingMarker;

  return {
    hash,
    shortHash,
    type: type.toLowerCase(),
    scope: scope || undefined,
    isBreaking,
    subject: subject.trim(),
    rawHeader,
  };
};

export const determineReleaseBumpType = (
  commits: ReleaseCommit[],
  manualBump?: string,
): ReleaseBumpType | null => {
  if (manualBump && manualBump !== "auto") {
    if (manualBump === "major" || manualBump === "minor" || manualBump === "patch") {
      return manualBump;
    }
  }

  let bump: ReleaseBumpType | null = null;
  for (const commit of commits) {
    if (commit.isBreaking) {
      return "major";
    }
    if (commit.type === "feat") {
      bump = "minor";
    } else if ((commit.type === "fix" || commit.type === "perf") && bump !== "minor") {
      bump = "patch";
    }
  }

  return bump;
};

export const parseSemverVersion = (versionStr: string): [number, number, number] | null => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(versionStr.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

export const compareSemverVersions = (a: string, b: string): number => {
  const semA = parseSemverVersion(a);
  const semB = parseSemverVersion(b);
  if (!semA && !semB) return a.localeCompare(b);
  if (!semA) return -1;
  if (!semB) return 1;
  if (semA[0] !== semB[0]) return semA[0] - semB[0];
  if (semA[1] !== semB[1]) return semA[1] - semB[1];
  return semA[2] - semB[2];
};

export const calculateNextReleaseVersion = (
  currentVersion: string,
  bump: ReleaseBumpType,
): string => {
  const parsed = parseSemverVersion(currentVersion);
  const [major, minor, patch] = parsed ?? [1, 0, 0];

  if (bump === "major") {
    return `${major + 1}.0.0`;
  }
  if (bump === "minor") {
    return `${major}.${minor + 1}.0`;
  }
  return `${major}.${minor}.${patch + 1}`;
};

export const generateReleaseChangelogMarkdown = (
  commits: ReleaseCommit[],
  repository?: string,
): string => {
  const breakingList: string[] = [];
  const featList: string[] = [];
  const fixList: string[] = [];
  const otherList: string[] = [];

  const formatCommitLink = (commit: ReleaseCommit): string => {
    const link = repository
      ? `([${commit.shortHash}](https://github.com/${repository}/commit/${commit.hash}))`
      : `(${commit.shortHash})`;
    const scopePrefix = commit.scope ? `**${commit.scope}:** ` : "";
    return `- ${scopePrefix}${commit.subject} ${link}`;
  };

  for (const commit of commits) {
    if (commit.isBreaking) {
      breakingList.push(formatCommitLink(commit));
    }
    if (commit.type === "feat") {
      featList.push(formatCommitLink(commit));
    } else if (commit.type === "fix" || commit.type === "perf") {
      fixList.push(formatCommitLink(commit));
    } else {
      otherList.push(formatCommitLink(commit));
    }
  }

  const sections: string[] = [];

  if (breakingList.length > 0) {
    sections.push(`### ⚠️ Breaking Changes\n\n${breakingList.join("\n")}`);
  }
  if (featList.length > 0) {
    sections.push(`### Features\n\n${featList.join("\n")}`);
  }
  if (fixList.length > 0) {
    sections.push(`### Bug Fixes\n\n${fixList.join("\n")}`);
  }
  if (otherList.length > 0) {
    sections.push(`### Other Changes\n\n${otherList.join("\n")}`);
  }

  return sections.join("\n\n");
};

export const executeReleaseGitCommand = (command: string): string => {
  try {
    return execSync(command, { encoding: "utf-8" }).trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Git command failed (${command}): ${message}`, { cause: err });
  }
};

export const publishGitHubRelease = async ({
  repository,
  token,
  tagName,
  releaseName,
  changelog,
  targetCommitish,
}: {
  repository: string;
  token: string;
  tagName: string;
  releaseName: string;
  changelog: string;
  targetCommitish: string;
}): Promise<void> => {
  const url = `https://api.github.com/repos/${repository}/releases`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "monthexpense-release-script",
    },
    body: JSON.stringify({
      tag_name: tagName,
      target_commitish: targetCommitish,
      name: releaseName,
      body: changelog,
      draft: false,
      prerelease: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to publish GitHub Release: ${response.status} ${errorText}`);
  }
};

export const executeAutoReleaseWorkflow = async (): Promise<void> => {
  const isDryRun = process.argv.includes("--dry-run");
  const manualBump = process.env.MANUAL_BUMP || "auto";
  const gitBranch = process.env.GIT_BRANCH || "master";
  const githubToken = process.env.GITHUB_TOKEN;
  const githubRepository = process.env.GITHUB_REPOSITORY;

  const pkgPath = resolve(process.cwd(), "package.json");
  const pkgContent = readFileSync(pkgPath, "utf-8");
  const pkg = JSON.parse(pkgContent) as { version: string };

  const tagsOutput = executeReleaseGitCommand('git tag -l "v*"');
  const tags = tagsOutput
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean)
    .toSorted(compareSemverVersions);

  const latestTag = tags.length > 0 ? tags[tags.length - 1] : null;

  const logCommand = latestTag
    ? `git log ${latestTag}..HEAD --pretty=format:"%H %s"`
    : `git log --pretty=format:"%H %s"`;

  const commitsOutput = executeReleaseGitCommand(logCommand);
  const commits = commitsOutput
    .split("\n")
    .map((line) => parseReleaseCommit(line))
    .filter((c): c is ReleaseCommit => c !== null);

  if (commits.length === 0) {
    console.log("No commits found since latest release. Skipping release.");
    return;
  }

  const bumpType = determineReleaseBumpType(commits, manualBump);
  if (!bumpType) {
    console.log("No releaseable commits (no feat/fix found). Skipping release.");
    return;
  }

  const baseVersion = latestTag ? latestTag.replace(/^v/, "") : pkg.version || "1.0.0";
  const newVersion = calculateNextReleaseVersion(baseVersion, bumpType);
  const tagName = `v${newVersion}`;
  const changelog = generateReleaseChangelogMarkdown(commits, githubRepository);

  console.log(`Current version: ${baseVersion}`);
  console.log(`Calculated bump: ${bumpType}`);
  console.log(`Target release: ${tagName}`);

  if (isDryRun) {
    console.log("\n[DRY RUN] Generated Changelog:\n");
    console.log(changelog);
    console.log("\n[DRY RUN] Completed without modifications.");
    return;
  }

  if (!githubToken || !githubRepository) {
    throw new Error(
      "GITHUB_TOKEN and GITHUB_REPOSITORY environment variables are required for release.",
    );
  }

  // 1. Update package.json
  pkg.version = newVersion;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf-8");
  console.log(`Updated package.json version to ${newVersion}`);

  // 2. Commit updated package.json
  executeReleaseGitCommand("git add package.json");
  executeReleaseGitCommand(`git commit -m "chore(release): v${newVersion} [skip ci]"`);

  // 3. Create annotated git tag
  executeReleaseGitCommand(`git tag -a "${tagName}" -m "Release ${tagName}"`);

  // 4. Push branch and tag
  executeReleaseGitCommand(`git push origin HEAD:${gitBranch}`);
  executeReleaseGitCommand(`git push origin "${tagName}"`);
  console.log(`Pushed release commit and tag ${tagName} to origin`);

  // 5. Create GitHub Release
  await publishGitHubRelease({
    repository: githubRepository,
    token: githubToken,
    tagName,
    releaseName: tagName,
    changelog,
    targetCommitish: gitBranch,
  });
  console.log(`Published GitHub Release ${tagName}`);
};

if (import.meta.main) {
  executeAutoReleaseWorkflow().catch((err: unknown) => {
    console.error("Release workflow failed:", err);
    process.exit(1);
  });
}
