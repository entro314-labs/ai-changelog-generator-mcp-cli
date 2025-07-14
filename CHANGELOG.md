# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.5.1] - 2025-06-09

### 🚀 **Point Release: Enhanced User Experience & Error Handling**

This point release significantly improves the tool's reliability and user experience with cleaner output, better error handling, and enhanced repository insights.

#### 🛠️ **Improvements**

**Enhanced Error Handling & User Experience**
- 🐛 **IMPROVED**: Git error messages now display clean, user-friendly warnings instead of raw technical output
- 🐛 **IMPROVED**: Suppressed stderr output from git commands to eliminate noise 
- 🐛 **IMPROVED**: Model availability errors show simplified messages with session-based deduplication
- ✨ **NEW**: Added `execGitShow()` method for safer git operations with missing files
- ✨ **NEW**: Graceful handling of deleted/renamed files with contextual messaging

**Repository Health Enhancements**  
- ✨ **NEW**: Added `--health` CLI flag for comprehensive repository health assessment
- ✨ **NEW**: Added `assess_repository_health` MCP tool for AI assistants
- ✨ **NEW**: 8-point commit message quality scoring system with real-time feedback
- ✨ **NEW**: Repository hygiene recommendations and actionable insights
- ✨ **NEW**: Health scoring (0-100) with categorization: Poor/Fair/Good/Excellent

**Developer Experience**
- ✨ **IMPROVED**: Cleaner console output with reduced error spam
- ✨ **IMPROVED**: Better fallback messaging for model selection
- ✨ **IMPROVED**: More informative warnings with actionable suggestions
- ✨ **IMPROVED**: Enhanced rule-based analysis reliability without AI providers

#### 🔧 **Technical Enhancements**

- **Error Recovery**: Robust handling of git edge cases and command failures
- **Output Sanitization**: Clean error messages without technical implementation details  
- **Session Management**: Deduplicated warnings to prevent console spam
- **Graceful Degradation**: Better fallback behavior when operations fail

#### 📊 **Impact**

- **No Breaking Changes**: Full backward compatibility maintained
- **Improved Reliability**: Prevents crashes from git edge cases
- **Better UX**: Professional, clean output suitable for all skill levels  
- **Enhanced Insights**: Repository health provides actionable development guidance

#### 🆙 **Migration Notes**

- No migration required - all improvements are additive
- New `--health` flag available for CLI users
- MCP users gain access to `assess_repository_health` tool
- All existing functionality works identically

---

## [2.5.0] - 2025-06-09

### 🆕 Major Improvements

**Repository Health Assessment & Commit Quality Analysis**
- ✨ **NEW**: Added comprehensive repository health assessment with `--health` CLI flag and `assess_repository_health` MCP tool
- ✨ **NEW**: Real-time commit message quality detection and scoring (8-point scale)
- ✨ **NEW**: Automatic warnings for poor commit messages with actionable suggestions
- ✨ **NEW**: Repository hygiene metrics including working directory status, commit frequency, and code diversity

**Enhanced Error Handling & Resilience**
- 🐛 **FIXED**: Graceful handling of missing files in git history (no more crashes on deleted/moved files)
- 🐛 **FIXED**: Improved error recovery for git command failures
- 🐛 **FIXED**: Better fallback analysis when git operations fail
- ✨ **NEW**: Comprehensive warnings and recovery suggestions

**Rule-Based Analysis Improvements**
- ✨ **NEW**: Enhanced rule-based analysis that works without AI providers
- ✨ **NEW**: Commit message quality warnings integrated into changelog output
- ✨ **NEW**: Repository health recommendations in generated output
- ✨ **NEW**: Better fallback behavior when AI analysis fails

**MCP Server Enhancements**
- ✨ **NEW**: Added `assess_repository_health` MCP tool for comprehensive health analysis
- ✨ **NEW**: Repository health metrics accessible via MCP for AI assistants
- ✨ **NEW**: Standardized JSON output format for health assessments
- ✨ **NEW**: Configurable analysis depth and recommendations

**Developer Experience**
- ✨ **NEW**: Clearer CLI help text with health assessment options
- ✨ **NEW**: Color-coded health scores and recommendations
- ✨ **NEW**: Proactive suggestions for repository hygiene improvements
- ✨ **NEW**: Better user guidance for poor commit message patterns

