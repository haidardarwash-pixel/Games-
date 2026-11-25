# Security Specification — Operation Ossuary Monolith Notes

## 1. Data Invariants

1. **Ownership Isolation**: Every document in `/monolith_notes/{noteId}` MUST have an `ownerId` matching `request.auth.uid` on creation, read (`get`/`list`), update, and delete. No user can read, list, modify, or delete another user's notes.
2. **Verified Identity**: All writes (`create`, `update`, `delete`) require an authenticated Google user with `request.auth.token.email_verified == true`.
3. **Strict Schema & Bounds**: Documents MUST contain exact required keys (`ownerId`, `title`, `body`, `partName`, `color`, `posX`, `posY`, `posZ`, `createdAt`, `updatedAt`) with zero ghost/shadow fields. String sizes are bounded (`ownerId <= 128`, `title 1..80`, `body 1..1000`, `partName 1..64`, `color` in `['amber', 'emerald', 'crimson', 'ivory']`) and numeric coordinates are bounded within the playable 3D desert world (`-500..500`).
4. **Immutability & Temporal Integrity**: `ownerId` and `createdAt` are immutable after creation. `createdAt == request.time` on create; `updatedAt == request.time` on create and update.
5. **Path Variable Hardening**: Single-document operations (`get`, `create`, `update`, `delete`) validate `isValidId(noteId)` (`^[a-zA-Z0-9_\-]+$`, max 128 chars).

## 2. The "Dirty Dozen" Adversarial Payloads (All Must Return PERMISSION_DENIED)

1. **Unauthenticated Create**: Creating a note with `auth = null`.
2. **Unverified Email Write**: Creating a note with `email_verified = false`.
3. **Identity Spoofing on Create**: User A creating a note with `ownerId: "userB"`.
4. **Shadow / Ghost Field Injection**: Creating a note containing an extra field `isAdmin: true`.
5. **ID Poisoning**: Creating a note at `/monolith_notes/invalid..id!@#$%` or > 128 chars.
6. **Oversized Title Resource Poisoning**: Creating a note with `title` length 81+ chars.
7. **Oversized Body Denial-of-Wallet**: Creating a note with `body` length 1001+ chars.
8. **Invalid Color Enum**: Creating a note with `color: "neon-pink"`.
9. **Client-Spoofed Timestamp**: Creating a note with a client-supplied timestamp instead of `request.time`.
10. **Cross-User Read / Scrape (`get` & `list`)**: User B attempting `get` or unfiltered `list` of User A's notes.
11. **Owner Reassignment / `createdAt` Tampering on Update**: User A updating `ownerId` or `createdAt` on an existing note.
12. **Value Poisoning on Update**: User A updating allowed key `title` with a boolean `true` or out-of-range coordinate `posX: 999999`.
