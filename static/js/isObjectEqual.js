function isObjectEqual(objectA, objectB) {
	for (let property in objectA) {
		switch (typeof (objectA[property])) {
			case 'object':
				if (!isObjectEqual(objectA[property], objectB[property])) {
					return false;
				}
				break;
			case 'function':
				if (typeof (objectB[property]) === 'undefined' ||
					(property !== 'isEqual' && objectA[property].toString() !== objectB[property].toString())) {
					return false;
				}
				break;
			default:
				if (objectA[property] !== objectB[property]) {
					return false;
				}
		}
	}

	for (let property in objectB) {
		if (typeof (objectA[property]) === 'undefined') {
			return false;
		}
	}

	return true;
}