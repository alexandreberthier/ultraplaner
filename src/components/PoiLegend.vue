<script setup lang="ts">
import { POI_CATEGORY_DEFS } from '../config/poiCategories'
</script>

<template>
  <div class="legend">
    <h3>Legende</h3>
    <ul>
      <li v-for="cat in POI_CATEGORY_DEFS.filter((c) => c.defaultOn)" :key="cat.id">
        <span>{{ cat.icon }}</span> {{ cat.label }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.legend {
  font-size: 0.8rem;
}

.legend h3 {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
}

.legend ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.legend li {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.25rem;
}
</style>
