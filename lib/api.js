const API_BASE = '/api';

async function request(url, options) {
  if (process.env.NEXT_PUBLIC_PORTFOLIO_DEMO === 'true') {
    const { demoRequest } = await import('./demo');
    return demoRequest(url, options);
  }
  return fetch(url, options);
}

export async function apiGet(endpoint, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await request(`${API_BASE}${endpoint}`, { headers });
  
  if (res.status === 401 || res.status === 403) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('tonasa_token');
      localStorage.removeItem('tonasa_user');
      window.location.href = '/login';
    }
    return null;
  }
  
  if (!res.ok) {
    let errorData = {};
    try {
      errorData = await res.json();
    } catch (e) {
      // Not JSON
    }
    throw new Error(errorData.message || errorData.error || `HTTP Error ${res.status}`);
  }
  
  const data = await res.json();
  return data;
}

export async function apiPost(endpoint, body, token, method = 'POST') {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await request(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: JSON.stringify(body),
  });
  
  if (res.status === 401 || res.status === 403) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('tonasa_token');
      localStorage.removeItem('tonasa_user');
      window.location.href = '/login';
    }
  }
  
  return res;
}

export async function apiPut(endpoint, body, token) {
  return apiPost(endpoint, body, token, 'PUT');
}


export async function apiDelete(endpoint, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await request(`${API_BASE}${endpoint}`, { method: 'DELETE', headers });
  
  if (res.status === 401 || res.status === 403) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('tonasa_token');
      localStorage.removeItem('tonasa_user');
      window.location.href = '/login';
    }
  }
  
  return res;
}
