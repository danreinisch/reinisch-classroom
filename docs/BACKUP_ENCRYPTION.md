# Backup Encryption Guide

This document provides guidance on encrypting backups created by `scripts/create-backup.sh`.

## Why Encrypt Backups?

While the backup script is designed to **never include secret values**, backups still contain sensitive information that should be protected:

- Project structure and file organization
- Code and configuration files
- Database schema and table structures
- Environment variable names (which can reveal infrastructure details)

Encryption adds an additional layer of security, especially when:
- Storing backups in cloud storage
- Transferring backups over the network
- Sharing backups with team members
- Archiving backups for long-term storage

## Recommended Encryption Methods

### Method 1: age (Recommended)

[age](https://github.com/FiloSottile/age) is a modern, simple file encryption tool with a focus on usability.

**Pros:**
- Simple command-line interface
- Strong encryption (ChaCha20-Poly1305)
- Support for SSH keys and passphrase
- Cross-platform (Windows, macOS, Linux)
- Small, auditable codebase

**Installation:**

```bash
# macOS
brew install age

# Ubuntu/Debian
sudo apt install age

# Or download from https://github.com/FiloSottile/age/releases
```

**Encrypt a backup:**

```bash
# Create backup
./scripts/create-backup.sh

# Encrypt with passphrase
tar czf - backups/reinisch-classroom-backup-TIMESTAMP/ | \
  age -p > backup-encrypted.tar.gz.age

# Or encrypt with a public key
tar czf - backups/reinisch-classroom-backup-TIMESTAMP/ | \
  age -r age1your_public_key_here > backup-encrypted.tar.gz.age

# Or encrypt for multiple recipients
tar czf - backups/reinisch-classroom-backup-TIMESTAMP/ | \
  age -r age1recipient1... -r age1recipient2... > backup-encrypted.tar.gz.age
```

**Decrypt a backup:**

```bash
# Decrypt with passphrase
age -d backup-encrypted.tar.gz.age | tar xzf -

# Or decrypt with private key
age -d -i ~/.age/key.txt backup-encrypted.tar.gz.age | tar xzf -
```

**Key Management:**

```bash
# Generate age key pair
age-keygen -o ~/.age/key.txt

# View public key
age-keygen -y ~/.age/key.txt
```

---

### Method 2: GPG (GNU Privacy Guard)

GPG is a well-established encryption tool based on OpenPGP standard.

**Pros:**
- Widely available on most systems
- Supports asymmetric encryption
- Strong key management
- Industry standard

**Cons:**
- More complex than age
- Steeper learning curve

**Encrypt a backup:**

```bash
# Create backup
./scripts/create-backup.sh

# Encrypt with passphrase
tar czf - backups/reinisch-classroom-backup-TIMESTAMP/ | \
  gpg -c --cipher-algo AES256 > backup-encrypted.tar.gz.gpg

# Or encrypt with public key
tar czf - backups/reinisch-classroom-backup-TIMESTAMP/ | \
  gpg -e -r your-email@example.com > backup-encrypted.tar.gz.gpg

# Or encrypt for multiple recipients
tar czf - backups/reinisch-classroom-backup-TIMESTAMP/ | \
  gpg -e -r person1@example.com -r person2@example.com > backup-encrypted.tar.gz.gpg
```

**Decrypt a backup:**

```bash
# Decrypt
gpg -d backup-encrypted.tar.gz.gpg | tar xzf -
```

---

### Method 3: OpenSSL

OpenSSL is available on most Unix-like systems by default.

**Pros:**
- Usually pre-installed
- No additional dependencies
- Good for quick encryption

**Cons:**
- Command-line interface can be confusing
- No built-in public key encryption (symmetric only)
- Less user-friendly than age

**Encrypt a backup:**

```bash
# Create backup
./scripts/create-backup.sh

# Encrypt with AES-256
tar czf - backups/reinisch-classroom-backup-TIMESTAMP/ | \
  openssl enc -aes-256-cbc -pbkdf2 -salt > backup-encrypted.tar.gz.enc
```

**Decrypt a backup:**

```bash
# Decrypt
openssl enc -d -aes-256-cbc -pbkdf2 -salt -in backup-encrypted.tar.gz.enc | tar xzf -
```

---

### Method 4: zip with Encryption

If you need Windows compatibility, encrypted zip files are a good option.

**Pros:**
- Cross-platform
- Easy to use
- No additional tools on Windows

**Cons:**
- Traditional zip encryption (ZipCrypto) is weak
- Must use zip 3.0+ with AES for strong encryption
- Not recommended for high-security needs

**Encrypt a backup:**

```bash
# Requires zip with AES support
cd backups
zip -r -e ../backup-encrypted.zip reinisch-classroom-backup-TIMESTAMP/
```

**Decrypt a backup:**

```bash
# Extract encrypted zip
unzip backup-encrypted.zip
```

**Note:** For maximum security with zip, use 7-Zip which supports AES-256:

```bash
# Encrypt with 7-Zip (AES-256)
7z a -p -mhe=on backup-encrypted.7z backups/reinisch-classroom-backup-TIMESTAMP/

# Decrypt
7z x backup-encrypted.7z
```

---

## Complete Backup Workflow

Here's a recommended complete workflow for creating and encrypting backups:

```bash
#!/bin/bash
# backup-and-encrypt.sh - Create and encrypt backup

set -euo pipefail

# Configuration
BACKUP_OUTPUT_DIR="./backups"
ENCRYPTED_OUTPUT_DIR="./encrypted-backups"
ENCRYPTION_METHOD="age"  # Options: age, gpg, openssl

# Create directories
mkdir -p "$ENCRYPTED_OUTPUT_DIR"

# 1. Create backup
echo "Creating backup..."
./scripts/create-backup.sh --output-dir "$BACKUP_OUTPUT_DIR"

# Find the latest backup
LATEST_BACKUP=$(find "$BACKUP_OUTPUT_DIR" -maxdepth 1 -type d -name "reinisch-classroom-backup-*" | sort | tail -1)
BACKUP_NAME=$(basename "$LATEST_BACKUP")

echo "Backup created: $BACKUP_NAME"

# 2. Encrypt backup
echo "Encrypting backup..."

case $ENCRYPTION_METHOD in
  age)
    # Using age with passphrase
    tar czf - "$LATEST_BACKUP" | \
      age -p > "$ENCRYPTED_OUTPUT_DIR/${BACKUP_NAME}.tar.gz.age"
    echo "Encrypted backup: $ENCRYPTED_OUTPUT_DIR/${BACKUP_NAME}.tar.gz.age"
    ;;
    
  gpg)
    # Using GPG with passphrase
    tar czf - "$LATEST_BACKUP" | \
      gpg -c --cipher-algo AES256 > "$ENCRYPTED_OUTPUT_DIR/${BACKUP_NAME}.tar.gz.gpg"
    echo "Encrypted backup: $ENCRYPTED_OUTPUT_DIR/${BACKUP_NAME}.tar.gz.gpg"
    ;;
    
  openssl)
    # Using OpenSSL
    tar czf - "$LATEST_BACKUP" | \
      openssl enc -aes-256-cbc -pbkdf2 -salt > "$ENCRYPTED_OUTPUT_DIR/${BACKUP_NAME}.tar.gz.enc"
    echo "Encrypted backup: $ENCRYPTED_OUTPUT_DIR/${BACKUP_NAME}.tar.gz.enc"
    ;;
    
  *)
    echo "Unknown encryption method: $ENCRYPTION_METHOD"
    exit 1
    ;;
esac

# 3. Clean up unencrypted backup (optional)
read -p "Delete unencrypted backup? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  rm -rf "$LATEST_BACKUP"
  echo "Unencrypted backup deleted"
fi

echo "Done!"
```

---

## Best Practices

### 1. Key Management

- **Store encryption keys separately** from encrypted backups
- **Use strong passphrases** (20+ characters, mix of letters, numbers, symbols)
- **Backup your keys** in a secure location (password manager, hardware token)
- **Document key locations** for disaster recovery
- **Rotate keys periodically** (yearly or after team changes)

### 2. Encryption Strategy

- **Encrypt all production backups** before storing in cloud
- **Use asymmetric encryption** (public/private keys) for team access
- **Test decryption** regularly to ensure keys work
- **Document the encryption method** used (add it to backup metadata)

### 3. Storage

- **Store encrypted backups in multiple locations**:
  - Local encrypted storage
  - Cloud storage (S3, Google Cloud Storage, Azure Blob)
  - Offline storage (external drive kept off-site)
  
- **Use version control** for encrypted backups (keep multiple versions)
- **Monitor backup integrity** (check file sizes, test restores)

### 4. Access Control

- **Limit access** to encryption keys (need-to-know basis)
- **Use separate keys** for different environments (dev, staging, prod)
- **Audit key usage** (who has access to which keys)
- **Revoke keys** when team members leave

### 5. Automation

Consider automating backups with cron or systemd timers:

```bash
# Example cron job (daily at 2 AM)
0 2 * * * /path/to/backup-and-encrypt.sh >> /var/log/backup.log 2>&1
```

---

## Security Reminders

⚠️ **CRITICAL REMINDERS:**

1. **The backup script itself does NOT store secret values**
   - Environment manifests contain only variable names and lengths
   - No passwords, API keys, or credentials in backups
   
2. **Encryption protects project structure and code**
   - But won't help if keys/passphrases are compromised
   - Store keys separately from backups
   
3. **Test your restore process**
   - Regularly decrypt and restore backups to ensure they work
   - Verify integrity using the included hash inventory
   
4. **Keep multiple backup copies**
   - Follow the 3-2-1 rule: 3 copies, 2 different media, 1 off-site
   
5. **Document your encryption method**
   - Future you (or your team) needs to know how to decrypt

---

## Compliance Considerations

For environments with compliance requirements (GDPR, HIPAA, SOC 2, etc.):

- **Use FIPS 140-2 validated encryption** (AES-256)
- **Document encryption methods** in security policies
- **Implement key rotation** policies
- **Maintain encryption audit logs**
- **Use hardware security modules (HSM)** for key storage if required
- **Encrypt backups at rest and in transit**

---

## Troubleshooting

### "Wrong passphrase" error when decrypting

- Ensure you're using the correct passphrase
- Check for typos (use copy/paste if possible)
- Verify you're using the same encryption method used to encrypt

### "Corrupted archive" error

- Check backup file integrity using the file hash inventory
- Verify the encrypted file wasn't corrupted during transfer
- Try re-downloading from backup storage

### "Key not found" error (GPG)

- Import the private key: `gpg --import private-key.asc`
- Verify key ID matches: `gpg --list-keys`
- Check GPG key expiration dates

### Performance issues with large backups

- Use compression before encryption: `tar czf - ... | age -p > ...`
- Consider splitting large backups into smaller chunks
- Use faster encryption (age is generally faster than GPG)

---

## Additional Resources

- [age documentation](https://github.com/FiloSottile/age)
- [GPG documentation](https://gnupg.org/documentation/)
- [OpenSSL documentation](https://www.openssl.org/docs/)
- [Backup best practices](https://www.backblaze.com/blog/the-3-2-1-backup-strategy/)
- [Encryption best practices](https://www.nist.gov/publications/advanced-encryption-standard-aes)

---

## Quick Reference

| Method | Encrypt | Decrypt |
|--------|---------|---------|
| age (passphrase) | `tar czf - backup/ \| age -p > backup.age` | `age -d backup.age \| tar xzf -` |
| age (key) | `tar czf - backup/ \| age -r KEY > backup.age` | `age -d -i key.txt backup.age \| tar xzf -` |
| GPG (passphrase) | `tar czf - backup/ \| gpg -c > backup.gpg` | `gpg -d backup.gpg \| tar xzf -` |
| GPG (key) | `tar czf - backup/ \| gpg -e -r EMAIL > backup.gpg` | `gpg -d backup.gpg \| tar xzf -` |
| OpenSSL | `tar czf - backup/ \| openssl enc -aes-256-cbc -pbkdf2 -salt > backup.enc` | `openssl enc -d -aes-256-cbc -pbkdf2 -salt -in backup.enc \| tar xzf -` |

---

**Remember:** Encryption is only as strong as your key management. Store keys securely and test your restore process regularly!
