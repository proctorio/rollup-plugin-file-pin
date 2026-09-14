import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import filePin, { hashFile } from "../src/index.js";

let m_dir = null;

beforeEach(async() =>
{
	m_dir = await fs.mkdtemp(path.join(os.tmpdir(), "file-pin-test-"));
});

afterEach(async() =>
{
	await fs.rm(m_dir, {
		recursive: true,
		force: true
	});
});

/**
 * @description Writes a file into the test dir and returns its name and expected digest.
 * @param {string} name - File name (may contain sub-directories).
 * @param {string} contents - File contents.
 * @param {string} [algorithm] - Digest algorithm (default "sha256").
 * @return {Promise<Object>} { name, digest } for building a pin map.
 */
async function writeFixture(name, contents, algorithm = "sha256")
{
	const FILE = path.join(m_dir, name);
	await fs.mkdir(path.dirname(FILE), { recursive: true });
	await fs.writeFile(FILE, contents);

	return {
		name,
		digest: createHash(algorithm).update(contents).digest("hex")
	};
}

describe("hashFile()", function()
{
	it("Should compute the sha256 digest of a file's contents", async function()
	{
		const FILE = path.join(m_dir, "blob.bin");
		await fs.writeFile(FILE, "the quick brown fox");

		const EXPECTED = createHash("sha256").update("the quick brown fox").digest("hex");

		expect(await hashFile(FILE)).toBe(EXPECTED);
	});

	it("Should honor a non-default algorithm", async function()
	{
		const FILE = path.join(m_dir, "blob.bin");
		await fs.writeFile(FILE, "the quick brown fox");

		const EXPECTED = createHash("sha512").update("the quick brown fox").digest("hex");

		expect(await hashFile(FILE, "sha512")).toBe(EXPECTED);
	});
});

describe("filePin()", function()
{
	it("Should require a non-empty pins map", function()
	{
		expect(() => filePin()).toThrow(/pins option is required/u);
		expect(() => filePin({})).toThrow(/pins option is required/u);
		expect(() => filePin({ pins: {} })).toThrow(/pins option is required/u);
		expect(() => filePin({ pins: [] })).toThrow(/pins option is required/u);
		expect(() => filePin({ pins: "nope" })).toThrow(/pins option is required/u);
		expect(() => filePin({ pins: null })).toThrow(/pins option is required/u);
	});

	it("Should expose a named rollup plugin", async function()
	{
		const A = await writeFixture("a.bin", "alpha");
		const PLUGIN = filePin({
			pins: { [A.name]: A.digest },
			baseDir: m_dir
		});

		expect(PLUGIN.name).toBe("file-pin");
	});

	it("Should pass when every file matches its pin", async function()
	{
		const A = await writeFixture("a.bin", "alpha");
		const B = await writeFixture("nested/b.bin", "bravo");

		const PLUGIN = filePin({
			pins: {
				[A.name]: A.digest,
				[B.name]: B.digest
			},
			baseDir: m_dir
		});

		await expect(PLUGIN.buildStart()).resolves.toBeUndefined();
	});

	it("Should fail the build when a file does not match its pin", async function()
	{
		await writeFixture("a.bin", "alpha");

		const PLUGIN = filePin({
			pins: { "a.bin": "0".repeat(64) },
			baseDir: m_dir
		});

		await expect(PLUGIN.buildStart()).rejects.toThrow(/pin mismatch for a\.bin/u);
	});

	it("Should fail the build when a pinned file is missing entirely", async function()
	{
		const PLUGIN = filePin({
			pins: { "does-not-exist.bin": "0".repeat(64) },
			baseDir: m_dir
		});

		await expect(PLUGIN.buildStart()).rejects.toThrow(/ENOENT/u);
	});

	it("Should resolve pinned paths against baseDir", async function()
	{
		const A = await writeFixture("deep/dir/a.bin", "alpha");

		const PLUGIN = filePin({
			pins: { "deep/dir/a.bin": A.digest },
			baseDir: m_dir
		});

		await expect(PLUGIN.buildStart()).resolves.toBeUndefined();
	});

	it("Should support a non-default algorithm end to end", async function()
	{
		const A = await writeFixture("a.bin", "alpha", "sha512");

		const PLUGIN = filePin({
			pins: { [A.name]: A.digest },
			algorithm: "sha512",
			baseDir: m_dir
		});

		await expect(PLUGIN.buildStart()).resolves.toBeUndefined();
	});

	it("Should name the algorithm in a mismatch error", async function()
	{
		await writeFixture("a.bin", "alpha", "sha512");

		const PLUGIN = filePin({
			pins: { "a.bin": "0".repeat(128) },
			algorithm: "sha512",
			baseDir: m_dir
		});

		await expect(PLUGIN.buildStart()).rejects.toThrow(/expected sha512/u);
	});

	it("Should verify only once per process when once is true", async function()
	{
		const A = await writeFixture("a.bin", "alpha");

		const PLUGIN = filePin({
			pins: { [A.name]: A.digest },
			baseDir: m_dir
		});

		await PLUGIN.buildStart();

		// once verified, a later build skips the check entirely - deleting the file no longer fails
		await fs.rm(path.join(m_dir, "a.bin"));

		await expect(PLUGIN.buildStart()).resolves.toBeUndefined();
	});

	it("Should re-verify on every build when once is false", async function()
	{
		const A = await writeFixture("a.bin", "alpha");

		const PLUGIN = filePin({
			pins: { [A.name]: A.digest },
			baseDir: m_dir,
			once: false
		});

		await PLUGIN.buildStart();

		await fs.rm(path.join(m_dir, "a.bin"));

		await expect(PLUGIN.buildStart()).rejects.toThrow(/ENOENT/u);
	});
});
