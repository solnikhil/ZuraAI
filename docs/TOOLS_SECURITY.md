# Built-in Tool Security

Built-in tools execute privileged main-process operations. Treat every tool call and every renderer value as attacker-controlled until main has validated it.

## Separate data from authority

Model-visible tool arguments describe the requested operation. They must never carry permission to perform it.

Invalid model argument examples include:

- `autoApprove`
- `approvalToken`
- `_agentSkills`
- Renderer settings that claim an operation is trusted
- Background-window run IDs, sender IDs, process identities, or overlay placement data

Each model-facing schema is closed and main rejects reserved authority properties before dispatch. Do not strip them silently: rejection makes provider/schema drift visible.

Provider and main-boundary schema validation share the CSP-safe interpreter in
`packages/provider-core/src/jsonSchema.ts`. It performs no runtime code generation, coercion,
property removal, or default insertion. Do not reintroduce Ajv runtime compilation into renderer
tool parsing or weaken `script-src` with `unsafe-eval`; unsupported standard validation keywords
must produce a schema-definition failure.

Approval authority is a separate main-owned execution context. After an explicit approval or a main-verified exact-repeat trust match, main issues a short-lived one-use token bound to:

- Sender webContents ID
- Exact built-in tool name
- Canonical hash of the exact validated arguments

Main consumes the token before dispatch. Reuse, expiry, sender mismatch, tool mismatch, or argument mismatch fails closed and follows the normal approval path.

## Trust and persistence

Trusted exact-repeat decisions store only main-generated argument signatures. Raw approval tokens are never persisted. Renderer localStorage is not an authority source for code, terminal, native UI, filesystem, or Computer Use actions.

## Background-window authority

`background_window_attach` is an approval-gated request to reserve one exact external HWND. Main resolves and stores `{hwnd, pid, processStartTime}` and binds it to the trusted sender plus opaque chat-run ID carried outside model arguments. Status, release, UI observation, and element mutation must match that owner. HWND reuse, process mismatch, stale elements, target loss, and renderer destruction fail closed and release the guard.

While the reservation is active, main scopes `computer_screenshot` to the reserved HWND regardless of model-provided title/app filters and returns a typed `screenshot_unavailable` blocked result when Windows does not expose a capturable surface. Main rejects `window_focus` with `foreground_required`; foreground focus is available only after the run explicitly releases its background reservation.

`ui_get_app_state` treats its accessibility tree and targeted image as separate observations. If UI Automation successfully reads the reserved target but Electron exposes no matching window capture source, the tool returns the valid tree with typed `screenshot_unavailable` metadata. It never substitutes a full-screen image, and coordinate actions remain unavailable until a separate targeted screenshot succeeds.

Physical Computer Use actions are grounded in a main-issued screenshot ID scoped to the trusted
sender and opaque chat-run ID. Main rejects missing, stale, or cross-run screenshot IDs, rotates the
ID after every action, recaptures the same target, and reports whether the image changed. The
renderer/model cannot transfer coordinate authority between runs or windows.

For a click grounded in a targeted window capture, main also retains the parsed HWND and verified capture bounds outside model arguments. Immediately before input, a fixed helper restores and foregrounds that exact HWND, confirms it remains the foreground window, rejects any bounds change, and resolves `WindowFromPoint` through `GetAncestor(GA_ROOT)` to confirm the coordinate is currently inside the same top-level window. This supports embedded controls owned by child processes while rejecting unrelated overlays. Any failed check sends no mouse event and requires a fresh targeted screenshot. Successful delivery evidence proves only that input was sent inside the target app; focus changes and pixel differences are not proof of the requested semantic outcome.

Background-safe UI Automation is pattern-only. Invoke, Value, SelectionItem/Toggle, and Scroll may execute without shared input; missing patterns return `foreground_required`. Never silently fall back to focus, clipboard paste, global keyboard input, cursor movement, coordinate clicks, wheel input, arbitrary window messages, or renderer-provided PowerShell. An approved physical `computer_*` action releases the guard first.

When an exact-HWND UI Automation snapshot contains no actionable descendants, main may query a bounded Microsoft Active Accessibility (MSAA) compatibility tree and merge provider-advertised controls into the result. MSAA IDs remain opaque and main-owned. A legacy default action is allowed only after main re-resolves the path and revalidates the target HWND/process plus the element role and name; arbitrary window messages and caller-provided scripts remain forbidden.

Windows Computer Use screenshots also return a typed OCR observation when the platform OCR service is available. Main writes only a randomly named, upscaled PNG beneath the OS temporary directory, invokes a fixed bounded Windows OCR script, caps the returned lines, and removes the file immediately. OCR bounds use screenshot coordinates and every OCR element is marked `background_safe: false`; OCR provides visual grounding for an approved physical action but never authorizes background input. OCR failure is surfaced as `status: unavailable` without invalidating the screenshot.

Disabling a prompt in renderer settings must not bypass main approval unless the product adds a separately reviewed main-owned policy and documents it in `AGENTS.md`.

## Contributor checklist

For every new or changed built-in tool:

1. Add the exact name to the cross-process built-in contract.
2. Define a complete closed JSON Schema with explicit bounds.
3. Add main runtime validation tests, including additional and reserved properties.
4. Keep approval state outside model arguments.
5. Require approval for mutating or high-risk operations.
6. Bind any approval authorization to exact validated arguments.
7. Return sanitized, bounded results.
8. Test forged, reused, expired, wrong-sender, and wrong-argument authorization attempts where applicable.

See `docs/CREATING_BUILTIN_TOOLS.md` for the mechanical workflow and `docs/IPC.md` for the cross-process boundary.
