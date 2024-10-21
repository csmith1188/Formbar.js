function deepObjectEqual(objectA, objectB) {
	if (objectA === objectB) return true;

	if (Array.isArray(objectA) && Array.isArray(objectB)) {

		if (objectA.length !== objectB.length) return false;

		return objectA.every((elem, index) => {
			return deepObjectEqual(elem, objectB[index]);
		})


	}

	if (typeof objectA === "object" && typeof objectB === "object" && objectA !== null && objectB !== null) {
		if (Array.isArray(objectA) || Array.isArray(objectB)) return false;

		const keys1 = Object.keys(objectA)
		const keys2 = Object.keys(objectB)

		if (keys1.length !== keys2.length || !keys1.every(key => keys2.includes(key))) return false;

		for (let key in objectA) {
			let isEqual = deepObjectEqual(objectA[key], objectB[key])
			if (!isEqual) { return false; }
		}

		return true;

	}

	return false;
}