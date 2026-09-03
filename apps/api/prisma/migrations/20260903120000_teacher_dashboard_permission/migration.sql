INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role.id, permission.id
FROM "Role" role
JOIN "Permission" permission ON permission.key = 'dashboard.read'
WHERE role.name IN ('Teacher', 'Class Teacher')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
