const permissions = require("../permissions");

test('User permissions are correctly defined', () => {
    expect(permissions.MANAGER_PERMISSIONS).toStrictEqual(5);
    expect(permissions.TEACHER_PERMISSIONS).toStrictEqual(4);
    expect(permissions.MOD_PERMISSIONS).toStrictEqual(3);
    expect(permissions.STUDENT_PERMISSIONS).toStrictEqual(2);
    expect(permissions.GUEST_PERMISSIONS).toStrictEqual(1);
    expect(permissions.BANNED_PERMISSIONS).toStrictEqual(0);
});