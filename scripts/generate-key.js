const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MANIFEST_PATH = path.join(__dirname, "../manifest.json");
const PRIVATE_KEY_PATH = path.join(__dirname, "../private-key.pem");

function getExtensionId(base64PublicKey) {
	// Decode base64 to binary DER public key
	const derKey = Buffer.from(base64PublicKey, "base64");

	// Generate SHA-256 hash of public key
	const hash = crypto.createHash("sha256").update(derKey).digest("hex");

	// Convert first 32 characters to 'a'-'p' representation
	return hash
		.substring(0, 32)
		.split("")
		.map((char) => {
			const decimal = parseInt(char, 16);
			return String.fromCharCode(97 + decimal); // 'a' is 97 in ASCII
		})
		.join("");
}

function main() {
	console.log("Generating RSA key pair...");

	// 1. Generate RSA key pair (2048-bit modulus for compatibility)
	const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
		modulusLength: 2048,
		publicKeyEncoding: {
			type: "spki",
			format: "pem",
		},
		privateKeyEncoding: {
			type: "pkcs8",
			format: "pem",
		},
	});

	// 2. Extract public key as a single-line base64 string
	const cleanPublicKeyBase64 = publicKey
		.replace(/-----BEGIN PUBLIC KEY-----/, "")
		.replace(/-----END PUBLIC KEY-----/, "")
		.replace(/\s+/g, "");

	// 3. Compute extension ID
	const extensionId = getExtensionId(cleanPublicKeyBase64);

	// 4. Update manifest.json with locked key and update_url
	if (fs.existsSync(MANIFEST_PATH)) {
		console.log("Updating manifest.json...");
		const manifestContent = fs.readFileSync(MANIFEST_PATH, "utf8");
		const manifest = JSON.parse(manifestContent);

		manifest.key = cleanPublicKeyBase64;
		manifest.update_url = "https://pepelatzdev.github.io/ext-ebay/update.xml";

		fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
		console.log("manifest.json updated successfully.");
	} else {
		console.error(`Error: manifest.json not found at ${MANIFEST_PATH}`);
		process.exit(1);
	}

	// 5. Save private key to private-key.pem
	fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, "utf8");
	console.log(`Private key saved locally to: ${PRIVATE_KEY_PATH}`);

	console.log("\n==================================================");
	console.log("🎉 KEY GENERATION SUCCESSFUL!");
	console.log("==================================================");
	console.log(`Your locked Extension ID is: ${extensionId}`);
	console.log("==================================================");
	console.log("\nIMPORTANT STEPS TO COMPLETE SET UP:");
	console.log("1. Add the generated private-key.pem to your GitHub Secrets.");
	console.log("   - Name: CHROME_CRX_PRIVATE_KEY");
	console.log(
		"   - Value: (copy-paste the ENTIRE content of private-key.pem, including headers)",
	);
	console.log(
		"\n2. Double check that private-key.pem is in your .gitignore file!",
	);
	console.log("   - Do NOT commit the private-key.pem file to Git.");
	console.log("==================================================\n");
}

main();
