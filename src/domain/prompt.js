/* biome-ignore-all lint/correctness/noUnusedVariables: classic script module API */
var ECAPrompt = (() => {
	function create(limits) {
		function normalizePromptText(value) {
			return String(value || "")
				.replace(/\u00a0/g, " ")
				.split(/\r?\n/)
				.map((line) => line.trim().replace(/[ \t]+/g, " "))
				.join("\n")
				.replace(/\n{3,}/g, "\n\n")
				.trim();
		}

		function appendBoundedDescription(basePrompt, rawDescription) {
			const marker = "[Description truncated]";
			const description = normalizePromptText(rawDescription);
			if (!description) return basePrompt.slice(0, limits.MAX_PROMPT_CHARS);
			const header = "\n\n**Description:**\n";
			const markerBlock = `\n\n${marker}`;
			let body = description.slice(0, limits.MAX_DESCRIPTION_CHARS);
			let truncated = body.length < description.length;
			const available =
				limits.MAX_PROMPT_CHARS - basePrompt.length - header.length;
			if (body.length > available) truncated = true;
			if (!truncated) return `${basePrompt}${header}${body}`;
			const safeBase = basePrompt.slice(
				0,
				Math.max(
					0,
					limits.MAX_PROMPT_CHARS - header.length - markerBlock.length,
				),
			);
			const bodyLimit = Math.max(
				0,
				limits.MAX_PROMPT_CHARS -
					safeBase.length -
					header.length -
					markerBlock.length,
			);
			body = body.slice(0, bodyLimit).trimEnd();
			return `${safeBase}${header}${body}${markerBlock}`;
		}

		function formatPrompt(preamble, data, pageUrl) {
			const clean = normalizePromptText;
			const lines = [`${clean(preamble)}\n\n---`];
			const missing = [];
			if (!data.title) missing.push("title");
			if (!data.bidPrice && !data.binPrice) missing.push("price");
			if (!data.description) missing.push("description");
			if (data.title) lines.push(`**Product:** ${clean(data.title)}`);
			lines.push(`**URL:** ${pageUrl.split(/[?#]/)[0]}`);
			lines.push(`**Listing Type:** ${clean(data.type)}`);
			if (data.bidPrice) lines.push(`**Current Bid:** ${clean(data.bidPrice)}`);
			if (data.binPrice)
				lines.push(`**Buy It Now Price:** ${clean(data.binPrice)}`);
			if (data.shipping) lines.push(`**Shipping:** ${clean(data.shipping)}`);
			if (data.condition) lines.push(`**Condition:** ${clean(data.condition)}`);
			if (data.returns) lines.push(`**Returns:** ${clean(data.returns)}`);
			if (missing.length)
				lines.push(`\n**Missing data:** ${missing.join(", ")}`);

			if (data.seller.name) {
				const feedback = data.seller.feedback
					? ` (${clean(data.seller.feedback)})`
					: "";
				lines.push(`\n**Seller:** ${clean(data.seller.name)}${feedback}`);
			}
			if (data.reviews?.length > 0) {
				lines.push("\n**Seller Reviews:**");
				for (const review of data.reviews) lines.push(`- "${clean(review)}"`);
			}
			if (data.specs?.length > 0) {
				lines.push("\n**Item Specifics:**");
				for (const spec of data.specs) {
					lines.push(`- ${clean(spec.label)}: ${clean(spec.value)}`);
				}
			}

			return appendBoundedDescription(
				normalizePromptText(lines.join("\n")),
				data.description,
			);
		}

		return { formatPrompt, normalizePromptText, appendBoundedDescription };
	}
	return { create };
})();
