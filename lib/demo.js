import sample from './demo-data.json';

const storageKey = 'tonasa_demo_data_v1';
const demoAdmin = { id: 1, name: 'Admin Demo', email: 'admin@example.test', role: 'admin_utama' };

export function startDemo() {
  const admin = getData().users.find(user => user.id === demoAdmin.id);
  localStorage.setItem('tonasa_token', `demo-${admin.id}`);
  localStorage.setItem('tonasa_user', JSON.stringify(admin));
}

function getData() {
  const stored = localStorage.getItem(storageKey);
  if (stored) return JSON.parse(stored);

  const date = '2026-01-01T09:00:00.000Z';
  const assets = sample.assets.map((asset, index) => ({
    ...asset, id: index + 1, equipment_number: `EQ-DEMO-${index + 1}`,
    created_at: date, added_date: date, created_by: demoAdmin.id,
  }));
  return {
    categories: sample.categories,
    assets,
    users: [demoAdmin, { id: 2, name: 'Operator Demo', email: 'operator@example.test', role: 'user' }],
    logs: assets.map(asset => ({
      id: asset.id, asset_id: asset.id, field_changed: 'asset_created',
      changed_by: demoAdmin.id, changed_at: date, new_value: asset.name,
    })).reverse(),
  };
}

function matches(record, search) {
  return !search || Object.values(record).some(value => String(value ?? '').toLowerCase().includes(search.toLowerCase()));
}

function paginate(records, query) {
  const limit = Math.max(1, Number(query.get('limit')) || 100);
  const offset = (Math.max(1, Number(query.get('page')) || 1) - 1) * limit;
  const filtered = records.filter(record => matches(record, query.get('search')));
  return { data: filtered.slice(offset, offset + limit), total: filtered.length };
}

function nextId(records) {
  return Math.max(0, ...records.map(record => record.id)) + 1;
}

function counts(records, field) {
  const output = {};
  for (const record of records) output[record[field]] = (output[record[field]] || 0) + 1;
  return output;
}

const json = (data, status = 200) => Response.json(data, { status });

