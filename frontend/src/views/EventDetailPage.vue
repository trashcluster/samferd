<template>
  <div class="container">
    <div v-if="loading" class="text-center">Loading...</div>

    <div v-else>
      <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>

      <!-- Event Details -->
      <div v-if="event" class="card">
        <router-link to="/">&lt; Back to Calendar</router-link>
        
        <h1>{{ event.title }}</h1>
        <p>{{ event.description }}</p>

        <div class="event-info-grid">
          <div>
            <strong>📍 Location:</strong> {{ event.location }}
          </div>
          <div>
            <strong>📅 Start:</strong> {{ formatDate(event.start_date) }}
          </div>
          <div>
            <strong>📅 End:</strong> {{ formatDate(event.end_date) }}
          </div>
          <div>
            <strong>🚗 Available Transport:</strong> {{ event.available_transports.join(', ') }}
          </div>
        </div>

        <!-- Registration Form or Status -->
        <div class="registration-section">
          <h2>Your Registration</h2>
          
          <div v-if="userRegistration">
            <div class="success-message">✓ You are registered for this event</div>
            <p><strong>Transport:</strong> {{ userRegistration.transport_type }}</p>
            <p><strong>Booking Reference:</strong> {{ userRegistration.booking_reference || 'Not provided' }}</p>
            
            <button @click="editRegistration = true" class="btn">Edit Registration</button>
            <button @click="deleteRegistrationHandler" class="btn danger">Unregister</button>
          </div>

          <div v-else-if="!editRegistration">
            <p>You haven't registered for this event yet.</p>
            <button @click="editRegistration = true" class="btn success">Register Now</button>
          </div>

          <!-- Registration Form -->
          <form v-if="editRegistration" @submit.prevent="submitRegistration" class="card mt-2">
            <h3>{{ userRegistration ? 'Update' : 'Register for' }} Event</h3>

            <div class="form-group">
              <label for="transport">Transportation Mode *</label>
              <select v-model="registrationForm.transport_type" id="transport" required>
                <option value="">-- Select --</option>
                <option v-for="transport in event.available_transports" :key="transport" :value="transport">
                  {{ transport.charAt(0).toUpperCase() + transport.slice(1) }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label for="bookingRef">Booking Reference</label>
              <input v-model="registrationForm.booking_reference" type="text" id="bookingRef" placeholder="e.g., Flight number, bus company, etc.">
            </div>

            <div class="form-group">
              <label>Booking Details (JSON)</label>
              <textarea v-model="registrationDetailsJSON" placeholder='{"seat": "12A", "airline": "United", "departure_time": "10:30"}'></textarea>
              <small>Optional: Add details like seat number, airline name, departure time, etc.</small>
            </div>

            <button type="submit" :disabled="isSubmitting">{{ isSubmitting ? 'Saving...' : 'Save Registration' }}</button>
            <button type="button" @click="editRegistration = false" class="btn" style="background-color: #95a5a6;">Cancel</button>
          </form>
        </div>
      </div>

      <!-- Event Registrations List -->
      <div v-if="event && registrations.length > 0" class="card">
        <h2>Registered Participants ({{ registrations.length }})</h2>

        <div v-for="transport in transportTypes" :key="transport" v-if="getRegistrationsByTransport(transport).length > 0">
          <h3>{{ transport.charAt(0).toUpperCase() + transport.slice(1) }} ({{ getRegistrationsByTransport(transport).length }})</h3>
          <div class="registrations-list">
            <div v-for="reg in getRegistrationsByTransport(transport)" :key="reg.id" class="registration-item">
              <div>
                <strong>{{ reg.user_full_name }}</strong>
                <p>{{ reg.user_email }}</p>
              </div>
              <div v-if="reg.booking_reference" class="booking-info">
                <small>{{ reg.booking_reference }}</small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useEventStore } from '../stores/event'

const route = useRoute()
const eventStore = useEventStore()

const loading = ref(true)
const errorMessage = ref('')
const event = ref(null)
const registrations = ref([])
const userRegistration = ref(null)
const editRegistration = ref(false)
const isSubmitting = ref(false)

const transportTypes = ['flight', 'bus', 'car', 'boat']

const registrationForm = ref({
  transport_type: '',
  booking_reference: '',
  booking_details: {}
})

const registrationDetailsJSON = ref('')

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('en-US', { 
    weekday: 'short', 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const getRegistrationsByTransport = (transport) => {
  return registrations.value.filter(r => r.transport_type === transport)
}

const submitRegistration = async () => {
  try {
    isSubmitting.value = true
    
    // Parse booking details JSON if provided
    if (registrationDetailsJSON.value) {
      try {
        registrationForm.value.booking_details = JSON.parse(registrationDetailsJSON.value)
      } catch {
        errorMessage.value = 'Invalid JSON in booking details'
        return
      }
    }

    if (userRegistration.value) {
      await eventStore.updateRegistration(userRegistration.value.id, registrationForm.value)
    } else {
      await eventStore.registerForEvent(route.params.id, registrationForm.value)
    }

    // Refresh data
    await loadEventData()
    editRegistration.value = false
    registrationForm.value = { transport_type: '', booking_reference: '', booking_details: {} }
    registrationDetailsJSON.value = ''
  } catch (error) {
    errorMessage.value = error.response?.data?.error || 'Failed to save registration'
  } finally {
    isSubmitting.value = false
  }
}

const deleteRegistrationHandler = async () => {
  if (confirm('Are you sure you want to unregister from this event?')) {
    try {
      await eventStore.deleteRegistration(userRegistration.value.id)
      userRegistration.value = null
      await loadEventData()
    } catch (error) {
      errorMessage.value = 'Failed to unregister'
    }
  }
}

const loadEventData = async () => {
  try {
    loading.value = true
    errorMessage.value = ''
    
    await eventStore.fetchEventByID(route.params.id)
    event.value = eventStore.selectedEvent
    
    await eventStore.fetchEventRegistrations(route.params.id)
    registrations.value = eventStore.registrations

    // Check if current user is registered
    const authStore = useAuthStore()
    userRegistration.value = registrations.value.find(r => r.user_id === authStore.user?.id) || null
  } catch (error) {
    errorMessage.value = 'Failed to load event details'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadEventData()
})
</script>

<script setup>
import { useAuthStore } from '../stores/auth'
</script>

<style scoped>
.event-info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
  margin: 1.5rem 0;
  padding: 1rem;
  background-color: #f0f7ff;
  border-radius: 4px;
}

.registration-section {
  margin: 2rem 0;
  padding: 1.5rem;
  background-color: #f9f9f9;
  border-radius: 4px;
}

.registrations-list {
  margin-bottom: 2rem;
}

.registration-item {
  padding: 1rem;
  background-color: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-bottom: 0.5rem;
  display: flex;
  justify-content: space-between;
}

.booking-info {
  font-style: italic;
  color: #666;
}

.btn {
  display: inline-block;
  padding: 0.5rem 1rem;
  background-color: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  margin-right: 0.5rem;
  margin-bottom: 0.5rem;
  text-decoration: none;
}

.btn:hover {
  background-color: #2980b9;
}

.btn.success {
  background-color: #27ae60;
}

.btn.success:hover {
  background-color: #229954;
}

.btn.danger {
  background-color: #e74c3c;
}

.btn.danger:hover {
  background-color: #c0392b;
}

textarea {
  width: 100%;
  min-height: 100px;
  font-family: monospace;
}

small {
  display: block;
  margin-top: 0.25rem;
  color: #666;
}
</style>