### 🔧 Technical Enhancements

- **Commit Message Analysis**: 8-point scoring system evaluating length, descriptiveness, conventional format compliance, and informational value
- **Repository Health Metrics**: Comprehensive scoring including commit quality, working directory status, activity patterns, and code diversity
- **Error Recovery**: Robust handling of git edge cases, deleted files, and command failures
- **Fallback Analysis**: Improved rule-based analysis that provides value even without AI providers
- **Attribution Updates**: Corrected repository references to match current GitHub location

### 📊 Impact

This release significantly improves the tool's reliability and usefulness by:
- **Preventing crashes** from git edge cases and missing files
- **Providing actionable insights** about repository health and commit quality
- **Working reliably** even without AI provider configuration
- **Offering proactive guidance** for better development practices

### 🆙 Migration Notes

- No breaking changes in this release
- New `--health` flag available for CLI users
- MCP users gain access to new `assess_repository_health` tool
- All existing functionality remains unchanged

## [2.4.0] - 2025-01-13

### Added
- **Complete MCP Server Feature Parity**: Achieved 100% feature parity between CLI and MCP server
  - New `generate_changelog_from_changes` MCP tool for working directory changelog generation
  - Equivalent to CLI's `--analyze` functionality with full AI-powered changelog creation
  - Supports all analysis modes (standard, detailed, enterprise) and model overrides
- **File Writing Behavior**: MCP tools now write `AI_CHANGELOG.md` files to project root
  - Both `generate_changelog` and `generate_changelog_from_changes` create persistent files
  - Ensures consistent behavior and proper attribution preservation
  - Prevents chat AI from modifying or stripping attribution from official output
- **Enhanced Attribution Support**: Fixed missing `includeAttribution` parameter in MCP tools
  - Added `includeAttribution` parameter to `analyze_current_changes` MCP tool schema
  - All MCP tools now support attribution control with proper defaults
  - Maintains promotional attribution while providing opt-out option

### Changed
- **MCP Tool Documentation**: Updated README with comprehensive MCP tool reference
  - Clarified distinction between analysis tools and changelog generation tools
  - Added file writing behavior documentation and feature parity notes
  - Updated examples to demonstrate working directory changelog generation
- **Tool Schema Enhancement**: Extended MCP tool schemas with missing parameters
  - More consistent parameter handling across all MCP tools
  - Better validation and documentation for tool parameters

### Fixed
- **Attribution Consistency**: Resolved discrepancy between CLI and MCP attribution behavior
  - MCP tools now include attribution footer by default, matching CLI behavior
  - Fixed missing attribution in working directory analysis workflows
- **Feature Gap**: Eliminated functionality differences between CLI and MCP interfaces
  - MCP server can now generate changelogs from working directory changes
  - No more reliance on chat AI interpretation of analysis data

### Technical Implementation
- **New MCP Methods**: Added `generateChangelogFromChanges()` and supporting helper methods
  - `generateWorkingDirChangelog()`: AI-powered changelog generation from file changes
  - `generateBasicChangelogFromChanges()`: Rule-based fallback for working directory changes
  - `getChangeDescription()`: Utility for describing file change types
- **File I/O Integration**: Added changelog file writing to MCP tool workflows
  - Consistent `AI_CHANGELOG.md` output across CLI and MCP interfaces
  - Proper error handling for file writing operations
  - Enhanced metadata with file path information

## [2.3.1] - 2025-01-08

### Added
- **Attribution Footer**: Added optional attribution footer to generated changelogs
  - Displays link to the project: "Generated using [ai-github-changelog-generator-cli-mcp](https://github.com/idominikosgr/AI-github-changelog-generator-cli-mcp)"
  - Enabled by default for promotional purposes while respecting user preferences
  - CLI flag `--no-attribution` to disable attribution footer
  - MCP parameter `includeAttribution: false` to disable attribution in MCP server
  - Promotes the tool while providing opt-out option for users who prefer clean output

## [2.3.0] - 2025-01-08

