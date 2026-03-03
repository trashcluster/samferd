import { defineStore } from 'pinia'
import { ref } from 'vue'
import { eventAPI, registrationAPI } from '../services/api'

export const useEventStore = defineStore('event', () => {
  const events = ref([])
  const selectedEvent = ref(null)
  const registrations = ref([])

  const fetchEvents = async () => {
    const response = await eventAPI.getEvents()
    events.value = response.data
    return response.data
  }

  const fetchEventByID = async (id) => {
    const response = await eventAPI.getEventByID(id)
    selectedEvent.value = response.data
    return response.data
  }

  const fetchEventRegistrations = async (eventID) => {
    const response = await eventAPI.getEventRegistrations(eventID)
    registrations.value = response.data
    return response.data
  }

  const createEvent = async (data) => {
    const response = await eventAPI.createEvent(data)
    events.value.push(response.data)
    return response.data
  }

  const updateEvent = async (id, data) => {
    const response = await eventAPI.updateEvent(id, data)
    const index = events.value.findIndex((e) => e.id === id)
    if (index !== -1) {
      events.value[index] = response.data
    }
    return response.data
  }

  const deleteEvent = async (id) => {
    await eventAPI.deleteEvent(id)
    events.value = events.value.filter((e) => e.id !== id)
  }

  const registerForEvent = async (eventID, data) => {
    const response = await registrationAPI.registerForEvent(eventID, data)
    return response.data
  }

  const updateRegistration = async (id, data) => {
    const response = await registrationAPI.updateRegistration(id, data)
    return response.data
  }

  const deleteRegistration = async (id) => {
    await registrationAPI.deleteRegistration(id)
  }

  return {
    events,
    selectedEvent,
    registrations,
    fetchEvents,
    fetchEventByID,
    fetchEventRegistrations,
    createEvent,
    updateEvent,
    deleteEvent,
    registerForEvent,
    updateRegistration,
    deleteRegistration
  }
})
