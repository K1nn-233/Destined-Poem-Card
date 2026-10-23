<script setup lang="ts">
interface Props {
  canGoPrevious: boolean;
  isNextDisabled: boolean;
  nextButtonText: string;
  nextDisabledTitle?: string;
}

defineProps<Props>();

const emit = defineEmits<{
  previous: [];
  next: [];
}>();
</script>

<template>
  <div class="navigation">
    <button class="nav-button prev-button" :disabled="!canGoPrevious" @click="emit('previous')">
      <i class="fa-solid fa-chevron-left"></i>
      <span class="text">上一步</span>
    </button>

    <button
      class="nav-button next-button"
      :disabled="isNextDisabled"
      :title="isNextDisabled ? nextDisabledTitle : undefined"
      @click="emit('next')"
    >
      <span class="text">{{ nextButtonText }}</span>
      <i class="fa-solid fa-chevron-right"></i>
    </button>
  </div>
</template>

<style lang="scss" scoped>
.navigation {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-lg);
}

.nav-button {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-xl);
  background: var(--button-bg);
  color: var(--title-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition-normal);
  box-shadow: var(--shadow-sm);

  &:hover:not(:disabled) {
    background: var(--button-hover);
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: var(--shadow-sm);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: var(--border-color-light);
    color: var(--text-light);
  }
}

@media (max-width: 768px) {
  .navigation {
    flex-wrap: wrap;
    justify-content: center;
  }

  .nav-button {
    flex: 1;
    min-width: 120px;
    justify-content: center;
  }
}
</style>
