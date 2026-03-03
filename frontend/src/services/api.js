import axios from 'axios'

const API_BASE_URL = '/api'

const api = axios.create({
  baseURL: API_BASE_URL
})

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle 401 responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  verifyEmail: (data) => api.post('/auth/verify-email', data)
}

export const userAPI = {
  getUser: (id) => api.get(`/users/${id}`),
  updateUser: (id, data) => api.put(`/users/${id}`, data),
  deleteUser: (id) => api.delete(`/users/${id}`)
}

export const eventAPI = {
  getEvents: () => api.get('/events'),
  getEventByID: (id) => api.get(`/events/${id}`),
  createEvent: (data) => api.post('/events', data),
  updateEvent: (id, data) => api.put(`/events/${id}`, data),
  deleteEvent: (id) => api.delete(`/events/${id}`),
  getEventRegistrations: (id) => api.get(`/events/${id}/registrations`)
}

export const registrationAPI = {
  registerForEvent: (eventID, data) => api.post(`/registrations/${eventID}`, data),
  updateRegistration: (id, data) => api.put(`/registrations/${id}`, data),
  deleteRegistration: (id) => api.delete(`/registrations/${id}`)
}

export default api
