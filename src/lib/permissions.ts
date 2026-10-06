export const PERMISSIONS = {
    ADMIN_ACCESS: 'admin.access',
    MEMBERS_MANAGE: 'members.manage',
  } as const;
  
  export function hasPermission(
    permissions: string[],
    permission: string
  ): boolean {
    return permissions.includes(permission);
  }
  
  export function isAdmin(
    permissions: string[]
  ): boolean {
    return hasPermission(
      permissions,
      PERMISSIONS.ADMIN_ACCESS
    );
  }