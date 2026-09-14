import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// Rollup plugin that verifies a set of files against pinned hash digests before the build emits
// anything, so a silently swapped or corrupted input can never ship. The pins live with the
// consumer - each file path mapped to its expected digest - and a legitimate change updates the
// pin in the same commit that changes the file. Verification runs in buildStart, before any
// output is produced, and only once per process even when a single instance is shared across
// several bundle configs.

/**
 * @description Computes the hex digest of a file's contents.
 * @param {string} file - Path to the file to hash.
 * @param {string} [algorithm] - Any hash algorithm supported by node's crypto (default "sha256").
 * @return {Promise<string>} The lowercase hex digest.
 */
export async function hashFile(file, algorithm = "sha256")
{
	const CONTENTS = await fs.readFile(file);

	return createHash(algorithm).update(CONTENTS).digest("hex");
}

/**
 * @description Rollup plugin that fails the build unless every pinned file matches its expected
 * digest. A missing file, a mismatched digest or an unknown algorithm throws, so a shipped
 * artifact can never carry an unverified input.
 * @param {Object} options - Plugin options.
 * @param {Object<string, string>} options.pins - Map of file path to expected hex digest.
 * @param {string} [options.algorithm] - Hash algorithm applied to every pin (default "sha256").
 * @param {string} [options.baseDir] - Directory the pinned paths are resolved against (default process.cwd()).
 * @param {boolean} [options.once] - Verify only once per process, even when the instance is shared across bundle configs (default true).
 * @return {Object} Rollup plugin.
 */
export default function filePin(options)
{
	const { pins, algorithm = "sha256", baseDir = process.cwd(), once = true } = options || {};

	if (!pins || typeof pins !== "object" || Array.isArray(pins) || Object.keys(pins).length === 0)
	{
		throw new Error("[file-pin] The pins option is required - a map of file path to expected " + algorithm + " digest.");
	}

	let verification = null;

	/**
	 * @description Hashes every pinned file and throws on the first mismatch.
	 * @return {Promise<void>} Resolves when every pin matches its expected digest.
	 */
	async function verify()
	{
		const RESULTS = await Promise.all(Object.entries(pins).map(async([FILE, EXPECTED]) => ({
			file: FILE,
			expected: EXPECTED,
			actual: await hashFile(path.resolve(baseDir, FILE), algorithm)
		})));

		for (const { file, expected, actual } of RESULTS)
		{
			if (actual !== expected)
			{
				const MESSAGE = "[file-pin] pin mismatch for " + file +
					": expected " + algorithm + " " + expected + ", got " + actual +
					". If the change is intentional, update the pin in the same change that updates the file.";

				throw new Error(MESSAGE);
			}
		}
	}

	return {
		name: "file-pin",

		/**
		 * @description Verifies every pin before the build produces output; a rejection here
		 * fails the build. With once (the default) the verification runs a single time per
		 * process even when one instance is shared across several bundle configs.
		 * @return {Promise<void>} Resolves when verification passes.
		 */
		buildStart()
		{
			if (!once)
			{
				return verify();
			}

			verification = verification || verify();

			return verification;
		}
	};
}
