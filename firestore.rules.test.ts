/**
 * Payload-First Security TDD specification for /monolith_notes/{noteId}.
 * Verifies all 12 Dirty Dozen adversarial payloads against firestore.rules
 * when executed with @firebase/rules-unit-testing against the Firestore emulator.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  operation: 'create' | 'get' | 'list' | 'update' | 'delete';
  authUid: string | null;
  emailVerified: boolean;
  docId: string;
  existingOwnerId?: string;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated create',
    operation: 'create',
    authUid: null,
    emailVerified: false,
    docId: 'note-1',
    payload: { ownerId: 'anon', title: 'Test', body: 'Body', partName: 'Arch', color: 'amber', posX: 0, posY: 40, posZ: 10 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified email write',
    operation: 'create',
    authUid: 'userA',
    emailVerified: false,
    docId: 'note-2',
    payload: { ownerId: 'userA', title: 'Test', body: 'Body', partName: 'Arch', color: 'amber', posX: 0, posY: 40, posZ: 10 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Identity spoofing on create',
    operation: 'create',
    authUid: 'userA',
    emailVerified: true,
    docId: 'note-3',
    payload: { ownerId: 'userB', title: 'Spoof', body: 'Body', partName: 'Arch', color: 'amber', posX: 0, posY: 40, posZ: 10 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow ghost field injection',
    operation: 'create',
    authUid: 'userA',
    emailVerified: true,
    docId: 'note-4',
    payload: { ownerId: 'userA', title: 'Ghost', body: 'Body', partName: 'Arch', color: 'amber', posX: 0, posY: 40, posZ: 10, isAdmin: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'ID poisoning with invalid characters',
    operation: 'create',
    authUid: 'userA',
    emailVerified: true,
    docId: 'bad$id!with*symbols',
    payload: { ownerId: 'userA', title: 'Bad ID', body: 'Body', partName: 'Arch', color: 'amber', posX: 0, posY: 40, posZ: 10 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Oversized title (> 80 chars)',
    operation: 'create',
    authUid: 'userA',
    emailVerified: true,
    docId: 'note-6',
    payload: { ownerId: 'userA', title: 'A'.repeat(81), body: 'Body', partName: 'Arch', color: 'amber', posX: 0, posY: 40, posZ: 10 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Oversized body (> 1000 chars)',
    operation: 'create',
    authUid: 'userA',
    emailVerified: true,
    docId: 'note-7',
    payload: { ownerId: 'userA', title: 'Big', body: 'B'.repeat(1001), partName: 'Arch', color: 'amber', posX: 0, posY: 40, posZ: 10 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Invalid color enum',
    operation: 'create',
    authUid: 'userA',
    emailVerified: true,
    docId: 'note-8',
    payload: { ownerId: 'userA', title: 'Bad Color', body: 'Body', partName: 'Arch', color: 'magenta', posX: 0, posY: 40, posZ: 10 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Client-spoofed timestamp',
    operation: 'create',
    authUid: 'userA',
    emailVerified: true,
    docId: 'note-9',
    payload: { ownerId: 'userA', title: 'Old Time', body: 'Body', partName: 'Arch', color: 'amber', posX: 0, posY: 40, posZ: 10, createdAt: '2020-01-01T00:00:00Z', updatedAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Cross-user read attempt',
    operation: 'get',
    authUid: 'userB',
    emailVerified: true,
    docId: 'note-userA',
    existingOwnerId: 'userA',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Immutable ownerId reassignment on update',
    operation: 'update',
    authUid: 'userA',
    emailVerified: true,
    docId: 'note-userA',
    existingOwnerId: 'userA',
    payload: { ownerId: 'userB' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Value poisoning on allowed update field',
    operation: 'update',
    authUid: 'userA',
    emailVerified: true,
    docId: 'note-userA',
    existingOwnerId: 'userA',
    payload: { title: true, posX: 999999 },
    expected: 'PERMISSION_DENIED',
  },
];
