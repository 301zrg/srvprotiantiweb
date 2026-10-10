// Public operator configuration. Leave empty to use VITE_DUEL_WS_URL.
// A release may set duelWebSocketUrl here without rebuilding the client.
// Optional deckImportOrigins overrides allowed website origins for deck messages.
// Use exact origins, or [] to disable that bridge. See docs/deck-import.md.
// websiteBaseUrl overrides the homepage's website link (HTTP/HTTPS; no credentials/query/fragment).
// Cloudflare/Python release tools write all three fields from validated public inputs:
// VITE_DUEL_WS_URL, VITE_DECK_IMPORT_ORIGINS (JSON array), VITE_WEBSITE_BASE_URL.
// Example: { duelWebSocketUrl: "wss://game.example.com/neos",
//   deckImportOrigins: ["https://ladder.example.com"], websiteBaseUrl: "https://ladder.example.com/" }
// Never put passwords, tunnel tokens or private keys in this file.
window.__SRVPRO_DUEL_CONFIG__ = {};
