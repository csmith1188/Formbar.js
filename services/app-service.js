const { dbGet, dbRun } = require("@modules/database");
const { compareBcrypt, hashBcrypt, sha256 } = require("@modules/crypto");
const { resolveAPIKey } = require("@services/api-key-service");
const { SCOPES } = require("@modules/scopes");
const { flattenObject } = require("@modules/util");
const { createPool } = require("@services/digipog-service");
const { registerItem, addItemToInventory } = require("@services/inventory-service");
const ValidationError = require("@errors/validation-error");
const crypto = require("crypto");

const SHARES_PER_APP = 100;
const VALID_APP_SCOPES = flattenObject(SCOPES.APP);

function normalizeOAuthScopes(scopes = "") {
    const requested = Array.isArray(scopes) ? scopes : String(scopes).split(/\s+/);
    return [...new Set(requested.map((scope) => String(scope).trim()).filter(Boolean))];
}

function validateOAuthScopes(scopes = "") {
    const requestedScopes = normalizeOAuthScopes(scopes);
    const invalidScopes = requestedScopes.filter((scope) => !VALID_APP_SCOPES.includes(scope));

    if (invalidScopes.length > 0) {
        throw new ValidationError(`Unsupported OAuth scope(s): ${invalidScopes.join(", ")}.`);
    }

    return requestedScopes;
}

/**
 * Create an app record, issue credentials, and seed the matching share item and pool.
 * @param {Object} appData - App data.
 * @param {string} appData.name - App name.
 * @param {string} appData.description - App description.
 * @param {number} appData.ownerId - Owner user ID.
 * @returns {Promise<Object>}
 */
function normalizeRedirectUris(redirectUris = []) {
    if (!Array.isArray(redirectUris)) {
        throw new ValidationError("redirectUris must be an array.");
    }

    const normalized = [];
    for (const redirectUri of redirectUris) {
        if (typeof redirectUri !== "string" || !redirectUri.trim()) {
            throw new ValidationError("Each redirect URI must be a non-empty string.");
        }

        let parsed;
        try {
            parsed = new URL(redirectUri);
        } catch {
            throw new ValidationError("Each redirect URI must be an absolute URL.");
        }

        if (!["http:", "https:"].includes(parsed.protocol)) {
            throw new ValidationError("Redirect URIs must use http or https.");
        }

        parsed.hash = "";
        normalized.push(parsed.toString());
    }

    return [...new Set(normalized)];
}

/**
 * Create an app record, issue credentials, and attach its redirect URIs.
 *
 * @param {Object} params - params.
 * @returns {Promise<*>}
 */
async function createApp({ name, description, ownerId, redirectUris = [] }) {
    const normalizedRedirectUris = normalizeRedirectUris(redirectUris);

    await dbRun("BEGIN TRANSACTION");

    try {
        const shareItemId = await registerItem({
            name: `${name} Share`,
            description: `Share of ${name}`,
            stackSize: SHARES_PER_APP,
            iconUrl: null,
        });
        const poolId = await createPool({ name: `${name} Developer Pool`, description, ownerId, shareItemId });

        const appId = await dbRun("INSERT INTO apps (name, description, owner_user_id, share_item_id, pool_id) VALUES (?, ?, ?, ?, ?)", [
            name,
            description,
            ownerId,
            shareItemId,
            poolId,
        ]);

        for (const redirectUri of normalizedRedirectUris) {
            await dbRun("INSERT INTO app_redirect_uris (app_id, redirect_uri) VALUES (?, ?)", [appId, redirectUri]);
        }

        // Generate and store API key for the app (128 hex chars = 64 bytes)
        const apiKey = crypto.randomBytes(64).toString("hex");
        const apiSecret = crypto.randomBytes(256).toString("hex");
        const apiKeyHash = sha256(apiKey);
        const apiSecretHash = await hashBcrypt(apiSecret);

        await dbRun("INSERT INTO api_keys (api_key_hash, entity_id, entity_type) VALUES (?, ?, ?)", [apiKeyHash, appId, "app"]);
        await dbRun("UPDATE apps SET client_secret_hash = ? WHERE id = ?", [apiSecretHash, appId]);

        await addItemToInventory(ownerId, shareItemId, SHARES_PER_APP);
        await dbRun("COMMIT");

        return {
            appId,
            apiKey,
            apiSecret,
        };
    } catch (error) {
        await dbRun("ROLLBACK");
        throw error;
    }
}

async function getAppById(appId) {
    const app = await dbGet("SELECT id, name, description, owner_user_id AS ownerId FROM apps WHERE id = ?", [appId]);
    return app || null;
}

async function getPublicOAuthAppMetadata({ clientId, redirectUri, requestedScopes }) {
    const client = await validateOAuthClientRedirect({ clientId, redirectUri });
    if (!client) {
        return null;
    }

    const scopes = validateOAuthScopes(requestedScopes);
    const app = await getAppById(clientId);
    if (!app) {
        return null;
    }

    return {
        id: app.id,
        name: app.name,
        description: app.description,
        redirectUri: client.redirectUri,
        requestedScopes: scopes,
    };
}

/**
 * Validate OAuth Client Redirect.
 *
 * @param {Object} params - params.
 * @returns {Promise<*>}
 */
async function validateOAuthClientRedirect({ clientId, redirectUri }) {
    const normalizedRedirectUri = normalizeRedirectUris([redirectUri])[0];
    const app = await dbGet(
        `SELECT apps.id
         FROM apps
         JOIN app_redirect_uris ON app_redirect_uris.app_id = apps.id
         WHERE apps.id = ?
           AND app_redirect_uris.redirect_uri = ?`,
        [clientId, normalizedRedirectUri]
    );

    return app ? { ...app, redirectUri: normalizedRedirectUri } : null;
}

/**
 * Validate OAuth Client Credentials.
 *
 * @param {Object} params - params.
 * @returns {Promise<*>}
 */
async function validateOAuthClientCredentials({ clientId, redirectUri, clientSecret }) {
    if (!clientSecret || typeof clientSecret !== "string" || !clientSecret.trim()) {
        return null;
    }

    const client = await validateOAuthClientRedirect({ clientId, redirectUri });
    if (!client) {
        return null;
    }

    const app = await dbGet("SELECT id, client_secret_hash FROM apps WHERE id = ?", [clientId]);
    if (!app?.client_secret_hash) {
        return null;
    }

    const isValidSecret = await compareBcrypt(clientSecret, app.client_secret_hash);
    return isValidSecret ? { ...client, redirectUri: client.redirectUri } : null;
}

async function validateOAuthAPIKey({ clientId, redirectUri, apiKey }) {
    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
        return null;
    }

    const app = await resolveAPIKey(apiKey);
    if (!app) {
        return null;
    }

    return app.id === Number(clientId) ? { ...app, redirectUri } : null;
}

module.exports = {
    createApp,
    getAppById,
    getPublicOAuthAppMetadata,
    normalizeRedirectUris,
    normalizeOAuthScopes,
    validateOAuthScopes,
    validateOAuthClientRedirect,
    validateOAuthClientCredentials,
    validateOAuthAPIKey,
};
