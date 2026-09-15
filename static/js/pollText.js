/**
 * Unescape C-style escape sequences in poll prompt/answer text.
 * Supports: \\ \' \" \a \b \f \n \r \t \v \0 \xHH \uHHHH \UHHHHHHHH \OOO
 * Unknown escapes keep the backslash so CommonMark escapes like \* still work.
 */
function unescapeCEscapes(text) {
	if (typeof text !== "string" || text.length === 0) {
		return text ?? "";
	}

	let result = "";
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (char !== "\\" || i + 1 >= text.length) {
			result += char;
			continue;
		}

		const next = text[++i];
		switch (next) {
			case "a":
				result += "\x07";
				break;
			case "b":
				result += "\b";
				break;
			case "f":
				result += "\f";
				break;
			case "n":
				result += "\n";
				break;
			case "r":
				result += "\r";
				break;
			case "t":
				result += "\t";
				break;
			case "v":
				result += "\v";
				break;
			case "\\":
			case "'":
			case '"':
				result += next;
				break;
			case "x": {
				const hex = text.slice(i + 1).match(/^[0-9a-fA-F]{1,2}/);
				if (hex) {
					result += String.fromCharCode(parseInt(hex[0], 16));
					i += hex[0].length;
				} else {
					result += "\\x";
				}
				break;
			}
			case "u": {
				const hex = text.slice(i + 1).match(/^[0-9a-fA-F]{4}/);
				if (hex) {
					result += String.fromCharCode(parseInt(hex[0], 16));
					i += hex[0].length;
				} else {
					result += "\\u";
				}
				break;
			}
			case "U": {
				const hex = text.slice(i + 1).match(/^[0-9a-fA-F]{8}/);
				if (hex) {
					result += String.fromCodePoint(parseInt(hex[0], 16));
					i += hex[0].length;
				} else {
					result += "\\U";
				}
				break;
			}
			default: {
				if (next >= "0" && next <= "7") {
					let octal = next;
					while (octal.length < 3 && i + 1 < text.length && text[i + 1] >= "0" && text[i + 1] <= "7") {
						octal += text[++i];
					}
					result += String.fromCharCode(parseInt(octal, 8));
				} else {
					// Preserve unknown escapes for CommonMark (e.g. \*, \_)
					result += "\\" + next;
				}
				break;
			}
		}
	}

	return result;
}

let pollMarkdownParser = null;
let pollMarkdownRenderer = null;

function getPollMarkdown() {
	if (typeof commonmark === "undefined") {
		return null;
	}
	if (!pollMarkdownParser || !pollMarkdownRenderer) {
		pollMarkdownParser = new commonmark.Parser();
		pollMarkdownRenderer = new commonmark.HtmlRenderer({ safe: true });
	}
	return { parser: pollMarkdownParser, renderer: pollMarkdownRenderer };
}

/**
 * Render poll prompt/answer text with C-escape unescaping and CommonMark.
 * @param {string} text
 * @param {{ inline?: boolean }} [options] - When inline, unwrap a single outer <p> for button/option labels.
 * @returns {string} Safe HTML
 */
function renderPollText(text, options = {}) {
	const unescaped = unescapeCEscapes(text ?? "");
	const md = getPollMarkdown();
	if (!md) {
		const escaped = unescaped
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
		return options.inline ? escaped : `<p>${escaped}</p>`;
	}

	let html = md.renderer.render(md.parser.parse(unescaped));
	if (options.inline) {
		html = html.replace(/^\s*<p>([\s\S]*?)<\/p>\s*$/i, "$1").trim();
	}
	return html;
}
