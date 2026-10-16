/**
 * Classroom Service — defines the Classroom model and the shared in-memory state store.
 *
 * The `Classroom` class represents a classroom that can be loaded into memory for
 * an active session. The `classStateStore` singleton holds all currently-loaded
 * classrooms and their connected users.
 *
 * This module is intentionally small and dependency-light so that both class-service
 * * (session logic) and room-service (persistent membership) can import it without
 * circular-dependency issues.
 *
 * @module services/classroom-service
 */
const { database, dbGet } = require("@modules/database");
const { ClassStateStore } = require("@stores/class-state-store");
const { classCodeCacheStore } = require("@stores/class-code-cache-store");
const { requireInternalParam } = require("@modules/error-wrapper");

const classStateStore = new ClassStateStore();

// This class is used to add a new classroom to the session data
// The classroom will be used to add lessons, do lessons, and for the teacher to operate them
class Classroom {
    constructor({ id, className, key, owner, customRoles, availableRoles, settings } = {}) {
        this.id = id;
        this.className = className;
        this.isActive = false;
        this.owner = owner;
        this.students = {};
        this.poll = {
            status: false,
            prompt: "",
            responses: [],
            allowTextResponses: false,
            allowMultipleResponses: false,
            blind: false,
            blindUntilEnded: false,
            weight: 1,
            excludedRespondents: [],
        };
        this.key = key;
        this.settings = settings || {};

        this.timer = {
            startTime: 0,
            endTime: 0,
            active: false,
            sound: false,
        };

        this.customRoles = customRoles || {};
        this.availableRoles = Array.isArray(availableRoles) ? availableRoles : [];
    }
}

/**
 * Fetch a classroom from the database.
 * @param {number} id - id.
 * @returns {Promise<Object|null>}
 */
function getClassroomFromDb(id) {
    requireInternalParam(id, "id");
    return dbGet("SELECT * FROM classroom WHERE id = ?", [id]);
}

/**
 * Resolve a class code to a classroom ID.
 * @param {string} code - code.
 * @returns {Promise<number|null>}
 */
function getClassIDFromCode(code) {
    const cachedClassId = classCodeCacheStore.get(code);
    if (cachedClassId) {
        return cachedClassId;
    }

    return new Promise((resolve, reject) => {
        database.get("SELECT id FROM classroom WHERE key = ?", [code], (err, classroom) => {
            if (err) {
                reject(err);
                return;
            }

            if (!classroom) {
                resolve(null);
                return;
            }

            classCodeCacheStore.set(code, classroom.id);
            resolve(classroom.id);
        });
    });
}

module.exports = {
    Classroom,
    classStateStore,
    getClassroomFromDb,
    getClassIDFromCode,
};