### Added
- **Model Override System**: CLI flag `--model` and MCP parameter for forcing specific AI models
  - Bypasses intelligent model selection logic when explicit model specified
  - Validates model capabilities and displays feature support (reasoning, context, caching)
  - Graceful fallback with capability warnings when model unavailable
- **Comprehensive Repository Analysis**: New `--comprehensive` CLI command and `analyze_comprehensive` MCP tool
  - Repository statistics: commit count, contributor analysis, age calculation
  - Branch analysis: local/remote branch enumeration, current branch detection
  - Working directory status: staged/unstaged/untracked file counts
  - AI-powered health assessment with actionable recommendations
- **Branch Analysis Tools**: New `--branches` CLI command and `analyze_branches` MCP tool
  - Enumerates all local and remote branches
  - Identifies unmerged commits across branches
  - Detects dangling commits unreachable from branch heads
  - Provides cleanup recommendations for repository maintenance
- **Untracked File Analysis**: New `--untracked` CLI command
  - Categorizes untracked files by type (source, config, docs, build artifacts, temp)
  - Risk assessment for each file category
  - Automatic .gitignore recommendations
  - AI-powered analysis when available
- **Enhanced Interactive Mode**: Repository status display in interactive interface
  - Shows current branch, staged/unstaged counts before menu presentation
  - Improved UX with contextual information for better decision making

### Fixed
- **Git Commit Parsing**: Fixed multiline commit message handling in `parseCommitOutput()`
  - Changed from `%b` to `%B` format specifier for proper body extraction
  - Added null byte separator support for complex commit messages
  - Resolves issue where commits with multiline descriptions were truncated
- **CLI Argument Processing**: Fixed `getCommitsSince()` format parameter
  - Changed from 'simple' to 'full' format to ensure hash field availability
  - Resolves "No commits found" error when commits existed in repository
- **Missing Method Implementation**: Added `analyzeRepositoryWithAI()` method
  - Implements AI-powered repository health analysis
  - Uses `generateCompletion()` API with proper message formatting
  - Provides structured health assessment with scoring and recommendations
- **AI Provider Method Calls**: Corrected `generateText()` to `generateCompletion()`
  - Updated untracked file analysis to use proper AI provider API
  - Fixed repository analysis to use correct message format structure

### Changed
- **Model Selection Logic**: Enhanced `selectOptimalModel()` to respect model override
  - Priority: manual override > intelligent selection > fallback
  - Added model capability validation and user feedback
  - Improved error handling for unavailable models
- **CLI Help Documentation**: Updated help text to include new commands
  - Added `--model` flag documentation with examples
  - Included `--branches`, `--comprehensive`, `--untracked` command descriptions
  - Updated examples section with model override usage patterns
- **MCP Server Schema**: Extended tool definitions for new functionality
  - Added `model` parameter to `generate_changelog` tool
  - Added `analyze_branches` and `analyze_comprehensive` tool definitions
  - Enhanced parameter validation and documentation

### Technical Implementation
- **Git Manager Extensions**: Added methods for comprehensive repository analysis
  - `getAllBranches()`: Returns local/remote branch enumeration
  - `getDanglingCommits()`: Identifies unreachable commits
  - `getRepositoryStats()`: Calculates repository metrics
- **AI Provider Integration**: Enhanced model override support
  - Model capability detection and validation
  - Intelligent fallback selection when override unavailable
  - Performance optimization with model-specific settings
- **Error Handling**: Improved robustness across git operations
  - Graceful degradation when git commands fail
  - Better error messages for troubleshooting
  - Consistent fallback behavior for offline scenarios

## [2.2.0] - 2024-06-01

### Added
- **MCP Server Implementation**: Complete Model Context Protocol server with 8 tools
  - `generate_changelog`: AI-powered changelog generation from git history
  - `analyze_commits`: Commit pattern analysis with configurable limits
  - `analyze_current_changes`: Staged/unstaged file analysis
  - `get_git_info`: Repository metadata and statistics
  - `configure_ai_provider`: AI provider testing and validation
  - `validate_models`: Model availability and capability checking
- **Dual CLI/MCP Architecture**:
  - `bin/ai-changelog.js`: Traditional CLI interface
  - `bin/ai-changelog-mcp.js`: MCP server executable
  - Shared core libraries for consistent functionality
