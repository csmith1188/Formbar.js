const { convertHSLToHex, generateColors, generateKey, camelCaseToNormal } = require('../util');

describe('Utility Functions', () => {
    describe('convertHSLToHex', () => {
        it('should convert HSL to Hex correctly', () => {
            const hex = convertHSLToHex(0, 100, 50);
            expect(hex).toBe('#ff0000');
        });

        it('should handle invalid inputs gracefully', () => {
            const hex = convertHSLToHex('invalid', 100, 50);
            expect(hex).toBe("#NaNNaNNaN");
        });
    });

    describe('generateColors', () => {
        it('should generate the correct number of colors', () => {
            const colors = generateColors(5);
            expect(colors.length).toBe(5);
        });

        it('should handle invalid inputs gracefully', () => {
            const colors = generateColors('invalid');
            expect(colors).toStrictEqual([]);
        });
    });

    describe('generateKey', () => {
        it('should generate a key of the correct length', () => {
            const key = generateKey(10);
            expect(key.length).toBe(10);
        });
    });

    describe('camelCaseToNormal', () => {
        it('should convert camelCase to normal text', () => {
            const text = camelCaseToNormal('camelCaseText');
            expect(text).toBe('Camel Case Text');
        });
    });
});