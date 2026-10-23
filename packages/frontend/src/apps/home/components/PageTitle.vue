<template>
  <div class="page-title-section">
    <h1 class="page-super-title">命定之诗与黄昏之歌</h1>
    <p class="page-subtitle-english">Destined Poetry & Twilight Song</p>
    <hr class="ornamental-divider" />
  </div>
</template>

<style scoped>
.page-super-title {
  font-family: var(--title-font);
  font-weight: 700;
  text-align: center;
  font-size: 2.8em;
  color: var(--title-color);
  margin: 10px 0 0 0;
  letter-spacing: 2px;
}

.page-subtitle-english {
  font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, 'Times New Roman', serif;
  font-style: italic;
  text-align: center;
  font-size: 1.3em;
  color: #8b7355;
  margin: 8px 0 0 0;
  letter-spacing: 3px;
  font-weight: 400;
}

.ornamental-divider {
  border: 0;
  height: 1px;
  background-color: var(--border-color);
  position: relative;
  margin: 25px auto 30px auto;
  width: 85%;
}

.ornamental-divider::after {
  content: '❖';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background-color: var(--bg-color, #f5efe6);
  padding: 0 15px;
  color: var(--title-color);
  font-size: 1.6em;
  line-height: 1;
}

/* Responsive */
@media screen and (max-width: 600px) {
  .page-super-title {
    font-size: 2em;
  }
}
</style>
