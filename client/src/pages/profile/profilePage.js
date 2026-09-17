import { api } from '../../api.js';
import { getState } from '../../auth.js';
import { navigate } from '../../router.js';
import { fullPageSpinner } from '../../ui/spinner.js';

export async function render(container) {
  container.innerHTML = fullPageSpinner();
  const user = getState().user;
  const res = await api.get('/employees');
  const own = res.data.employees.find((e) => e.userId === user.id);

  if (!own) {
    container.innerHTML = `
      <div class="card max-w-lg">
        <p class="text-sm text-slate-500">No employee profile is linked to your account yet. Please contact your administrator.</p>
      </div>
    `;
    return;
  }

  navigate(`/employees/${own.id}`);
}
