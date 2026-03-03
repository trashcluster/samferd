import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authAPI } from '../services/api'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const token = ref(null)

  const isAuthenticated = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.is_admin || false)

  const register = async (email, password, fullName) => {
    const response = await authAPI.register({ email, password, full_name: fullName })
    return response.data
  }

  const login = async (email, password) => {
    const response = await authAPI.login({ email, password })
    token.value = response.data.token
    user.value = response.data.user
    localStorage.setItem('token', token.value)
    localStorage.setItem('user', JSON.stringify(user.value))
    return response.data
  }

  const logout = () => {
    token.value = null
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  const restoreSession = () => {
    const savedToken = localStorage.getItem('token')
    const savedUser = localStorage.getItem('user')
    if (savedToken && savedUser) {
      token.value = savedToken
      user.value = JSON.parse(savedUser)
    }
  }

  const verifyEmail = async (verificationToken) => {
    await authAPI.verifyEmail({ token: verificationToken })
  }

  return {
    user,
    token,
    isAuthenticated,
    isAdmin,
    register,
    login,
    logout,
    restoreSession,
    verifyEmail
  }
})
