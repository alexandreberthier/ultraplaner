<script setup lang="ts">
function noindex() {
  let el = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')
  if (!el) {
    el = document.createElement('meta')
    el.name = 'robots'
    document.head.appendChild(el)
  }
  el.content = 'noindex, nofollow'
}

noindex()
</script>

<template>
  <main class="reserved-path">
    <h1>UltraPlaner</h1>
    <p><router-link to="/">ultraplaner.com</router-link></p>
  </main>
</template>

<style scoped>
.reserved-path {
  max-width: 40rem;
  margin: 3rem auto;
  padding: 0 1rem;
  font-family: system-ui, sans-serif;
}
</style>
