#!/usr/bin/env node
/**
 * Anki MCP Server - TypeScript version
 * Connects to AnkiConnect to manage flashcards via MCP protocol
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const ANKI_CONNECT_URL = "http://127.0.0.1:8765";

// Output schemas
const CardSchema = z.object({
  noteId: z.number(),
  front: z.string(),
  back: z.string(),
});

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

// Tool: Get all decks
server.registerTool(
  "get_decks",
  {
    title: "Get Decks",
    description: "Get all deck names from Anki",
    inputSchema: {},
    outputSchema: {
      decks: z.array(z.string()),
      total: z.number(),
    },
  },
  async () => {
    try {
      const decks = await ankiRequest<string[]>("deckNames");
      const output = { decks, total: decks.length };
      return {
        content: [{ type: "text", text: `Found ${decks.length} decks` }],
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
server.registerTool(
  "list_cards",
  {
    title: "List Cards",
    description: "List cards in a deck with their front/back content",
    inputSchema: {
      deck_name: z.string().describe("Full deck name (e.g., 'Italian::Chapter 1')"),
      limit: z.number().default(50).describe("Maximum number of cards to return"),
    },
    outputSchema: {
      cards: z.array(CardSchema),
      total: z.number(),
    },
  },
  async ({ deck_name, limit }) => {
    try {
      const cardIds = await ankiRequest<number[]>("findCards", { query: `"deck:${deck_name}"` });

      if (!cardIds || cardIds.length === 0) {
        const output = { cards: [], total: 0 };
        return {
          content: [{ type: "text", text: "No cards found in this deck." }],
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

      const output = { cards, total: cards.length };
      return {
        content: [{ type: "text", text: `Found ${cards.length} cards` }],
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

// Tool: Create a new card
server.registerTool(
  "create_card",
  {
    title: "Create Card",
    description: "Create a new basic card in Anki",
    inputSchema: {
      deck_name: z.string().describe("The deck to add the card to"),
      front: z.string().describe("Front side content"),
      back: z.string().describe("Back side content"),
    },
    outputSchema: {
      noteId: z.number(),
      deckName: z.string(),
    },
  },
  async ({ deck_name, front, back }) => {
    try {
      const noteId = await ankiRequest<number>("addNote", {
        note: {
          deckName: deck_name,
          modelName: "Basic",
          fields: { Front: front, Back: back },
          options: { allowDuplicate: false },
        },
      });

      const output = { noteId, deckName: deck_name };
      return {
        content: [{ type: "text", text: `Created card with note ID: ${noteId}` }],
        structuredContent: output,
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to create card: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }
);

// Tool: Update an existing card
server.registerTool(
  "update_card",
  {
    title: "Update Card",
    description: "Update an existing card's content",
    inputSchema: {
      note_id: z.number().describe("The note ID to update"),
      front: z.string().optional().describe("New front content"),
      back: z.string().optional().describe("New back content"),
    },
    outputSchema: {
      noteId: z.number(),
      updated: z.boolean(),
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
        content: [{ type: "text", text: `Updated note ${note_id}` }],
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

// Tool: Create a new deck
server.registerTool(
  "create_deck",
  {
    title: "Create Deck",
    description: "Create a new deck in Anki",
    inputSchema: {
      deck_name: z.string().describe("Full deck name (use :: for nested decks)"),
    },
    outputSchema: {
      deckId: z.number(),
      deckName: z.string(),
    },
  },
  async ({ deck_name }) => {
    try {
      const deckId = await ankiRequest<number>("createDeck", { deck: deck_name });
      const output = { deckId, deckName: deck_name };
      return {
        content: [{ type: "text", text: `Created deck '${deck_name}' with ID: ${deckId}` }],
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

// Tool: Rename a deck
server.registerTool(
  "rename_deck",
  {
    title: "Rename Deck",
    description: "Rename a deck in Anki",
    inputSchema: {
      old_name: z.string().describe("Current full deck name"),
      new_name: z.string().describe("New full deck name"),
    },
    outputSchema: {
      oldName: z.string(),
      newName: z.string(),
      cardsMoved: z.number(),
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
        content: [{ type: "text", text: `Renamed '${old_name}' to '${new_name}' (${cardsMoved} cards moved)` }],
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
  console.error("Anki MCP server running on stdio");
}

main().catch(console.error);
