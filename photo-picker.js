/* global ECA */
/* biome-ignore-all lint/correctness/noUnusedVariables: content-script global */
var ECAPhotoPicker = (() => {
	function close(dialog, result) {
		dialog.remove();
		return result;
	}

	function open({ title, photos, limit = ECA.PHOTO_LIMIT }) {
		return new Promise((resolve) => {
			const dialog = document.createElement("div");
			dialog.id = ECA.PHOTO_PICKER_ID;
			dialog.className = "eca-photo-picker";
			dialog.setAttribute("role", "dialog");
			dialog.setAttribute("aria-modal", "true");

			const panel = document.createElement("div");
			panel.className = "eca-photo-picker__panel";
			const heading = document.createElement("h2");
			heading.textContent = "Choose listing photos";
			const description = document.createElement("p");
			description.textContent = title
				? `${title} — choose up to ${limit} main-gallery photos.`
				: `Choose up to ${limit} main-gallery photos.`;
			panel.append(heading, description);

			const selected = new Set(
				photos.slice(0, limit).map((photo) => photo.photoId),
			);
			const summary = document.createElement("p");
			summary.className = "eca-photo-picker__summary";
			const updateSummary = () => {
				summary.textContent = `Selected ${selected.size} of ${photos.length}`;
			};
			updateSummary();
			panel.appendChild(summary);

			if (photos.length > limit) {
				const warning = document.createElement("p");
				warning.className = "eca-photo-picker__warning";
				warning.textContent = `Only ${limit} photos can be attached at once.`;
				panel.appendChild(warning);
			}

			const grid = document.createElement("div");
			grid.className = "eca-photo-picker__grid";
			for (const [index, photo] of photos.entries()) {
				const label = document.createElement("label");
				label.className = "eca-photo-picker__photo";
				const checkbox = document.createElement("input");
				checkbox.type = "checkbox";
				checkbox.checked = selected.has(photo.photoId);
				checkbox.setAttribute("aria-label", `Photo ${index + 1}`);
				checkbox.addEventListener("change", () => {
					if (checkbox.checked && selected.size >= limit) {
						checkbox.checked = false;
						return;
					}
					if (checkbox.checked) selected.add(photo.photoId);
					else selected.delete(photo.photoId);
					updateSummary();
				});
				const image = document.createElement("img");
				image.src = photo.thumbnailUrl;
				image.alt = `Listing photo ${index + 1}`;
				label.append(checkbox, image);
				grid.appendChild(label);
			}
			panel.appendChild(grid);

			const actions = document.createElement("div");
			actions.className = "eca-photo-picker__actions";
			const cancel = document.createElement("button");
			cancel.type = "button";
			cancel.textContent = "Cancel";
			cancel.addEventListener("click", () =>
				resolve(close(dialog, { confirmed: false, selectedPhotoIds: [] })),
			);
			const continueButton = document.createElement("button");
			continueButton.type = "button";
			continueButton.className = "eca-photo-picker__continue";
			continueButton.textContent = "Continue";
			continueButton.addEventListener("click", () =>
				resolve(
					close(dialog, { confirmed: true, selectedPhotoIds: [...selected] }),
				),
			);
			actions.append(cancel, continueButton);
			panel.appendChild(actions);
			dialog.appendChild(panel);
			dialog.addEventListener("click", (event) => {
				if (event.target === dialog)
					resolve(close(dialog, { confirmed: false, selectedPhotoIds: [] }));
			});
			document.body.appendChild(dialog);
			continueButton.focus();
		});
	}

	return { open };
})();
