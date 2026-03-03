<template>
  <div class="container">
    <h1>Travel Events Calendar</h1>
    
    <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>

    <div class="card">
      <div class="calendar-container">
        <div class="calendar-header">
          <button @click="previousMonth">&lt; Previous</button>
          <h2>{{ monthYearDisplay }}</h2>
          <button @click="nextMonth">Next &gt;</button>
        </div>

        <div class="calendar-weekdays">
          <div v-for="day in weekdays" :key="day" class="weekday">{{ day }}</div>
        </div>

        <div class="calendar-grid">
          <div
            v-for="day in calendarDays"
            :key="day.date"
            :class="['calendar-day', {
              'other-month': !day.isCurrentMonth,
              'has-event': day.events.length > 0,
              'is-registered': day.isRegistered
            }]"
            @click="selectDay(day)"
          >
            <div class="day-number">{{ day.dayOfMonth }}</div>
            <div v-if="day.events.length > 0" class="event-count">
              {{ day.events.length }} event(s)
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Selected day events -->
    <div v-if="selectedDay && selectedDay.events.length > 0" class="card">
      <h2>Events on {{ formatDate(selectedDay.date) }}</h2>
      
      <div v-for="event in selectedDay.events" :key="event.id" class="event-card">
        <h3>{{ event.title }}</h3>
        <p><strong>Location:</strong> {{ event.location }}</p>
        <p><strong>Dates:</strong> {{ formatDate(event.start_date) }} to {{ formatDate(event.end_date) }}</p>
        <router-link :to="'/events/' + event.id" class="btn">View Details</router-link>
      </div>
    </div>

    <!-- Upcoming events list -->
    <div class="card">
      <h2>Upcoming Events</h2>
      
      <div v-if="upcomingEvents.length === 0" class="text-center">
        <p>No upcoming events. Check back soon!</p>
      </div>

      <div v-else class="grid grid-2">
        <div v-for="event in upcomingEvents" :key="event.id" class="event-card">
          <h3>{{ event.title }}</h3>
          <p>{{ event.description }}</p>
          <p><strong>📍</strong> {{ event.location }}</p>
          <p><strong>📅</strong> {{ formatDate(event.start_date) }}</p>
          <router-link :to="'/events/' + event.id" class="btn">View Event</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useEventStore } from '../stores/event'

const eventStore = useEventStore()
const errorMessage = ref('')
const currentMonth = ref(new Date())
const selectedDay = ref(null)

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const monthYearDisplay = computed(() => {
  return currentMonth.value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
})

const calendarDays = computed(() => {
  const year = currentMonth.value.getFullYear()
  const month = currentMonth.value.getMonth()
  
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startingDayOfWeek = firstDay.getDay()

  const days = []

  // Previous month empty days
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    const date = new Date(year, month, -i)
    days.push({ date, dayOfMonth: date.getDate(), isCurrentMonth: false, events: [], isRegistered: false })
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    const date = new Date(year, month, i)
    const dayEvents = eventStore.events.filter(e => {
      const eventDate = new Date(e.start_date)
      return eventDate.toDateString() === date.toDateString()
    })
    days.push({ date, dayOfMonth: i, isCurrentMonth: true, events: dayEvents, isRegistered: false })
  }

  // Next month empty days
  const remainingDays = 42 - days.length
  for (let i = 1; i <= remainingDays; i++) {
    const date = new Date(year, month + 1, i)
    days.push({ date, dayOfMonth: date.getDate(), isCurrentMonth: false, events: [], isRegistered: false })
  }

  return days
})

const upcomingEvents = computed(() => {
  const now = new Date()
  return eventStore.events
    .filter(e => new Date(e.start_date) >= now)
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
    .slice(0, 6)
})

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('en-US', { 
    weekday: 'short', 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  })
}

const previousMonth = () => {
  currentMonth.value = new Date(currentMonth.value.getFullYear(), currentMonth.value.getMonth() - 1)
}

const nextMonth = () => {
  currentMonth.value = new Date(currentMonth.value.getFullYear(), currentMonth.value.getMonth() + 1)
}

const selectDay = (day) => {
  if (day.events.length > 0) {
    selectedDay.value = day
  }
}

onMounted(async () => {
  try {
    await eventStore.fetchEvents()
  } catch (error) {
    errorMessage.value = 'Failed to load events'
  }
})
</script>

<style scoped>
.calendar-container {
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
}

.calendar-header {
  background-color: #2c3e50;
  color: white;
  padding: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.calendar-header button {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  font-size: 1.2rem;
  padding: 0.5rem 1rem;
}

.calendar-header button:hover {
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.calendar-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  background-color: #ecf0f1;
  font-weight: bold;
}

.weekday {
  padding: 0.75rem;
  text-align: center;
  border-bottom: 2px solid #bdc3c7;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}

.calendar-day {
  border: 1px solid #bdc3c7;
  padding: 0.75rem;
  min-height: 80px;
  background-color: white;
  cursor: pointer;
  transition: background-color 0.2s;
}

.calendar-day:hover {
  background-color: #f0f0f0;
}

.calendar-day.other-month {
  background-color: #f9f9f9;
  color: #95a5a6;
}

.calendar-day.has-event {
  background-color: #e3f2fd;
}

.calendar-day.is-registered {
  background-color: #e8f5e9;
  border: 2px solid #27ae60;
}

.day-number {
  font-weight: bold;
  margin-bottom: 0.25rem;
}

.event-count {
  font-size: 0.75rem;
  color: #2c3e50;
  font-weight: bold;
}

.event-card {
  background-color: #f9f9f9;
  padding: 1rem;
  border-left: 4px solid #3498db;
  margin-bottom: 1rem;
  border-radius: 4px;
}

.event-card h3 {
  margin: 0 0 0.5rem 0;
}

.event-card p {
  margin: 0.25rem 0;
  font-size: 0.9rem;
}

.btn {
  display: inline-block;
  padding: 0.5rem 1rem;
  background-color: #3498db;
  color: white;
  border-radius: 4px;
  margin-top: 0.5rem;
  text-decoration: none;
  transition: background-color 0.2s;
}

.btn:hover {
  background-color: #2980b9;
  text-decoration: none;
}
</style>
