import axios from 'axios';

const api = axios.create({
    // Use relative path by default to leverage Nginx/Vite proxy
    // This supports both HTTP and HTTPS correctly without mixed content/CORS issues
    baseURL: '',
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add token to requests
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handle authentication errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        // Don't auto-redirect on 401 for login endpoint or password change - let the component handle it
        if (error.response?.status === 401 &&
            !error.config.url.includes('/auth/login') &&
            !error.config.url.includes('/auth/password')) {
            localStorage.removeItem('auth_token');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export default api;
