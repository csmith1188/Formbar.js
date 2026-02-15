/**
 * Converts HSL color values to Hex color values
 * @param hue
 * @param saturation
 * @param lightness
 * @returns {string}
 */
function convertHSLToHex(hue, saturation, lightness) {
    try {
        // Normalize lightness to range 0-1
        lightness /= 100;

        // Calculate chroma
        const chroma = (saturation * Math.min(lightness, 1 - lightness)) / 100;

        // Function to get color component
        function getColorComponent(colorIndex) {
            try {
                const colorPosition = (colorIndex + hue / 30) % 12;
                const colorValue = lightness - chroma * Math.max(Math.min(colorPosition - 3, 9 - colorPosition, 1), -1);

                // Return color component in hexadecimal format
                return Math.round(255 * colorValue)
                    .toString(16)
                    .padStart(2, "0");
            } catch (err) {
                return err;
            }
        }

        // Return the hex color
        let red = getColorComponent(0);
        let green = getColorComponent(8);
        let blue = getColorComponent(4);

        if (red instanceof Error) throw red;
        if (green instanceof Error) throw green;
        if (blue instanceof Error) throw blue;

        return `#${red}${green}${blue}`;
    } catch (err) {
        return err;
    }
}

/**
 * Generates random colors
 * @param amount - Amount of colors to generate
 * @returns {string[]}
 */
function generateColors(amount) {
    try {
        // Initialize colors array
        let colors = [];

        // Initialize hue
        let hue = 0;

        // Generate colors
        for (let i = 0; i < amount; i++) {
            // Add color to the colors array
            let color = convertHSLToHex(hue, 100, 50);

            if (color instanceof Error) throw color;

            colors.push(color);

            // Increment hue
            hue += 360 / amount;
        }

        // Return the colors array
        return colors;
    } catch (err) {
        return err;
    }
}

function generateKey(size) {
    let key = "";
    for (let i = 0; i < size; i++) {
        let keygen = "abcdefghijklmnopqrstuvwxyz123456789";
        let letter = keygen[Math.floor(Math.random() * keygen.length)];
        key += letter;
    }

    return key;
}

function camelCaseToNormal(str) {
    let result = str.replace(/([A-Z])/g, " $1");
    result = result.charAt(0).toUpperCase() + result.slice(1);
    return result;
}

module.exports = {
    convertHSLToHex,
    generateColors,
    generateKey,
    camelCaseToNormal,
};
