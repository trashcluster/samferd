<template>
  <div class="container">
    <div class="card" style="max-width: 600px;">
      <h1>User Profile</h1>

      <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>
      <div v-if="successMessage" class="success-message">{{ successMessage }}</div>

      <div v-if="currentUser" class="profile-info">
        <div class="form-group">
          <label>Email</label>
          <input type="email" :value="currentUser.email" disabled>
        </div>

        <div class="form-group">
          <label for="fullName">Full Name</label>
          <input v-model="form.fullName" type="text" id="fullName">
        </div>

        <div class="form-group">
          <label>Email Verified</label>
          <div :class="['status', currentUser.email_verified ? 'verified' : 'not-verified']">
            {{ currentUser.email_verified ? '✓ Verified' : '✗ Not Verified' }}
          </div>
        </div>

        <button @click="updateProfile" :disabled="isUpdating">
          {{ isUpdating ? 'Saving...' : 'Save Profile' }}
        </button>
      </div>

      <h2 class="mt-2">My Registrations</h2>

      <div v-if="userRegistrations.length === 0" class="text-center">
        <p>You are not registered for any events yet.</p>
        <router-link to="/" class="btn">Browse Events</router-link>
      </div>

      <div v-else class="grid grid-2">
        <div v-for="reg in userRegistrations" :key="reg.id" class="reg-card">
          <h3>{{ reg.event_title }}</h3>
          <p><strong>Transport:</strong> {{ reg.transport_type }}</p>
          <p><strong>Booking Ref:</strong> {{ reg.booking_reference || 'N/A' }}</p>
          <router-link :to="'/events/' + reg.event_id" class="btn">View Event</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()

const currentUser = computed(() => authStore.user)
const form = ref({
  fullName: ''
})

const userRegistrations = ref([])
const errorMessage = ref('')
const successMessage = ref('')
const isUpdating = ref(false)

const updateProfile = async () => {
  try {
    isUpdating.value = true
    // TODO: Implement profile update API call
    successMessage.value = 'Profile updated successfully'
    setTimeout(() => (successMessage.value = ''), 3000)
  } catch (error) {
    errorMessage.value = 'Failed to update profile'
  } finally {
    isUpdating.value = false
  }
}

onMounted(() => {
  if (currentUser.value) {
    form.value.fullName = currentUser.value.full_name
  }
  // TODO: Fetch user registrations
})
</script>

<style scoped>
.profile-info {
  margin-bottom: 2rem;
}

.status {
  padding: 0.5rem 1rem;
  border-radius: 4px;
  font-weight: bold;
}

.status.verified {
  background-color: #d4edda;
  color: #155724;
}

.status.not-verified {
  background-color: #f8d7da;
  color: #721c24;
}

.reg-card {
  background-color: #f9f9f9;
  padding: 1rem;
  border-left: 4px solid #3498db;
  border-radius: 4px;
}

.btn {
  display: inline-block;
  padding: 0.5rem 1rem;
  background-color: #3498db;
  color: white;
  border-radius: 4px;
  text-decoration: none;
  margin-top: 0.5rem;
}

.btn:hover {
  background-color: #2980b9;
  text-decoration: none;
}
</style>
