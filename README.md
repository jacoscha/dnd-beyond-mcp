# dnd-beyond-mcp

A Model Context Protocol (MCP) server that lets Claude read your D&D Beyond characters and campaigns. It uses Playwright to authenticate with Wizards ID and access your account data.

## Prerequisites

- Node.js 18+
- A D&D Beyond account

## Installation

```bash
git clone <repo>
cd dnd-beyond-mcp
npm install
npx playwright install chromium
npm run build
```

## Claude Desktop setup

Add the following to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dnd-beyond": {
      "command": "node",
      "args": ["/absolute/path/to/dnd-beyond-mcp/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop after editing the config.

## First-time login

The first time you use the server, ask Claude to run `ddb_login`. A Chromium browser window will open — sign in with your Wizards ID account. Once complete, the session is saved to `~/.config/dnd-beyond-mcp/session.json` and reused automatically in all future sessions.

## Available tools

| Tool | Description |
|------|-------------|
| `ddb_login` | Open browser and log in via Wizards ID |
| `ddb_status` | Check if the current session is active |
| `ddb_list_characters` | List all characters on your account |
| `ddb_get_character` | Get a full character sheet (by ID or name) |
| `ddb_get_campaign` | Get campaign details and roster (by campaign ID) |

## Example prompts

- *"List my D&D Beyond characters"*
- *"Show me the character sheet for Aldric"*
- *"What spells does my wizard have prepared?"*
- *"Who's in campaign 12345678?"*

## Session persistence

The Playwright storage state (cookies + localStorage) is saved to `~/.config/dnd-beyond-mcp/session.json` after a successful login. Subsequent sessions load this file automatically — no re-login needed unless the session expires.

## Running in Cowork / remotely

This server runs locally and requires a real browser for the login flow. It is **not** directly compatible with Claude.ai's Cowork remote execution environment without additional infrastructure (an HTTP transport + ngrok tunnel, or a deployed server with pre-baked session cookies).
# dnd-beyond-mcp
