import { icon, renderIcons } from '../../icons.js';
import { api } from '../../api.js';
import { getState } from '../../auth.js';
import { can, ROLE_LABELS } from '../../permissions.js';
import { initials, esc } from '../../format.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { dataTable } from '../../ui/dataTable.js';
import { pagination } from '../../ui/pagination.js';
import { statusBadge } from '../../ui/statusBadge.js';
import { navigate } from '../../router.js';
import { openAddEmployeeModal } from './addEmployeeModal.js';
import { render as renderDepartmentsPanel } from './departmentsPanel.js';

const PAGE_SIZE = 25;

export function render(container) {
  const user = getState().user;
  const canManageOrgStructure = can(user, 'DEPARTMENTS', 'MANAGE') || can(user, 'DESIGNATIONS', 'MANAGE');
  const local = { search: '', page: 1, tab: 'employees', employees: [], total: 0, loading: true };
  let searchDebounce = null;

  async function load() {
    local.loading = true;
    drawTable();
    const params = new URLSearchParams({ page: String(local.page), pageSize: String(PAGE_SIZE) });
    if (local.search) params.set('search', local.search);
    const res = await api.get(`/employees?${params.toString()}`);
    local.employees = res.data.employees;
    local.total = res.data.total ?? 0;
    local.loading = false;
    drawTable();
  }

  function draw() {
    container.innerHTML = `
      ${pageHeader({
        title: user.role === 'MANAGER' ? 'My Team' : 'Employees',
        subtitle: 'Directory of employee profiles across the organization.',
        actionsHtml: can(user, 'EMPLOYEES', 'CREATE') ? `<button id="add-employee-btn" class="btn-primary" style="${local.tab === 'departments' ? 'display:none' : ''}">${icon('plus', 'h-4 w-4')} Add Employee</button>` : '',
      })}

      ${
        canManageOrgStructure
          ? `<div class="mb-4 flex gap-2 border-b border-slate-200">
              <button data-tab="employees" class="px-3 py-2 text-sm font-medium border-b-2 -mb-px ${local.tab === 'employees' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}">Employees</button>
              <button data-tab="departments" class="px-3 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1 ${local.tab === 'departments' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}">
                ${icon('building-2', 'h-3.5 w-3.5')} Departments &amp; Designations
              </button>
            </div>`
          : ''
      }

      <div id="tab-content"></div>
    `;
    renderIcons();

    const addBtn = container.querySelector('#add-employee-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        openAddEmployeeModal({ onClose() {}, onCreated: () => load() });
      });
    }
    container.querySelectorAll('[data-tab]').forEach((btn) =>
      btn.addEventListener('click', () => {
        local.tab = btn.getAttribute('data-tab');
        draw();
      })
    );

    if (local.tab === 'departments') {
      renderDepartmentsPanel(container.querySelector('#tab-content'));
    } else {
      drawEmployeesTab();
    }
  }

  function drawEmployeesTab() {
    const tabContent = container.querySelector('#tab-content');
    tabContent.innerHTML = `
      <div class="card">
        <div class="mb-4 flex items-center gap-2">
          <div class="relative w-full max-w-xs">
            ${icon('search', 'absolute left-3 top-2.5 h-4 w-4 text-slate-400')}
            <input id="search-input" class="input pl-9" placeholder="Search employees..." value="${esc(local.search)}" />
          </div>
        </div>
        <div id="employees-table"></div>
        <div id="employees-pagination"></div>
      </div>
    `;
    renderIcons();

    const searchInput = tabContent.querySelector('#search-input');
    searchInput.addEventListener('input', () => {
      local.search = searchInput.value;
      local.page = 1;
      if (searchDebounce) clearTimeout(searchDebounce);
      searchDebounce = setTimeout(load, 300);
    });

    drawTable();
  }

  function drawTable() {
    const tableEl = container.querySelector('#employees-table');
    const pagEl = container.querySelector('#employees-pagination');
    if (!tableEl) return;

    tableEl.innerHTML = dataTable({
      loading: local.loading,
      data: local.employees,
      keyFn: (e) => e.id,
      emptyMessage: 'No employees found.',
      columns: [
        {
          header: 'Employee',
          accessor: (e) => `
            <div class="flex items-center gap-3 cursor-pointer" data-view="${e.id}">
              <div class="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-semibold">${esc(initials(e.firstName, e.lastName))}</div>
              <div>
                <p class="font-medium text-slate-800">${esc(e.firstName)} ${esc(e.lastName)}</p>
                <p class="text-xs text-slate-400">${esc(e.employeeCode)}</p>
              </div>
            </div>`,
        },
        { header: 'Department', accessor: (e) => esc(e.department?.name ?? '—') },
        { header: 'Designation', accessor: (e) => esc(e.designation?.title ?? '—') },
        { header: 'Role', accessor: (e) => esc(ROLE_LABELS[e.role] ?? e.role) },
        { header: 'Status', accessor: (e) => statusBadge(e.status) },
        { header: '', accessor: (e) => `<button class="text-brand-600 hover:text-brand-700 text-sm font-medium" data-view="${e.id}">View</button>` },
      ],
    });

    if (pagEl) pagEl.innerHTML = pagination({ page: local.page, pageSize: PAGE_SIZE, total: local.total });
    renderIcons();

    tableEl.querySelectorAll('[data-view]').forEach((el) => el.addEventListener('click', () => navigate(`/employees/${el.getAttribute('data-view')}`)));
    if (pagEl) {
      const prev = pagEl.querySelector('[data-action="prev-page"]');
      const next = pagEl.querySelector('[data-action="next-page"]');
      if (prev) prev.addEventListener('click', () => { local.page -= 1; load(); });
      if (next) next.addEventListener('click', () => { local.page += 1; load(); });
    }
  }

  draw();
  load();
}
