# Backup, Disaster Recovery & Data Retention — Saudi ERP

## 1. Backup Strategy

Data safety and disaster recovery for enterprise financial records are subject to strict statutory requirements under Saudi Arabian tax and commercial law (minimum 6 years retention).

### 1.1 Backup Tiers
1. **Continuous Point-in-Time Recovery (PITR)**: Write-ahead log (WAL) archiving allowing recovery to any specific second in the past 7 days.
2. **Daily Automated Snapshots**: Complete database exports executed every 24 hours during off-peak hours (02:00 AM AST / UTC+3).
3. **Monthly Archival Backups**: Permanent end-of-month financial period snapshots retained for 6+ years.

---

## 2. Retention Policy Matrix

| Tier | Frequency | Retention Window | Storage Class | Encryption |
| :--- | :--- | :--- | :--- | :--- |
| **Hourly PITR** | Continuous | 7 Days | Hot Storage | AES-256 |
| **Daily Snapshots**| Every 24h | 30 Days | Standard Object Storage | AES-256 |
| **Weekly Snapshots**| Every Sunday | 90 Days | Standard Object Storage | AES-256 |
| **Annual Archives** | Fiscal Year Close | 6 Years (ZATCA/MCI) | Coldline / Glacier | AES-256 + KMS |

---

## 3. Restoration Protocol

1. **Permission Requirement**: Only authenticated users with the `SUPER_ADMIN` role may trigger or download database backups.
2. **Pre-Restore Snapshot**: The system automatically executes a safety snapshot of the existing database state immediately prior to initiating any restoration process.
3. **Audit Log Mandate**: Every backup generation, download, and restoration action writes an immutable record to `audit_logs` capturing user identity, IP address, timestamp, and target snapshot ID.
4. **Automated Restoration Testing**: Weekly automated restoration drills run in an isolated test environment to verify database checksums and report generation validity.
