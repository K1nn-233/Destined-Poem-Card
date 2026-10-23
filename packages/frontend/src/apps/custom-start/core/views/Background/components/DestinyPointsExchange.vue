<script setup lang="ts">
import { ref, computed } from 'vue';
import { EXCHANGE_RATES, exchangeBudget, exchangeGain } from '../../../rules/exchange';
import ExchangeCard from '../../../components/exchange-card.vue';
import { useCharacterStore } from '../../../store/character';

const characterStore = useCharacterStore();

const pointsToExchange = ref(0);

const maxExchangeable = computed(() =>
  exchangeBudget(
    characterStore.character.reincarnationPoints,
    characterStore.consumedPoints,
    characterStore.character.destinyPoints,
    'destinyPoints',
  ),
);

const handleExchange = () => {
  if (pointsToExchange.value <= 0 || pointsToExchange.value > maxExchangeable.value) {
    return;
  }

  const nextDestinyPoints = exchangeGain(pointsToExchange.value, 'destinyPoints');
  characterStore.updateCharacterField('destinyPoints', nextDestinyPoints);
  pointsToExchange.value = 0;
};

const handleExchangeAll = () => {
  if (maxExchangeable.value <= 0) return;
  characterStore.updateCharacterField(
    'destinyPoints',
    exchangeGain(maxExchangeable.value, 'destinyPoints'),
  );
  pointsToExchange.value = 0;
};

const handleReset = () => {
  characterStore.resetDestinyExchange();
  pointsToExchange.value = 0;
};
</script>

<template>
  <ExchangeCard
    v-model="pointsToExchange"
    title="命运点数"
    :rate-text="`(1转生点 = ${EXCHANGE_RATES.destinyPoints}命运点)`"
    icon-class="fa-solid fa-stars"
    current-label="当前："
    :current-value="characterStore.character.destinyPoints"
    gain-unit="命运点"
    :gain-per-point="EXCHANGE_RATES.destinyPoints"
    :max-exchangeable="maxExchangeable"
    theme="violet"
    exchange-all-title="将所有剩余转生点数兑换为命运点数"
    reset-title="重置已兑换的命运点数"
    :reset-disabled="characterStore.character.destinyPoints <= 0"
    @exchange="handleExchange"
    @exchange-all="handleExchangeAll"
    @reset="handleReset"
  />
</template>
