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

let a = {
	a: 'a',
	b: 1,
	c: { a: 'a', b: true },
	d: [1, 2, 3]
}
let b = {
	a: 'a',
	b: 1,
	c: {
		b: true,
		a: 'a',
	},
	d: [1, 2, 3]
}

console.log(isObjectEqual(a, b));