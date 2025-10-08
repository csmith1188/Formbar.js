const { dbRun, dbGet, dbGetAll } = require("../modules/database");
const { logger } = require("../modules/logger");

module.exports = {
    run(socket) {
        socket.on("poolCreate", async (data) => {
            try {
                const { name, description } = data;
                if (typeof name !== "string" || name.length <= 0 || name.length > 50) {
                    return socket.emit("poolCreateResponse", { success: false, message: "Invalid pool name." });
                }
                if (typeof description !== "string" || description.length > 255) {
                    return socket.emit("poolCreateResponse", { success: false, message: "Invalid pool description." });
                }

                const result = await dbRun("INSERT INTO digipog_pools (name, description, amount) VALUES (?, ?, 0)", [name, description]);
                const member = await dbGet("SELECT * FROM digipog_pool_users WHERE user_id = ?", [socket.request.session.user.id]);
                if (member.owner && member.owner.split(',').length >= 5) {
                    return socket.emit("poolCreateResponse", { success: false, message: "You can only own up to 5 pools." });
                }

                // Add the pool to the user's owned pools
                if (member) {
                    dbRun("UPDATE digipog_pool_users SET owner = ? WHERE user_id = ?", [member.owner ? member.owner + `,${result.lastID}` : `${result.lastID}`, socket.request.session.user.id]);
                } else {
                    dbRun("INSERT INTO digipog_pool_users (user_id, owner) VALUES (?, ?)", [socket.request.session.user.id, result.lastID]);
                }
            } catch (err) {
                logger.log('error', err.stack);
            }
        });

        socket.on("poolDelete", async (data) => {
            try {
                const { poolId } = data;
                if (typeof poolId !== "number" || poolId <= 0) {
                    return socket.emit("poolDeleteResponse", { success: false, message: "Invalid pool ID." });
                }

                const member = await dbGet("SELECT * FROM digipog_pool_users WHERE user_id = ?", [socket.request.session.user.id]);
                if (!member || !member.owner || !member.owner.split(',').includes(poolId.toString())) {
                    return socket.emit("poolDeleteResponse", { success: false, message: "You do not own this pool." });
                }

                // Remove the pool from the database
                const newOwnerList = member.owner.split(',').filter(id => id !== poolId.toString()).join(',');
                await dbRun("UPDATE digipog_pool_users SET owner = ? WHERE user_id = ?", [newOwnerList, socket.request.session.user.id]);
                await dbRun("UPDATE digipog_pool_users SET member = TRIM(REPLACE(REPLACE(member, ?, ''), ',,', ',')) WHERE member LIKE ?", [poolId.toString(), `%${poolId}%`]);
                await dbRun("DELETE FROM digipog_pools WHERE id = ?", [poolId]);

                return socket.emit("poolDeleteResponse", { success: true, message: "Pool deleted successfully." });
            } catch (err) {
                logger.log('error', err.stack);
            }
        });

        socket.on("poolAddMember", async (data) => {
            try {
                const { poolId, userId } = data;
                if (typeof poolId !== "number" || poolId < 0) {
                    return socket.emit("poolAddMemberResponse", { success: false, message: "Invalid pool ID." });
                }
                if (typeof userId !== "number" || (userId <= 0) && (userId !== socket.request.session.user.id)) {
                    return socket.emit("poolAddMemberResponse", { success: false, message: "Invalid user ID." });
                }

                const member = await dbGet("SELECT * FROM digipog_pool_users WHERE user_id = ?", [socket.request.session.user.id]);
                if (!member || !member.owner || !member.owner.split(',').includes(poolId.toString())) {
                    return socket.emit("poolAddMemberResponse", { success: false, message: "You do not own this pool." });
                }

                const userToAdd = await dbGet("SELECT * FROM users WHERE id = ?", [userId]);
                if (!userToAdd) {
                    return socket.emit("poolAddMemberResponse", { success: false, message: "User not found." });
                }

                const poolMembers = member.member ? member.member.split(',') : [];
                if (poolMembers.includes(userId.toString())) {
                    return socket.emit("poolAddMemberResponse", { success: false, message: "User is already a member of this pool." });
                }

                poolMembers.push(userId.toString());
                await dbRun("UPDATE digipog_pool_users SET member = ? WHERE user_id = ?", [poolMembers.join(','), socket.request.session.user.id]);

                return socket.emit("poolAddMemberResponse", { success: true, message: "User added to pool successfully." });
            } catch (err) {
                logger.log('error', err.stack);
            }
        });

        socket.on("poolRemoveMember", async (data) => {
            try {
                const { poolId, userId } = data;
                if (typeof poolId !== "number" || poolId < 0) {
                    return socket.emit("poolRemoveMemberResponse", { success: false, message: "Invalid pool ID." });
                }
                if (typeof userId !== "number" || (userId <= 0) && (userId !== socket.request.session.user.id)) {
                    return socket.emit("poolRemoveMemberResponse", { success: false, message: "Invalid user ID." });
                }

                const member = await dbGet("SELECT * FROM digipog_pool_users WHERE user_id = ?", [socket.request.session.user.id]);
                if (!member || !member.owner || !member.owner.split(',').includes(poolId.toString())) {
                    return socket.emit("poolRemoveMemberResponse", { success: false, message: "You do not own this pool." });
                }

                const poolMembers = member.member ? member.member.split(',') : [];
                if (!poolMembers.includes(userId.toString())) {
                    return socket.emit("poolRemoveMemberResponse", { success: false, message: "User is not a member of this pool." });
                }

                const newMemberList = poolMembers.filter(id => id !== userId.toString()).join(',');
                await dbRun("UPDATE digipog_pool_users SET member = ? WHERE user_id = ?", [newMemberList, socket.request.session.user.id]);

                return socket.emit("poolRemoveMemberResponse", { success: true, message: "User removed from pool successfully." });
            } catch (err) {
                logger.log('error', err.stack);
            }
        });

        socket.on("poolPayout", async (data) => {
            try {
                const { poolId } = data;
                if (typeof poolId !== "number" || poolId <= 0) {
                    return socket.emit("poolPayoutResponse", { success: false, message: "Invalid pool ID." });
                }
                const pool = await dbGet("SELECT * FROM digipog_pools WHERE id = ?", [poolId]);
                if (!pool) {
                    return socket.emit("poolPayoutResponse", { success: false, message: "Pool not found." });
                }
                const members = await dbGetAll("SELECT id FROM digipog_pool_users WHERE member LIKE ? OR owner LIKE ?", [`%${poolId}%`, `%${poolId}%`]);
                for (const member of members) {
                    const user = await dbGet("SELECT * FROM users WHERE id = ?", [member.id]);
                    if (user) {
                        const newBalance = user.digipogs + Math.floor(pool.amount / members.length);
                        await dbRun("UPDATE users SET digipogs = ? WHERE id = ?", [newBalance, user.id]);
                        await dbRun("INSERT INTO transactions (from_user, to_user, pool, amount, reason, date) VALUES (?, ?, ?, ?, ?, ?)", [null, user.id, pool.id, Math.floor(pool.amount / members.length), `Payout from pool ${pool.name}`, Date.now()]);
                    }
                }

                await dbRun("UPDATE digipog_pools SET amount = 0 WHERE id = ?", [poolId]);
                return socket.emit("poolPayoutResponse", { success: true, message: "Pool payout successful." });
            } catch (err) {
                logger.log('error', err.stack);
            }
        });
    }
}