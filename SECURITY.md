# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security issue, report it privately by emailing:

[155098676+DreadHeadHippy@users.noreply.github.com](mailto:155098676+DreadHeadHippy@users.noreply.github.com)

Include as much detail as possible:

- A description of the vulnerability
- Steps to reproduce or a proof-of-concept
- Potential impact assessment
- Any suggested mitigations (optional)

You can expect an acknowledgement within **72 hours** and a resolution or status update within **14 days**.

## Scope

Security reports are relevant for issues in this plugin that could affect users running it in their Stream Deck environment, such as:

- Unvalidated WebSocket host/port inputs leading to SSRF
- Credentials (OBS WebSocket passwords) being leaked in logs or storage
- Malicious workflow payloads executing unintended system commands
- Dependency vulnerabilities with a clear exploitation path

Out of scope: vulnerabilities in OBS Studio itself, the Elgato Stream Deck software, or unrelated third-party packages with no direct exploitation path through this plugin.

## Disclosure Policy

Once a fix is ready and released, we will publicly disclose the vulnerability details in the release notes, crediting the reporter (unless anonymity is requested).