export async function demoRequest(url, options) {
  const { pathname, searchParams: query } = new URL(url, window.location.origin);
  const [, , resource, target, action, suffix] = pathname.split('/');
  const method = options.method || 'GET';
  const body = options.body ? JSON.parse(options.body) : {};
  const data = getData();
  const userId = Number(options.headers?.Authorization?.match(/^Bearer demo-(\d+)$/)?.[1]);
  const user = data.users.find(row => row.id === userId && !row.is_deleted);
  if (!user) return json({ message: 'Buka kembali sesi demo.' }, 401);

  const active = data.assets.filter(asset => !asset.is_deleted);
  const approved = active.filter(asset => asset.status_approval === 'Approved');
  const pending = active.filter(asset => asset.status_approval === 'Pending');
  const asset = data.assets.find(row => row.id === Number(target));
  const listedUser = data.users.find(row => row.id === Number(target));
  const now = new Date().toISOString();
  const decorateAsset = row => ({
    ...row,
    category_name: data.categories.find(category => category.id === Number(row.category_id))?.name,
    created_by_name: data.users.find(actor => actor.id === row.created_by)?.name,
    deleted_by_name: data.users.find(actor => actor.id === row.deleted_by)?.name,
  });
  const decorateLog = row => {
    const linkedAsset = data.assets.find(item => item.id === row.asset_id);
    const actor = data.users.find(item => item.id === row.changed_by)?.name;
    return {
      ...row, actor_name: actor, changed_by_name: actor, username: actor,
      target_name: data.users.find(item => item.id === row.user_id)?.name,
      asset_number: linkedAsset?.asset_number, asset_name: linkedAsset?.name,
      category_id: linkedAsset?.category_id, category_name: linkedAsset && decorateAsset(linkedAsset).category_name,
    };
  };
  const log = (field_changed, old_value, new_value, reference) => {
    data.logs.unshift({ id: nextId(data.logs), ...reference, field_changed, old_value, new_value, changed_by: user.id, changed_at: now });
  };

  if (method === 'GET') {
    if (resource === 'stats') return json({
      total_aset: approved.length, kondisi_baik: approved.filter(row => row.function_status === 'Baik').length,
      kondisi_rusak: approved.filter(row => row.function_status === 'Rusak').length,
      pending_approvals: pending.length, kondisi_summary: counts(approved, 'function_status'),
      status_summary: counts(approved, 'performance_status'),
    });
    if (resource === 'categories') return json(data.categories);
    if (resource === 'notifications') return json({ count: pending.length });
    if (resource === 'approvals') return json(pending.map(decorateAsset));
    if (resource === 'auth' && target === 'profile') return json(user);
    if (resource === 'users') return json(data.users.filter(row => !row.is_deleted));
    if (resource === 'assets' && !target) return json(paginate(active.map(decorateAsset).reverse().filter(row => (
      ['function_status', 'performance_status', 'status_approval'].every(field => !query.get(field) || row[field] === query.get(field)) &&
      (!query.get('category') || Number(query.get('category')) === Number(row.category_id))
    )), query));
    if (resource === 'assets' && asset && !asset.is_deleted) return json({
      asset: decorateAsset(asset), history: data.logs.filter(row => row.asset_id === asset.id).map(decorateLog),
    });
    if (resource === 'reports') return json(paginate(data.logs.filter(row => row.asset_id).map(decorateLog).filter(row => (
      (!query.get('category') || Number(query.get('category')) === Number(row.category_id)) &&
      (!query.get('start_date') || row.changed_at.slice(0, 10) >= query.get('start_date')) &&
      (!query.get('end_date') || row.changed_at.slice(0, 10) <= query.get('end_date'))
    )), query));
    if (resource === 'history') {
      if (target === 'deleted-assets') return json(paginate(data.assets.filter(row => row.is_deleted).map(decorateAsset), query));
      if (target === 'deleted-users') return json(paginate(data.users.filter(row => row.is_deleted), query));
      if (target === 'logs') return json(paginate(data.logs.filter(row => action === 'assets' ? row.asset_id : row.user_id).map(decorateLog), query));
      return json(data.logs.slice(0, Number(query.get('limit')) || 100).map(decorateLog).map(row => ({
        ...row, action: row.field_changed === 'asset_created' ? 'Tambah Aset' : row.field_changed === 'status_approval' ? 'Persetujuan' : 'Perubahan Data',
        description: `${row.asset_name || row.target_name || 'Aset demo'} · ${row.new_value ?? ''}`, created_at: row.changed_at,
      })));
    }
    return json({ message: 'Data tidak ditemukan.' }, 404);
  }

  const selected = body.ids?.map(Number) || [];
  const isAdmin = user.role === 'admin' || user.role === 'admin_utama';
  if (resource === 'auth' && target === 'impersonate' && user.role === 'admin_utama') {
    const account = data.users.find(row => row.id === Number(action) && !row.is_deleted);
    return account ? json({ user: account, token: `demo-${account.id}` }) : json({ message: 'Pengguna tidak ditemukan.' }, 404);
  }
  if (resource === 'assets') {
    if (!target || target === 'bulk') {
      for (const entry of target === 'bulk' ? body.assets : [body]) {
        const id = nextId(data.assets);
        const number = entry.asset_number || `DEMO-${String(id).padStart(3, '0')}`;
        if (data.assets.some(row => row.asset_number === number)) return json({ message: `Nomor aset ${number} sudah digunakan.` }, 400);
        data.assets.push({
          ...entry, id, asset_number: number, added_date: now, created_at: now,
          equipment_number: entry.equipment_number || `EQ-DEMO-${id}`,
          category_id: Number(entry.category_id) || data.categories[0].id,
          status_approval: isAdmin ? 'Approved' : 'Pending', created_by: user.id,
        });
        log('asset_created', null, entry.name, { asset_id: id });
      }
    } else if (method === 'PUT' && asset) {
      if (data.assets.some(row => row.id !== asset.id && row.asset_number === body.asset_number)) return json({ message: 'Nomor aset sudah digunakan.' }, 400);
      log('name', asset.name, body.name, { asset_id: asset.id });
      Object.assign(asset, body, { category_id: Number(body.category_id), status_approval: isAdmin ? 'Approved' : 'Pending' });
    } else if (isAdmin) {
      const ids = target === 'bulk-delete' ? selected : [Number(target)];
      const remove = action !== 'restore';
      for (const row of data.assets.filter(item => ids.includes(item.id))) {
        row.is_deleted = Number(remove);
        row.deleted_at = remove ? now : null;
        row.deleted_by = remove ? user.id : null;
        log('is_deleted', remove ? '0' : '1', remove ? '1' : '0', { asset_id: row.id });
      }
    }
  } else if (resource === 'approvals' && isAdmin) {
    const ids = target.startsWith('bulk-') ? selected : [Number(target)];
    const status = (action || target).endsWith('approve') ? 'Approved' : 'Rejected';
    for (const row of active.filter(item => ids.includes(item.id))) {
      log('status_approval', row.status_approval, status, { asset_id: row.id });
      row.status_approval = status;
      row.rejection_reason = status === 'Rejected' ? body.rejection_reason : null;
    }
  } else if (resource === 'users' && user.role === 'admin_utama') {
    if (method === 'POST' && !target) {
      const id = nextId(data.users);
      data.users.push({ id, name: body.name, email: body.email, role: body.role });
      log('user_created', null, body.name, { user_id: id });
    } else if (listedUser && listedUser.id !== demoAdmin.id) {
      if (method === 'PUT') Object.assign(listedUser, { name: body.name, email: body.email, role: body.role });
      if (method === 'DELETE' || action === 'restore') {
        listedUser.is_deleted = Number(method === 'DELETE');
        listedUser.deleted_at = method === 'DELETE' ? now : null;
      }
      log('user_updated', null, listedUser.name, { user_id: listedUser.id });
    }
  } else if (resource === 'auth' && target === 'profile' && method === 'PUT') {
    Object.assign(user, { name: body.name, email: body.email });
    localStorage.setItem('tonasa_user', JSON.stringify(user));
  } else if (resource === 'history' && isAdmin && method === 'DELETE') {
    if (target === 'logs' && suffix === 'permanent') data.logs = data.logs.filter(row => !selected.includes(row.id) || !(action === 'assets' ? row.asset_id : row.user_id));
    if (target === 'assets' || target === 'users') {
      const key = target === 'assets' ? 'asset_id' : 'user_id';
      const deleted = data[target].filter(row => row.is_deleted && selected.includes(row.id)).map(row => row.id);
      data[target] = data[target].filter(row => !deleted.includes(row.id));
      data.logs = data.logs.filter(row => !deleted.includes(row[key]));
    }
  } else {
    return json({ message: 'Tindakan tidak tersedia dalam sesi demo ini.' }, 400);
  }

  try {
    localStorage.setItem(storageKey, JSON.stringify(data));
  } catch {
    return json({ message: 'Penyimpanan browser penuh. Coba foto yang lebih kecil.' }, 400);
  }
  window.dispatchEvent(new Event('ASSET_CHANGED'));
  return json({ message: 'Perubahan demo tersimpan.', user });
}
