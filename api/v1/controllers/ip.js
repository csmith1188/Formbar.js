const { logger } = require("@modules/logger");
const { dbGet, dbRun, dbGetAll } = require("@modules/database");
const { settings } = require("@modules/config");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");
const { getIpAccess } = require("@modules/webServer");
const { hasPermission } = require("@middleware/permissionCheck");
const authentication = require("@middleware/authentication");
const fs = require("fs");
const ValidationError = require("@errors/validation-error");
const ConflictError = require("@errors/conflict-error");

module.exports = (router) => {
    // List IPs
    router.get("/ip/:type", hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
        const ipMode = req.params.type;
        if (ipMode !== "whitelist" && ipMode !== "blacklist") {
            throw new ValidationError("Invalid type", { event: "ip.list.get.failed", reason: "invalid_type" });
        }

        const isWhitelist = ipMode === "whitelist" ? 1 : 0;
        const rows = await dbGetAll(`SELECT id, ip FROM ip_access_list WHERE is_whitelist = ?`, [isWhitelist]);
        res.status(200).json({ active: settings[`${ipMode}Active`], ips: rows || [] });
    });

    // Add IP
    router.post("/ip/:type", hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
        const type = req.params.type;
        const { ip } = req.body || {};
        if (type !== "whitelist" && type !== "blacklist") {
            throw new ValidationError("Invalid type", { event: "ip.add.failed", reason: "invalid_type" });
        }
        if (!ip) {
            throw new ValidationError("Missing ip");
        }

        const isWhitelist = type === "whitelist" ? 1 : 0;

        // Check if the IP already exists
        const exists = await dbGet(`SELECT 1 AS one FROM ip_access_list WHERE ip=? AND is_whitelist=?`, [ip, isWhitelist]);
        if (exists && exists.one) {
            throw new ConflictError("IP already exists", { event: "ip.add.failed", reason: "ip_exists" });
        }

        // Insert the IP into the database
        await dbRun(`INSERT INTO ip_access_list (ip, is_whitelist) VALUES(?, ?)`, [ip, isWhitelist]);
        const cache = await getIpAccess(type);
        if (type === "whitelist") {
            Object.keys(authentication.whitelistedIps).forEach((k) => delete authentication.whitelistedIps[k]);
            Object.assign(authentication.whitelistedIps, cache);
        } else {
            Object.keys(authentication.blacklistedIps).forEach((k) => delete authentication.blacklistedIps[k]);
            Object.assign(authentication.blacklistedIps, cache);
        }
        res.status(201).json({ ok: true });
    });

    // Update IP
    router.put("/ip/:type/:id", hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
        const type = req.params.type;
        const id = req.params.id;
        const { ip } = req.body || {};
        if (!ip) {
            throw new ValidationError("Missing ip", { event: "ip.update.failed", reason: "missing_ip" });
        }
        if (type !== "whitelist" && type !== "blacklist") {
            throw new ValidationError("Invalid type", { event: "ip.update.failed", reason: "invalid_type" });
        }

        const isWhitelist = type === "whitelist" ? 1 : 0;
        await dbRun(`UPDATE ip_access_list SET ip=? WHERE id=? AND is_whitelist=?`, [ip, id, isWhitelist]);
        const cache = await getIpAccess(type);
        if (type === "whitelist") {
            Object.keys(authentication.whitelistedIps).forEach((key) => delete authentication.whitelistedIps[key]);
            Object.assign(authentication.whitelistedIps, cache);
        } else {
            Object.keys(authentication.blacklistedIps).forEach((k) => delete authentication.blacklistedIps[k]);
            Object.assign(authentication.blacklistedIps, cache);
        }
        res.status(200).json({ ok: true });
    });

    // Remove IP
    router.delete("/ip/:type/:id", hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
        const type = req.params.type;
        const id = req.params.id;
        if (type !== "whitelist" && type !== "blacklist") {
            throw new ValidationError("Invalid type", { event: "ip.delete.failed", reason: "invalid_type" });
        }

        const isWhitelist = type === "whitelist" ? 1 : 0;
        await dbRun(`DELETE FROM ip_access_list WHERE id=? AND is_whitelist=?`, [id, isWhitelist]);
        const cache = await getIpAccess(type);
        if (type === "whitelist") {
            Object.keys(authentication.whitelistedIps).forEach((k) => delete authentication.whitelistedIps[k]);
            Object.assign(authentication.whitelistedIps, cache);
        } else {
            Object.keys(authentication.blacklistedIps).forEach((k) => delete authentication.blacklistedIps[k]);
            Object.assign(authentication.blacklistedIps, cache);
        }
        res.status(200).json({ ok: true });
    });

    // Toggle ip whitelist/blacklist
    router.post("/ip/:type/toggle", hasPermission(MANAGER_PERMISSIONS), (req, res) => {
        const type = req.params.type;
        if (type !== "whitelist" && type !== "blacklist") {
            throw new ValidationError("Invalid type", { event: "ip.toggle.failed", reason: "invalid_type" });
        }

        // Toggle the ip mode
        // If one is already enabled, then disable the other
        const otherType = type === "whitelist" ? "blacklist" : "whitelist";
        settings[`${type}Active`] = !settings[`${type}Active`];
        if (settings[`${type}Active`]) {
            settings[`${otherType}Active`] = false;
        }

        // Update the .env with the new settings
        const env = fs.readFileSync("./.env", "utf8");
        const whitelistEnabled = `${type.toUpperCase()}_ENABLED`;
        const blacklistEnabled = `${otherType.toUpperCase()}_ENABLED`;
        let updatedIpMode = env
            .replace(new RegExp(`${whitelistEnabled}='(true|false)'`), `${whitelistEnabled}='${settings[`${type}Active`]}'`)
            .replace(new RegExp(`${blacklistEnabled}='(true|false)'`), `${blacklistEnabled}='${settings[`${otherType}Active`]}'`);

        if (updatedIpMode === env) {
            // If keys not present, append them
            const lines = [`${whitelistEnabled}='${settings[`${type}Active`]}'`, `${blacklistEnabled}='${settings[`${otherType}Active`]}'`];
            updatedIpMode = env.trimEnd() + "\n" + lines.join("\n") + "\n";
        }

        fs.writeFileSync("./.env", updatedIpMode);
        res.status(200).json({ ok: true, active: settings[`${type}Active`], otherDisabled: !settings[`${otherType}Active`] });
    });
};
