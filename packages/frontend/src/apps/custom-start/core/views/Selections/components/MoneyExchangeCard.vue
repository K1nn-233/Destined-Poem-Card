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
    characterStore.character.money,
    'money',
  ),
);

const handleExchange = () => {
  if (pointsToExchange.value <= 0 || pointsToExchange.value > maxExchangeable.value) {
    return;
  }

  const nextMoney = exchangeGain(pointsToExchange.value, 'money');
  characterStore.updateCharacterField('money', nextMoney);
  pointsToExchange.value = 0;
};

const handleExchangeAll = () => {
  if (maxExchangeable.value <= 0) return;
  characterStore.updateCharacterField('money', exchangeGain(maxExchangeable.value, 'money'));
  pointsToExchange.value = 0;
};

const handleReset = () => {
  characterStore.updateCharacterField('money', 0);
  pointsToExchange.value = 0;
};
</script>

<template>
  <ExchangeCard
    v-model="pointsToExchange"
    title="金钱兑换"
    :rate-text="`(1转生点 = ${EXCHANGE_RATES.money} Z)`"
    icon-class="fa-solid fa-coins"
    current-label="当前："
    :current-value="characterStore.character.money"
    current-unit="Z"
    gain-unit="Z"
    :gain-per-point="EXCHANGE_RATES.money"
    :max-exchangeable="maxExchangeable"
    theme="gold"
    exchange-all-title="将所有剩余转生点数兑换为金钱"
    reset-title="重置已兑换的金钱"
    :reset-disabled="characterStore.character.money <= 0"
    @exchange="handleExchange"
    @exchange-all="handleExchangeAll"
    @reset="handleReset"
  />
</template>
