import { describe, expect, it } from "bun:test";
import {
  calculateNextReleaseVersion,
  compareSemverVersions,
  determineReleaseBumpType,
  generateReleaseChangelogMarkdown,
  parseReleaseCommit,
  parseSemverVersion,
  type ReleaseCommit,
} from "./auto-release";

describe("auto-release", () => {
  describe("parseReleaseCommit", () => {
    it("parses conventional commit with type and subject", () => {
      const commit = parseReleaseCommit(
        "7fc64fdf8e5503cb055711a5ae000c63b74e1aa5 feat: add transaction sync status",
      );
      expect(commit).not.toBeNull();
      expect(commit?.type).toBe("feat");
      expect(commit?.scope).toBeUndefined();
      expect(commit?.isBreaking).toBe(false);
      expect(commit?.subject).toBe("add transaction sync status");
      expect(commit?.shortHash).toBe("7fc64fd");
    });

    it("parses conventional commit with scope", () => {
      const commit = parseReleaseCommit(
        "200c3718d310afbf2820fb7eddb5f7b34da65086 fix(sync): spreadsheet sign in timeout",
      );
      expect(commit).not.toBeNull();
      expect(commit?.type).toBe("fix");
      expect(commit?.scope).toBe("sync");
      expect(commit?.isBreaking).toBe(false);
      expect(commit?.subject).toBe("spreadsheet sign in timeout");
    });

    it("detects breaking change with exclamation mark", () => {
      const commit = parseReleaseCommit(
        "36363087f1023fe95ee6119ab1f7b583404ba117 feat(api)!: migrate to new contract",
      );
      expect(commit).not.toBeNull();
      expect(commit?.type).toBe("feat");
      expect(commit?.scope).toBe("api");
      expect(commit?.isBreaking).toBe(true);
    });

    it("detects breaking change with BREAKING CHANGE keyword", () => {
      const commit = parseReleaseCommit(
        "fe73617300000000000000000000000000000000 refactor: rewrite engine BREAKING CHANGE: old api dropped",
      );
      expect(commit).not.toBeNull();
      expect(commit?.isBreaking).toBe(true);
    });

    it("handles non-conventional commits as other type", () => {
      const commit = parseReleaseCommit(
        "e4a0ef9000000000000000000000000000000000 initial repository setup",
      );
      expect(commit).not.toBeNull();
      expect(commit?.type).toBe("other");
      expect(commit?.subject).toBe("initial repository setup");
      expect(commit?.isBreaking).toBe(false);
    });

    it("returns null for empty or invalid commit lines", () => {
      expect(parseReleaseCommit("")).toBeNull();
      expect(parseReleaseCommit("   ")).toBeNull();
      expect(parseReleaseCommit("onlyonehash")).toBeNull();
    });
  });

  describe("determineReleaseBumpType", () => {
    it("identifies major bump when breaking commit is present", () => {
      const commits: ReleaseCommit[] = [
        {
          hash: "1",
          shortHash: "1",
          type: "fix",
          isBreaking: false,
          subject: "fix a",
          rawHeader: "fix: a",
        },
        {
          hash: "2",
          shortHash: "2",
          type: "feat",
          isBreaking: true,
          subject: "feat b",
          rawHeader: "feat!: b",
        },
      ];
      expect(determineReleaseBumpType(commits)).toBe("major");
    });

    it("identifies minor bump when feat commit is present without breaking", () => {
      const commits: ReleaseCommit[] = [
        {
          hash: "1",
          shortHash: "1",
          type: "fix",
          isBreaking: false,
          subject: "fix bug",
          rawHeader: "fix: bug",
        },
        {
          hash: "2",
          shortHash: "2",
          type: "feat",
          isBreaking: false,
          subject: "add button",
          rawHeader: "feat: add button",
        },
      ];
      expect(determineReleaseBumpType(commits)).toBe("minor");
    });

    it("identifies patch bump when fix or perf commit is present without feat/breaking", () => {
      const commits: ReleaseCommit[] = [
        {
          hash: "1",
          shortHash: "1",
          type: "fix",
          isBreaking: false,
          subject: "fix bug",
          rawHeader: "fix: bug",
        },
        {
          hash: "2",
          shortHash: "2",
          type: "chore",
          isBreaking: false,
          subject: "deps",
          rawHeader: "chore: deps",
        },
      ];
      expect(determineReleaseBumpType(commits)).toBe("patch");
    });

    it("returns null when no releasable commits are found", () => {
      const commits: ReleaseCommit[] = [
        {
          hash: "1",
          shortHash: "1",
          type: "chore",
          isBreaking: false,
          subject: "deps",
          rawHeader: "chore: deps",
        },
        {
          hash: "2",
          shortHash: "2",
          type: "docs",
          isBreaking: false,
          subject: "readme",
          rawHeader: "docs: readme",
        },
      ];
      expect(determineReleaseBumpType(commits)).toBeNull();
    });

    it("honors manual bump override over commit analysis", () => {
      const commits: ReleaseCommit[] = [
        {
          hash: "1",
          shortHash: "1",
          type: "fix",
          isBreaking: false,
          subject: "fix bug",
          rawHeader: "fix: bug",
        },
      ];
      expect(determineReleaseBumpType(commits, "major")).toBe("major");
      expect(determineReleaseBumpType(commits, "minor")).toBe("minor");
      expect(determineReleaseBumpType(commits, "patch")).toBe("patch");
    });
  });

  describe("calculateNextReleaseVersion and semver parsing", () => {
    it("parses semver version correctly", () => {
      expect(parseSemverVersion("1.0.0")).toEqual([1, 0, 0]);
      expect(parseSemverVersion("v2.14.3")).toEqual([2, 14, 3]);
      expect(parseSemverVersion("invalid")).toBeNull();
    });

    it("sorts semver versions ascending", () => {
      const tags = ["v1.0.1", "v2.0.0", "v1.10.0", "v1.2.0"];
      const sorted = tags.toSorted(compareSemverVersions);
      expect(sorted).toEqual(["v1.0.1", "v1.2.0", "v1.10.0", "v2.0.0"]);
    });

    it("calculates patch, minor, and major version bumps", () => {
      expect(calculateNextReleaseVersion("1.0.0", "patch")).toBe("1.0.1");
      expect(calculateNextReleaseVersion("1.0.0", "minor")).toBe("1.1.0");
      expect(calculateNextReleaseVersion("1.0.0", "major")).toBe("2.0.0");
      expect(calculateNextReleaseVersion("v2.4.9", "patch")).toBe("2.4.10");
    });
  });

  describe("generateReleaseChangelogMarkdown", () => {
    it("categorizes commits into Features, Bug Fixes, Breaking Changes, and Other Changes", () => {
      const commits: ReleaseCommit[] = [
        {
          hash: "aaaaaaa111111111111111111111111111111111",
          shortHash: "aaaaaaa",
          type: "feat",
          scope: "auth",
          isBreaking: true,
          subject: "switch to passkey",
          rawHeader: "feat(auth)!: switch to passkey",
        },
        {
          hash: "bbbbbbb222222222222222222222222222222222",
          shortHash: "bbbbbbb",
          type: "feat",
          isBreaking: false,
          subject: "add dark mode",
          rawHeader: "feat: add dark mode",
        },
        {
          hash: "ccccccc333333333333333333333333333333333",
          shortHash: "ccccccc",
          type: "fix",
          scope: "sync",
          isBreaking: false,
          subject: "handle 401 token refresh",
          rawHeader: "fix(sync): handle 401 token refresh",
        },
        {
          hash: "ddddddd444444444444444444444444444444444",
          shortHash: "ddddddd",
          type: "docs",
          isBreaking: false,
          subject: "update README",
          rawHeader: "docs: update README",
        },
      ];

      const changelog = generateReleaseChangelogMarkdown(commits, "zeetec20/monthexpense");

      expect(changelog).toContain("### ⚠️ Breaking Changes");
      expect(changelog).toContain(
        "- **auth:** switch to passkey ([aaaaaaa](https://github.com/zeetec20/monthexpense/commit/aaaaaaa111111111111111111111111111111111))",
      );

      expect(changelog).toContain("### Features");
      expect(changelog).toContain(
        "- add dark mode ([bbbbbbb](https://github.com/zeetec20/monthexpense/commit/bbbbbbb222222222222222222222222222222222))",
      );

      expect(changelog).toContain("### Bug Fixes");
      expect(changelog).toContain(
        "- **sync:** handle 401 token refresh ([ccccccc](https://github.com/zeetec20/monthexpense/commit/ccccccc333333333333333333333333333333333))",
      );

      expect(changelog).toContain("### Other Changes");
      expect(changelog).toContain(
        "- update README ([ddddddd](https://github.com/zeetec20/monthexpense/commit/ddddddd444444444444444444444444444444444))",
      );
    });
  });
});
