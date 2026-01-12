# Anki MCP Server

A Model Context Protocol (MCP) server for managing [Anki](https://apps.ankiweb.net/) flashcards. Connects to [AnkiConnect](https://foosoft.net/projects/anki-connect/) to enable AI assistants to create, read, and update flashcards.

## Prerequisites

- [Anki](https://apps.ankiweb.net/) with [AnkiConnect](https://ankiweb.net/shared/info/2055492159) add-on installed
- Node.js 22+ ([Download](https://nodejs.org/en/download))
- pnpm installed ([Installation](https://pnpm.io/installation))
- Anki running, with AnkiConnect on `http://127.0.0.1:8765` (default)

## Installation

```bash
pnpm install
pnpm build
pnpm link --global
```

This makes the command `stefanwille-anki-mcp-server` available system-wide.


## Configuration

### Configure with Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "anki": {
      "command": "stefanwille-anki-mcp-server"
    }
  }
}
```

## Example Prompts

- "What decks do I have in Anki?"
- "Show the cards in my Spanish vocabulary deck"
- "Check all cards in deck 'Italiano::Capitulo 3' for grammatical errors and correct them"
- "Create a card in my Italian deck with 'ciao' on the front and 'hello' on the back"
- "Extract the vocabulary from the foto and add it to my Italian deck with Italian on the front and German on the back: ..."
- "Create a new deck called 'Physics::Quantum Mechanics'"
- "Rename my 'Math' deck to 'Mathematics'"


## Tools available to Claude Desktop

| Tool | Description |
|------|-------------|
| `get_decks` | Get all deck names from Anki |
| `create_deck` | Create a new deck |
| `list_cards` | List cards in a deck with front/back content |
| `create_card` | Create a new basic card |
| `update_card` | Update an existing card's content |
| `rename_deck` | Rename a deck |


## Uninstall

```bash
pnpm unlink --global
```

## License

MIT
