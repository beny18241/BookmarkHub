# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BookmarkHub is a cross-browser extension that synchronizes bookmarks between different browsers (Chrome, Firefox, Edge) using GitHub Gist as storage. Built with WXT framework, React, and TypeScript.

## Development Commands

```bash
# Development
npm run dev                    # Build and watch for Chrome
npm run dev:firefox            # Build and watch for Firefox

# Building
npm run build                  # Production build for Chrome
npm run build:firefox          # Production build for Firefox

# Type checking
npm run compile                # TypeScript compilation check (no emit)

# Packaging
npm run zip                    # Create zip for Chrome
npm run zip:firefox            # Create zip for Firefox

# Setup
npm run postinstall            # Prepare WXT (runs automatically after install)
```

## Architecture

### Framework & Build System
- **WXT**: Browser extension framework handling manifest generation and build process
- Configuration: `wxt.config.ts` defines extension API, permissions, and browser-specific settings
- Entry points defined in `src/entrypoints/`: `background.ts`, `popup/`, `options/`

### Core Components

#### Background Service (`src/entrypoints/background.ts`)
- Central orchestrator for bookmark operations
- Message passing hub between popup/options and bookmark operations
- Monitors bookmark changes via browser APIs and sets badge indicators
- Handles browser type detection (Chrome vs Firefox) for ID mapping
- Main operations: `uploadBookmarks()`, `downloadBookmarks()`, `clearBookmarkTree()`

#### Bookmark Synchronization Flow
1. **Upload**: Reads local bookmarks → normalizes IDs → formats to SyncDataInfo → pushes to Gist
2. **Download**: Fetches from Gist → clears local tree → recreates with browser-specific IDs
3. Browser-specific ID mapping (Chrome: "1"/"2"/"3", Firefox: "toolbar_____"/"unfiled_____"/etc)

#### Service Layer (`src/utils/`)
- `services.ts`: BookmarkService - interfaces with GitHub Gist API
- `http.ts`: Configured ky HTTP client with GitHub auth headers
- `setting.ts`: Settings management using webext-options-sync
- `optionsStorage.ts`: Default options configuration
- `models.ts`: TypeScript models (BookmarkInfo, SyncDataInfo, enums)

### Key Technical Details

**Browser Differences**:
- Firefox root bookmark ID: `"root________"`
- Chrome: numeric IDs ("0", "1", "2", "3")
- Background script normalizes these to standard folder names (ToolbarFolder, MenuFolder, etc.)

**State Management**:
- `curOperType`: Prevents badge updates during sync operations (SYNC/REMOVE vs NONE)
- Badge shows "!" when local changes detected outside of sync operations
- Local/remote counts stored in `browser.storage.local`

**Gist Storage Structure**:
```typescript
{
  version: string,
  createDate: number,
  browser: string,
  bookmarks: BookmarkInfo[]  // Normalized tree structure
}
```

## Important Notes

- All bookmark operations strip browser-specific metadata (dateAdded, IDs, etc.) before upload
- GitHub API requirements: Token with gist scope, Gist ID, custom filename (default: "BookmarkHub")
- Permissions needed: `storage`, `bookmarks`, `notifications`, GitHub host permissions
- Internationalization: Uses browser.i18n with locale files in `src/public/_locales/`
