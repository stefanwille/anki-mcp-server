#!/usr/bin/env node
/**
 * Anki MCP Server
 * Connects to AnkiConnect to manage flashcards via MCP protocol
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const ANKI_CONNECT_URL = "http://127.0.0.1:8765";

// Helper to send requests to AnkiConnect
async function ankiRequest<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(ANKI_CONNECT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, version: 6, params }),
      signal: controller.signal,
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }
    return data.result as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("AnkiConnect request timed out after 30 seconds");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// Create MCP server
const server = new McpServer({
  name: "anki",
  version: "1.0.0",
});

/**
 * Wraps `registerTool` so a duplicate name or synchronous registration error is visible in stderr
 * (e.g. Claude Desktop MCP logs). The SDK may still convert schemas lazily on `tools/list`.
 */
const registerAnkiTool: typeof server.registerTool = (name, config, cb) => {
  try {
    return server.registerTool(name, config, cb);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[anki-mcp] registerTool failed: "${name}" — ${msg}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
};

// Tool: Get all decks
registerAnkiTool(
  "get_decks",
  {
    title: "Get Decks",
    description: "Get all deck names from Anki",
    inputSchema: {},
  },
  async () => {
    try {
      const decks = await ankiRequest<string[]>("deckNames");
      const output = { decks };
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to get decks: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }
);

// Tool: List cards in a deck
registerAnkiTool(
  "list_cards",
  {
    title: "List Cards",
    description: "List card sides in a deck (uses Basic model).",
    inputSchema: {
      deck_name: z.string(),
      limit: z.number().default(50),
    },
  },
  async ({ deck_name, limit }) => {
    try {
      const cardIds = await ankiRequest<number[]>("findCards", { query: `"deck:${deck_name}"` });

      if (!cardIds || cardIds.length === 0) {
        const output = { cards: [] };
        return {
          content: [{ type: "text", text: JSON.stringify(output) }],
          structuredContent: output,
        };
      }

      const limitedIds = cardIds.slice(0, limit);
      const cardsInfo = await ankiRequest<Array<{
        note: number;
        fields: { Front?: { value: string }; Back?: { value: string } };
      }>>("cardsInfo", { cards: limitedIds });

      const cards = cardsInfo.map((card) => ({
        noteId: card.note,
        front: card.fields.Front?.value || "",
        back: card.fields.Back?.value || "",
      }));

      const output = { cards };
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to list cards: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }
);

// Tool: Create one or more new cards
registerAnkiTool(
  "create_cards",
  {
    title: "Create Cards",
    description: "Add Basic note(s) to a deck. Duplicates skipped (null noteId in results).",
    inputSchema: {
      deck_name: z.string(),
      cards: z.array(
        z.object({
          front: z.string(),
          back: z.string(),
        })
      ),
    },
  },
  async ({ deck_name, cards }) => {
    try {
      const noteIds = await ankiRequest<(number | null)[]>("addNotes", {
        notes: cards.map((card) => ({
          deckName: deck_name,
          modelName: "Basic",
          fields: { Front: card.front, Back: card.back },
          options: { allowDuplicate: false },
        })),
      });

      const results = cards.map((card, i) => ({
        front: card.front,
        noteId: noteIds[i] ?? null,
      }));
      const created = results.filter((r) => r.noteId !== null).length;
      const failed = results.length - created;

      const output = { deckName: deck_name, created, failed, results };
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to create cards: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }
);

// Tool: Update an existing card
registerAnkiTool(
  "update_card",
  {
    title: "Update Card",
    description: "Update an existing card's content",
    inputSchema: {
      note_id: z.number(),
      front: z.string().optional(),
      back: z.string().optional(),
    },
  },
  async ({ note_id, front, back }) => {
    try {
      if (front === undefined && back === undefined) {
        return {
          content: [{ type: "text", text: "Error: Provide at least 'front' or 'back' to update." }],
          isError: true,
        };
      }

      // Get current fields
      const notes = await ankiRequest<Array<{
        fields: { Front?: { value: string }; Back?: { value: string } };
      }>>("notesInfo", { notes: [note_id] });

      if (!notes || notes.length === 0) {
        return {
          content: [{ type: "text", text: `Note ${note_id} not found.` }],
          isError: true,
        };
      }

      const current = notes[0].fields;
      const fields = {
        Front: front ?? current.Front?.value ?? "",
        Back: back ?? current.Back?.value ?? "",
      };

      await ankiRequest("updateNoteFields", { note: { id: note_id, fields } });

      const output = { noteId: note_id, updated: true };
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to update card: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }
);

// Tool: Delete cards
registerAnkiTool(
  "delete_cards",
  {
    title: "Delete Cards",
    description: "Delete one or more cards from Anki by their note IDs",
    inputSchema: {
      note_ids: z.array(z.number()),
    },
  },
  async ({ note_ids }) => {
    try {
      await ankiRequest("deleteNotes", { notes: note_ids });

      const output = { noteIds: note_ids, deleted: true };
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to delete cards: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }
);

// Tool: Create a new deck
registerAnkiTool(
  "create_deck",
  {
    title: "Create Deck",
    description: "Create a new deck in Anki",
    inputSchema: {
      deck_name: z.string(),
    },
  },
  async ({ deck_name }) => {
    try {
      const deckId = await ankiRequest<number>("createDeck", { deck: deck_name });
      const output = { deckId, deckName: deck_name };
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to create deck: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }
);

// Tool: Delete a deck
registerAnkiTool(
  "delete_deck",
  {
    title: "Delete Deck",
    description: "Delete deck, nested decks, and all their cards.",
    inputSchema: {
      deck_name: z.string(),
    },
  },
  async ({ deck_name }) => {
    try {
      const cardIds = await ankiRequest<number[]>("findCards", { query: `"deck:${deck_name}"` });
      await ankiRequest("deleteDecks", { decks: [deck_name], cardsToo: true });

      const output = { deckName: deck_name, deleted: true, cardsDeleted: cardIds?.length ?? 0 };
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Failed to delete deck: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
    }
  }
);

// Tool: Rename a deck
registerAnkiTool(
  "rename_deck",
  {
    title: "Rename Deck",
    description: "Rename a deck in Anki",
    inputSchema: {
      old_name: z.string(),
      new_name: z.string(),
    },
  },
  async ({ old_name, new_name }) => {
    try {
      // Get cards in old deck
      const cardIds = await ankiRequest<number[]>("findCards", { query: `"deck:${old_name}"` });

      // Create new deck
      await ankiRequest("createDeck", { deck: new_name });

      // Move cards if any exist
      if (cardIds && cardIds.length > 0) {
        await ankiRequest("changeDeck", { cards: cardIds, deck: new_name });
      }

      // Delete old deck
      await ankiRequest("deleteDecks", { decks: [old_name], cardsToo: true });

      const cardsMoved = cardIds?.length || 0;
      const output = { oldName: old_name, newName: new_name, cardsMoved };
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to rename deck: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    "Anki MCP: 8 tools — get_decks, list_cards, create_cards, update_card, delete_cards, create_deck, delete_deck, rename_deck"
  );
}

main().catch(console.error);
