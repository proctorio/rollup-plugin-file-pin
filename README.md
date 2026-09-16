# rollup-plugin-file-pin

Fails the build unless a set of files match their pinned hash digests. Verification runs before the bundle emits anything, so a silently swapped, corrupted or accidentally regenerated input can never make it into a shipped artifact.

The pins live with the consumer - a map of file path to expected digest - so a legitimate change updates the pin in the same commit that changes the file, and any drift becomes a loud build failure instead of a silent substitution. It is well suited to pinning vendored binaries (wasm/tflite models, prebuilt native assets) whose identity you want to guarantee at build time.

## Installation

```bash
npm install rollup-plugin-file-pin
```

## Usage

```js
// rollup.config.js
import filePin from "rollup-plugin-file-pin";

export default {
	plugins: [
		filePin({
			pins: {
				"vendor/detection.wasm": "5a7b24f12467b004a3de91c62d5f08c521039568eb335d0d174a3f441d20ee06",
				"vendor/face.tflite":    "b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f"
			}
		})
	]
};
```

Place it before any plugin that copies or transforms the pinned files, so verification happens first. A mismatch, a missing file or an unknown algorithm throws and fails the build.

## Options

| Option      | Required | Description |
| ----------- | -------- | ----------- |
| `pins`      | yes      | Map of file path to expected hex digest. A build fails if any file is missing or hashes differently. |
| `algorithm` | no       | Hash algorithm applied to every pin - any algorithm node's `crypto` supports (default `"sha256"`). |
| `baseDir`   | no       | Directory the pinned paths are resolved against (default `process.cwd()`). |
| `once`      | no       | Verify only once per process, even when a single instance is shared across bundle configs (default `true`). |

The `hashFile(file, algorithm)` function is also exported for computing a file's digest outside rollup - useful for producing the pin values in the first place.

## Development

```
npm install
npm test        # vitest
npm run coverage
npm run lint
```

## Security

See [SECURITY.md](SECURITY.md) for how to report a vulnerability.

## Contributing

Issues and pull requests are welcome on
[GitHub](https://github.com/proctorio/rollup-plugin-file-pin). The default
branch is mirrored from an internal repository; maintainers merge accepted
pull requests and the mirror picks them up on the next sync.