- **Intelligent Model Selection**: Complexity-based model assignment
  - File count and line change analysis for model selection
  - Breaking change detection for advanced reasoning models
  - Cost optimization through efficient model usage
- **Model Support Matrix**:
  - `gpt-4.1-nano`: <3 files, <50 lines
  - `gpt-4.1-mini`: 3-10 files, <200 lines  
  - `gpt-4.1`: 10-20 files, <1000 lines
  - `o4-mini`: 20+ files, architectural changes
- **TypeScript Definitions**: Complete type definitions in `types/index.d.ts`
- **Configuration System**: Environment variable and .env.local support

### Changed
- **Package Architecture**: Migrated from flat to modular structure
  - Core modules: `ai-provider.js`, `git-manager.js`, `templates.js`, `config.js`
  - Separated concerns: CLI, MCP server, shared libraries
  - Improved maintainability and testability
- **Azure OpenAI Integration**: Updated to v1 API with 2025-04-01-preview version
  - GPT-4.1 series support with 1M token context
  - Prompt caching for 75% cost reduction
  - Enhanced error handling and fallback mechanisms
- **Package Namespace**: Scoped to `@idominikosgr/ai-changelog-generator`
- **Import Resolution**: Relative paths for improved portability

### Fixed
- **Path Dependencies**: Eliminated absolute path requirements
- **Error Boundaries**: Improved error handling for network failures
- **Test Compatibility**: Updated test imports for new structure

### Technical Details
- **Dependencies**: Added `@modelcontextprotocol/sdk@1.12.1`
- **API Compatibility**: Supports both OpenAI and Azure OpenAI endpoints
- **Context Window**: 1M token support for large repository analysis
- **Caching Strategy**: Prompt caching implementation for cost optimization

## [2.1.0] - 2024-05-15

### Added
- **Interactive Mode**: Full interactive CLI with commit selection
  - Checkbox interface for commit cherry-picking
  - Staged/unstaged change analysis
  - AI-powered commit message validation
  - Commit suggestion generation
- **Analysis Modes**: Configurable analysis depth
  - `--detailed`: Comprehensive business and technical analysis
  - `--enterprise`: Stakeholder-ready documentation
  - `--analyze`: Current working directory analysis
- **Enhanced Git Integration**: Extended git operation support
  - Diff analysis with before/after context
  - File categorization by type (source, docs, tests, config)
  - Conventional commit parsing and validation
- **AI Provider Fallback**: Rule-based analysis when AI unavailable
  - Pattern recognition for commit classification
  - Basic impact assessment
  - Maintains functionality in offline scenarios

### Changed
- **Command Interface**: Expanded CLI options
  - Version-specific changelog generation
  - Date range filtering
  - Output format selection
- **AI Model Support**: Extended model compatibility
  - GPT-4 series support
  - Azure OpenAI integration
  - Model-specific optimizations

### Fixed
- **Commit Parsing**: Improved conventional commit detection
- **File Processing**: Better handling of binary files
- **Error Recovery**: Enhanced resilience to git command failures

## [2.0.0] - 2024-05-01

### Added
- **Core AI Integration**: OpenAI and Azure OpenAI API support
- **Git Analysis Engine**: Automated commit analysis and categorization
- **Template System**: Configurable changelog output formats
- **Configuration Management**: Environment variable and config file support

### Changed
- **Breaking**: Migrated from manual to automated changelog generation
- **API**: Redesigned for programmatic usage

### Technical Implementation
- **Git Operations**: Direct git command integration
- **AI Processing**: Asynchronous batch processing
- **Output Generation**: Template-based markdown generation
- **Error Handling**: Comprehensive error recovery mechanisms

## [1.0.0] - 2024-04-01

### Added
- **Initial Implementation**: Basic changelog generation
- **Git Integration**: Commit history parsing
- **CLI Interface**: Command-line argument processing
- **File Output**: Markdown changelog generation

### Technical Foundation
- **Node.js Runtime**: Core JavaScript implementation
- **Git Commands**: Shell command execution
- **File System**: Changelog file management
- **Process Management**: CLI argument handling
