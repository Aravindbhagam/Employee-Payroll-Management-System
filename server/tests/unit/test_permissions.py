from app.permissions import ROLE_LABELS, flatten_defaults
from app.enums import RESOURCES


class TestDefaultPermissionMatrix:
    @classmethod
    def setup_class(cls):
        cls.rows = flatten_defaults()

    def allowed(self, role, resource, action):
        for r in self.rows:
            if r["role"] == role and r["resource"] == resource and r["action"] == action:
                return r["allowed"]
        return False

    def test_covers_every_combination_exactly_once(self):
        seen = set()
        for r in self.rows:
            key = f'{r["role"]}:{r["resource"]}:{r["action"]}'
            assert key not in seen
            seen.add(key)
        assert len(self.rows) == 5 * 16 * 8  # 5 roles x 16 resources x 8 actions

    def test_super_admin_view_every_resource(self):
        for resource in RESOURCES:
            assert self.allowed("SUPER_ADMIN", resource, "VIEW") is True

    def test_super_admin_full_crud_on_core_resources(self):
        for resource in ["EMPLOYEES", "PAYROLL", "SALARY_STRUCTURE", "USERS", "SETTINGS", "TAX_COMPLIANCE", "DEPARTMENTS", "DESIGNATIONS", "DOCUMENTS", "ANNOUNCEMENTS"]:
            for action in ["VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "EXPORT", "PROCESS", "MANAGE"]:
                assert self.allowed("SUPER_ADMIN", resource, action) is True

    def test_employee_never_manages_users(self):
        for action in ["VIEW", "CREATE", "EDIT", "DELETE", "MANAGE"]:
            assert self.allowed("EMPLOYEE", "USERS", action) is False

    def test_manager_cannot_process_or_approve_payroll(self):
        assert self.allowed("MANAGER", "PAYROLL", "PROCESS") is False
        assert self.allowed("MANAGER", "PAYROLL", "APPROVE") is False
        assert self.allowed("MANAGER", "PAYROLL", "VIEW") is False

    def test_hr_admin_cannot_process_payroll(self):
        assert self.allowed("HR_ADMIN", "PAYROLL", "PROCESS") is False

    def test_payroll_admin_can_process_but_not_approve(self):
        assert self.allowed("PAYROLL_ADMIN", "PAYROLL", "PROCESS") is True
        assert self.allowed("PAYROLL_ADMIN", "PAYROLL", "APPROVE") is False

    def test_manager_approves_leave_employee_does_not(self):
        assert self.allowed("MANAGER", "LEAVE", "APPROVE") is True
        assert self.allowed("EMPLOYEE", "LEAVE", "APPROVE") is False

    def test_every_role_can_apply_for_leave(self):
        for role in ["SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN", "MANAGER", "EMPLOYEE"]:
            assert self.allowed(role, "LEAVE", "CREATE") is True

    def test_every_role_has_a_label(self):
        for role in ["SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN", "MANAGER", "EMPLOYEE"]:
            assert ROLE_LABELS[role]
