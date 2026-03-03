<template>
  <div class="container">
    <h1>Admin Panel</h1>

    <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>
    <div v-if="successMessage" class="success-message">{{ successMessage }}</div>

    <div class="admin-tabs">
      <button
        v-for="tab in tabs"
        :key="tab"
        @click="activeTab = tab"
        :class="['tab-button', { active: activeTab === tab }]"
      >
        {{ tab }}
      </button>
    </div>

    <!-- Create Event Tab -->
    <div v-if="activeTab === 'Create Event'" class="card">
      <h2>Create New Event</h2>

      <form @submit.prevent="createEvent">
        <div class="form-group">
          <label for="title">Title *</label>
          <input v-model="eventForm.title" type="text" id="title" required>
        </div>

        <div class="form-group">
          <label for="description">Description</label>
          <textarea v-model="eventForm.description" id="description"></textarea>
        </div>

        <div class="form-group">
          <label for="location">Location *</label>
          <input v-model="eventForm.location" type="text" id="location" required>
        </div>

        <div class="grid grid-2">
          <div class="form-group">
            <label for="startDate">Start Date *</label>
            <input v-model="eventForm.startDate" type="datetime-local" id="startDate" required>
          </div>

          <div class="form-group">
            <label for="endDate">End Date *</label>
            <input v-model="eventForm.endDate" type="datetime-local" id="endDate" required>
          </div>
        </div>

        <div class="form-group">
          <label>Available Transports *</label>
          <div class="checkbox-group">
            <label>
              <input type="checkbox" name="flight" value="flight" v-model="eventForm.transports">
              ✈️ Flight
            </label>
            <label>
              <input type="checkbox" name="bus" value="bus" v-model="eventForm.transports">
              🚌 Bus
            </label>
            <label>
              <input type="checkbox" name="car" value="car" v-model="eventForm.transports">
              🚗 Car
            </label>
            <label>
              <input type="checkbox" name="boat" value="boat" v-model="eventForm.transports">
              ⛵ Boat
            </label>
          </div>
        </div>

        <button type="submit" :disabled="isCreating" class="btn success">
          {{ isCreating ? 'Creating...' : 'Create Event' }}
        </button>
      </form>
    </div>

    <!-- Manage Events Tab -->
    <div v-if="activeTab === 'Manage Events'" class="card">
      <h2>Existing Events</h2>

      <div v-if="allEvents.length === 0" class="text-center">
        <p>No events yet.</p>
      </div>

      <div v-else class="events-list">
        <div v-for="event in allEvents" :key="event.id" class="event-item">
          <div>
            <h3>{{ event.title }}</h3>
            <p>{{ event.location }} | {{ formatDate(event.start_date) }}</p>
          </div>
          <div class="event-actions">
            <button @click="editEvent(event)" class="btn">Edit</button>
            <button @click="deleteEventHandler(event.id)" class="btn danger">Delete</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Users Tab -->
    <div v-if="activeTab === 'Users'" class="card">
      <h2>System Users</h2>

      <div v-if="users.length === 0" class="text-center">
        <p>No users registered yet.</p>
      </div>

      <div v-else class="users-list">
        <div v-for="user in users" :key="user.id" class="user-item">
          <div>
            <strong>{{ user.full_name }}</strong>
            <p>{{ user.email }}</p>
            <span :class="['status', user.email_verified ? 'verified' : 'not-verified']">
              {{ user.email_verified ? 'Verified' : 'Not Verified' }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useEventStore } from '../stores/event'

const eventStore = useEventStore()

const activeTab = ref('Create Event')
const tabs = ['Create Event', 'Manage Events', 'Users']

const eventForm = ref({
  title: '',
  description: '',
  location: '',
  startDate: '',
  endDate: '',
  transports: []
})

const allEvents = ref([])
const users = ref([])
const errorMessage = ref('')
const successMessage = ref('')
const isCreating = ref(false)

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const createEvent = async () => {
  try {
    isCreating.value = true
    errorMessage.value = ''

    if (!eventForm.value.title || !eventForm.value.location || !eventForm.value.startDate || !eventForm.value.endDate) {
      errorMessage.value = 'Please fill in all required fields'
      return
    }

    if (eventForm.value.transports.length === 0) {
      errorMessage.value = 'Please select at least one transport type'
      return
    }

    await eventStore.createEvent({
      title: eventForm.value.title,
      description: eventForm.value.description,
      location: eventForm.value.location,
      start_date: new Date(eventForm.value.startDate).toISOString(),
      end_date: new Date(eventForm.value.endDate).toISOString(),
      available_transports: eventForm.value.transports
    })

    successMessage.value = 'Event created successfully!'
    eventForm.value = { title: '', description: '', location: '', startDate: '', endDate: '', transports: [] }
    setTimeout(() => (successMessage.value = ''), 3000)
    await loadEvents()
  } catch (error) {
    errorMessage.value = error.response?.data?.error || 'Failed to create event'
  } finally {
    isCreating.value = false
  }
}

const editEvent = (event) => {
  // TODO: Implement event edit
  console.log('Edit event:', event)
}

const deleteEventHandler = async (eventID) => {
  if (confirm('Are you sure you want to delete this event?')) {
    try {
      await eventStore.deleteEvent(eventID)
      successMessage.value = 'Event deleted successfully'
      setTimeout(() => (successMessage.value = ''), 3000)
      await loadEvents()
    } catch (error) {
      errorMessage.value = 'Failed to delete event'
    }
  }
}

const loadEvents = async () => {
  try {
    await eventStore.fetchEvents()
    allEvents.value = eventStore.events
  } catch (error) {
    errorMessage.value = 'Failed to load events'
  }
}

onMounted(async () => {
  await loadEvents()
  // TODO: Fetch users
})
</script>

<style scoped>
.admin-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 2rem;
  border-bottom: 2px solid #ddd;
}

.tab-button {
  padding: 1rem 1.5rem;
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  font-size: 1rem;
  border-bottom: 3px solid transparent;
  transition: all 0.2s;
}

.tab-button.active {
  color: #2c3e50;
  border-bottom-color: #3498db;
}

.tab-button:hover {
  color: #2c3e50;
}

.checkbox-group {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  margin-top: 0.5rem;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: normal;
}

.checkbox-group input {
  width: auto;
}

.events-list,
.users-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.event-item,
.user-item {
  background-color: #f9f9f9;
  padding: 1rem;
  border-radius: 4px;
  border-left: 4px solid #3498db;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.event-item h3,
.user-item h3 {
  margin: 0;
}

.event-item p,
.user-item p {
  margin: 0.25rem 0;
  font-size: 0.9rem;
  color: #666;
}

.event-actions {
  display: flex;
  gap: 0.5rem;
}

.btn {
  padding: 0.5rem 1rem;
  background-color: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.btn:hover {
  background-color: #2980b9;
}

.btn.danger {
  background-color: #e74c3c;
}

.btn.danger:hover {
  background-color: #c0392b;
}

.btn.success {
  background-color: #27ae60;
}

.btn.success:hover {
  background-color: #229954;
}

.status {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  font-size: 0.85rem;
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
</style>
