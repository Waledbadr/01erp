---
name: tenant-security
description: Enforce company isolation, scoped permissions, auditing, and secret handling in server features.
---

# Tenant security

Read before any company-owned query or action. Derive companyId from an authenticated, verified membership; never trust a client-supplied tenant identifier alone. Require central scoped query helpers and enforce companyId on reads, writes, joins, background jobs, cache keys, search, storage paths, API keys, and exports. Use composite foreign keys/uniques where needed to prevent cross-company references. Permission convention is resource.action with company, branch, and warehouse scopes; deny by default and check server-side before queries that reveal restricted cost or margin.

Encrypt secrets at rest or use a secret manager. Do not log or return tokens, passwords, private keys, CSIDs, or raw API keys. Audit event includes actor, company, session/device/IP, time, action, entity, before/after redacted values, and reason; protect audit records from ordinary deletion. Uploads enforce size, extension, detected content type, and content validation, store under opaque names, and never execute uploaded content. Test cross-tenant denial for every module.
