# Anki MCP Server

[![npm](https://img.shields.io/npm/v/stefanwille-anki-mcp-server)](https://www.npmjs.com/package/stefanwille-anki-mcp-server)

A Model Context Protocol (MCP) server for managing [Anki](https://apps.ankiweb.net/) flashcards. Connects to [AnkiConnect](https://foosoft.net/projects/anki-connect/) to enable AI assistants to create, read, and update flashcards.

## Prerequisites

- [Anki](https://apps.ankiweb.net/) with [AnkiConnect](https://ankiweb.net/shared/info/2055492159) add-on installed
- Node.js 22+ ([Download](https://nodejs.org/en/download))
- Anki running, with AnkiConnect on `http://127.0.0.1:8765` (default)

## Installation in Claude Desktop


- Open Claude Desktop
- Go to: "Claude" / "Settings..."
- Tab "Developer"
- Click "Edit Config"

Edit your Claude Desktop config (`claude_desktop_config.json`), and add:

```json
{
  "mcpServers": {
    "anki": {
      "command": "npx",
      "args": ["-y", "stefanwille-anki-mcp-server@latest"]
    }
  }
}
```

Restart Claude Desktop to activate.



## Example Prompts

- "What decks do I have in Anki?"
- "Show the cards in my Spanish vocabulary deck"
- "Check all cards in deck 'Italiano::Capitulo 3' for grammatical errors and correct them"
- "Create a card in my Italian deck with 'ciao' on the front and 'hello' on the back"
- "Extract the vocabulary from the foto and add it to my Italian deck with Italian on the front and German on the back: ..."
- "Create a new deck called 'Physics::Quantum Mechanics'"
- "Rename my 'Math' deck to 'Mathematics'"
- "Give me an exercise that requires me to use the italian words in the deck 'Italienisch::Capitulo 6::Italienisch 38 - 2025-08-01'"

## Tools

| Tool | Description |
|------|-------------|
| `get_decks` | Get all deck names from Anki |
| `create_deck` | Create a new deck |
| `list_cards` | List cards in a deck with front/back content |
| `create_card` | Create a new basic card |
| `update_card` | Update an existing card's content |
| `rename_deck` | Rename a deck |

## Development

### Prerequisites

- Node.js 22+
- pnpm ([Installation](https://pnpm.io/installation))

### Build from Source

```bash
git clone https://github.com/stefanwille/anki-mcp-server.git
cd anki-mcp-server
pnpm install
pnpm build
```

### Watch Mode

```bash
pnpm watch
```

Rebuilds automatically on file changes.

### Install Locally

```bash
pnpm link --global
```

This makes `stefanwille-anki-mcp-server` available system-wide. Update Claude Desktop config to use the command directly:

```json
{
  "mcpServers": {
    "anki": {
      "command": "stefanwille-anki-mcp-server"
    }
  }
}
```

### Uninstall Local Version

```bash
pnpm unlink --global
```

### Publish to npm

Create a GitHub release to trigger the npm publish workflow:

```bash
pnpm version patch  # or minor, major
git push && git push --tags
gh release create v$(node -p "require('./package.json').version") --generate-notes
```

This triggers the GitHub Actions workflow that publishes to npm automatically.

## License

MIT
