# Security Model

MCP Warden reduces risk at the MCP tool-call boundary. It is a policy and observability layer, not a sandbox.

## Assets

Warden is designed to help protect:

- Local MCP client workflows.
- Tool-call audit history.
- Policy configuration.
- Sensitive input fields that may appear in tool arguments.
- Local network and metadata endpoints from accidental tool access.

## Trust Assumptions

Warden assumes:

- The local user controls the machine running Warden.
- The user can choose which MCP servers to run.
- Upstream MCP servers may be buggy, over-permissioned, or untrusted.
- The local filesystem and OS process environment are outside Warden's full control.

## Threats Addressed

| Threat                    | Mitigation                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| Over-broad tools          | Scan command, allow lists, block lists, policy modes.                                         |
| Unsafe URLs in arguments  | SSRF guard checks URL-like argument values.                                                   |
| Suspicious tool output    | Injection detector warns on known prompt-injection patterns.                                  |
| Large or sensitive output | Data leak detector warns or blocks based on size, entropy, repetition, and PII concentration. |
| Unknown tool appearance   | New tool tracking and notification support.                                                   |
| Lack of traceability      | SQLite audit logging with masked input.                                                       |

## Out of Scope

Warden does not fully protect against:

- Malicious MCP server binaries.
- Arbitrary child process behavior after a server starts.
- OS-level filesystem or network access.
- All possible prompt injection variants.
- All possible secret formats.
- Remote exposure of the dashboard if a user publishes it.

Use OS sandboxing, containers, restricted tokens, and network controls for stronger isolation.

## Policy Enforcement

Policy mode determines enforcement strength:

- `passthrough`: no enforcement.
- `audit-only`: records policy decisions but allows calls.
- `enforcing`: blocks policy violations.

For untrusted servers, use `enforcing` with explicit `allowed_tools`.

## Audit Log Sensitivity

Audit logs are local, but they can still contain sensitive operational metadata.

Recommended handling:

- Restrict access to `~/.mcp-warden`.
- Keep logs local unless explicitly exported.
- Rotate or purge logs according to your retention needs.
- Treat `warden.db` as sensitive.

## Dashboard Exposure

The dashboard is intended for local use. Do not expose it to public networks without adding authentication, transport security, and network-level access controls.

## Secure Defaults

Current defaults prioritize visibility:

- default mode: `audit-only`
- new tool alerts: enabled
- local SQLite storage

For stricter environments, configure server-specific `enforcing` policies.
