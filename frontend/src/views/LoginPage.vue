<template>
  <div class="container">
    <div class="card" style="max-width: 400px; margin: 3rem auto;">
      <h1 class="text-center">Login</h1>
      
      <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>

      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label for="email">Email</label>
          <input v-model="form.email" type="email" id="email" required>
        </div>

        <div class="form-group">
          <label for="password">Password</label>
          <input v-model="form.password" type="password" id="password" required>
        </div>

        <button type="submit" class="w-100" :disabled="isLoading">
          {{ isLoading ? 'Logging in...' : 'Login' }}
        </button>
      </form>

      <p class="text-center mt-2">
        Don't have an account?
        <router-link to="/register">Register here</router-link>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const form = ref({
  email: '',
  password: ''
})

const errorMessage = ref('')
const isLoading = ref(false)

const handleLogin = async () => {
  try {
    isLoading.value = true
    errorMessage.value = ''
    await authStore.login(form.email, form.password)
    router.push('/')
  } catch (error) {
    errorMessage.value = error.response?.data?.error || 'Login failed'
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped>
.w-100 {
  width: 100%;
}
</style>
