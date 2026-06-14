export function getConfig() {
    return {
        cookie: process.env.DDB_COOKIE ?? null,
        characterServiceBase: "https://character-service.dndbeyond.com/character/v3",
        wwwBase: "https://www.dndbeyond.com",
    };
}
//# sourceMappingURL=config.js.map