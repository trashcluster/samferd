<template>
  <div class="container">
    <div class="card" style="max-width: 500px; margin: 3rem auto; text-align: center;">
      <h1>Email Verification</h1>
      
      <div v-if="status === 'verifying'" class="text-center">
        <p>Verifying your email...</p>
      </div>

      <div v-if="status === 'success'" class="success-message">
        <h2>✓ Email Verified!</h2>
        <p>Your email has been successfully verified. You can now log in.</p>
        <router-link to="/login" class="btn">Go to Login</router-link>
      </div>

      <div v-if="status === 'error'" class="error-message">
        <h2>✗ Verification Failed</h2>
        <p>{{ errorMessage }}</p>
        <router-link to="/login" class="btn">Go to Login</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const status = ref('verifying')
const errorMessage = ref('')

onMounted(async () => {
  try {
    const token = route.query.token
    if (!token) {
      status.value = 'error'
      errorMessage.value = 'No verification token provided'
      return
    }

    await authStore.verifyEmail(token)
    status.value = 'success'
    setTimeout(() => router.push('/login'), 3000)
  } catch (error) {
    status.value = 'error'
    errorMessage.value = error.response?.data?.error || 'Email verification failed'
  }
})
</script>

<style scoped>
.btn {
  display: inline-block;
  padding: 0.75rem 1.5rem;
  background-color: #3498db;
  color: white;
  border-radius: 4px;
  text-decoration: none;
  margin-top: 1rem;
}

.btn:hover {
  background-color: #2980b9;
  text-decoration: none;
}
</style>
