/* biome-ignore-all lint/correctness/noUnusedVariables: classic script module API */
var ECAPhotoCodec = (() => {
	function create({ encode, decode, chunkBytes }) {
		function toBase64(bytes) {
			let binary = "";
			for (let index = 0; index < bytes.length; index += 1)
				binary += String.fromCharCode(bytes[index]);
			return encode(binary);
		}

		function fromBase64(value) {
			const binary = decode(value);
			return Uint8Array.from(binary, (char) => char.charCodeAt(0));
		}

		function chunks(bytes) {
			const result = [];
			for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
				result.push(toBase64(bytes.slice(offset, offset + chunkBytes)));
			}
			return result;
		}

		return { toBase64, fromBase64, chunks };
	}
	return { create };
})();
