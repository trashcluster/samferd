<template>
  <div id="app-container">
    <nav class="navbar">
      <div class="nav-left">
        <router-link to="/" class="logo">Samferd</router-link>
      </div>
      <div class="nav-right">
        <span v-if="isAuthenticated" class="user-name">{{ currentUser?.full_name }}</span>
        <router-link v-if="isAuthenticated" to="/profile" class="nav-link">Profile</router-link>
        <router-link v-if="isAuthenticated && isAdmin" to="/admin" class="nav-link admin">Admin</router-link>
        <button v-if="isAuthenticated" @click="logout" class="nav-link logout-btn">Logout</button>
        <template v-else>
          <router-link to="/login" class="nav-link">Login</router-link>
          <router-link to="/register" class="nav-link">Register</router-link>
        </template>
      </div>
    </nav>

    <div class="main-container">
      <router-view />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const isAuthenticated = computed(() => authStore.isAuthenticated)
const currentUser = computed(() => authStore.user)
const isAdmin = computed(() => authStore.isAdmin)

const logout = () => {
  authStore.logout()
  router.push('/login')
}

onMounted(() => {
  // Try to restore session from localStorage
  authStore.restoreSession()
})
</script>

<style scoped>
#app-container {
  min-height: 100vh;
  background-color: #f5f5f5;
}

.navbar {
  background-color: #2c3e50;
  color: white;
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.nav-left {
  flex: 1;
}

.logo {
  font-size: 1.5rem;
  font-weight: bold;
  color: #fff;
  text-decoration: none;
}

.nav-right {
  display: flex;
  gap: 1.5rem;
  align-items: center;
}

.nav-link {
  color: #ecf0f1;
  text-decoration: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.nav-link:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.nav-link.admin {
  background-color: #e74c3c;
}

.logout-btn {
  background: none;
  border: none;
  color: #ecf0f1;
  cursor: pointer;
  font-size: 1rem;
}

.user-name {
  font-size: 0.9rem;
}

.main-container {
  max-width: 1200px;
  margin: 2rem auto;
  padding: 0 1rem;
}
</style>
