# ArchiMate Thumbnail Generator

Create a GitHub Issue, attach a text copy of one native Archi model, and receive one PNG thumbnail per view. GitHub Issues rejects the `.archimate` extension, so rename a copy to `.archimate.txt` without changing its contents; no ZIP is used. Archi performs the actual report rendering; Node.js validates inputs, extracts the report diagrams, resizes PNGs, and writes a run manifest.

## Architecture

1. The `Generate ArchiMate Thumbnails` Issue Form accepts one `.archimate.txt` attachment. The model name is read from the XML model itself.
2. `Process model` runs on `issues.opened` with read-only repository/Issue permissions. It streams and validates the upload, invokes `ArchiRuntime` v0.1.0, and uploads generated files as a short-lived Actions artifact.
3. `Publish results` is triggered by the completed processing workflow. It verifies the originating workflow, repository, Issue, run and artifact; validates all files without executing artifact content; then commits results to `dist/` and comments on the Issue.

The export mechanism is Archi's documented CLI: `--loadModel <*.archimate>` followed by `--html.createReport <path>`. Archi's HTML report has one `views/<view-id>.html` page per diagram and an `<img class="diagram">` link to the rendered PNG. Extraction follows only those explicit links—not report icons or other assets. The integration test exercises a native model authored for this project with three distinct diagram views against `ghcr.io/continuous-drivenarchitecture/archi-runtime:v0.1.0` (Archi 5.11.0, coArchi 0.9.8).

## Create a request

1. Open **Issues → New issue → Generate ArchiMate Thumbnails**.
2. Optionally add a description; no model-name text field is needed.
3. Make a copy of the `.archimate` file and rename it to `.archimate.txt` (or `.txt`). Do not edit its contents or ZIP it. Attach that copy directly and wait for GitHub to show the uploaded filename/link before submitting.
4. Submit the Issue. Processing starts when the Issue is opened; later Issue edits do not start another processing run.

Users need only a GitHub account and a browser. They do not need Docker, Node.js, or Archi installed.

If the attachment is missing or invalid, the Issue remains open and receives a failure comment with the workflow link and a recommended action. On success it receives links to each PNG, the `completed` label, and is closed. A failure receives the `failed` label and remains open. Comments are updated on workflow reruns instead of duplicated.

## Output

Each run is committed to `dist/`; earlier results are retained. Images use UTC execution time and this format:

```text
YYYYMMDD-HHmmss-issueNN-view-slug-viewid.png
```

For example: `20261117-033000-issue42-arquitectura-negocio-a1b2c3.png`. Each execution also writes `issueNN-runRUNID-manifest.json`, containing the issue/run IDs, UTC timestamp, model name and SHA-256, view and thumbnail counts, per-view identifiers and filenames, errors, and pinned tool versions. Re-publishing a run is idempotent and will not overwrite different existing results.

Thumbnails preserve the diagram's aspect ratio, are not enlarged, and are limited to 1200 pixels on the longest side by default. Workflow limits are configurable through `MAX_MODEL_BYTES` (100 MiB), `MAX_VIEWS` (100), `MAX_THUMBNAIL_DIMENSION` (1200), `MAX_OUTPUT_BYTES` (500 MiB) and `ARCHI_TIMEOUT_MS` (240000). Each setting is range-checked before use.

## Requirements and local development

- Node.js 20 or newer and npm.
- Docker Engine for local Archi processing. GitHub-hosted `ubuntu-latest` runners provide Docker for Actions.
- GitHub Actions enabled; the repository's Actions settings must allow `GITHUB_TOKEN` to write repository contents and Issues. No PAT is used.

```sh
npm ci
npm run check
RUN_ARCHI_INTEGRATION=1 npm test
```

The integration test loads a real native model, runs Archi, extracts every view, generates PNGs and checks the manifest/image outputs. CI runs it on `ubuntu-latest` with the pinned runtime image. The `dist/` directory is intentionally committed; the temporary Actions artifact is only transport between the isolated workflows and expires after seven days.

## Security

- The processing workflow has only `contents: read` and `issues: read`; it receives no write token. Archi runs in the unprivileged `archi-runtime` container and no model-provided scripts or commands are executed.
- Attachment downloads accept HTTPS GitHub upload URLs only, reject disallowed redirects, stream the model under a size cap, validate native Archi XML, and use isolated temporary directories with a fixed output filename. DTD/entity declarations are rejected.
- The publisher accepts artifacts only from the expected workflow/run/repository and validates metadata, filenames, file sizes and decodability before copying. Artifact contents are never executed. Concurrent branch updates are retried with fetch/rebase/push; same-run publication is idempotent. The write-capable token is used only in the publisher workflow and is not persisted in Git configuration.
- The default model limit is 100 MiB and the view limit is 100. Processing has a 15-minute workflow timeout; Archi has a 4-minute timeout.

## GitHub Actions configuration

Enable Actions. An organization administrator must allow repository workflows to request `GITHUB_TOKEN` write permissions; then set **Repository Settings → Actions → General → Workflow permissions** to read/write. The workflows still declare least-privilege permissions individually: processing is read-only and only the publisher requests `contents: write` and `issues: write`. Branch protection must permit the repository Actions token to push to the default branch, or publication will fail and the Issue will remain open. No PAT or external database/service is required. If organization policy disables workflow write tokens, repository administrators cannot override it; publishing cannot work until the organization policy is changed.

## Troubleshooting and known limits

- **No attachment / invalid model:** attach one `.archimate.txt` copy directly to the Issue using GitHub's upload control. Ensure the contents are still the original ArchiMate XML; do not upload a ZIP.
- **Unsupported or corrupt model:** open and save the file with Archi, then upload it again. The model is treated as untrusted data and must not rely on scripts.
- **No diagrams in the report:** only views that Archi renders as diagram images are exportable; empty or non-diagram views do not get fabricated thumbnails.
- **Timeout or runner limits:** try a smaller model or reduce the number of views. Model size, view count, image size and execution time are capped.
- **Push denied:** check the repository Actions token setting and branch protection for the default branch.
- `archi-runtime` v0.1.0's report path is proven for native `.archimate` files; the separate `--modelrepository.loadModel` option is for coArchi repository folders and is not used here.
- End-to-end Issue creation/publication requires the workflows to be pushed and run on GitHub; local integration testing cannot validate repository-specific branch policies or Actions settings.

## References

- [archi-runtime](https://github.com/Continuous-DrivenArchitecture/archi-runtime)
- [Archi – The ArchiMate Modelling Tool](https://www.archimatetool.com/)
