#!/usr/bin/env node

/**
 * Git Operations for Changelog Generation
 * Provides robust git integration with error handling and validation
 * Updated with better commit parsing and error recovery
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class GitManager {
  constructor() {
    this.validateGitRepository();
    this.gitConfig = this.loadGitConfig();
  }

  validateGitRepository() {
    try {
      execSync('git rev-parse --git-dir', { stdio: 'ignore' });
      this.isGitRepo = true;
    } catch (error) {
      this.isGitRepo = false;
      throw new Error('Not a git repository. Please run this tool in a git repository.');
    }
  }

  loadGitConfig() {
    try {
      const remoteUrl = this.getRemoteUrl();
      const userName = this.execGitSafe('git config --get user.name').trim();
      const userEmail = this.execGitSafe('git config --get user.email').trim();

      return {
        remoteUrl: this.parseRemoteUrl(remoteUrl),
        userName,
        userEmail,
        repository: this.extractRepositoryInfo(remoteUrl)
      };
    } catch (error) {
      // Only warn if it's an unexpected error, not missing remote
      return {};
    }
  }

  getRemoteUrl() {
    try {
      return execSync('git config --get remote.origin.url', { 
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'] // Suppress stderr
      }).trim();
    } catch (error) {
      // This is expected if no remote origin is configured
      return '';
    }
  }

  parseRemoteUrl(url) {
    if (!url) return null;

    // Handle different Git URL formats with better regex
    const patterns = [
      /https:\/\/github\.com\/(.+)\/(.+?)(?:\.git)?$/,
      /git@github\.com:(.+)\/(.+?)(?:\.git)?$/,
      /https:\/\/gitlab\.com\/(.+)\/(.+?)(?:\.git)?$/,
      /git@gitlab\.com:(.+)\/(.+?)(?:\.git)?$/,
      /https:\/\/bitbucket\.org\/(.+)\/(.+?)(?:\.git)?$/,
      /git@bitbucket\.org:(.+)\/(.+?)(?:\.git)?$/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          platform: this.detectPlatform(url),
          owner: match[1],
          repo: match[2],
          url: url
        };
      }
    }

    return { url };
  }

  detectPlatform(url) {
    if (url.includes('github.com')) return 'github';
    if (url.includes('gitlab.com')) return 'gitlab';
    if (url.includes('bitbucket.org')) return 'bitbucket';
    return 'unknown';
  }

  extractRepositoryInfo(url) {
    const parsed = this.parseRemoteUrl(url);
    if (parsed && parsed.platform && parsed.owner && parsed.repo) {
      const platformUrls = {
        github: `https://github.com/${parsed.owner}/${parsed.repo}`,
        gitlab: `https://gitlab.com/${parsed.owner}/${parsed.repo}`,
        bitbucket: `https://bitbucket.org/${parsed.owner}/${parsed.repo}`
      };
      return platformUrls[parsed.platform] || url;
    }
    return null;
  }

  execGit(command, options = {}) {
    try {
      return execSync(command, {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024, // 1MB buffer
        timeout: 30000, // 30 second timeout
        stdio: ['pipe', 'pipe', 'ignore'], // Suppress stderr by default
        ...options
      });
    } catch (error) {
      throw new Error(`Git command failed: ${command}\nError: ${error.message}\nExit code: ${error.status || 'unknown'}`);
    }
  }

  execGitSafe(command, options = {}) {
    try {
      return this.execGit(command, options);
    } catch (error) {
      // Don't warn for expected failures like missing remote origin
      const suppressWarnings = [
        'git config --get remote.origin.url'
      ];
      
      if (!suppressWarnings.some(suppressCmd => command.includes(suppressCmd))) {
        console.warn(`⚠️  Git command failed: ${command} - ${error.message}`);
      }
      return '';
    }
  }

  // NEW: Execute git show commands that might fail due to missing files  
  execGitShow(command, options = {}) {
    try {
      return execSync(command, {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'ignore'], // Fully suppress stderr
        ...options
      });
    } catch (error) {
      // For git show commands, we expect some files to not exist
      // This is normal in git history (renamed, deleted files)
      if (command.includes('git show') && error.message.includes('does not exist')) {
        return null; // Return null to indicate file doesn't exist
      }
      
      // For other errors, still suppress stderr but log a clean warning
      console.warn(`⚠️  Git operation failed: ${this.sanitizeGitError(error.message)}`);
      return null;
    }
  }

  // NEW: Clean up git error messages for user display
  sanitizeGitError(errorMessage) {
    // Remove git command details and just show the essence
    if (errorMessage.includes('does not exist')) {
      const match = errorMessage.match(/path '([^']+)' does not exist/);
      if (match) {
        return `File '${match[1]}' was not found in git history (likely renamed or deleted)`;
      }
    }
    
    // Remove command details and exit codes
    return errorMessage
      .replace(/Git command failed: [^\n]+\n/g, '')
      .replace(/Error: Command failed: [^\n]+\n/g, '')
      .replace(/Exit code: \d+/g, '')
      .replace(/fatal: /g, '')
      .trim();
  }

  getCommits(options = {}) {
    const {
      count = 20,
      since = null,
      until = null,
      author = null,
      grep = null,
      format = 'full',
      excludeMerges = true,
      branch = null
    } = options;

    let command = 'git log';

    // Add branch if specified and valid
    if (branch) {
      try {
        // Verify branch exists
        this.execGit(`git rev-parse --verify ${branch}`, { stdio: 'ignore' });
        command += ` ${branch}`;
      } catch (error) {
        console.warn(`⚠️  Branch ${branch} not found, using current branch`);
      }
    }

    // Add count limit
    if (count && count > 0) {
      command += ` -${Math.min(count, 1000)}`; // Cap at 1000 commits for performance
    }

    // Add date range with validation
    if (since) {
      try {
        // Validate date format
        if (this.isValidGitDate(since)) {
          command += ` --since="${since}"`;
        } else {
          console.warn(`⚠️  Invalid since date: ${since}`);
        }
      } catch (error) {
        console.warn(`⚠️  Invalid since parameter: ${since}`);
      }
    }

    if (until) {
      try {
        if (this.isValidGitDate(until)) {
          command += ` --until="${until}"`;
        } else {
          console.warn(`⚠️  Invalid until date: ${until}`);
        }
      } catch (error) {
        console.warn(`⚠️  Invalid until parameter: ${until}`);
      }
    }

    // Add author filter with escaping
    if (author) {
      const escapedAuthor = author.replace(/["\\]/g, '\\$&');
      command += ` --author="${escapedAuthor}"`;
    }

    // Add grep filter with escaping
    if (grep) {
      const escapedGrep = grep.replace(/["\\]/g, '\\$&');
      command += ` --grep="${escapedGrep}"`;
    }

    // Exclude merge commits
    if (excludeMerges) {
      command += ' --no-merges';
    }

    // Set format based on what we need
    const formatStrings = {
      simple: '%h|%s|%an|%ad',
      full: '%H|%h|%s|%B|%an|%ae|%ad|%cd',  // Use %B for body to handle newlines properly
      oneline: '%h %s',
      detailed: '%H|%h|%s|%B|%an|%ae|%ad|%cd|%P|%D'  // Use %B for body
    };

    const formatString = formatStrings[format] || formatStrings.full;
    command += ` --pretty=format:"${formatString}" --date=iso`;

    // Use null byte separator for better parsing with multiline messages
    if (format === 'full' || format === 'detailed') {
      command += ' -z'; // Use null byte as separator
    }

    try {
      const output = this.execGit(command);
      return this.parseCommitOutput(output, format);
    } catch (error) {
      console.error('Error getting commits:', error.message);
      // Return empty array instead of crashing
      return [];
    }
  }

  isValidGitDate(dateStr) {
    if (!dateStr) return false;

    // Check common git date formats
    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
      /^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/, // YYYY-MM-DD HH:MM:SS
      /^\d+\s(seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s+ago$/, // relative dates
      /^yesterday$/, /^last\s+(week|month|year)$/, // keywords
      /^HEAD~\d+$/, /^[a-f0-9]{7,40}$/ // commit references
    ];

    return datePatterns.some(pattern => pattern.test(dateStr)) ||
           !isNaN(Date.parse(dateStr)); // Valid JavaScript date
  }

  parseCommitOutput(output, format) {
    if (!output?.trim()) return [];

    // Split by separator based on format
    let lines;
    if (format === 'full' || format === 'detailed') {
      // Use null byte separator for full/detailed format to handle multiline bodies
      lines = output.trim().split('\0').filter(Boolean);
    } else {
      // Use newlines for other formats
      lines = output.trim().split('\n').filter(line => line.trim());
    }

    try {
      if (format === 'oneline') {
        return lines.map(line => {
          const spaceIndex = line.indexOf(' ');
          if (spaceIndex === -1) return { hash: line, message: '' };

          return {
            hash: line.substring(0, spaceIndex),
            shortHash: line.substring(0, spaceIndex),
            message: line.substring(spaceIndex + 1)
          };
        });
      }

      if (format === 'simple') {
        return lines.map(line => {
          const parts = line.split('|');
          if (parts.length < 4) {
            console.warn(`Malformed simple commit line: ${line}`);
            return null;
          }

          const [shortHash, message, author, date] = parts;
          return {
            shortHash: shortHash?.trim(),
            message: message?.trim(),
            author: author?.trim(),
            date: date?.trim(),
            type: this.extractCommitType(message),
            scope: this.extractCommitScope(message)
          };
        }).filter(Boolean);
      }

      if (format === 'full' || format === 'detailed') {
        return lines.map(line => {
          const parts = line.split('|');
          if (parts.length < 8) {
            console.warn(`Malformed full commit line: ${line}`);
            return null;
          }

          const [fullHash, shortHash, subject, body, author, email, authorDate, commitDate, parents, refs] = parts;

          const commit = {
            hash: fullHash?.trim(),
            shortHash: shortHash?.trim(),
            subject: subject?.trim(),
            body: body?.trim() || '',
            message: subject?.trim() + (body?.trim() ? '\n\n' + body.trim() : ''),
            author: author?.trim(),
            email: email?.trim(),
            authorDate: authorDate?.trim(),
            commitDate: commitDate?.trim(),
            type: this.extractCommitType(subject),
            scope: this.extractCommitScope(subject),
            breaking: this.isBreakingChange(subject, body)
          };

          // Add additional info for detailed format
          if (format === 'detailed') {
            commit.parents = parents?.trim().split(' ').filter(Boolean) || [];
            commit.refs = refs?.trim() || '';
            commit.isMerge = commit.parents.length > 1;
          }

          return commit;
        }).filter(Boolean);
      }

      // Fallback for unknown formats
      return lines.map(line => ({ message: line.trim() }));
    } catch (error) {
      console.error('Error parsing commit output:', error.message);
      return [];
    }
  }

  extractCommitType(message) {
    if (!message) return 'other';

    // regex for conventional commits with better coverage
    const conventionalCommitRegex = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert|breaking|security|deps|config|ui|api|db|wip)(\(.+\))?!?:/i;
    const match = message.match(conventionalCommitRegex);
    return match ? match[1].toLowerCase() : this.inferTypeFromMessage(message);
  }

  inferTypeFromMessage(message) {
    if (!message) return 'other';

    const lowerMessage = message.toLowerCase();

    // Common patterns for type inference
    if (lowerMessage.includes('add') || lowerMessage.includes('new') || lowerMessage.includes('implement')) return 'feat';
    if (lowerMessage.includes('fix') || lowerMessage.includes('bug') || lowerMessage.includes('resolve')) return 'fix';
    if (lowerMessage.includes('update') || lowerMessage.includes('upgrade') || lowerMessage.includes('improve')) return 'refactor';
    if (lowerMessage.includes('remove') || lowerMessage.includes('delete') || lowerMessage.includes('clean')) return 'chore';
    if (lowerMessage.includes('test') || lowerMessage.includes('spec')) return 'test';
    if (lowerMessage.includes('doc') || lowerMessage.includes('readme')) return 'docs';
    if (lowerMessage.includes('style') || lowerMessage.includes('format') || lowerMessage.includes('lint')) return 'style';
    if (lowerMessage.includes('performance') || lowerMessage.includes('perf') || lowerMessage.includes('optimize')) return 'perf';
    if (lowerMessage.includes('security') || lowerMessage.includes('vulnerability')) return 'security';
    if (lowerMessage.includes('config') || lowerMessage.includes('setting')) return 'config';
    if (lowerMessage.includes('build') || lowerMessage.includes('deploy') || lowerMessage.includes('release')) return 'build';
    if (lowerMessage.includes('ci') || lowerMessage.includes('workflow') || lowerMessage.includes('action')) return 'ci';

    return 'other';
  }

  extractCommitScope(message) {
    if (!message) return null;

    // Extract scope from conventional commit format
    const scopeRegex = /^\w+\((.+)\)!?:/;
    const match = message.match(scopeRegex);
    return match ? match[1].trim() : null;
  }

  isBreakingChange(subject, body = '') {
    if (!subject) return false;

    return subject.includes('!:') ||
           subject.toUpperCase().includes('BREAKING') ||
           body.includes('BREAKING CHANGE:') ||
           body.includes('BREAKING-CHANGE:') ||
           body.toUpperCase().includes('BREAKING CHANGE');
  }

  getStagedChanges() {
    try {
      const output = this.execGit('git diff --cached --name-status');
      return this.parseDiffOutput(output);
    } catch (error) {
      console.error('Error getting staged changes:', error.message);
      return [];
    }
  }

  getUnstagedChanges() {
    try {
      const output = this.execGit('git diff --name-status');
      return this.parseDiffOutput(output);
    } catch (error) {
      console.error('Error getting unstaged changes:', error.message);
      return [];
    }
  }

  parseDiffOutput(output) {
    if (!output?.trim()) return [];

    return output.trim().split('\n').map(line => {
      const parts = line.split('\t');
      if (parts.length < 2) return null;

      const [status, ...pathParts] = parts;
      const filePath = pathParts.join('\t'); // Handle files with tabs in name

      return {
        status: this.mapDiffStatus(status),
        path: filePath,
        type: this.getFileType(filePath),
        category: this.categorizeFile(filePath)
      };
    }).filter(Boolean);
  }

  mapDiffStatus(status) {
    if (!status) return 'unknown';

    const statusMap = {
      'A': 'added',
      'M': 'modified',
      'D': 'deleted',
      'R': 'renamed',
      'C': 'copied',
      'U': 'unmerged',
      'T': 'type-changed'
    };

    // Handle complex statuses like R100 or C85
    const baseStatus = status.charAt(0);
    return statusMap[baseStatus] || status;
  }

  getFileType(filePath) {
    if (!filePath) return 'unknown';

    const ext = path.extname(filePath).toLowerCase();
    const typeMap = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript-react',
      '.jsx': 'javascript-react',
      '.py': 'python',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.go': 'go',
      '.rs': 'rust',
      '.php': 'php',
      '.rb': 'ruby',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.md': 'documentation',
      '.json': 'config',
      '.yml': 'config',
      '.yaml': 'config',
      '.toml': 'config',
      '.ini': 'config',
      '.xml': 'config',
      '.css': 'stylesheet',
      '.scss': 'stylesheet',
      '.sass': 'stylesheet',
      '.less': 'stylesheet',
      '.html': 'markup',
      '.vue': 'vue',
      '.svelte': 'svelte',
      '.sql': 'database',
      '.sh': 'script',
      '.bash': 'script',
      '.zsh': 'script',
      '.ps1': 'script'
    };

    return typeMap[ext] || 'other';
  }

  categorizeFile(filePath) {
    if (!filePath) return 'other';

    const pathLower = filePath.toLowerCase();

    // Source code
    if (pathLower.match(/\.(js|ts|tsx|jsx|py|java|c|cpp|go|rs|php|rb|swift|kt)$/)) {
      if (pathLower.includes('test') || pathLower.includes('spec')) return 'test';
      return 'source';
    }

    // Styles
    if (pathLower.match(/\.(css|scss|sass|less|styl)$/)) return 'style';

    // Configuration
    if (pathLower.match(/\.(json|yaml|yml|toml|ini|xml|env)$/) ||
        pathLower.includes('config') ||
        pathLower.includes('package.json') ||
        pathLower.includes('tsconfig') ||
        pathLower.includes('webpack') ||
        pathLower.includes('babel')) return 'config';

    // Documentation
    if (pathLower.match(/\.(md|txt|rst|adoc)$/) || pathLower.includes('readme')) return 'docs';

    // Database
    if (pathLower.match(/\.(sql|prisma)$/) || pathLower.includes('migration') || pathLower.includes('schema')) return 'database';

    // Assets
    if (pathLower.match(/\.(png|jpg|jpeg|gif|svg|webp|ico|bmp)$/)) return 'asset';

    // Scripts
    if (pathLower.match(/\.(sh|bash|zsh|ps1|bat|cmd)$/)) return 'script';

    return 'other';
  }

  getBranchInfo() {
    try {
      const currentBranch = this.execGitSafe('git branch --show-current').trim();
      const remoteBranch = this.execGitSafe(`git config --get branch.${currentBranch}.remote`).trim();
      const upstreamBranch = this.execGitSafe(`git config --get branch.${currentBranch}.merge`).trim().replace('refs/heads/', '');

      return {
        current: currentBranch || 'unknown',
        remote: remoteBranch || null,
        upstream: upstreamBranch || null,
        tracking: remoteBranch && upstreamBranch ? `${remoteBranch}/${upstreamBranch}` : null
      };
    } catch (error) {
      console.warn('Could not get branch info:', error.message);
      return { current: 'unknown' };
    }
  }

  getRepositoryStats() {
    try {
      const totalCommits = parseInt(this.execGitSafe('git rev-list --count HEAD').trim()) || 0;
      const contributors = this.execGitSafe('git shortlog -sn --all').trim().split('\n').length || 0;
      const firstCommitDate = this.execGitSafe('git log --reverse --pretty=format:"%ad" --date=short | head -1').trim();
      const lastCommitDate = this.execGitSafe('git log -1 --pretty=format:"%ad" --date=short').trim();

      return {
        totalCommits,
        contributors,
        firstCommit: firstCommitDate || null,
        lastCommit: lastCommitDate || null,
        age: this.calculateRepoAge(firstCommitDate)
      };
    } catch (error) {
      console.warn('Could not get repository stats:', error.message);
      return { totalCommits: 0, contributors: 0 };
    }
  }

  calculateRepoAge(firstCommitDate) {
    if (!firstCommitDate) return null;

    try {
      const first = new Date(firstCommitDate);
      const now = new Date();
      const diffTime = Math.abs(now - first);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 30) return `${diffDays} days`;
      if (diffDays < 365) return `${Math.floor(diffDays / 30)} months`;
      return `${Math.floor(diffDays / 365)} years`;
    } catch (error) {
      return null;
    }
  }

  validateCommitHash(hash) {
    if (!hash || typeof hash !== 'string') return false;

    try {
      this.execGit(`git cat-file -e ${hash}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  getCommitDiff(hash, options = {}) {
    if (!this.validateCommitHash(hash)) {
      throw new Error(`Invalid commit hash: ${hash}`);
    }

    try {
      const { nameOnly = false, stat = false, unified = 3 } = options;

      let command = `git show ${hash}`;

      if (nameOnly) {
        command += ' --name-only --pretty=format:""';
      } else if (stat) {
        command += ' --stat --pretty=format:""';
      } else {
        command += ` --name-status --pretty=format:"" -U${unified}`;
      }

      return this.execGit(command).trim();
    } catch (error) {
      console.error(`Error getting diff for commit ${hash}:`, error.message);
      return '';
    }
  }

  getCurrentBranch() {
    try {
      return this.execGit('git rev-parse --abbrev-ref HEAD').trim();
    } catch (error) {
      console.warn('Could not get current branch:', error.message);
      return 'unknown';
    }
  }

  getLastCommit() {
    try {
      const output = this.execGit('git log -1 --pretty=format:"%H|%an|%ae|%ad|%s" --date=iso');
      const [hash, author, email, date, message] = output.split('|');

      return {
        hash: hash?.trim(),
        author: author?.trim(),
        email: email?.trim(),
        date: date?.trim(),
        message: message?.trim()
      };
    } catch (error) {
      console.warn('Could not get last commit:', error.message);
      return null;
    }
  }

  getTags(options = {}) {
    try {
      const { sort = '-version:refname', limit = 50 } = options;
      let command = `git tag --sort=${sort}`;

      if (limit > 0) {
        command += ` | head -${limit}`;
      }

      const output = this.execGit(command);
      return output.trim().split('\n').filter(Boolean);
    } catch (error) {
      console.warn('Could not get tags:', error.message);
      return [];
    }
  }

  getStatus() {
    try {
      const output = this.execGit('git status --porcelain');
      const files = output.trim().split('\n').filter(Boolean);

      const status = {
        clean: files.length === 0,
        modified: files.filter(f => f.startsWith(' M') || f.startsWith('MM')).length,
        added: files.filter(f => f.startsWith('A ') || f.startsWith('AM')).length,
        deleted: files.filter(f => f.startsWith(' D') || f.startsWith('AD')).length,
        renamed: files.filter(f => f.startsWith('R ')).length,
        copied: files.filter(f => f.startsWith('C ')).length,
        untracked: files.filter(f => f.startsWith('??')).length,
        unmerged: files.filter(f => f.startsWith('UU') || f.startsWith('AA')).length,
        total: files.length
      };

      return status;
    } catch (error) {
      console.warn('Could not get status:', error.message);
      return { clean: false, error: error.message };
    }
  }

  // New method: Get commits with file statistics
  getCommitsWithStats(options = {}) {
    const commits = this.getCommits({ ...options, format: 'full' });

    return commits.map(commit => {
      try {
        const diffStat = this.getCommitDiff(commit.hash, { stat: true });
        const stats = this.parseDiffStats(diffStat);

        return {
          ...commit,
          stats
        };
      } catch (error) {
        console.warn(`Could not get stats for commit ${commit.hash}: ${error.message}`);
        return commit;
      }
    });
  }

  parseDiffStats(diffStat) {
    if (!diffStat) return { files: 0, insertions: 0, deletions: 0 };

    try {
      const lines = diffStat.split('\n');
      const summaryLine = lines[lines.length - 1];

      const match = summaryLine.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);

      if (match) {
        return {
          files: parseInt(match[1]) || 0,
          insertions: parseInt(match[2]) || 0,
          deletions: parseInt(match[3]) || 0
        };
      }
    } catch (error) {
      console.warn('Error parsing diff stats:', error.message);
    }

    return { files: 0, insertions: 0, deletions: 0 };
  }

  // New method: Get all branches (local and remote)
  getAllBranches() {
    try {
      const localBranches = this.execGitSafe('git branch').split('\n')
        .map(line => line.replace(/^\*?\s+/, '').trim())
        .filter(Boolean);
      
      const remoteBranches = this.execGitSafe('git branch -r').split('\n')
        .map(line => line.trim().replace(/^origin\//, ''))
        .filter(line => line && !line.includes('HEAD'));

      return {
        local: localBranches,
        remote: remoteBranches,
        current: this.getCurrentBranch()
      };
    } catch (error) {
      console.warn('Could not get branches:', error.message);
      return { local: [], remote: [], current: 'unknown' };
    }
  }

  // New method: Compare commits between branches
  getCommitsBetweenBranches(baseBranch, targetBranch) {
    try {
      // Get commits in targetBranch that are not in baseBranch
      const command = `git log ${baseBranch}..${targetBranch} --pretty=format:"%H|%h|%s|%b|%an|%ae|%ad|%cd" --date=iso`;
      const output = this.execGitSafe(command);
      
      if (!output.trim()) return [];
      
      return this.parseCommitOutput(output, 'full');
    } catch (error) {
      console.error(`Error comparing branches ${baseBranch}..${targetBranch}:`, error.message);
      return [];
    }
  }

  // New method: Get unmerged commits across branches  
  getUnmergedCommits() {
    try {
      const branches = this.getAllBranches();
      const currentBranch = branches.current;
      const unmergedCommits = [];

      for (const branch of branches.local) {
        if (branch !== currentBranch) {
          try {
            const commits = this.getCommitsBetweenBranches(currentBranch, branch);
            if (commits.length > 0) {
              unmergedCommits.push({
                branch,
                commits: commits.map(c => ({
                  hash: c.hash,
                  shortHash: c.shortHash,
                  subject: c.subject,
                  author: c.author,
                  date: c.authorDate
                }))
              });
            }
          } catch (error) {
            console.warn(`Could not analyze branch ${branch}:`, error.message);
          }
        }
      }

      return unmergedCommits;
    } catch (error) {
      console.error('Error getting unmerged commits:', error.message);
      return [];
    }
  }

  // New method: Find dangling commits (unreachable commits)
  getDanglingCommits() {
    try {
      // Get all unreachable objects
      const fsckOutput = this.execGitSafe('git fsck --unreachable --no-dangling');
      const danglingLines = fsckOutput.split('\n')
        .filter(line => line.includes('unreachable commit'))
        .map(line => line.split(' ')[2])
        .filter(Boolean);

      const danglingCommits = [];
      
      for (const hash of danglingLines.slice(0, 20)) { // Limit to 20 for performance
        try {
          const commitInfo = this.execGitSafe(`git show --pretty=format:"%H|%h|%s|%an|%ad" --no-patch ${hash}`);
          const [fullHash, shortHash, subject, author, date] = commitInfo.split('|');
          
          danglingCommits.push({
            hash: fullHash,
            shortHash: shortHash,
            subject: subject || 'No subject',
            author: author || 'Unknown',
            date: date || 'Unknown date',
            isDangling: true
          });
        } catch (error) {
          // Skip invalid commits
          continue;
        }
      }

      return danglingCommits;
    } catch (error) {
      console.warn('Could not get dangling commits:', error.message);
      return [];
    }
  }

  // Get comprehensive repository analysis
  getComprehensiveAnalysis() {
    try {
      const branches = this.getAllBranches();
      const unmergedCommits = this.getUnmergedCommits();
      const danglingCommits = this.getDanglingCommits();
      const status = this.getStatus();

      return {
        branches,
        unmergedCommits,
        danglingCommits,
        workingDirectory: {
          staged: this.getStagedChanges(),
          unstaged: this.getUnstagedChanges(),
          status
        },
        statistics: this.getRepositoryStats()
      };
    } catch (error) {
      console.error('Error getting comprehensive analysis:', error.message);
      return null;
    }
  }
}

module.exports = GitManager;

// CLI usage for testing
if (require.main === module) {
  try {
    const git = new GitManager();
    const command = process.argv[2];

    if (command === 'info') {
      console.log('Git Repository Info:');
      console.log('Config:', git.gitConfig);
      console.log('Branch:', git.getBranchInfo());
      console.log('Stats:', git.getRepositoryStats());
    } else if (command === 'commits') {
      const count = parseInt(process.argv[3]) || 5;
      console.log(`Last ${count} commits:`);
      const commits = git.getCommits({ count, format: 'simple' });
      commits.forEach(commit => {
        console.log(`${commit.shortHash} - ${commit.message} (${commit.author}) [${commit.type}]`);
      });
    } else if (command === 'staged') {
      console.log('Staged changes:');
      const changes = git.getStagedChanges();
      changes.forEach(change => {
        console.log(`${change.status}: ${change.path} [${change.category}]`);
      });
    } else if (command === 'stats') {
      const count = parseInt(process.argv[3]) || 5;
      console.log(`Commits with stats (last ${count}):`);
      const commits = git.getCommitsWithStats({ count });
      commits.forEach(commit => {
        const stats = commit.stats || { files: 0, insertions: 0, deletions: 0 };
        console.log(`${commit.shortHash} - ${commit.subject}`);
        console.log(`  Files: ${stats.files}, +${stats.insertions}, -${stats.deletions}`);
      });
    } else {
      console.log('Usage:');
      console.log('  node git-manager.js info         # Show repository info');
      console.log('  node git-manager.js commits 10   # Show last 10 commits');
      console.log('  node git-manager.js staged       # Show staged changes');
      console.log('  node git-manager.js stats 5      # Show commits with file stats');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}