# dnd-beyond-mcp

MCP server that gives Claude access to D&D Beyond character sheets and campaigns via Playwright browser automation.

## Tools

- **ddb_login** — Opens a browser for Wizards ID login. Run once; session is persisted to `~/.config/dnd-beyond-mcp/session.json` and reused automatically.
- **ddb_status** — Check whether the saved session is still active.
- **ddb_list_characters** — List all characters on the account (name, ID, level, race, class).
- **ddb_get_character** — Fetch a full character sheet by numeric ID or name substring. Returns HP, ability scores, spells, inventory, currency, traits, and campaign.
- **ddb_get_campaign** — Fetch campaign details and roster by numeric campaign ID.
- **ddb_get_campaign_sheets** — Fetch the full character sheet for every player character in a campaign (DM use).

## Usage pattern

Always call `ddb_status` first. If not logged in, call `ddb_login` and wait for the user to complete the browser login. After that, all other tools work without further auth.

## Architecture

- `src/browser.ts` — Playwright browser/context lifecycle and session persistence
- `src/auth.ts` — Login flow (navigates to DDB, waits for OAuth redirect)
- `src/server.ts` — MCP tool definitions and D&D Beyond page scraping / API calls
- `src/index.ts` — Entry point, stdio transport
- Session stored at `~/.config/dnd-beyond-mcp/session.json`

## Development

```bash
npm install
npx playwright install chromium
npm run build   # tsc → dist/
npm start       # run the server manually
```

## Notes

- The server runs with `headless: false` so the login browser window is visible to the user.
- Character data is fetched from `character-service.dndbeyond.com` using the saved session cookies.
- Campaign data is scraped from the DDB campaign page (no dedicated API).
