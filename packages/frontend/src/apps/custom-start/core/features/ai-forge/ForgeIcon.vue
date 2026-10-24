<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'items' | 'partner' }>(), { variant: 'items' });
</script>

<template>
  <svg
    class="forge-icon"
    viewBox="0 0 40 40"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    aria-hidden="true"
  >
    <template v-if="variant === 'partner'">
      <path d="M33 18a14 14 0 1 1-12-12 M7 31c2-6 7-9 13-9s11 3 13 9" />
      <circle cx="20" cy="15" r="5" />
      <path d="m31 3 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" />
    </template>
    <template v-else>
      <path d="M20 4 25 15 36 20 25 25 20 36 15 25 4 20 15 15Z" />
      <path d="m20 12 8 8-8 8-8-8Z M8 6v6 M5 9h6 M32 28v6 M29 31h6" />
      <circle cx="20" cy="20" r="2" fill="currentColor" />
    </template>
  </svg>
</template>
