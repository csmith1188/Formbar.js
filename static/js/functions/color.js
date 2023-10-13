// Function to convert HSL to Hex
function convertHSLToHex(hue, saturation, lightness) {
	// Normalize lightness to range 0-1
	lightness /= 100;

	// Calculate chroma
	const chroma = saturation * Math.min(lightness, 1 - lightness) / 100;

	// Function to get color component
	function getColorComponent(colorIndex) {
		const colorPosition = (colorIndex + hue / 30) % 12;
		const colorValue = lightness - chroma * Math.max(Math.min(colorPosition - 3, 9 - colorPosition, 1), -1);

		// Return color component in hexadecimal format
		return Math.round(255 * colorValue).toString(16).padStart(2, '0');
	};

	// Return the hex color
	return `#${getColorComponent(0)}${getColorComponent(8)}${getColorComponent(4)}`;
}

// Function to generate colors
function generateColors(amount) {
	// Initialize colors array
	let colors = [];

	// Initialize hue
	let hue = 0

	// Generate colors
	for (let i = 0; i < amount; i++) {
		// Add color to the colors array
		colors.push(convertHSLToHex(hue, 100, 50));

		// Increment hue
		hue += 360 / amount
	}

	// Return the colors array
	return colors;
}