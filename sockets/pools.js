const { dbRun, dbGet, dbGetAll } = require("../modules/database");
const { logger } = require("../modules/logger");
const pools = require("../modules/pools");

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

                // Check how many pools the user already owns
                const userPools = await pools.getPoolsForUser(socket.request.session.userId);
                const ownedPools = userPools.filter((p) => p.owner);

                if (ownedPools.length >= 5) {
                    return socket.emit("poolCreateResponse", { success: false, message: "You can only own up to 5 pools." });
                }

                // Create the pool
                const result = await dbRun("INSERT INTO digipog_pools (name, description, amount) VALUES (?, ?, 0)", [name, description]);
                const poolId = result.lastID || result;

                // Add the user as the pool owner using the new structure
                await pools.addUserToPool(poolId, socket.request.session.userId, 1);

                return socket.emit("poolCreateResponse", { success: true, message: "Pool created successfully." });
            } catch (err) {
                logger.log("error", err.stack);
                return socket.emit("poolCreateResponse", { success: false, message: "An error occurred while creating the pool." });
            }
        });

        socket.on("poolDelete", async (data) => {
            try {
                const { poolId } = data;
                if (typeof poolId !== "number" || poolId <= 0) {
                    return socket.emit("poolDeleteResponse", { success: false, message: "Invalid pool ID." });
                }

                // Check if the user owns this pool
                const isOwner = await pools.isUserOwner(socket.request.session.userId, poolId);
                if (!isOwner) {
                    return socket.emit("poolDeleteResponse", { success: false, message: "You do not own this pool." });
                }

                // Delete all user associations with this pool
                await dbRun("DELETE FROM digipog_pool_users WHERE pool_id = ?", [poolId]);

                // Delete the pool itself
                await dbRun("DELETE FROM digipog_pools WHERE id = ?", [poolId]);

                return socket.emit("poolDeleteResponse", { success: true, message: "Pool deleted successfully." });
            } catch (err) {
                logger.log("error", err.stack);
                return socket.emit("poolDeleteResponse", { success: false, message: "An error occurred while deleting the pool." });
            }
        });

        socket.on("poolAddMember", async (data) => {
            try {
                const { poolId, userId } = data;
                if (typeof poolId !== "number") {
                    return socket.emit("poolAddMemberResponse", { success: false, message: "Invalid pool ID." });
                }
                if (typeof userId !== "number" || userId <= 0) {
                    return socket.emit("poolAddMemberResponse", { success: false, message: "Invalid user ID." });
                }

                // Check if the current user owns this pool
                const isOwner = await pools.isUserOwner(socket.request.session.userId, poolId);
                if (!isOwner) {
                    return socket.emit("poolAddMemberResponse", { success: false, message: "You do not own this pool." });
                }

                // Check if the user exists
                const userToAdd = await dbGet("SELECT * FROM users WHERE id = ?", [userId]);
                if (!userToAdd) {
                    return socket.emit("poolAddMemberResponse", { success: false, message: "User not found." });
                }

                // Check if user is already in the pool
                const isInPool = await pools.isUserInPool(userId, poolId);
                if (isInPool) {
                    return socket.emit("poolAddMemberResponse", { success: false, message: "User is already a member of this pool." });
                }

                // Add the user as a member (owner flag = 0)
                await pools.addUserToPool(poolId, userId, 0);

                return socket.emit("poolAddMemberResponse", { success: true, message: "User added to pool successfully." });
            } catch (err) {
                logger.log("error", err.stack);
                return socket.emit("poolAddMemberResponse", { success: false, message: "An error occurred while adding the user." });
            }
        });

        socket.on("poolRemoveMember", async (data) => {
            try {
                const { poolId, userId } = data;
                if (typeof poolId !== "number") {
                    return socket.emit("poolRemoveMemberResponse", { success: false, message: "Invalid pool ID." });
                }
                if (typeof userId !== "number" || userId <= 0) {
                    return socket.emit("poolRemoveMemberResponse", { success: false, message: "Invalid user ID." });
                }

                // Check if the current user owns this pool
                const isOwner = await pools.isUserOwner(socket.request.session.userId, poolId);
                if (!isOwner) {
                    return socket.emit("poolRemoveMemberResponse", { success: false, message: "You do not own this pool." });
                }

                // Check if the target user is in the pool
                const isInPool = await pools.isUserInPool(userId, poolId);
                if (!isInPool) {
                    return socket.emit("poolRemoveMemberResponse", { success: false, message: "User is not a member of this pool." });
                }

                // Remove the user from the pool
                await pools.removeUserFromPool(poolId, userId);

                return socket.emit("poolRemoveMemberResponse", { success: true, message: "User removed from pool successfully." });
            } catch (err) {
                logger.log("error", err.stack);
                return socket.emit("poolRemoveMemberResponse", { success: false, message: "An error occurred while removing the user." });
            }
        });

        socket.on("poolPayout", async (data) => {
            try {
                const { poolId } = data;
                if (typeof poolId !== "number" || poolId < 0) {
                    return socket.emit("poolPayoutResponse", { success: false, message: "Invalid pool ID." });
                }

                // Check if the current user owns this pool
                const isOwner = await pools.isUserOwner(socket.request.session.userId, poolId);
                if (!isOwner) {
                    return socket.emit("poolPayoutResponse", { success: false, message: "You do not own this pool." });
                }

                // Get the pool
                const pool = await dbGet("SELECT * FROM digipog_pools WHERE id = ?", [poolId]);
                if (!pool) {
                    return socket.emit("poolPayoutResponse", { success: false, message: "Pool not found." });
                }

                // Get all members (owners and non-owners)
                const members = await pools.getUsersForPool(poolId);

                if (members.length === 0) {
                    return socket.emit("poolPayoutResponse", { success: false, message: "Pool has no members." });
                }

                const amountPerMember = Math.floor(pool.amount / members.length);

                // Pay out to each member
                for (const member of members) {
                    const user = await dbGet("SELECT * FROM users WHERE id = ?", [member.user_id]);
                    if (user) {
                        const newBalance = user.digipogs + amountPerMember;
                        await dbRun("UPDATE users SET digipogs = ? WHERE id = ?", [newBalance, member.user_id]);
                        await dbRun("INSERT INTO transactions (from_user, to_user, pool, amount, reason, date) VALUES (?, ?, ?, ?, ?, ?)", [
                            null,
                            member.user_id,
                            pool.id,
                            amountPerMember,
                            `Pool Payout`,
                            new Date(),
                        ]);
                    }
                }

                // Reset pool amount to 0
                await dbRun("UPDATE digipog_pools SET amount = 0 WHERE id = ?", [poolId]);

                return socket.emit("poolPayoutResponse", { success: true, message: "Pool payout successful." });
            } catch (err) {
                logger.log("error", err.stack);
                return socket.emit("poolPayoutResponse", { success: false, message: "An error occurred during payout." });
            }
        });
    },
};
