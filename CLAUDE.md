# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP server for Anki flashcard management via AnkiConnect. Single-file TypeScript project using @modelcontextprotocol/sdk.

## Commands

```bash
pnpm install    # Install dependencies
pnpm build      # Compile TypeScript to dist/
pnpm watch      # Auto-rebuild on changes
pnpm dev        # Run directly with tsx (no build needed)
```

## Architecture

Single source file (`src/index.ts`) containing:
- `ankiRequest<T>()` - Generic HTTP wrapper for AnkiConnect API calls
- Tool registrations: `get_decks`, `list_cards`, `create_card`, `update_card`, `create_deck`, `rename_deck`
- Stdio transport for MCP communication

AnkiConnect endpoint: `http://127.0.0.1:8765`

## Tool Pattern

Each tool follows:
```typescript
server.registerTool("tool_name", {
  title, description, inputSchema, outputSchema
}, async (params) => {
  // Return { content, structuredContent } or { content, isError: true }
})
```

## Publishing

```bash
pnpm version patch  # or minor, major
git push && git push --tags
gh release create v$(node -p "require('./package.json').version") --generate-notes
```
GitHub Actions auto-publishes to npm via OIDC trusted publishing.
