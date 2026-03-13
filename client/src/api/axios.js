import axios from 'axios';
import { incrementPending, decrementPending } from './loadingBus';

const configuredApiUrl = (import.meta.env.VITE_API_URL || '').trim();
const baseURL = import.meta.env.DEV
    ? '/api'
    : (configuredApiUrl || 'http://localhost:5000/api');

const api = axios.create({
    baseURL,
});

api.interceptors.request.use(
    (config) => {
        const user = JSON.parse(localStorage.getItem('user'));
        if (user && user.token) {
            config.headers.Authorization = `Bearer ${user.token}`;
        }
        incrementPending();
        return config;
    },
    (error) => Promise.reject(error)
);

api.interceptors.response.use(
    (response) => {
        decrementPending();
        return response;
    },
    (error) => {
        decrementPending();
        return Promise.reject(error);
    }
);

export default api;
