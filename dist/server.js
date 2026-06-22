import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getBrowser, getContext, isLoggedIn, getPage, SESSION_PATH } from "./browser.js";
import { login } from "./auth.js";
const ABILITY_NAMES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
function ok(text) {
    return { content: [{ type: "text", text }] };
}
function err(text) {
    return { content: [{ type: "text", text }], isError: true };
}
async function getSharedContext() {
    const browser = await getBrowser();
    return getContext(browser);
}
// Extract the Cobalt JWT from DDB's localStorage so we can send it as
// Authorization: Bearer on character-service calls. DDB's backend uses this
// to verify DM status for non-owned characters — cookies alone aren't enough.
async function extractCobaltToken(page) {
    return page.evaluate(() => {
        for (const storage of [localStorage, sessionStorage]) {
            for (const key of Object.keys(storage)) {
                const val = storage.getItem(key);
                if (!val)
                    continue;
                if (val.startsWith("eyJ"))
                    return val;
                try {
                    const parsed = JSON.parse(val);
                    for (const field of ["token", "accessToken", "cobaltToken", "authToken", "id_token"]) {
                        if (typeof parsed?.[field] === "string" && parsed[field].startsWith("eyJ"))
                            return parsed[field];
                    }
                }
                catch { }
            }
        }
        return null;
    });
}
async function fetchCharacterById(context, page, charId) {
    const token = await extractCobaltToken(page);
    const headers = { Accept: "application/json" };
    if (token)
        headers["Authorization"] = `Bearer ${token}`;
    const resp = await context.request.get(`https://character-service.dndbeyond.com/character/v5/character/${charId}`, { headers });
    if (!resp.ok())
        throw new Error(`HTTP ${resp.status()} for character ${charId}`);
    const raw = (await resp.json());
    return raw.data;
}
function modStr(score) {
    const mod = Math.floor((score - 10) / 2);
    return mod >= 0 ? `+${mod}` : `${mod}`;
}
function resolveScore(id, stats, bonusStats, overrideStats) {
    const override = overrideStats.find((s) => s.id === id)?.value;
    if (override != null)
        return override;
    const base = stats.find((s) => s.id === id)?.value ?? 10;
    const bonus = bonusStats.find((s) => s.id === id)?.value ?? 0;
    return base + bonus;
}
function formatSheet(c) {
    const lines = [];
    const classes = c.classes
        .map((cl) => `${cl.definition.name}${cl.subclassDefinition ? ` (${cl.subclassDefinition.name})` : ""} ${cl.level}`)
        .join(" / ");
    const race = c.race?.fullName ?? c.race?.baseName ?? "Unknown Race";
    lines.push(`# ${c.name}`);
    lines.push(`**Race:** ${race} | **Classes:** ${classes || "None"}`);
    lines.push(`**XP:** ${c.currentXp.toLocaleString()}${c.inspiration ? " | **Inspiration:** Yes" : ""}`);
    lines.push("");
    const maxHP = c.overrideHitPoints ?? c.baseHitPoints + (c.bonusHitPoints ?? 0);
    const currentHP = maxHP - c.removedHitPoints;
    lines.push("## Hit Points");
    lines.push(`${currentHP} / ${maxHP}${c.temporaryHitPoints ? ` (+${c.temporaryHitPoints} temp)` : ""}`);
    if (c.deathSaves) {
        const ds = c.deathSaves;
        lines.push(`Death Saves: ${ds.successCount ?? 0} successes / ${ds.failCount ?? 0} failures${ds.isStabilized ? " *(stabilized)*" : ""}`);
    }
    lines.push("");
    lines.push("## Ability Scores");
    const scores = [1, 2, 3, 4, 5, 6].map((id, i) => {
        const score = resolveScore(id, c.stats, c.bonusStats ?? [], c.overrideStats ?? []);
        return `**${ABILITY_NAMES[i]}** ${score} (${modStr(score)})`;
    });
    lines.push(scores.join(" | "));
    lines.push("");
    if (c.currencies) {
        const { pp, gp, ep, sp, cp } = c.currencies;
        lines.push("## Currency");
        lines.push(`PP: ${pp} | GP: ${gp} | EP: ${ep} | SP: ${sp} | CP: ${cp}`);
        lines.push("");
    }
    if (c.inventory?.length) {
        lines.push("## Equipment");
        const sorted = [...c.inventory].sort((a, b) => (b.equipped ? 1 : 0) - (a.equipped ? 1 : 0));
        for (const item of sorted) {
            const rarity = item.definition.rarity ? ` [${item.definition.rarity}]` : "";
            const equip = item.equipped ? " *(equipped)*" : "";
            lines.push(`- ${item.definition.name}${rarity} ×${item.quantity}${equip}`);
        }
        lines.push("");
    }
    if (c.spellSlots?.some((s) => s.available > 0)) {
        lines.push("## Spell Slots");
        lines.push(c.spellSlots
            .filter((s) => s.available > 0)
            .map((s) => `Level ${s.level}: ${s.available - s.used}/${s.available}`)
            .join(", "));
        lines.push("");
    }
    if (c.classSpells?.length) {
        lines.push("## Spells");
        for (const cs of c.classSpells) {
            const classInfo = c.classes.find((cl) => cl.id === cs.characterClassId);
            const className = classInfo?.definition.name ?? `Class ${cs.characterClassId}`;
            lines.push(`### ${className}`);
            const byLevel = new Map();
            for (const s of cs.spells) {
                const lvl = s.definition.level;
                if (!byLevel.has(lvl))
                    byLevel.set(lvl, []);
                const unprepared = !s.prepared && !s.alwaysPrepared ? " *(unprepared)*" : "";
                byLevel.get(lvl).push(`${s.definition.name}${unprepared}`);
            }
            for (const [lvl, names] of [...byLevel.entries()].sort((a, b) => a[0] - b[0])) {
                lines.push(`**${lvl === 0 ? "Cantrips" : `Level ${lvl}`}:** ${names.join(", ")}`);
            }
        }
        lines.push("");
    }
    if (c.traits) {
        const fields = [
            ["Personality Traits", c.traits.personalityTraits],
            ["Ideals", c.traits.ideals],
            ["Bonds", c.traits.bonds],
            ["Flaws", c.traits.flaws],
            ["Appearance", c.traits.appearance],
            ["Backstory", c.traits.backstory],
        ];
        const nonempty = fields.filter(([, v]) => v);
        if (nonempty.length) {
            lines.push("## Traits & Background");
            for (const [label, value] of nonempty)
                lines.push(`**${label}:** ${value}`);
            lines.push("");
        }
    }
    if (c.campaign) {
        lines.push("## Campaign");
        lines.push(`${c.campaign.name} (ID: ${c.campaign.id})`);
    }
    return lines.join("\n");
}
export function createServer() {
    const server = new McpServer({ name: "dnd-beyond-mcp", version: "1.0.0" });
    // ─── ddb_login ────────────────────────────────────────────────────────────
    server.tool("ddb_login", "Open a browser and log into D&D Beyond via Wizards ID. Run once — the session is saved to disk and reused automatically on all future calls.", {}, async () => {
        try {
            const context = await getSharedContext();
            const result = await login(context);
            return ok(result);
        }
        catch (e) {
            return err(`Login failed: ${String(e)}`);
        }
    });
    // ─── ddb_status ───────────────────────────────────────────────────────────
    server.tool("ddb_status", "Check whether the D&D Beyond session is active. Run ddb_login first if this reports not logged in.", {}, async () => {
        try {
            const context = await getSharedContext();
            const page = await getPage(context);
            const loggedIn = await isLoggedIn(page);
            if (loggedIn) {
                return ok(`Logged in to D&D Beyond.\nSession file: ${SESSION_PATH}`);
            }
            return err(`Not logged in.\nRun ddb_login to authenticate.\nSession file: ${SESSION_PATH}`);
        }
        catch (e) {
            return err(`Status check failed: ${String(e)}`);
        }
    });
    // ─── ddb_list_characters ──────────────────────────────────────────────────
    server.tool("ddb_list_characters", "List all characters in your D&D Beyond account (name, ID, level, race, class).", {}, async () => {
        try {
            const context = await getSharedContext();
            const page = await getPage(context);
            if (!(await isLoggedIn(page)))
                return err("Not logged in. Run ddb_login first.");
            await page.goto("https://www.dndbeyond.com/characters", {
                waitUntil: "networkidle",
                timeout: 30000,
            });
            await page.waitForTimeout(2000);
            const characters = await page.evaluate(() => {
                const list = [];
                document.querySelectorAll("li.ddb-campaigns-character-card-wrapper").forEach((el) => {
                    const name = el
                        .querySelector(".ddb-campaigns-character-card-header-upper-character-info h2")
                        ?.textContent?.trim() ?? "";
                    const summary = el
                        .querySelector(".ddb-campaigns-character-card-header-upper-character-info-secondary")
                        ?.textContent?.trim() ?? "";
                    const viewLink = el.querySelector(".ddb-campaigns-character-card-footer-links a[href*='/characters/']");
                    const idMatch = (viewLink?.href ?? "").match(/\/characters\/(\d+)/);
                    const id = idMatch?.[1] ?? "";
                    const parts = summary.split("|").map((s) => s.trim());
                    if (name && id) {
                        list.push({
                            name,
                            id,
                            level: parts[0] ?? "",
                            race: parts[1] ?? "",
                            class: parts.slice(2).join(" / ").trim(),
                        });
                    }
                });
                return list;
            });
            if (!characters.length)
                return ok("No characters found on this account.");
            const lines = characters.map((c) => `- **${c.name}** (ID: \`${c.id}\`) — ${c.level}, ${c.race}${c.class ? `, ${c.class}` : ""}`);
            return ok(`## Characters (${characters.length})\n\n${lines.join("\n")}`);
        }
        catch (e) {
            return err(`Failed to list characters: ${String(e)}`);
        }
    });
    // ─── ddb_get_character ────────────────────────────────────────────────────
    server.tool("ddb_get_character", "Get the full character sheet for a D&D Beyond character by ID or name.", {
        characterId: z.number().optional().describe("Numeric character ID"),
        name: z.string().optional().describe("Character name (substring match, case-insensitive)"),
    }, async ({ characterId, name }) => {
        try {
            if (!characterId && !name)
                return err("Provide either characterId or name.");
            const context = await getSharedContext();
            const page = await getPage(context);
            if (!(await isLoggedIn(page)))
                return err("Not logged in. Run ddb_login first.");
            let id = characterId;
            if (!id) {
                await page.goto("https://www.dndbeyond.com/characters", {
                    waitUntil: "networkidle",
                    timeout: 30000,
                });
                await page.waitForTimeout(2000);
                const characters = await page.evaluate(() => {
                    const list = [];
                    document.querySelectorAll("li.ddb-campaigns-character-card-wrapper").forEach((el) => {
                        const charName = el
                            .querySelector(".ddb-campaigns-character-card-header-upper-character-info h2")
                            ?.textContent?.trim() ?? "";
                        const viewLink = el.querySelector(".ddb-campaigns-character-card-footer-links a[href*='/characters/']");
                        const idMatch = (viewLink?.href ?? "").match(/\/characters\/(\d+)/);
                        const charId = idMatch?.[1] ?? "";
                        if (charName && charId)
                            list.push({ name: charName, id: charId });
                    });
                    return list;
                });
                const needle = name.toLowerCase();
                const match = characters.find((c) => c.name.toLowerCase().includes(needle));
                if (!match)
                    return err(`No character found matching "${name}".`);
                id = parseInt(match.id, 10);
            }
            const character = await fetchCharacterById(context, page, id);
            return ok(formatSheet(character));
        }
        catch (e) {
            return err(`Failed to get character: ${String(e)}`);
        }
    });
    // ─── ddb_get_campaign_sheets ──────────────────────────────────────────────
    server.tool("ddb_get_campaign_sheets", "Fetch the full character sheet for every character in a campaign. Intended for use when you are the DM.", {
        campaignId: z.number().describe("Numeric campaign ID"),
    }, async ({ campaignId }) => {
        try {
            const context = await getSharedContext();
            const page = await getPage(context);
            if (!(await isLoggedIn(page)))
                return err("Not logged in. Run ddb_login first.");
            await page.goto(`https://www.dndbeyond.com/campaigns/${campaignId}`, {
                waitUntil: "networkidle",
                timeout: 30000,
            });
            await page.waitForTimeout(2000);
            const characterIds = await page.evaluate(() => {
                const ids = [];
                document.querySelectorAll("li.ddb-campaigns-character-card-wrapper").forEach((el) => {
                    const link = el.querySelector("a[href*='/characters/']");
                    const match = (link?.href ?? "").match(/\/characters\/(\d+)/);
                    if (match)
                        ids.push(parseInt(match[1], 10));
                });
                return [...new Set(ids)];
            });
            if (!characterIds.length) {
                return err(`No characters found in campaign ${campaignId}. Make sure you are the DM and the campaign has members.`);
            }
            const sheets = [];
            const errors = [];
            for (const charId of characterIds) {
                try {
                    const character = await fetchCharacterById(context, page, charId);
                    sheets.push(formatSheet(character));
                }
                catch (e) {
                    errors.push(`Character ${charId}: ${String(e)}`);
                }
            }
            const output = [`# Campaign ${campaignId} — All Character Sheets`];
            if (sheets.length)
                output.push(`\n---\n\n${sheets.join("\n\n---\n\n")}`);
            if (errors.length)
                output.push(`\n\n---\n\n**Fetch errors:**\n${errors.map((e) => `- ${e}`).join("\n")}`);
            return ok(output.join(""));
        }
        catch (e) {
            return err(`Failed to get campaign sheets: ${String(e)}`);
        }
    });
    // ─── ddb_get_campaign ─────────────────────────────────────────────────────
    server.tool("ddb_get_campaign", "Get campaign details and member roster for a D&D Beyond campaign.", {
        campaignId: z.number().describe("Numeric campaign ID"),
    }, async ({ campaignId }) => {
        try {
            const context = await getSharedContext();
            const page = await getPage(context);
            if (!(await isLoggedIn(page)))
                return err("Not logged in. Run ddb_login first.");
            await page.goto(`https://www.dndbeyond.com/campaigns/${campaignId}`, {
                waitUntil: "networkidle",
                timeout: 30000,
            });
            await page.waitForTimeout(2000);
            const campaign = await page.evaluate(() => {
                const data = {};
                const name = document.querySelector("h1.page-title")?.textContent?.trim();
                if (name)
                    data.name = name;
                const dm = document
                    .querySelector("span.user-interactions-profile-nickname")
                    ?.textContent?.trim();
                if (dm)
                    data.dungeonMaster = dm;
                const descEl = Array.from(document.querySelectorAll(".ddb-campaigns-detail p")).find((el) => (el.textContent?.trim().length ?? 0) > 50);
                if (descEl)
                    data.description = descEl.textContent?.trim();
                const characters = [];
                document.querySelectorAll("li.ddb-campaigns-character-card-wrapper").forEach((el) => {
                    const charName = el
                        .querySelector(".ddb-campaigns-character-card-header-upper-character-info-primary")
                        ?.textContent?.trim() ?? "";
                    const secondaries = el.querySelectorAll(".ddb-campaigns-character-card-header-upper-character-info-secondary");
                    const level = secondaries[0]?.textContent?.trim() ?? "";
                    const player = (secondaries[1]?.textContent?.trim() ?? "").replace(/^Player:\s*/i, "");
                    if (charName)
                        characters.push({ character: charName, level, player });
                });
                if (characters.length)
                    data.characters = characters;
                return data;
            });
            const lines = [`# ${campaign.name ?? `Campaign ${campaignId}`}`];
            if (campaign.dungeonMaster)
                lines.push(`**DM:** ${campaign.dungeonMaster}`);
            if (campaign.description)
                lines.push(`\n${campaign.description}`);
            if (campaign.characters?.length) {
                lines.push("\n## Roster");
                for (const c of campaign.characters) {
                    lines.push(`- **${c.character}** — ${c.level}${c.player ? ` (Player: ${c.player})` : ""}`);
                }
            }
            return ok(lines.join("\n"));
        }
        catch (e) {
            return err(`Failed to get campaign: ${String(e)}`);
        }
    });
    return server;
}
//# sourceMappingURL=server.js.map