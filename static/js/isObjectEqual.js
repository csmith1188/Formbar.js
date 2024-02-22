function isObjectEqual(objectA, objectB) {
	if (objectA === objectB) return true;

	if (Array.isArray(objectA) && Array.isArray(objectB)) {

		if (objectA.length !== objectB.length) return false;

		return objectA.every((elem, index) => {
			return isObjectEqual(elem, objectB[index]);
		})


	}

	if (typeof objectA === "object" && typeof objectB === "object" && objectA !== null && objectB !== null) {
		if (Array.isArray(objectA) || Array.isArray(objectB)) return false;

		const keys1 = Object.keys(objectA)
		const keys2 = Object.keys(objectB)

		if (keys1.length !== keys2.length || !keys1.every(key => keys2.includes(key))) return false;

		for (let key in objectA) {
			console.log(objectA[key], objectB[key])
			let isEqual = isObjectEqual(objectA[key], objectB[key])
			if (!isEqual) { return false; }
		}

		return true;

	}

	return false;
}