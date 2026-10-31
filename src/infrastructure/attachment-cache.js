/* biome-ignore-all lint/correctness/noUnusedVariables: classic script module API */
var ECAAttachmentCache = (() => {
	function create() {
		const entries = new Map();
		function removeRequest(request) {
			for (const photo of request?.photos || [])
				entries.delete(`${request.requestId}:${photo.photoId}`);
		}
		return { entries, removeRequest };
	}
	return { create };
})();
