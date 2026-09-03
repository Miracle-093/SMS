INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role.id, permission.id
FROM "Role" role
JOIN "Permission" permission ON permission.key IN ('dashboard.read', 'marks.entry')
WHERE (role.name = 'Teacher' AND permission.key = 'dashboard.read')
   OR (role.name = 'Class Teacher' AND permission.key IN ('dashboard.read', 'marks.entry'))
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
