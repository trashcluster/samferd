<template>
  <div class="container">
    <div class="card" style="max-width: 400px; margin: 3rem auto;">
      <h1 class="text-center">Register</h1>
      
      <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>

      <form @submit.prevent="handleRegister">
        <div class="form-group">
          <label for="fullName">Full Name</label>
          <input v-model="form.fullName" type="text" id="fullName" required>
        </div>

        <div class="form-group">
          <label for="email">Email</label>
          <input v-model="form.email" type="email" id="email" required>
        </div>

        <div class="form-group">
          <label for="password">Password (min. 8 characters)</label>
          <input v-model="form.password" type="password" id="password" required>
        </div>

        <button type="submit" class="w-100" :disabled="isLoading">
          {{ isLoading ? 'Registering...' : 'Register' }}
        </button>
      </form>

      <p class="text-center mt-2">
        Already have an account?
        <router-link to="/login">Login here</router-link>
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
  fullName: '',
  email: '',
  password: ''
})

const errorMessage = ref('')
const isLoading = ref(false)

const handleRegister = async () => {
  try {
    isLoading.value = true
    errorMessage.value = ''
    await authStore.register(form.value.email, form.value.password, form.value.fullName)
    // Auto-redirect to home (email auto-verified in MVP)
    await authStore.login(form.value.email, form.value.password)
    router.push('/')
  } catch (error) {
    errorMessage.value = error.response?.data?.error || 'Registration failed'
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
